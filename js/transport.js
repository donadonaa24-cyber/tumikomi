(function () {
  "use strict";
  const P = Game.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Dispatch runs can hold fewer pallets than the stacked/front-rear yard slots, so missing slots count as gone.
  const alive = p => Boolean(p) && !p.transported && !p.forkDamaged;
  const oldStart = P.startStage;
  P.startStage = function (id) {
    this.yardDebris = []; this.road = null;
    oldStart.call(this, id);
    if (this.stage && this.stage.id >= 2) UI.dialogue("爪を上段の穴の高さへ合わせ、手動で前進して75%以上差し込みます。その後、上ボタン／Wで持上げ。", "boss");
  };
  const oldLayout = P.layoutPickupBay;
  P.yardRelations = function () {
    const p = this.packages;
    const stageId = this.stage ? this.stage.id : 0;
    return { bottom: stageId >= 2 ? p[0] : null, top: stageId >= 2 ? p[1] : null,
      front: stageId >= 3 ? p[2] : null, rear: stageId >= 3 ? p[3] : null };
  };
  P.layoutPickupBay = function () {
    oldLayout.call(this);
    const r = this.yardRelations(), selected = this.selected;
    if (!selected) return;
    const place = (p, x, floor) => {
      if (!p || !alive(p)) return;
      p.trayScale = 1.12; p.x = x; p.y = floor - Collision.dimensions(p).height * p.trayScale;
    };
    if (selected === r.bottom || selected === r.top) {
      place(r.bottom, 850, 520);
      const floor = r.bottom && alive(r.bottom) ? r.bottom.y : 520;
      place(r.top, 850, floor);
    }
    if (selected === r.front || selected === r.rear) {
      place(r.front, 800, 520);
      place(r.rear, r.front && alive(r.front) ? 800 + Collision.dimensions(r.front).width * 1.12 + 12 : 850, 520);
    }
  };
  const oldSelect = P.selectPickupCargo;
  P.selectPickupCargo = function (pkg) {
    const r = this.yardRelations();
    if (pkg === r.rear && r.front && alive(r.front)) {
      UI.toast("奥のパレットは手前を取り出してから扱います。", true); return;
    }
    oldSelect.call(this, pkg);
    if (pkg === r.bottom && alive(r.top)) UI.dialogue("段積み貨物です。上段をタップして先に取り出してください。下段を持ち上げると転倒します。", "boss");
    if (pkg === r.front && alive(r.rear)) UI.dialogue("奥にも貨物があります。差込75%以上で止め、爪先を奥へ突き出さないように。", "boss");
  };
  P.damageYard = function (items, message) {
    this.yardDebris = items.filter(alive).map(p => ({ p: Object.assign({}, p), x: p.x, y: p.y, age: 0 }));
    items.filter(alive).forEach(p => {
      p.forkDamaged = true; p.damageCause = message; p.pickupActive = false; p.placed = false;
      this.forkAccidents++;
    });
    this.drag = null; this.stopVirtualPad(); this.releaseForklift(); this.flash = .8;
    Sfx.play("glass"); UI.toast(message + "：破損・運賃対象外", true);
    const next = this.packages.find(alive);
    this.selectedId = null;
    if (next) this.selectPickupCargo(next); else this.layoutPickupBay();
    this.invalidateInspection(); this.updateControls();
  };
  P.checkRearStrike = function () {
    if (!this.stage || this.mode !== "playing" || this.phase !== "pickup" || this.forklift.forkedId) return false;
    const r = this.yardRelations();
    if (this.selected !== r.front || !r.rear || !alive(r.rear)) return false;
    const fork = this.forkRect(), box = this.renderRect(r.rear);
    if (fork.x + fork.width > box.x && fork.y + fork.height > box.y && fork.y < box.y + box.height) {
      this.damageYard([r.rear], "差し込み過ぎで奥の貨物に爪が接触"); return true;
    }
    return false;
  };
  const oldAttempt = P.attemptPickup;
  const precisePalletCheck = P.palletForkCheck;
  P.palletForkCheck = function (pkg) {
    const check = precisePalletCheck.call(this, pkg);
    const r = this.yardRelations();
    if (this.phase === "pickup" && pkg === r.top && r.bottom && alive(r.bottom) && alive(pkg)) {
      check.tolerance = 18;
      check.heightOk = check.verticalError <= check.tolerance;
      check.valid = check.heightOk && check.weightOk && check.ratio >= .75;
    }
    return check;
  };
  const oldVirtualControl = P.setVirtualControl;
  P.setVirtualControl = function (axis, value, pressed) {
    if (axis === "lift" && value === -1 && this.mode === "playing" && this.phase === "pickup") {
      if (pressed && !this.forklift.forkedId) {
        const pkg = this.resolvePickupTarget();
        if (pkg && this.palletForkCheck(pkg).valid) {
          this.attemptPickup(pkg); return;
        }
      }
    }
    oldVirtualControl.call(this, axis, value, pressed);
  };
  // A visible upper pallet is a physical target even while the lower pallet is selected.
  P.resolvePickupTarget = function () {
    if (!this.stage || this.phase !== "pickup" || this.forklift.forkedId) return this.selected;
    const r = this.yardRelations(), fork = this.forkRect();
    if (this.selected !== r.bottom && this.selected !== r.top) return this.selected;
    const nearUpperHole = r.top && alive(r.top) && this.palletForkCheck(r.top).heightOk;
    const target = nearUpperHole ? r.top : [r.top, r.bottom].find(p => p && alive(p) && (() => {
      const box = this.renderRect(p);
      return fork.y + fork.height > box.y && fork.y < box.y + box.height;
    })());
    if (target && target !== this.selected) {
      this.packages.forEach(p => { p.pickupActive = p === target; });
      this.selectedId = target.id;
      this.updateControls();
    }
    return this.selected;
  };
  P.attemptPickup = function (pkg) {
    pkg = this.resolvePickupTarget() || pkg;
    if (this.checkRearStrike()) return false;
    const r = this.yardRelations();
    if (pkg === r.bottom && alive(r.top) && this.palletForkCheck(pkg).valid) {
      this.damageYard([r.bottom, r.top], "下段から持ち上げて段積み貨物が転倒"); return false;
    }
    return oldAttempt.call(this, pkg);
  };
  for (const method of ["pickupPointerMove", "stepVirtualPad"]) {
    const old = P[method];
    P[method] = function (...args) { old.apply(this, args); this.checkRearStrike(); };
  }
  const assistedStep = P.stepVirtualPad;
  P.stepVirtualPad = function (dt) {
    if (this.mode === "playing" && this.phase === "pickup") {
      if (this.forklift.forkedId && this.mobilePad.lift) {
        this.forklift.forkY = clamp(this.forklift.forkY + this.mobilePad.lift * 105 * dt, 200, 536);
        this.forklift.targetForkY = this.forklift.forkY;
        this.syncPickedCargo();
      }
    }
    assistedStep.call(this, dt);
  };
  const oldDraw = P.draw;
  P.draw = function () {
    oldDraw.call(this);
    if (this.phase !== "pickup" || this.mode !== "playing") return;
    const c = this.ctx;
    for (const d of this.yardDebris || []) {
      if (d.age > 1.5) continue;
      c.save(); c.globalAlpha = 1 - d.age / 1.5;
      c.translate(d.x, d.y + Math.min(110, d.age * d.age * 180)); c.rotate(d.age * 1.4);
      const p = Object.assign({}, d.p, { x: 0, y: 0 }); this.drawPackage(c, p); c.restore();
    }
    c.fillStyle = "#e8fff5"; c.font = "bold 15px sans-serif";
    c.fillText(this.stage.id >= 3 ? "段積みは上から ／ 前後配置は手前から ／ 爪の突き出しに注意" : this.stage.id >= 2 ? "段積みは上から。上段をタップして選択" : "基本練習：パレット穴へ75%以上差し込む", 700, 245);
  };
  // Night highway driving lives in js/drive.js.
})();
