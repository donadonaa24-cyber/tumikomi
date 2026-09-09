(function () {
  "use strict";

  const W = 1280;
  const H = 720;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.stage = null;
      this.packages = [];
      this.selectedId = null;
      this.drag = null;
      this.history = [];
      this.mode = "menu";
      this.timeRemaining = 0;
      this.overtimeSeconds = 0;
      this.deadlineWarned = false;
      this.eventTriggered = false;
      this.departLocked = false;
      this.driveElapsed = 0;
      this.driveResult = null;
      this.driveSfx = {};
      this.inspected = false;
      this.inspectionReport = null;
      this.phase = "pickup";
      this.forkAccidents = 0;
      this.transportSequence = 0;
      this.stageNonce = 0;
      this.lastFrame = performance.now();
      this.flash = 0;
      this.forkliftImage = new Image();
      this.forkliftImage.src = "assets/images/forklift-side-operator.png";
      this.truckImage = new Image();
      this.truckImage.src = "assets/images/truck-side-green.png";
      this.pickupTruckImage = new Image();
      this.pickupTruckImage.src = "assets/images/yard-truck-destination.png";
      this.pickupBuildingImage = new Image();
      this.pickupBuildingImage.src = "assets/images/yard-company-entrance.png";
      this.cargoImage = new Image();
      this.cargoImage.src = "assets/images/cargo-pallet-cartons.png";
      this.mobilePad = { drive: 0, lift: 0 };
      this.forklift = {
        x: 300,
        targetX: 300,
        baseY: 574,
        targetBaseY: 574,
        forkY: 512,
        targetForkY: 512,
        forkLength: 250,
        capacityKg: 1500,
        carrying: false,
        engagement: 0,
        forkedId: null
      };
      this.pickupHintShown = false;
      this.roadSeed = Array.from({ length: 22 }, function (_, index) {
        return { x: (index * 83) % 1280, width: 28 + (index % 4) * 13 };
      });
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    startStage(stageId) {
      const source = StageData.stages.find(function (item) { return item.id === stageId; });
      if (!source) return;
      this.stageNonce += 1;
      this.stage = clone(source);
      this.packages = this.stage.packages.map(function (pkg) {
        pkg.trayScale = 1;
        pkg.unstable = false;
        pkg.transported = false;
        pkg.forkDamaged = false;
        pkg.pickupActive = false;
        pkg.transportOrder = 0;
        return pkg;
      });
      this.originalPackageIds = this.packages.map(function (pkg) { return pkg.id; });
      this.selectedId = null;
      this.drag = null;
      this.history = [];
      this.mode = "playing";
      this.timeRemaining = this.stage.timeLimit || 0;
      this.overtimeSeconds = 0;
      this.deadlineWarned = false;
      this.eventTriggered = false;
      this.departLocked = false;
      this.driveElapsed = 0;
      this.driveResult = null;
      this.inspected = false;
      this.inspectionReport = null;
      this.phase = "pickup";
      this.forkAccidents = 0;
      this.transportSequence = 0;
      this.pickupHintShown = false;
      this.stopVirtualPad();
      this.releaseForklift();
      this.selectPickupCargo(this.packages[0]);
      UI.dialogue("まず倉庫で荷役。青い昇降ハンドルで爪を穴へ合わせ、車体を前進させます。", "rookie");
      UI.toast("MISSION 0" + this.stage.id + "　" + this.stage.objective);
      this.updateControls();
    }

    get selected() {
      return this.packages.find((pkg) => pkg.id === this.selectedId) || null;
    }

    captureState() {
      return {
        packages: clone(this.packages),
        selectedId: this.selectedId,
        eventTriggered: this.eventTriggered,
        departLocked: this.departLocked,
        inspected: this.inspected,
        phase: this.phase,
        forkAccidents: this.forkAccidents,
        transportSequence: this.transportSequence
      };
    }

    restoreState(snapshot) {
      this.packages = clone(snapshot.packages);
      this.selectedId = snapshot.selectedId;
      this.eventTriggered = snapshot.eventTriggered;
      this.departLocked = snapshot.departLocked;
      this.inspected = Boolean(snapshot.inspected);
      this.phase = snapshot.phase || "loading";
      this.forkAccidents = snapshot.forkAccidents || 0;
      this.transportSequence = snapshot.transportSequence || 0;
      this.inspectionReport = null;
      this.drag = null;
      this.releaseForklift();
      if (this.phase === "pickup") this.layoutPickupBay();
      else this.layoutTray();
      this.refreshStability();
      this.updateControls();
    }

    pushHistory(snapshot) {
      this.history.push(snapshot);
      if (this.history.length > 10) this.history.shift();
    }

    invalidateInspection() {
      this.inspected = false;
      this.inspectionReport = null;
    }

    undo() {
      if (this.mode !== "playing" || !this.history.length) {
        UI.toast(this.mode === "event" ? "追加便を確認中です。" : "これ以上は戻せません。", true);
        return;
      }
      const previous = this.history.pop();
      this.restoreState(previous);
      Sfx.play("button");
      UI.dialogue("ひとつ前の積み方に戻しました！", "rookie");
    }

    restart() {
      if (!this.stage) return;
      Sfx.play("button");
      this.startStage(this.stage.id);
    }

    layoutTray() {
      const waiting = this.packages.filter((pkg) => (pkg.transported || pkg.isAdded) && !pkg.forkDamaged && !pkg.placed && (!this.drag || this.drag.id !== pkg.id));
      if (!waiting.length) return;
      const gap = 14;
      const rawWidth = waiting.reduce(function (sum, pkg) { return sum + Collision.dimensions(pkg).width; }, 0);
      const available = 1160 - gap * Math.max(0, waiting.length - 1);
      const scale = clamp(available / Math.max(1, rawWidth), .46, .88);
      const total = waiting.reduce(function (sum, pkg) { return sum + Collision.dimensions(pkg).width * scale; }, 0) + gap * (waiting.length - 1);
      let x = (W - total) / 2;
      waiting.forEach(function (pkg) {
        const size = Collision.dimensions(pkg);
        pkg.trayScale = scale;
        pkg.x = x;
        pkg.y = 700 - size.height * scale;
        x += size.width * scale + gap;
      });
    }

    renderRect(pkg) {
      const size = Collision.dimensions(pkg);
      const scale = pkg.placed || (this.drag && this.drag.id === pkg.id) ? 1 : (pkg.trayScale || 1);
      return { x: pkg.x, y: pkg.y, width: size.width * scale, height: size.height * scale, scale };
    }

    hitTest(x, y) {
      for (let i = this.packages.length - 1; i >= 0; i -= 1) {
        const pkg = this.packages[i];
        if (this.phase === "loading" && !pkg.placed && !pkg.transported && !pkg.isAdded) continue;
        if (pkg.forkDamaged) continue;
        const r = this.renderRect(pkg);
        if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return pkg;
      }
      return null;
    }

    forkliftGeometry() {
      const bodyHeight = this.phase === "pickup" ? 220 : 190;
      const bodyWidth = bodyHeight * (1135 / 1024);
      return {
        bodyHeight,
        bodyWidth,
        mastOffset: bodyWidth - 5
      };
    }

    forkRect() {
      const geometry = this.forkliftGeometry();
      return {
        x: this.forklift.x + geometry.mastOffset,
        y: this.forklift.forkY,
        width: this.forklift.forkLength,
        height: 9
      };
    }

    syncForkliftToCargo(pkg) {
      const r = this.renderRect(pkg);
      const geometry = this.forkliftGeometry();
      this.forklift.x = r.x + 6 - geometry.mastOffset;
      this.forklift.targetX = this.forklift.x;
      this.forklift.forkY = r.y + r.height;
      this.forklift.targetForkY = this.forklift.forkY;
      this.forklift.targetBaseY = this.forklift.forkY > 570 ? 708 : 574;
      this.forklift.baseY = this.forklift.targetBaseY;
      this.forklift.carrying = true;
      const check = this.forkEngagement(pkg);
      this.forklift.engagement = check.ratio;
      return check;
    }

    forkEngagement(pkg) {
      const r = this.renderRect(pkg);
      const fork = this.forkRect();
      const overlap = Math.max(0, Math.min(r.x + r.width, fork.x + fork.width) - Math.max(r.x, fork.x));
      const ratio = r.width ? overlap / r.width : 0;
      const verticalError = Math.abs(r.y + r.height - fork.y);
      const weightOk = pkg.weightKg <= this.forklift.capacityKg;
      return { valid: ratio >= .75 && verticalError <= 3 && weightOk, ratio, verticalError, weightOk };
    }

    palletGeometry(pkg) {
      const r = this.renderRect(pkg);
      const bandHeight = clamp(r.height * .18, 14, 24);
      const holeHeight = clamp(bandHeight * .46, 7, 11);
      return {
        rect: r,
        bandY: r.y + r.height - bandHeight,
        bandHeight,
        holeY: r.y + r.height - bandHeight * .66,
        holeHeight
      };
    }

    palletForkCheck(pkg) {
      const pallet = this.palletGeometry(pkg);
      const fork = this.forkRect();
      const forkCenterY = fork.y + fork.height / 2;
      const holeCenterY = pallet.holeY + pallet.holeHeight / 2;
      const verticalError = Math.abs(forkCenterY - holeCenterY);
      const tolerance = Math.max(4, pallet.holeHeight * .54);
      const penetration = Math.max(0, Math.min(pallet.rect.width, fork.x + fork.width - pallet.rect.x));
      const ratio = pallet.rect.width ? penetration / pallet.rect.width : 0;
      const heightOk = verticalError <= tolerance;
      const weightOk = pkg.weightKg <= this.forklift.capacityKg;
      return {
        valid: heightOk && weightOk && ratio >= .75,
        heightOk,
        weightOk,
        verticalError,
        tolerance,
        penetration,
        ratio,
        forkCenterY,
        holeCenterY
      };
    }

    sideForkliftBodyRect() {
      const geometry = this.forkliftGeometry();
      return {
        x: this.forklift.x,
        y: this.forklift.baseY - geometry.bodyHeight,
        width: geometry.bodyWidth,
        height: geometry.bodyHeight
      };
    }

    forkLiftHandleRect() {
      const fork = this.forkRect();
      return { x: fork.x - 25, y: fork.y - 23, width: 36, height: 46 };
    }

    releaseForklift() {
      if (!this.forklift) return;
      this.forklift.carrying = false;
      this.forklift.engagement = 0;
      this.forklift.forkedId = null;
      this.forklift.targetX = this.phase === "pickup" ? 300 : 54;
      this.forklift.targetBaseY = 574;
      this.forklift.targetForkY = this.phase === "pickup" ? 512 : 548;
      if (this.phase === "pickup") {
        this.forklift.x = 300;
        this.forklift.forkY = 512;
      }
    }

    selectPickupCargo(pkg) {
      if (!pkg || pkg.transported || pkg.forkDamaged || this.forklift.forkedId) return;
      this.packages.forEach(function (item) { item.pickupActive = false; });
      pkg.pickupActive = true;
      this.selectedId = pkg.id;
      this.layoutPickupBay();
      this.forklift.x = 300;
      this.forklift.targetX = 300;
      this.forklift.baseY = 574;
      this.forklift.targetBaseY = 574;
      this.forklift.forkY = 490;
      this.forklift.targetForkY = 490;
      this.forklift.carrying = false;
      this.forklift.engagement = 0;
      UI.dialogue(pkg.name + "。まず青いハンドルで爪の高さをパレット穴へ合わせます。", "rookie");
      this.updateControls();
    }

    layoutPickupBay() {
      const active = this.packages.find(function (pkg) { return pkg.pickupActive && !pkg.transported && !pkg.forkDamaged; });
      if (active) {
        const size = Collision.dimensions(active);
        active.trayScale = 1.12;
        active.x = 850;
        active.y = 520 - size.height * active.trayScale;
      }

      const queued = this.packages.filter(function (pkg) {
        return !pkg.pickupActive && !pkg.transported && !pkg.forkDamaged;
      });
      queued.forEach(function (pkg, index) {
        const size = Collision.dimensions(pkg);
        const row = Math.floor(index / 5);
        const col = index % 5;
        pkg.trayScale = .32;
        pkg.x = 720 + col * 108;
        pkg.y = 690 - row * 48 - size.height * pkg.trayScale;
      });

      const transported = this.packages.filter(function (pkg) { return pkg.transported && !pkg.placed; });
      transported.forEach(function (pkg, index) {
        const size = Collision.dimensions(pkg);
        pkg.trayScale = .3;
        pkg.x = 48 + (index % 5) * 108;
        pkg.y = 690 - Math.floor(index / 5) * 47 - size.height * pkg.trayScale;
      });

      const damaged = this.packages.filter(function (pkg) { return pkg.forkDamaged; });
      damaged.forEach(function (pkg, index) {
        const size = Collision.dimensions(pkg);
        pkg.trayScale = .3;
        pkg.x = 485 + (index % 2) * 94;
        pkg.y = 690 - Math.floor(index / 2) * 47 - size.height * pkg.trayScale;
      });
    }

    syncPickedCargo() {
      if (!this.forklift.forkedId) return;
      const pkg = this.packages.find((item) => item.id === this.forklift.forkedId);
      if (!pkg) return;
      const fork = this.forkRect();
      pkg.x = fork.x + (pkg.forkOffsetX || 0);
      pkg.y = fork.y + (pkg.forkOffsetY || 0);
    }

    triggerForkAccident(pkg) {
      if (!pkg || pkg.forkDamaged) return;
      pkg.forkDamaged = true;
      pkg.damageCause = "爪突き事故";
      pkg.pickupActive = false;
      pkg.transported = false;
      pkg.placed = false;
      this.forkAccidents += 1;
      this.flash = .72;
      this.drag = null;
      this.stopVirtualPad();
      this.releaseForklift();
      Sfx.play(pkg.protectedCargo ? "glass" : "error");
      UI.toast("爪突き事故！ " + pkg.name + "を破損扱い・隔離しました。", true);
      UI.dialogue("爪先が荷物に当たりました。停止して高さと差込口を確認してから前進します。", "boss");
      const next = this.packages.find(function (item) { return !item.transported && !item.forkDamaged; });
      if (next) this.selectPickupCargo(next);
      else this.layoutPickupBay();
      this.invalidateInspection();
      this.updateControls();
    }

    completeTransport(pkg) {
      if (!pkg) return;
      pkg.transported = true;
      pkg.pickupActive = false;
      pkg.transportOrder = ++this.transportSequence;
      delete pkg.forkOffsetX;
      delete pkg.forkOffsetY;
      this.drag = null;
      this.stopVirtualPad();
      this.releaseForklift();
      Sfx.play("place");
      UI.toast(pkg.name + "を出荷バースへ運びました。");
      const next = this.packages.find(function (item) { return !item.transported && !item.forkDamaged; });
      if (next) {
        this.selectPickupCargo(next);
      } else {
        this.selectedId = null;
        this.layoutPickupBay();
        UI.dialogue("倉庫内の搬送完了。積付け画面へ進めます。", "rookie");
      }
      this.updateControls();
    }

    stopVirtualPad() {
      this.mobilePad.drive = 0;
      this.mobilePad.lift = 0;
      ["padDriveBack", "padDriveForward", "padForkUp", "padForkDown"].forEach(function (id) {
        const button = document.getElementById(id);
        if (button) button.classList.remove("is-pressed");
      });
    }

    setVirtualControl(axis, value, pressed) {
      if (axis !== "drive" && axis !== "lift") return;
      if (this.mode !== "playing" || this.phase !== "pickup") {
        this.mobilePad[axis] = 0;
        return;
      }
      if (pressed) this.mobilePad[axis] = value;
      else if (this.mobilePad[axis] === value) this.mobilePad[axis] = 0;
    }

    attemptPickup(pkg) {
      if (!pkg || pkg.forkDamaged || this.forklift.forkedId) return false;
      const check = this.palletForkCheck(pkg);
      if (!check.weightOk) {
        UI.toast("定格荷重1,500kgを超えています。", true);
        return false;
      }
      if (!check.heightOk && check.penetration > 0) {
        this.triggerForkAccident(pkg);
        return false;
      }
      if (!check.valid) {
        UI.toast(check.heightOk
          ? "差し込みが浅いです（" + Math.round(check.ratio * 100) + "%）。75%以上まで静かに前進します。"
          : "爪をパレット差込口の中央へ合わせてください。", true);
        return false;
      }
      const fork = this.forkRect();
      pkg.forkOffsetX = pkg.x - fork.x;
      pkg.forkOffsetY = pkg.y - fork.y;
      this.forklift.forkedId = pkg.id;
      this.forklift.carrying = true;
      this.forklift.engagement = check.ratio;
      this.forklift.forkY -= 18;
      this.forklift.targetForkY = this.forklift.forkY;
      this.syncPickedCargo();
      Sfx.play("place");
      UI.toast("差込" + Math.round(check.ratio * 100) + "%・持上げOK。左へ後退して運びます。");
      UI.dialogue("根元まで差し込み、5〜10cm持ち上げました。荷を低く保って後退します。", "rookie");
      this.updateControls();
      return true;
    }

    activateVirtualPickup() {
      if (this.mode !== "playing" || this.phase !== "pickup") return;
      const pkg = this.packages.find((item) => item.id === (this.forklift.forkedId || this.selectedId));
      if (!pkg || pkg.forkDamaged) return;
      if (this.forklift.forkedId) {
        if (this.forklift.x <= 125) this.completeTransport(pkg);
        else UI.toast("左の緑トラックまで後退してください。到着すると自動で搬送完了します。");
        return;
      }
      this.attemptPickup(pkg);
    }

    beginLoadingPhase() {
      const ready = this.packages.filter(function (pkg) { return pkg.transported && !pkg.forkDamaged; });
      if (!ready.length) {
        UI.toast("先にパレットを1台以上、出荷バースへ運んでください。", true);
        return;
      }
      this.phase = "loading";
      this.drag = null;
      this.selectedId = null;
      this.history = [];
      this.stopVirtualPad();
      this.releaseForklift();
      this.layoutTray();
      UI.toast("SCREEN 2 / トラック積付け");
      UI.dialogue("搬送済みパレットを選び、トラック側面図の荷室へ直接配置します。", "rookie");
      this.updateControls();
    }

    pickupPointerDown(x, y, pointerId) {
      const active = this.selected;
      const handle = this.forkLiftHandleRect();
      const body = this.sideForkliftBodyRect();
      if (x >= handle.x && x <= handle.x + handle.width && y >= handle.y && y <= handle.y + handle.height && !this.forklift.forkedId) {
        this.drag = { kind: "lift", pointerId, startY: y, startForkY: this.forklift.forkY };
        Sfx.play("pick");
        return;
      }
      if (x >= body.x && x <= body.x + body.width && y >= body.y && y <= body.y + body.height) {
        this.drag = { kind: "drive", pointerId, startX: x, startLiftX: this.forklift.x };
        Sfx.play("pick");
        return;
      }
      const pkg = this.hitTest(x, y);
      if (pkg && !pkg.transported && !pkg.forkDamaged && !this.forklift.forkedId) this.selectPickupCargo(pkg);
      else if (active) UI.dialogue("車体を左右へ、青いハンドルを上下へドラッグします。", "rookie");
    }

    pickupPointerMove(x, y, pointerId) {
      if (!this.drag || this.drag.pointerId !== pointerId) return;
      const pkg = this.packages.find((item) => item.id === (this.forklift.forkedId || this.selectedId));
      if (!pkg) return;
      if (this.drag.kind === "lift") {
        this.forklift.forkY = clamp(this.drag.startForkY + (y - this.drag.startY), 240, 536);
        this.forklift.targetForkY = this.forklift.forkY;
      } else if (this.drag.kind === "drive") {
        this.forklift.x = clamp(this.drag.startLiftX + (x - this.drag.startX), 58, 650);
        this.forklift.targetX = this.forklift.x;
        if (this.forklift.forkedId) this.syncPickedCargo();
      }
      if (!this.forklift.forkedId) {
        const check = this.palletForkCheck(pkg);
        this.forklift.engagement = check.ratio;
        if (check.penetration > 6 && !check.heightOk) this.triggerForkAccident(pkg);
      }
    }

    pickupPointerUp(x, y, pointerId) {
      if (!this.drag || this.drag.pointerId !== pointerId) return;
      const action = this.drag;
      this.drag = null;
      const pkg = this.packages.find((item) => item.id === (this.forklift.forkedId || this.selectedId));
      if (!pkg || pkg.forkDamaged) return;
      if (action.kind === "lift") {
        const check = this.palletForkCheck(pkg);
        UI.toast(check.heightOk ? "爪高さOK。車体をゆっくり前進してください。" : "爪高さが穴から外れています。", !check.heightOk);
        return;
      }
      if (this.forklift.forkedId) {
        if (this.forklift.x <= 125) this.completeTransport(pkg);
        else UI.toast("荷を15〜20cmの低い位置で保ち、左の出荷バースまで後退します。");
        return;
      }
      this.attemptPickup(pkg);
    }

    pointerDown(x, y, pointerId) {
      if (this.mode !== "playing") return;
      if (this.phase === "pickup") {
        this.pickupPointerDown(x, y, pointerId);
        return;
      }
      const pkg = this.hitTest(x, y);
      if (!pkg) {
        this.selectedId = null;
        this.updateControls();
        return;
      }
      const size = Collision.dimensions(pkg);
      this.selectedId = pkg.id;
      this.drag = {
        id: pkg.id,
        pointerId,
        startX: x,
        startY: y,
        moved: false,
        wasPlaced: pkg.placed,
        snapshot: this.captureState(),
        offsetX: pkg.placed ? x - pkg.x : size.width / 2,
        offsetY: pkg.placed ? y - pkg.y : size.height / 2
      };
      Sfx.play("pick");
      this.updateControls();
    }

    pointerMove(x, y, pointerId) {
      if (this.phase === "pickup") {
        this.pickupPointerMove(x, y, pointerId);
        return;
      }
      if (!this.drag || this.drag.pointerId !== pointerId || this.mode !== "playing") return;
      const pkg = this.selected;
      if (!pkg) return;
      if (!this.drag.moved && Math.hypot(x - this.drag.startX, y - this.drag.startY) < 5) return;
      if (!this.drag.moved) {
        this.drag.moved = true;
        pkg.placed = false;
        pkg.trayScale = 1;
      }
      pkg.x = x - this.drag.offsetX;
      pkg.y = y - this.drag.offsetY;
      this.forklift.forkY = clamp(pkg.y + Collision.dimensions(pkg).height, 210, 650);
      this.forklift.targetForkY = this.forklift.forkY;
    }

    pointerUp(x, y, pointerId) {
      if (this.phase === "pickup") {
        this.pickupPointerUp(x, y, pointerId);
        return;
      }
      if (!this.drag || this.drag.pointerId !== pointerId) return;
      const action = this.drag;
      const pkg = this.selected;
      if (!pkg) { this.drag = null; return; }
      if (!action.moved) {
        this.drag = null;
        UI.dialogue(pkg.name + "を選択中。回転できます。", "rookie");
        return;
      }

      pkg.x = x - action.offsetX;
      pkg.y = y - action.offsetY;

      if (action.wasPlaced && y >= 580) {
        pkg.placed = false;
        pkg.braced = false;
        pkg.cushioned = false;
        pkg.strapped = false;
        pkg.unstable = false;
        this.drag = null;
        this.releaseForklift();
        this.invalidateInspection();
        this.pushHistory(action.snapshot);
        this.layoutTray();
        this.refreshStability();
        Sfx.play("place");
        UI.toast(pkg.name + "を待機場へ戻しました。");
        UI.dialogue("重量や運賃を見直して、積む荷物を選び直せます。", "rookie");
        this.updateControls();
        return;
      }

      const result = Collision.resolvePlacement(pkg, this.packages, this.stage.truck);
      if (!result.valid) {
        this.restoreState(action.snapshot);
        this.flash = .34;
        Sfx.play("error");
        UI.toast(result.reason, true);
        UI.dialogue("そこはちょっと厳しそうです……", "rookie");
        return;
      }

      const unsupported = this.findUnsupportedPackage();
      if (unsupported) {
        this.restoreState(action.snapshot);
        this.flash = .34;
        Sfx.play("error");
        UI.toast(unsupported.name + "が宙に浮いてしまいます。", true);
        return;
      }

      this.drag = null;
      this.releaseForklift();
      if (action.wasPlaced) {
        pkg.braced = false;
        pkg.cushioned = false;
        pkg.strapped = false;
      }
      this.invalidateInspection();
      this.pushHistory(action.snapshot);
      pkg.unstable = result.unstable;
      this.refreshStability();
      this.layoutTray();
      Sfx.play("place");
      if (result.unstable) {
        UI.toast("置けましたが、支えが少なく不安定です。", true);
        UI.dialogue("ちょっと端に寄りすぎかも……？", "rookie");
      } else {
        UI.dialogue("接地よし。爪を静かに抜き、次の荷物へ進みます。", "rookie");
      }
      this.checkStageEvents();
      this.updateControls();
    }

    rotateSelected() {
      if (this.mode !== "playing" || this.phase !== "loading") return;
      const pkg = this.selected;
      if (!pkg) {
        UI.toast("回転する荷物を選んでください。", true);
        return;
      }
      const snapshot = this.captureState();
      const before = Collision.dimensions(pkg);
      const centerX = pkg.x + before.width / 2;
      const centerY = pkg.y + before.height / 2;
      pkg.rotation = (pkg.rotation + 90) % 360;
      const after = Collision.dimensions(pkg);
      pkg.x = centerX - after.width / 2;
      pkg.y = centerY - after.height / 2;

      const rotation = Collision.canRotate(pkg, this.packages, this.stage.truck);
      const unsupported = pkg.placed ? this.findUnsupportedPackage() : null;
      if (!rotation.valid || unsupported) {
        this.restoreState(snapshot);
        this.flash = .3;
        Sfx.play("error");
        UI.toast(rotation.valid ? unsupported.name + "が宙に浮いてしまいます。" : rotation.reason, true);
        return;
      }
      this.pushHistory(snapshot);
      if (pkg.placed && (pkg.braced || pkg.cushioned || pkg.strapped)) {
        pkg.braced = false;
        pkg.cushioned = false;
        pkg.strapped = false;
        UI.toast("向きを変えたため、固定資材を外しました。再固定してください。", true);
      }
      this.invalidateInspection();
      this.layoutTray();
      this.refreshStability();
      Sfx.play("rotate");
      UI.dialogue("向きを変えると、意外と入りますね！", "rookie");
      this.updateControls();
    }

    findUnsupportedPackage() {
      return this.packages.find((item) => item.placed && Collision.supportInfo(item, this.packages, this.stage.truck).ratio < .5) || null;
    }

    refreshStability() {
      this.packages.forEach((item) => {
        item.unstable = item.placed && Collision.supportInfo(item, this.packages, this.stage.truck).ratio < .68 && !Scoring.isSecured(item);
      });
    }

    materialRemaining(kind) {
      if (!this.stage) return 0;
      const stock = (this.stage.materials && this.stage.materials[kind]) || 0;
      const used = Scoring.materialUsage(this.packages)[kind] || 0;
      return Math.max(0, stock - used);
    }

    useMaterial(kind) {
      if (this.mode !== "playing" || this.phase !== "loading") return;
      const pkg = this.selected;
      const property = { panel: "braced", foam: "cushioned", strap: "strapped" }[kind];
      const label = { panel: "コンパネ", foam: "発泡材", strap: "ラッシングベルト" }[kind];
      if (!property || !pkg || !pkg.placed) {
        UI.toast("荷台に置いた荷物を選んでから資材を使ってください。", true);
        return;
      }
      if (kind === "panel" && pkg.protectedCargo && !pkg[property]) {
        UI.toast("破損厳禁貨物をコンパネで直接押さえないでください。発泡材を使います。", true);
        return;
      }
      const snapshot = this.captureState();
      if (pkg[property]) {
        pkg[property] = false;
        this.pushHistory(snapshot);
        this.invalidateInspection();
        this.refreshStability();
        Sfx.play("button");
        UI.toast(pkg.name + "から" + label + "を外しました。");
        this.updateControls();
        return;
      }
      if (this.materialRemaining(kind) <= 0) {
        UI.toast(label + "の在庫がありません。固定方法を組み替えてください。", true);
        return;
      }
      pkg[property] = true;
      this.pushHistory(snapshot);
      this.invalidateInspection();
      this.refreshStability();
      Sfx.play("place");
      UI.toast(pkg.name + "に" + label + "を使用しました。");
      if (kind === "foam") UI.dialogue("隙間を埋めて、横ずれと接触を防ぎました。", "rookie");
      else if (kind === "panel") UI.dialogue("コンパネで面を作り、荷物の列を押さえました。", "rookie");
      else UI.dialogue("固定点へベルトを掛け、前後の動きを止めました。", "rookie");
      this.updateControls();
    }

    inspectLoad() {
      if (!this.stage || this.mode !== "playing") return;
      if (this.phase !== "loading") {
        UI.toast("先に倉庫ヤードの荷役を終え、積付け画面へ進んでください。", true);
        return;
      }
      const report = Scoring.analyze(this.stage, this.packages);
      this.inspectionReport = report;
      this.inspected = report.blockingIssues.length === 0;
      UI.showInspection(this.stage, report);
      if (this.inspected) {
        Sfx.play("clear");
        UI.dialogue("重量・重心・固定、全部確認できました。出発できます！", "rookie");
      } else {
        Sfx.play("error");
        UI.dialogue("赤い項目を直して、もう一度点検しましょう。", "rookie");
      }
      this.updateControls();
    }

    checkStageEvents() {
      if (!this.stage || this.stage.id !== 5 || this.eventTriggered) return;
      const complete = this.originalPackageIds.every((id) => {
        const pkg = this.packages.find((item) => item.id === id);
        return pkg && pkg.placed;
      });
      if (!complete) return;

      this.eventTriggered = true;
      this.departLocked = true;
      this.mode = "event";
      this.history = [];
      this.updateControls();
      UI.dialogue("ごめん、これも追加でお願い！", "boss");
      UI.toast("追加便を受け付けています……");
      Sfx.play("button");
      const nonce = this.stageNonce;
      setTimeout(() => {
        if (nonce !== this.stageNonce || !this.stage || this.stage.id !== 5) return;
        const extra = clone(this.stage.additionalPackage);
        extra.isAdded = true;
        extra.trayScale = 1;
        extra.transported = true;
        extra.forkDamaged = false;
        this.packages.push(extra);
        this.selectedId = extra.id;
        this.mode = "playing";
        this.departLocked = false;
        this.invalidateInspection();
        this.layoutTray();
        this.updateControls();
        UI.dialogue("緊急追加便です。最大積載量を再計算してください。", "rookie");
        UI.toast("追加荷物が1個届きました。空けておいた隙間へ！");
      }, 1550);
    }

    depart() {
      if (this.mode !== "playing" || this.departLocked) {
        UI.toast("まだ出発できません。", true);
        return;
      }
      if (this.phase === "pickup") {
        this.beginLoadingPhase();
        return;
      }
      if (!this.inspected) {
        UI.toast("先に発車前点検をしてください。", true);
        this.inspectLoad();
        return;
      }
      UI.dialogue("本当にこの積み方で行きます？", "rookie");
      this.beginDrive();
    }

    beginDrive() {
      if (!this.stage || this.mode !== "playing") return;
      this.driveResult = Scoring.calculate(this.stage, this.packages, this.timeRemaining, this.overtimeSeconds);
      this.mode = "driving";
      this.driveElapsed = 0;
      this.driveSfx = {};
      this.drag = null;
      this.selectedId = null;
      UI.hideDialogue();
      UI.toast("積み込み完了。出発します！");
      Sfx.play("depart");
      this.updateControls();
    }

    finishDrive() {
      if (this.mode !== "driving") return;
      this.mode = "result";
      Sfx.play("clear");
      const id = this.stage.id;
      UI.showResult(this.stage, this.driveResult, {
        retry: () => this.startStage(id),
        next: () => this.startStage(Math.min(StageData.stages.length, id + 1)),
        stages: () => { this.mode = "menu"; UI.showStart(); }
      });
      this.updateControls();
    }

    updateControls() {
      const playing = this.mode === "playing";
      const pickup = playing && this.phase === "pickup";
      const loading = playing && this.phase === "loading";
      const rotate = document.getElementById("rotateButton");
      const undo = document.getElementById("undoButton");
      const restart = document.getElementById("restartButton");
      const depart = document.getElementById("departButton");
      const inspect = document.getElementById("inspectButton");
      const panel = document.getElementById("panelButton");
      const foam = document.getElementById("foamButton");
      const strap = document.getElementById("strapButton");
      const phaseIndicator = document.getElementById("phaseIndicator");
      const virtualPad = document.getElementById("virtualPad");
      const pickupAction = document.getElementById("padPickupAction");
      if (!rotate) return;
      if (document.body && document.body.classList) {
        document.body.classList.toggle("is-pickup-phase", pickup);
        document.body.classList.toggle("is-loading-phase", loading);
      }
      rotate.disabled = !loading || !this.selected;
      undo.disabled = !loading || !this.history.length;
      restart.disabled = !(playing || this.mode === "event");
      const transportedCount = this.packages.filter(function (pkg) { return pkg.transported && !pkg.forkDamaged; }).length;
      depart.disabled = !playing || this.departLocked || (pickup ? transportedCount === 0 : !this.inspected);
      depart.innerHTML = pickup ? "積付け画面へ <span>→</span>" : "出発する <span>→</span>";
      if (inspect) {
        inspect.disabled = !loading || this.departLocked;
        inspect.classList.toggle("is-checked", Boolean(this.inspected));
        inspect.innerHTML = pickup ? "画面2で点検" : (this.inspected ? "✓ 点検済み" : "<kbd>I</kbd> 発車前点検");
      }
      const selectedPlaced = Boolean(loading && this.selected && this.selected.placed);
      [[panel, "panel"], [foam, "foam"], [strap, "strap"]].forEach((entry) => {
        const button = entry[0];
        const kind = entry[1];
        if (!button) return;
        const property = { panel: "braced", foam: "cushioned", strap: "strapped" }[kind];
        button.disabled = !selectedPlaced || (this.materialRemaining(kind) <= 0 && !(this.selected && this.selected[property]));
      });
      const counts = { panel: "panelCount", foam: "foamCount", strap: "strapCount" };
      Object.keys(counts).forEach((kind) => {
        const counter = document.getElementById(counts[kind]);
        if (counter) counter.textContent = String(this.materialRemaining(kind));
      });
      if (phaseIndicator) {
        phaseIndicator.classList.toggle("is-loading", this.phase === "loading");
        phaseIndicator.innerHTML =
          "<span class=\"phase-step " + (this.phase === "pickup" ? "is-active" : "is-done") + "\"><b>1</b> パレット荷役</span>" +
          "<i>→</i>" +
          "<span class=\"phase-step " + (this.phase === "loading" ? "is-active" : "") + "\"><b>2</b> トラック積付け</span>";
      }
      if (virtualPad) virtualPad.hidden = !pickup;
      ["padDriveBack", "padDriveForward"].forEach(function (id) {
        const button = document.getElementById(id);
        if (button) button.disabled = !pickup || !this.selected;
      }, this);
      ["padForkUp", "padForkDown"].forEach(function (id) {
        const button = document.getElementById(id);
        if (button) button.disabled = !pickup || !this.selected || Boolean(this.forklift.forkedId);
      }, this);
      if (pickupAction) {
        const carrying = Boolean(this.forklift.forkedId);
        pickupAction.disabled = !pickup || !this.selected;
        pickupAction.classList.toggle("is-carrying", carrying);
        pickupAction.innerHTML = carrying
          ? "<b>運搬中</b><small>左トラックへ後退</small>"
          : "<b>持上げ</b><small>差込75%以上で確定</small>";
      }
    }

    loop(now) {
      const dt = Math.min(.05, (now - this.lastFrame) / 1000 || 0);
      this.lastFrame = now;
      this.update(dt);
      this.draw();
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      if (this.stage && this.stage.timeLimit && (this.mode === "playing" || this.mode === "event")) {
        if (this.timeRemaining > 0) {
          const before = this.timeRemaining;
          this.timeRemaining = Math.max(0, this.timeRemaining - dt);
          if (dt > before) this.overtimeSeconds += dt - before;
        } else {
          this.overtimeSeconds += dt;
        }
        if (this.timeRemaining <= 0 && !this.deadlineWarned) {
          this.deadlineWarned = true;
          UI.toast("出発時刻を過ぎました。5秒ごとに500円の遅延損失です！", true);
          UI.dialogue("出発時間だぞ！安全は省略せず、確実に仕上げろ！", "boss");
          Sfx.play("error");
        }
      }
      this.updateForklift(dt);
      this.flash = Math.max(0, this.flash - dt);
      if (this.mode !== "driving") return;
      this.driveElapsed += dt;
      const v = this.driveResult.violationKinds;
      if (this.driveElapsed > 1.75 && !this.driveSfx.bump) {
        this.driveSfx.bump = true;
        Sfx.play("bump");
      }
      if (this.driveElapsed > 3.2 && v.protected && !this.driveSfx.glass) {
        this.driveSfx.glass = true;
        Sfx.play("glass");
      }
      if (this.driveElapsed > 6.2) this.finishDrive();
    }

    updateForklift(dt) {
      this.stepVirtualPad(dt);
      const smoothing = 1 - Math.exp(-dt * 12);
      if (!this.forklift.carrying) {
        this.forklift.x += (this.forklift.targetX - this.forklift.x) * smoothing;
        this.forklift.forkY += (this.forklift.targetForkY - this.forklift.forkY) * smoothing;
      }
      this.forklift.baseY += (this.forklift.targetBaseY - this.forklift.baseY) * smoothing;
    }

    stepVirtualPad(dt) {
      if (!this.mobilePad || this.mode !== "playing" || this.phase !== "pickup") return;
      const pkg = this.packages.find((item) => item.id === (this.forklift.forkedId || this.selectedId));
      if (!pkg || pkg.forkDamaged) return;

      if (this.mobilePad.lift && !this.forklift.forkedId) {
        this.forklift.forkY = clamp(this.forklift.forkY + this.mobilePad.lift * 105 * dt, 240, 536);
        this.forklift.targetForkY = this.forklift.forkY;
      }
      if (!this.mobilePad.drive) return;

      this.forklift.x = clamp(this.forklift.x + this.mobilePad.drive * 265 * dt, 58, 650);
      this.forklift.targetX = this.forklift.x;
      if (this.forklift.forkedId) {
        this.syncPickedCargo();
        if (this.mobilePad.drive < 0 && this.forklift.x <= 125) this.completeTransport(pkg);
        return;
      }
      const check = this.palletForkCheck(pkg);
      this.forklift.engagement = check.ratio;
      if (check.penetration > 6 && !check.heightOk) this.triggerForkAccident(pkg);
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, W, H);
      if (this.mode === "driving") this.drawDriving(ctx);
      else this.drawWarehouse(ctx);
      if (this.flash > 0) {
        ctx.fillStyle = "rgba(255, 80, 55," + (this.flash * .35) + ")";
        ctx.fillRect(0, 0, W, H);
      }
    }

    drawWarehouse(ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, "#0d3946");
      gradient.addColorStop(.58, "#082733");
      gradient.addColorStop(1, "#051821");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = .13;
      ctx.strokeStyle = "#d7e0e5";
      ctx.lineWidth = 2;
      for (let x = 30; x < W; x += 82) {
        ctx.beginPath(); ctx.moveTo(x, 145); ctx.lineTo(x, 560); ctx.stroke();
      }
      for (let y = 145; y < 570; y += 68) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();

      if (!this.stage) {
        ctx.fillStyle = "#f3ead8";
        ctx.font = "700 42px Georgia, serif";
        ctx.fillText("MIDNIGHT LOADING BAY", 420, 330);
        return;
      }

      this.drawHud(ctx);
      if (this.phase === "pickup") {
        this.drawPickupYard(ctx);
        return;
      }
      this.drawLoadingBay(ctx);
    }

    drawCoverImage(ctx, image, x, y, width, height, focusX) {
      if (!image || !image.complete || !image.naturalWidth) return false;
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      const targetRatio = width / height;
      let sourceWidth = image.naturalWidth;
      let sourceHeight = image.naturalHeight;
      let sourceX = 0;
      let sourceY = 0;
      if (sourceRatio > targetRatio) {
        sourceWidth = image.naturalHeight * targetRatio;
        sourceX = (image.naturalWidth - sourceWidth) * clamp(focusX == null ? .5 : focusX, 0, 1);
      } else {
        sourceHeight = image.naturalWidth / targetRatio;
        sourceY = (image.naturalHeight - sourceHeight) * .5;
      }
      ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
      return true;
    }

    drawPickupYard(ctx) {
      ctx.fillStyle = "#071b25";
      ctx.fillRect(0, 548, W, 172);
      ctx.fillStyle = "#155265";
      ctx.fillRect(0, 570, W, 7);

      ctx.save();
      ctx.beginPath();
      ctx.rect(24, 164, 390, 386);
      ctx.clip();
      if (!this.drawCoverImage(ctx, this.pickupTruckImage, 24, 164, 390, 386, 0)) {
        ctx.fillStyle = "rgba(37,211,145,.1)";
        ctx.fillRect(24, 164, 390, 386);
      }
      const truckShade = ctx.createLinearGradient(24, 164, 24, 550);
      truckShade.addColorStop(0, "rgba(3,20,27,.18)");
      truckShade.addColorStop(.62, "rgba(3,20,27,.12)");
      truckShade.addColorStop(1, "rgba(3,20,27,.72)");
      ctx.fillStyle = truckShade;
      ctx.fillRect(24, 164, 390, 386);
      ctx.restore();
      ctx.strokeStyle = "rgba(37,211,145,.66)";
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(30, 170, 378, 372);
      ctx.setLineDash([]);
      ctx.fillStyle = "#7ce8b8";
      ctx.font = "800 12px ui-monospace, 'Yu Gothic UI', sans-serif";
      ctx.fillText("DESTINATION / 緑トラック", 48, 196);
      ctx.fillStyle = "#d2e8e7";
      ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText("荷を低く保ち、左へ後退して積込口へ", 48, 218);

      ctx.save();
      ctx.beginPath();
      ctx.rect(700, 164, 552, 386);
      ctx.clip();
      if (!this.drawCoverImage(ctx, this.pickupBuildingImage, 700, 164, 552, 386, 1)) {
        ctx.fillStyle = "rgba(74,168,255,.09)";
        ctx.fillRect(700, 164, 552, 386);
      }
      const buildingShade = ctx.createLinearGradient(700, 164, 700, 550);
      buildingShade.addColorStop(0, "rgba(3,20,27,.22)");
      buildingShade.addColorStop(.6, "rgba(3,20,27,.08)");
      buildingShade.addColorStop(1, "rgba(3,20,27,.7)");
      ctx.fillStyle = buildingShade;
      ctx.fillRect(700, 164, 552, 386);
      ctx.restore();
      ctx.strokeStyle = "rgba(74,168,255,.56)";
      ctx.lineWidth = 2;
      ctx.strokeRect(706, 170, 540, 372);
      ctx.fillStyle = "#70bdff";
      ctx.font = "800 12px ui-monospace, 'Yu Gothic UI', sans-serif";
      ctx.fillText("WAREHOUSE ENTRANCE / 荷物置場", 724, 196);
      ctx.fillStyle = "#d2e8e7";
      ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText("① 青いハンドルで高さ調整　② 車体を前進　③ 75%以上で持上げ", 724, 218);

      ctx.fillStyle = "rgba(6,31,43,.72)";
      ctx.fillRect(430, 474, 250, 45);
      ctx.fillStyle = "#7ce8b8";
      ctx.font = "800 10px ui-monospace, 'Yu Gothic UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("◀  TRANSPORT LANE / 搬送路", 555, 501);
      ctx.textAlign = "left";

      const active = this.selected;
      if (active && !active.forkDamaged && !active.transported) {
        const check = this.palletForkCheck(active);
        const guideColor = check.heightOk ? "#7ce8b8" : "#4aa8ff";
        const pallet = this.palletGeometry(active);
        ctx.strokeStyle = guideColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(650, check.holeCenterY); ctx.lineTo(1210, check.holeCenterY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = guideColor;
        ctx.font = "800 11px ui-monospace, 'Yu Gothic UI', sans-serif";
        ctx.fillText(check.heightOk ? "穴高さ OK" : "穴中心へ合わせる", 1092, pallet.bandY - 9);
      }

      this.drawForklift(ctx);
      const small = this.packages.filter(function (pkg) { return !pkg.pickupActive; });
      small.forEach((pkg) => this.drawPackage(ctx, pkg));
      if (active && active.pickupActive) this.drawPackage(ctx, active);

      const handle = this.forkLiftHandleRect();
      ctx.fillStyle = "#4aa8ff";
      ctx.beginPath();
      ctx.arc(handle.x + handle.width / 2, handle.y + handle.height / 2, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff4df";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#111826";
      ctx.font = "900 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("↕", handle.x + handle.width / 2, handle.y + 28);
      ctx.textAlign = "left";

      ctx.fillStyle = "#84909f";
      ctx.font = "800 10px ui-monospace, 'Yu Gothic UI', sans-serif";
      ctx.fillText("搬送済み", 48, 608);
      ctx.fillText("破損隔離", 485, 608);
      ctx.fillText("未処理パレット（クリックで選択）", 720, 608);
    }

    drawLoadingBay(ctx) {
      this.drawTruck(ctx, false);
      this.drawTray(ctx);
      const placed = this.packages.filter(function (pkg) { return pkg.placed; });
      const waiting = this.packages.filter((pkg) => (pkg.transported || pkg.isAdded) && !pkg.forkDamaged && !pkg.placed && (!this.drag || this.drag.id !== pkg.id));
      placed.forEach((pkg) => this.drawPackage(ctx, pkg));
      waiting.forEach((pkg) => this.drawPackage(ctx, pkg));
      if (this.drag) {
        const dragged = this.packages.find((pkg) => pkg.id === this.drag.id);
        if (dragged && this.drag.moved) this.drawPackage(ctx, dragged, true);
      }
    }

    drawHud(ctx) {
      const placed = this.packages.filter(function (pkg) { return pkg.placed; }).length;
      const staged = this.packages.filter(function (pkg) { return pkg.transported && !pkg.forkDamaged; });
      const stagedWeight = staged.reduce(function (sum, pkg) { return sum + pkg.weightKg; }, 0);
      const stagedRevenue = staged.reduce(function (sum, pkg) { return sum + pkg.fee; }, 0);
      const damagedLoss = this.packages.filter(function (pkg) { return pkg.forkDamaged; }).reduce(function (sum, pkg) { return sum + pkg.replacementCost; }, 0);
      const pickup = this.phase === "pickup";
      const audit = Scoring.analyze(this.stage, this.packages);
      ctx.fillStyle = "rgba(8,13,22,.74)";
      ctx.fillRect(0, 0, W, 136);
      ctx.strokeStyle = "rgba(243,234,216,.13)";
      ctx.beginPath(); ctx.moveTo(0, 136); ctx.lineTo(W, 136); ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,.035)";
      ctx.fillRect(22, 18, 208, 100);
      ctx.fillStyle = "#8f9bac";
      ctx.font = "800 10px ui-monospace, monospace";
      ctx.fillText("SELECTED CARGO", 34, 37);
      if (this.selected) {
        ctx.fillStyle = "#f3ead8";
        ctx.font = "800 15px 'Yu Gothic UI', sans-serif";
        ctx.fillText(this.selected.name, 34, 60, 182);
        ctx.fillStyle = "#ffbd59";
        ctx.font = "800 13px ui-monospace, monospace";
        ctx.fillText(this.selected.weightKg + "kg  /  " + Scoring.yen(this.selected.fee), 34, 82);
        const flags = [];
        if (this.selected.protectedCargo) flags.push("破損厳禁");
        if (this.selected.braced) flags.push("板");
        if (this.selected.cushioned) flags.push("発泡");
        if (this.selected.strapped) flags.push("ベルト");
        if (pickup) {
          const check = this.palletForkCheck(this.selected);
          flags.push("差込" + Math.round(check.ratio * 100) + "%");
          flags.push(check.heightOk ? "穴高OK" : "高さ調整");
        }
        ctx.fillStyle = this.selected.protectedCargo ? "#ff9d88" : "#8290a0";
        ctx.font = "700 10px 'Yu Gothic UI', sans-serif";
        ctx.fillText(flags.length ? flags.join("・") : "耐荷重 " + this.selected.maxStackKg + "kg", 34, 103, 182);
      } else {
        ctx.fillStyle = "#667384";
        ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
        ctx.fillText("荷物を選択", 34, 70);
      }

      ctx.fillStyle = "#ff6b4a";
      ctx.font = "800 13px ui-monospace, monospace";
      ctx.fillText("MISSION 0" + this.stage.id, 258, 34);
      ctx.fillStyle = "#f3ead8";
      ctx.font = "700 27px Georgia, 'Yu Mincho', serif";
      ctx.fillText(this.stage.title, 258, 70, 360);
      ctx.fillStyle = "#8f9bac";
      ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
      ctx.fillText(this.stage.objective, 260, 97, 360);
      ctx.fillStyle = "#667384";
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText(pickup
        ? "TRANSPORTED " + staged.length + " / " + this.packages.length + "　事故 " + this.forkAccidents
        : "LOADED " + placed + " / " + staged.length, 260, 116);

      ctx.textAlign = "right";
      ctx.fillStyle = "#8f9bac";
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText(pickup ? "搬送候補重量" : "PAYLOAD", 763, 35);
      ctx.fillStyle = (pickup ? stagedWeight > audit.maxPayloadKg : audit.overweightKg) ? "#ff6b4a" : "#ffbd59";
      ctx.font = "800 20px ui-monospace, monospace";
      ctx.fillText((pickup ? stagedWeight : audit.payloadKg) + "kg", 763, 64);
      ctx.fillStyle = "#7f8c9c";
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText("/ " + audit.maxPayloadKg + "kg", 763, 84);

      ctx.fillStyle = "#8f9bac";
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText(pickup ? "爪突き事故" : "前後荷重", 906, 35);
      ctx.fillStyle = pickup ? (this.forkAccidents ? "#ff6b4a" : "#72d6b5") : (audit.balanceOk ? "#72d6b5" : "#ff6b4a");
      ctx.font = "800 18px 'Yu Gothic UI', sans-serif";
      const balanceText = pickup ? (this.forkAccidents ? this.forkAccidents + "件" : "0件") : (!audit.payloadKg ? "--" : (audit.balanceOffsetPercent === 0 ? "中央" : Math.abs(audit.balanceOffsetPercent) + "% " + (audit.balanceOffsetPercent < 0 ? "後" : "前")));
      ctx.fillText(balanceText, 906, 64);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(798, 76, 108, 5);
      ctx.fillStyle = pickup ? (this.forkAccidents ? "#ff6b4a" : "#72d6b5") : (audit.balanceOk ? "#72d6b5" : "#ff6b4a");
      ctx.fillRect(pickup ? 850 : 852 + clamp(audit.balanceOffset, -.9, .9) * 54 - 2, 72, pickup ? 56 : 4, pickup ? 5 : 13);

      ctx.fillStyle = "#8f9bac";
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText(pickup ? "搬送済み運賃" : "予定安全売上", 1067, 35);
      ctx.fillStyle = "#72d6b5";
      ctx.font = "800 19px ui-monospace, monospace";
      ctx.fillText(Scoring.yen(Math.max(0, pickup ? stagedRevenue - damagedLoss : audit.grossRevenue - audit.materialCost - damagedLoss)), 1067, 64);
      ctx.fillStyle = "#7f8c9c";
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.fillText("目標 " + Scoring.yen(this.stage.targetRevenue), 1067, 84);

      ctx.fillStyle = "#8f9bac";
      ctx.font = "700 10px ui-monospace, monospace";
      const overdue = this.overtimeSeconds > 0;
      ctx.fillText(overdue ? "OVERTIME" : "DEPARTURE", 1248, 35);
      ctx.fillStyle = overdue || this.timeRemaining < 30 ? "#ff6b4a" : "#f3ead8";
      ctx.font = "800 22px ui-monospace, monospace";
      ctx.fillText(overdue ? "+" + this.formatTime(this.overtimeSeconds) : this.formatTime(this.timeRemaining), 1248, 64);
      if (overdue) {
        ctx.fillStyle = "#ff8d73";
        ctx.font = "800 10px 'Yu Gothic UI', sans-serif";
        ctx.fillText("−" + Scoring.yen(Math.ceil(this.overtimeSeconds / 5) * 500), 1248, 84);
      }
      ctx.textAlign = "left";
    }

    formatTime(seconds) {
      const total = Math.max(0, Math.ceil(seconds));
      return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }

    drawTruck(ctx, driving) {
      const truck = this.stage ? this.stage.truck : StageData.TRUCK;
      ctx.save();
      if (this.truckImage.complete && this.truckImage.naturalWidth) {
        ctx.drawImage(this.truckImage, 0, 170, 1536, 680, 150, 120, 1120, 496);
      }
      const cargoGradient = ctx.createLinearGradient(truck.x, truck.y, truck.x, truck.y + truck.height);
      cargoGradient.addColorStop(0, driving ? "rgba(29,66,54,.58)" : "rgba(25,51,47,.34)");
      cargoGradient.addColorStop(1, driving ? "rgba(17,43,37,.66)" : "rgba(9,27,28,.48)");
      ctx.fillStyle = cargoGradient;
      ctx.fillRect(truck.x + 5, truck.y + 5, truck.width - 10, truck.height - 10);

      ctx.strokeStyle = "rgba(203,218,226,.12)";
      ctx.lineWidth = 2;
      for (let x = truck.x + 76; x < truck.x + truck.width; x += 76) {
        ctx.beginPath(); ctx.moveTo(x, truck.y + 8); ctx.lineTo(x, truck.y + truck.height - 8); ctx.stroke();
      }
      ctx.strokeStyle = "#188b65";
      ctx.lineWidth = 7;
      ctx.strokeRect(truck.x - 1, truck.y - 1, truck.width + 2, truck.height + 2);
      ctx.strokeStyle = "#4aa8ff";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(truck.x, truck.y + truck.height); ctx.lineTo(truck.x + truck.width, truck.y + truck.height); ctx.stroke();

      ctx.fillStyle = "#70bdff";
      ctx.font = "800 11px ui-monospace, monospace";
      ctx.fillText("REAR DOOR / 後部進入", truck.x + 13, truck.y + 25);
      ctx.textAlign = "right";
      ctx.fillText("CAB / FRONT →", truck.x + truck.width - 13, truck.y + 25);
      ctx.textAlign = "left";
      ctx.restore();
    }

    drawTray(ctx) {
      ctx.fillStyle = "rgba(8,13,22,.9)";
      ctx.fillRect(36, 596, 1188, 112);
      ctx.strokeStyle = "rgba(243,234,216,.18)";
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 596, 1188, 112);
      ctx.fillStyle = "#84909f";
      ctx.font = "700 11px ui-monospace, monospace";
      ctx.fillText("TRUCK STAGING / 搬送済みパレット・未積載", 54, 620);
      for (let x = 60; x < 1210; x += 42) {
        ctx.strokeStyle = "rgba(243,234,216,.06)";
        ctx.beginPath(); ctx.moveTo(x, 688); ctx.lineTo(x + 22, 707); ctx.stroke();
      }
    }

    drawForklift(ctx) {
      const lift = this.forklift;
      const geometry = this.forkliftGeometry();
      const bodyY = lift.baseY - geometry.bodyHeight;
      const fork = this.forkRect();

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0,0,0,.34)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;

      if (this.forkliftImage.complete && this.forkliftImage.naturalWidth) {
        ctx.drawImage(
          this.forkliftImage,
          0, 0, 1135, 1024,
          lift.x, bodyY, geometry.bodyWidth, geometry.bodyHeight
        );
      } else {
        ctx.fillStyle = "#ff7a1a";
        ctx.fillRect(lift.x + 18, lift.baseY - 66, 130, 48);
        ctx.fillStyle = "#172235";
        ctx.fillRect(lift.x + 86, lift.baseY - 160, 64, 95);
        ctx.fillRect(lift.x + geometry.bodyWidth - 11, lift.baseY - 182, 11, 168);
        ctx.fillStyle = "#111823";
        [lift.x + 55, lift.x + 150].forEach(function (wheelX) {
          ctx.beginPath(); ctx.arc(wheelX, lift.baseY - 14, 22, 0, Math.PI * 2); ctx.fill();
        });
      }

      ctx.shadowColor = "transparent";
      const railTop = Math.min(bodyY + 8, fork.y - 60);
      ctx.fillStyle = "#151e2b";
      ctx.fillRect(fork.x - 8, railTop, 6, lift.baseY - railTop - 12);
      ctx.fillStyle = "#334052";
      ctx.fillRect(fork.x + 2, railTop, 5, lift.baseY - railTop - 12);
      const steel = ctx.createLinearGradient(fork.x, fork.y, fork.x, fork.y + 10);
      steel.addColorStop(0, "#c7d0d9");
      steel.addColorStop(.38, "#5f6977");
      steel.addColorStop(1, "#222b39");
      ctx.fillStyle = "#202a39";
      ctx.fillRect(fork.x - 5, fork.y - 54, 9, 63);
      ctx.fillRect(fork.x + 3, fork.y - 44, 5, 53);
      ctx.fillStyle = steel;
      ctx.fillRect(fork.x - 2, fork.y, fork.width + 3, 6);
      ctx.fillStyle = "#384353";
      ctx.fillRect(fork.x + 3, fork.y + 7, fork.width - 13, 4);

      const depthMarkX = fork.x + fork.width * .75;
      ctx.strokeStyle = "#ffbd59";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(depthMarkX, fork.y - 5);
      ctx.lineTo(depthMarkX, fork.y + 13);
      ctx.stroke();

      const label = lift.carrying
        ? "爪差込 " + Math.round(lift.engagement * 100) + "%"
        : "FORKLIFT / 1.5t";
      const labelX = clamp(lift.x + geometry.bodyWidth * .46, 78, 1150);
      const labelY = lift.carrying ? Math.max(154, fork.y - 66) : lift.baseY + 13;
      ctx.font = "800 10px ui-monospace, 'Yu Gothic UI', sans-serif";
      const labelWidth = ctx.measureText(label).width + 20;
      ctx.fillStyle = "rgba(8,13,22,.88)";
      ctx.fillRect(labelX - labelWidth / 2, labelY - 15, labelWidth, 22);
      ctx.fillStyle = lift.carrying && lift.engagement >= .75 ? "#72d6b5" : "#ffbd59";
      ctx.textAlign = "center";
      ctx.fillText(label, labelX, labelY);
      ctx.textAlign = "left";
      ctx.restore();
    }

    drawPackage(ctx, pkg, dragging) {
      const r = this.renderRect(pkg);
      const selected = pkg.id === this.selectedId;
      ctx.save();
      if (dragging) ctx.globalAlpha = .72;
      ctx.shadowColor = "rgba(0,0,0,.32)";
      ctx.shadowBlur = selected ? 18 : 8;
      ctx.shadowOffsetY = 5;
      const pallet = this.palletGeometry(pkg);
      const cargoHeight = r.height - pallet.bandHeight;
      if ((pkg.type === "normal" || pkg.type === "priority") && this.cargoImage.complete && this.cargoImage.naturalWidth) {
        ctx.drawImage(this.cargoImage, 250, 45, 1050, 920, r.x, r.y, r.width, r.height);
        if (pkg.type === "priority") {
          ctx.fillStyle = "rgba(214,93,69,.24)";
          ctx.fillRect(r.x, r.y, r.width, cargoHeight);
        }
      } else if (pkg.type === "heavy") {
        const metal = ctx.createLinearGradient(r.x, r.y, r.x, r.y + cargoHeight);
        metal.addColorStop(0, "#8392a4");
        metal.addColorStop(1, "#3c4b5f");
        ctx.fillStyle = metal;
        ctx.fillRect(r.x, r.y, r.width, cargoHeight);
        ctx.strokeStyle = "rgba(230,238,244,.5)";
        ctx.lineWidth = Math.max(2, 4 * r.scale);
        ctx.beginPath();
        ctx.moveTo(r.x + 5, r.y + 5); ctx.lineTo(r.x + r.width - 5, r.y + cargoHeight - 5);
        ctx.moveTo(r.x + r.width - 5, r.y + 5); ctx.lineTo(r.x + 5, r.y + cargoHeight - 5);
        ctx.stroke();
      } else if (pkg.type === "glass") {
        ctx.fillStyle = "rgba(82,183,197,.46)";
        ctx.fillRect(r.x + r.width * .12, r.y + 3, r.width * .76, cargoHeight - 3);
        ctx.strokeStyle = "#bdebf0";
        ctx.lineWidth = Math.max(2, 3 * r.scale);
        ctx.strokeRect(r.x + r.width * .12, r.y + 3, r.width * .76, cargoHeight - 3);
        ctx.strokeStyle = "#704b2d";
        ctx.beginPath();
        ctx.moveTo(r.x + 4, pallet.bandY); ctx.lineTo(r.x + r.width * .35, r.y + 5);
        ctx.moveTo(r.x + r.width - 4, pallet.bandY); ctx.lineTo(r.x + r.width * .65, r.y + 5);
        ctx.stroke();
      } else if (pkg.type === "pet") {
        ctx.fillStyle = "rgba(65,92,75,.82)";
        ctx.fillRect(r.x, r.y, r.width, cargoHeight);
        ctx.strokeStyle = "#a9c9a1";
        ctx.lineWidth = Math.max(1, 2 * r.scale);
        for (let px = r.x + 6; px < r.x + r.width; px += Math.max(8, 14 * r.scale)) {
          ctx.beginPath(); ctx.moveTo(px, r.y + 2); ctx.lineTo(px, r.y + cargoHeight - 2); ctx.stroke();
        }
        ctx.fillStyle = "rgba(16,24,30,.6)";
        ctx.beginPath();
        ctx.arc(r.x + r.width * .55, r.y + cargoHeight * .58, Math.max(5, cargoHeight * .17), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = pkg.color;
        ctx.fillRect(r.x, r.y, r.width, cargoHeight);
      }
      ctx.shadowColor = "transparent";

      ctx.fillStyle = "#c88847";
      ctx.fillRect(r.x, pallet.bandY, r.width, pallet.bandHeight);
      ctx.fillStyle = "#e1aa68";
      ctx.fillRect(r.x, pallet.bandY, r.width, Math.max(3, pallet.bandHeight * .25));
      ctx.fillStyle = "#2b211b";
      const slotY = pallet.holeY;
      const slotH = pallet.holeHeight;
      ctx.fillRect(r.x + r.width * .11, slotY, r.width * .3, slotH);
      ctx.fillRect(r.x + r.width * .59, slotY, r.width * .3, slotH);
      ctx.fillStyle = "#9a5e32";
      ctx.fillRect(r.x + r.width * .45, pallet.bandY + 3, r.width * .1, pallet.bandHeight - 4);
      ctx.strokeStyle = "rgba(255,255,255,.23)";
      ctx.lineWidth = Math.max(1, r.scale * 2);
      ctx.strokeRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);

      if (pkg.cushioned) {
        ctx.fillStyle = "#ffe08a";
        const pad = Math.max(4, 7 * r.scale);
        for (let py = r.y + 6; py < r.y + r.height - 4; py += Math.max(12, 18 * r.scale)) {
          ctx.fillRect(r.x - pad, py, pad, Math.max(7, 10 * r.scale));
          ctx.fillRect(r.x + r.width, py, pad, Math.max(7, 10 * r.scale));
        }
      }
      if (pkg.braced) {
        const boardX = r.x + r.width - Math.max(7, 10 * r.scale);
        ctx.fillStyle = "#d19a5b";
        const boardBottom = this.stage ? this.stage.truck.y + this.stage.truck.height : r.y + r.height;
        ctx.fillRect(boardX, r.y - 3, Math.max(8, 11 * r.scale), Math.max(r.height + 6, boardBottom - r.y + 3));
        ctx.strokeStyle = "#704b2d";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(boardX + 3, r.y + 4); ctx.lineTo(boardX + 3, r.y + r.height - 4);
        ctx.stroke();
      }
      if (pkg.strapped) {
        ctx.strokeStyle = "#ff7252";
        ctx.lineWidth = Math.max(3, 5 * r.scale);
        ctx.beginPath();
        ctx.moveTo(r.x + r.width * .18, r.y + 2);
        ctx.lineTo(r.x + r.width * .72, r.y + r.height - 2);
        ctx.moveTo(r.x + r.width * .72, r.y + 2);
        ctx.lineTo(r.x + r.width * .18, r.y + r.height - 2);
        ctx.stroke();
      }

      if (pkg.protectedCargo) {
        ctx.strokeStyle = "#fff0d0";
        ctx.lineWidth = Math.max(1, 2 * r.scale);
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(r.x + 4, r.y + 4, r.width - 8, r.height - 8);
        ctx.setLineDash([]);
      }

      if (pkg.isAdded) {
        ctx.strokeStyle = "#ff6b4a";
        ctx.lineWidth = 5;
        ctx.strokeRect(r.x - 3, r.y - 3, r.width + 6, r.height + 6);
      }

      if (pkg.forkDamaged) {
        ctx.fillStyle = "rgba(90,12,12,.48)";
        ctx.fillRect(r.x, r.y, r.width, r.height);
        ctx.strokeStyle = "#ff6b4a";
        ctx.lineWidth = Math.max(3, 5 * r.scale);
        ctx.beginPath();
        ctx.moveTo(r.x + 5, r.y + 5); ctx.lineTo(r.x + r.width - 5, r.y + r.height - 5);
        ctx.moveTo(r.x + r.width - 5, r.y + 5); ctx.lineTo(r.x + 5, r.y + r.height - 5);
        ctx.stroke();
        if (r.width > 58) {
          ctx.fillStyle = "#fff0e9";
          ctx.font = "900 " + clamp(13 * r.scale, 8, 13) + "px 'Yu Gothic UI', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("破損隔離", r.x + r.width / 2, r.y + r.height / 2 + 4);
          ctx.textAlign = "left";
        }
      }

      const minSide = Math.min(r.width, r.height);
      const iconSize = clamp(minSide * .34, 12, 34);
      if (pkg.icon) {
        ctx.fillStyle = pkg.type === "heavy" ? "#101826" : "#fff4df";
        ctx.font = "900 " + iconSize + "px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pkg.icon, r.x + r.width * .23, r.y + r.height * .50);
      }

      if (r.width > 54 && r.height > 36) {
        const fontSize = clamp(14 * r.scale, 8, 14);
        ctx.fillStyle = "rgba(12,18,27,.86)";
        ctx.font = "800 " + fontSize + "px 'Yu Gothic UI', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const labelX = pkg.icon ? r.x + r.width * .43 : r.x + 9 * r.scale;
        const maxWidth = r.x + r.width - labelX - 5;
        let label = pkg.name;
        while (label.length > 3 && ctx.measureText(label).width > maxWidth) label = label.slice(0, -1);
        if (label !== pkg.name) label += "…";
        ctx.fillText(label, labelX, r.y + r.height * .57);
        ctx.fillStyle = "rgba(12,18,27,.57)";
        ctx.font = "700 " + clamp(10 * r.scale, 7, 10) + "px ui-monospace, monospace";
        ctx.fillText(pkg.weightKg + "kg / " + Scoring.yen(pkg.fee), labelX, r.y + r.height * .76, maxWidth);
      }

      if (pkg.unstable && pkg.placed) {
        ctx.fillStyle = "#ffbd59";
        ctx.beginPath();
        ctx.moveTo(r.x + r.width - 26, r.y + 6); ctx.lineTo(r.x + r.width - 6, r.y + 6); ctx.lineTo(r.x + r.width - 6, r.y + 27); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#111826";
        ctx.font = "900 13px sans-serif";
        ctx.fillText("!", r.x + r.width - 14, r.y + 21);
      }

      if (selected) {
        ctx.strokeStyle = "#fff4df";
        ctx.lineWidth = 4;
        ctx.setLineDash([9, 6]);
        ctx.strokeRect(r.x - 5, r.y - 5, r.width + 10, r.height + 10);
      }
      ctx.restore();
    }

    drivingMessage() {
      if (!this.driveResult) return "";
      const v = this.driveResult.violationKinds;
      if (this.driveElapsed < 1.2) return "市街地へ向けて走行中…";
      if (this.driveElapsed < 2.45) return "段差！";
      if (this.driveElapsed < 3.7) return "急カーブ！";
      if (this.driveElapsed < 5.15) {
        if (v.forkDamage) return "爪突き事故の破損損失が計上された！";
        if (v.protected) return "破損厳禁の荷物が損傷した！";
        if (v.heavy) return "下の荷物がつぶれた！";
        if (v.unsecured || v.unstable) return "固定不足で荷物がずれた！";
        if (v.balance) return "偏荷重で車体が大きく揺れる！";
        return "固定よし。荷物は安定している。";
      }
      return "配送センターへ到着！";
    }

    drawDriving(ctx) {
      const t = this.driveElapsed;
      const sky = ctx.createLinearGradient(0, 0, 0, 500);
      sky.addColorStop(0, "#111b2d");
      sky.addColorStop(.65, "#2d4052");
      sky.addColorStop(1, "#d56b4d");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,189,89,.62)";
      ctx.beginPath(); ctx.arc(1050, 160, 48, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#172436";
      for (let i = 0; i < 24; i += 1) {
        const x = ((i * 91 - t * 120) % 1460) - 100;
        const h = 60 + (i % 5) * 25;
        ctx.fillRect(x, 390 - h, 68, h);
      }
      ctx.fillStyle = "#111a26";
      ctx.fillRect(0, 390, W, 330);
      ctx.fillStyle = "#273343";
      ctx.fillRect(0, 555, W, 165);
      ctx.fillStyle = "#d6b15d";
      this.roadSeed.forEach(function (mark) {
        let x = (mark.x - t * 360) % 1500;
        if (x < -150) x += 1500;
        ctx.fillRect(x, 632, mark.width, 7);
      });

      const v = this.driveResult.violationKinds;
      const risky = v.heavy || v.protected || v.unsecured || v.unstable || v.balance;
      const eventShake = t > 1.72 && t < 2.28 ? Math.sin(t * 80) * (risky ? 7 : 2.2) : 0;
      const enter = easeOutCubic(clamp(t / .8, 0, 1));
      const offsetX = -180 + enter * 230 + Math.max(0, t - 4.9) * 180;
      ctx.save();
      ctx.translate(offsetX, 98 + eventShake);
      ctx.scale(.76, .76);
      this.drawTruck(ctx, true);
      this.packages.filter(function (pkg) { return pkg.placed; }).forEach((pkg) => {
        const protectedType = pkg.type === "glass" || pkg.type === "pet";
        const localShake = risky && t > 1.7 && t < 4.3 ? Math.sin(t * (protectedType ? 33 : 22) + pkg.x) * 2.5 : 0;
        ctx.save();
        ctx.translate(localShake, 0);
        this.drawPackage(ctx, pkg, false);
        ctx.restore();
      });
      ctx.restore();

      ctx.fillStyle = "rgba(8,13,22,.78)";
      ctx.fillRect(0, 0, W, 106);
      ctx.fillStyle = "#ff6b4a";
      ctx.font = "800 13px ui-monospace, monospace";
      ctx.fillText("ROAD TEST / SAFETY CHECK", 52, 38);
      ctx.fillStyle = "#f3ead8";
      ctx.font = "700 31px Georgia, 'Yu Mincho', serif";
      ctx.fillText(this.drivingMessage(), 52, 77);
      ctx.fillStyle = "rgba(243,234,216,.25)";
      ctx.fillRect(52, 92, 1176, 3);
      ctx.fillStyle = "#ffbd59";
      ctx.fillRect(52, 92, 1176 * clamp(t / 6.2, 0, 1), 3);
    }
  }

  window.Game = Game;
})();
