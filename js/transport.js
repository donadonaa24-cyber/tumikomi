(function () {
  "use strict";
  const P = Game.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const alive = p => !p.transported && !p.forkDamaged;
  const oldStart = P.startStage;
  P.startStage = function (id) {
    this.yardDebris = []; this.road = null;
    oldStart.call(this, id);
    if (id >= 2) UI.dialogue("段積みです。上段をタップして先に取り出します。下段を持ち上げると転倒・破損します。", "boss");
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
  // A visible upper pallet is a physical target even while the lower pallet is selected.
  P.resolvePickupTarget = function () {
    if (!this.stage || this.phase !== "pickup" || this.forklift.forkedId) return this.selected;
    const r = this.yardRelations(), fork = this.forkRect();
    if (this.selected !== r.bottom && this.selected !== r.top) return this.selected;
    const target = [r.top, r.bottom].find(p => p && alive(p) && (() => {
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

  function asset(name) { const i = new Image(); i.src = "assets/images/" + name + ".png"; return i; }
  function sprite(c, i, x, y, w, h, color) {
    if (i && i.complete && i.naturalWidth) {
      c.save();
      // The civilian source has an opaque preview background; crop at its silhouette when compositing.
      if (i.src.includes("car-civilian")) {
        c.translate(x, y); c.scale(w, h); c.beginPath();
        c.moveTo(.5, .025); c.bezierCurveTo(.76, .025, .81, .08, .805, .235);
        c.lineTo(.885, .297); c.lineTo(.81, .32); c.lineTo(.83, .85);
        c.bezierCurveTo(.83, .98, .72, .994, .5, .994);
        c.bezierCurveTo(.28, .994, .17, .98, .17, .85);
        c.lineTo(.19, .32); c.lineTo(.115, .297); c.lineTo(.195, .235);
        c.bezierCurveTo(.19, .08, .24, .025, .5, .025); c.closePath(); c.clip();
        c.drawImage(i, 0, 0, 1, 1);
      } else c.drawImage(i, x, y, w, h);
      c.restore();
    }
    else { c.fillStyle = color; c.fillRect(x + w * .15, y, w * .7, h); }
  }
  const oldBegin = P.beginDrive;
  P.makeRoadPattern = function (index) {
    const shift = (index % 5) * 24;
    const events = [
      { at: 560 + shift, lane: index % 2, name: "落下した資材", length: 0 },
      { at: 1200 + shift, lane: Math.floor(index / 2) % 2, name: "片側工事ゾーン", length: 100, construction: true },
      { at: 1880 + shift, lane: (index + 1) % 2, name: "路上の障害物", length: 0 }
    ];
    // Traffic belongs to separate road sections, outside each hazard's escape corridor.
    const cars = [180, 820 + shift, 1520 + shift, 2220 + shift].map((at, n) => ({
      at, lane: 0, speed: 90 + (index % 3) * 5, cruise: 90 + (index % 3) * 5,
      patrol: n === index % 4, stopAt: events.find(e => e.at > at)?.at - 340 || Infinity
    }));
    cars.push({ at: -240 - index * 10, lane: 1, speed: 120, cruise: 120, overtaker: true, stopAt: events[0].at - 340 });
    return { events, cars };
  };
  P.beginDrive = function () {
    oldBegin.call(this);
    if (this.mode !== "driving") return;
    this.roadImages = this.roadImages || { city: asset("night-city"), map: asset("highway-map"), truck: asset("truck-top-cutout"), car: asset("car-civilian"), patrol: asset("patrol-top-cutout") };
    const pattern = Math.floor(Math.random() * 10);
    this.road = Object.assign({ speed: 80, distance: 0, length: 2500, lane: 0, x: 548, pattern,
      seconds: 0, gas: false, brake: false, brakeDamage: 0, loss: 0, hits: 0, fines: 0, cooldown: 0, rightSeconds: 0, lanePenalties: 0,
      warning: "通常80km/h。アクセルで120まで加速。離して減速、急ブレーキに注意。" }, this.makeRoadPattern(pattern));
    this.updateControls();
    UI.toast("通常80・アクセルで最大120km/h。離すと緩やかに80へ。110m手前から回避案内。120km/hでは判断を素早く！");
  };
  P.roadControl = function (key, pressed) {
    if (this.mode !== "driving" || !this.road) return;
    if (this.road.paused && pressed) return;
    if (key === "gas") this.road.gas = pressed;
    if (key === "brake") {
      if (pressed && !this.road.brake) {
        this.road.brakeStart = this.road.speed; this.road.brakeChecked = false;
        this.road.brakeRisk = Math.random();
      }
      this.road.brake = pressed;
    }
    if (pressed && key === "left") this.road.lane = 0;
    if (pressed && key === "right") this.road.lane = 1;
  };
  P.toggleRoadPause = function () {
    if (this.mode !== "driving" || !this.road) return;
    this.road.paused = !this.road.paused;
    this.road.gas = false; this.road.brake = false;
    document.querySelectorAll("[data-road]").forEach(b => b.classList.remove("is-pressed"));
    this.updateControls();
  };
  P.handleControlKey = function (key, pressed, repeat) {
    key = key.toLowerCase();
    if (this.mode === "driving") {
      if (key === "p" || key === "escape") { if (pressed && !repeat) this.toggleRoadPause(); return true; }
      const action = { w: "gas", s: "brake", a: "left", d: "right" }[key];
      if (action) { this.roadControl(action, pressed); return true; }
    }
    if (this.mode === "playing" && this.phase === "pickup") {
      const action = { w: ["lift", -1], s: ["lift", 1], a: ["drive", -1], d: ["drive", 1] }[key];
      if (action) { this.setVirtualControl(action[0], action[1], pressed); return true; }
      if (key === "e") { if (pressed && !repeat) this.activateVirtualPickup(); return true; }
    }
    return false;
  };
  P.roadIncident = function (message, loss, fine) {
    const r = this.road;
    r.warning = message; r.cooldown = 2;
    if (fine) r.fines++; else { r.hits++; r.speed = Math.min(r.speed, 65); }
    this.flash = .4; Sfx.play(fine ? "error" : "bump"); UI.toast(message + (fine ? " −3点" : " −5点"), true);
  };
  // Match visible vehicle bodies, with a small forgiving inset (mirrors are excluded).
  P.roadContact = function (object, obstacle) {
    const r = this.road, centerX = object.lane ? 732 : 548;
    const centerY = this.roadObjectY(object.at);
    const halfWidth = obstacle ? 55 : 27, halfHeight = obstacle ? 20 : 53;
    return r.x + 34 > centerX - halfWidth && r.x - 34 < centerX + halfWidth &&
      630 > centerY - halfHeight - (object.length || 0) * 5 && 490 < centerY + halfHeight;
  };
  // One distance-based projection for lane markings, road tiles, hazards and collisions.
  P.roadObjectY = function (at) { return 535 - (at - this.road.distance) * 5; };
  P.updateRoad = function (dt) {
    const r = this.road;
    if (!r || r.paused || document.hidden) return;
    r.seconds += dt; r.cooldown = Math.max(0, r.cooldown - dt);
    r.speed = r.brake ? Math.max(0, r.speed - 45 * dt) : r.gas ? Math.min(120, r.speed + 14 * dt) :
      r.speed > 80 ? Math.max(80, r.speed - 10 * dt) : Math.min(80, r.speed + 10 * dt);
    if (r.brake && !r.brakeChecked && r.brakeStart >= 100 && r.brakeStart - r.speed >= 25) {
      r.brakeChecked = true;
      if (r.brakeRisk < .35) { r.brakeDamage++; r.warning = "急ブレーキで荷傷み −5点"; r.cooldown = 2; this.flash = .4; UI.toast(r.warning, true); }
    }
    const previousDistance = r.distance;
    const travelDt = dt * 1.75;
    r.distance += r.speed / 3.6 * travelDt;
    r.x += ((r.lane ? 732 : 548) - r.x) * Math.min(1, dt * 5);
    const upcoming = r.events.find(e => !e.done && e.at >= r.distance);
    if (!r.cooldown) r.warning = upcoming && upcoming.at - r.distance < 110 ?
      upcoming.name + "まで" + Math.ceil(upcoming.at - r.distance) + "m ／ " + (upcoming.lane ? "左" : "右") + "車線へ回避" :
      "通常80 ／ アクセルで120・離して減速 ／ 急ブレーキは荷傷みの危険";
    for (const e of r.events) if (!e.done) {
      if (!e.hit && this.roadContact(e, true)) { e.hit = true; this.roadIncident(e.name + "に接触", 0, false); }
      if (r.distance > e.at + (e.length || 0) + 90) e.done = true;
    }
    // Front-to-back following: a full truck plus clearance fits between every two cars.
    const leaders = {};
    for (const car of [...r.cars].sort((a, b) => b.at - a.at)) {
      const leader = leaders[car.lane];
      // Release queued traffic once the player has cleared its protected hazard corridor.
      const nextHazard = r.events.find(e => r.distance <= e.at + (e.length || 0) + 220 && car.at < e.at);
      if (car.cruise != null) car.stopAt = nextHazard ? nextHazard.at - 340 : Infinity;
      const playerAhead = car.overtaker && car.at < r.distance && Math.abs(r.x - 732) < 85;
      const stop = Math.min(car.stopAt ?? Infinity, leader ? leader.at - 220 : Infinity, playerAhead ? r.distance - 35 : Infinity);
      if (car.cruise != null) car.speed = Math.min(car.cruise, Math.max(0, (stop - car.at) * 1.5));
      car.nextAt = Math.min(stop, car.at + car.speed / 3.6 * travelDt);
      leaders[car.lane] = { at: car.nextAt };
    }
    for (const car of r.cars) {
      const before = car.at - previousDistance;
      car.at = car.nextAt;
      const relative = car.at - r.distance;
      if (car.overtaker && relative < 0 && relative > -150 && r.lane === 1) {
        const leftBlocked = r.events.some(e => e.lane === 0 && r.distance > e.at - 180 && r.distance < e.at + (e.length || 0) + 110) ||
          r.cars.some(other => other !== car && other.lane === 0 && Math.abs(other.at - r.distance) < 100);
        car.yieldSeconds = leftBlocked ? 0 : (car.yieldSeconds || 0) + dt;
        if (!r.cooldown) r.warning = leftBlocked ? "後続車が接近。左の安全を確認してから譲ってください" : "右後方から120km/hの車！左へ譲ってください（猶予4秒）";
        if (car.yieldSeconds >= 4 && !car.yieldPenalized) {
          car.yieldPenalized = true; r.lanePenalties++; r.cooldown = 2;
          UI.toast("追越車に道を譲りましょう −3点", true);
        }
      } else if (car.overtaker) car.yieldSeconds = 0;
      if (car.patrol) {
        if (before >= 0 && relative < 0) car.monitorUntil = r.seconds + 5;
        const monitored = (relative >= 0 && relative < 50) || r.seconds < (car.monitorUntil || 0);
        if (monitored && !car.ticketed) {
          if (!r.cooldown) r.warning = "パトカー監視中：90km/h以上で−3点 ／ 追越後5秒まで";
          if (r.speed >= 90) { car.ticketed = true; this.roadIncident("追越時・追越後の速度超過", 0, true); }
        }
      }
      if (!car.hit && this.roadContact(car, false)) {
        car.hit = true; this.roadIncident("他車両に接触", 0, false);
      }
    }
    const telemetry = document.getElementById("roadTelemetry");
    const needsRight = r.events.some(e => e.lane === 0 && r.distance >= e.at - 180 && r.distance <= e.at + (e.length || 0) + 110) ||
      r.cars.some(car => car.lane === 0 && car.at - r.distance > -65 && car.at - r.distance < 140);
    if (r.lane === 1 && !needsRight) r.rightSeconds += dt;
    else r.rightSeconds = 0;
    if (r.rightSeconds >= 8) {
      r.lanePenalties++; r.rightSeconds = 0; r.warning = "追越後は左車線へ戻りましょう −3点"; r.cooldown = 2; UI.toast(r.warning, true);
    } else if (r.rightSeconds >= 4 && !r.cooldown) r.warning = "左車線へ戻ってください。右車線の連続走行は8秒で−3点";
    const alert = document.getElementById("roadAlert");
    if (telemetry) telemetry.textContent = Math.round(r.speed) + " km/h　残り" + Math.max(0, Math.ceil(r.length - r.distance)) + "m　減点 " + (r.hits * 5 + r.fines * 3 + r.brakeDamage * 5 + r.lanePenalties * 3) + "点";
    if (alert) alert.textContent = r.warning;
    if (r.distance >= r.length) {
      const result = this.driveResult;
      const delay = Math.max(0, Math.ceil((r.seconds - 150) / 5)) * 500;
      result.netRevenue = Math.max(0, result.netRevenue - r.loss - delay);
      result.damageLoss += r.loss; result.timePenalty += delay;
      result.score = Math.max(0, result.score - r.hits * 5 - r.fines * 3 - r.brakeDamage * 5 - r.lanePenalties * 3);
      result.rank = Scoring.rankFor(result.score);
      result.passed = result.passed && result.netRevenue >= this.stage.targetRevenue;
      result.penalties = result.penalties.filter(p => !p.includes("荷物は無事"));
      result.penalties.push("高速配送 " + Math.round(r.seconds) + "秒 ／ 接触・荷傷み " + r.hits + "件 ／ 速度違反 " + r.fines + "件");
      result.penalties.push("急ブレーキによる荷傷み " + r.brakeDamage + "件 ／ コース " + (r.pattern + 1));
      result.penalties.push("右車線の連続走行 " + r.lanePenalties + "件（各−3点）");
      if (delay) result.penalties.push("配送目安150秒超過：" + Scoring.yen(delay));
      this.finishDrive();
    }
  };
  const oldUpdate = P.update;
  P.update = function (dt) {
    for (const d of this.yardDebris || []) d.age += dt;
    if (this.mode === "driving") { this.flash = Math.max(0, this.flash - dt); this.updateRoad(dt); }
    else oldUpdate.call(this, dt);
  };
  const oldControls = P.updateControls;
  P.updateControls = function () {
    oldControls.call(this);
    const panel = document.getElementById("roadControls");
    if (panel) panel.hidden = this.mode !== "driving";
    const pause = document.getElementById("roadPauseButton");
    if (pause) {
      pause.hidden = this.mode !== "driving";
      pause.textContent = this.road && this.road.paused ? "▶ 再開" : "Ⅱ 一時停止";
      pause.setAttribute("aria-pressed", String(Boolean(this.road && this.road.paused)));
    }
    if (document.body && document.body.classList) document.body.classList.toggle("is-driving-phase", this.mode === "driving");
  };
  P.drawDriving = function (c) {
    const r = this.road; if (!r) return;
    const i = this.roadImages, scroll = r.distance * 5;
    c.fillStyle = "#031020"; c.fillRect(0, 0, 1280, 720);
    if (i.city.complete && i.city.naturalWidth) {
      const offset = (r.distance * .65) % 1280;
      c.drawImage(i.city, -offset, 0, 1280, 720); c.drawImage(i.city, 1280 - offset, 0, 1280, 720);
    }
    c.fillStyle = "rgba(2,12,25,.38)"; c.fillRect(0, 0, 1280, 720);
    const bend = r.events.some(e => e.name.includes("急カーブ") && Math.abs(r.distance - e.at) < 110) ? Math.sin(r.distance / 80) * 35 : 0;
    c.save(); c.translate(bend, 0);
    c.fillStyle = "#182331"; c.fillRect(350, 0, 580, 720);
    if (i.map.complete && i.map.naturalWidth) {
      const offset = scroll % 720;
      c.drawImage(i.map, 300, offset - 720, 680, 720); c.drawImage(i.map, 300, offset, 680, 720);
    }
    // Explicit lane markings keep collision geometry legible regardless of the generated tile.
    c.fillStyle = "rgba(22,31,45,.65)"; c.fillRect(448, 0, 384, 720);
    c.strokeStyle = "#d1e5ed"; c.lineWidth = 3;
    c.setLineDash([30, 35]); c.lineDashOffset = -scroll;
    c.beginPath(); c.moveTo(640, 0); c.lineTo(640, 720); c.stroke(); c.setLineDash([]);
    for (const e of r.events) {
      const y = this.roadObjectY(e.at);
      if (y < -60 || y - (e.length || 0) * 5 > 780) continue;
      const x = e.lane ? 732 : 548;
      if (e.construction) {
        c.fillStyle = "rgba(238,160,40,.35)"; c.fillRect(x - 75, y - e.length * 5, 150, e.length * 5);
        for (let cone = 0; cone <= e.length; cone += 20) {
          c.fillStyle = "#ff8b32"; c.beginPath(); c.moveTo(x - 80, y - cone * 5);
          c.lineTo(x - 67, y - cone * 5 - 22); c.lineTo(x - 54, y - cone * 5); c.fill();
        }
      }
      c.fillStyle = e.hit ? "#74625d" : "#ecab44"; c.fillRect(x - 62, y - 26, 124, 52);
      c.fillStyle = "#302820";
      for (let stripe = 0; stripe < 5; stripe++) c.fillRect(x - 57 + stripe * 25, y - 22, 10, 44);
      c.fillStyle = "#fff"; c.font = "bold 17px sans-serif"; c.fillText(e.name, x - 75, y - 35);
    }
    for (const car of r.cars) {
      const y = this.roadObjectY(car.at);
      if (y < -160 || y > 780) continue;
      sprite(c, car.patrol ? i.patrol : i.car, (car.lane ? 732 : 548) - 43, y - 65, 86, 130, "#b5c4d0");
      this.drawRoadLights(c, car.lane ? 732 : 548, y - 65, 86, 130);
      if (car.patrol) { c.fillStyle = Math.floor(r.seconds * 5) % 2 ? "#ff3846" : "#ffbabd"; c.fillRect((car.lane ? 732 : 548) - 15, y - 6, 30, 6); }
    }
    sprite(c, i.truck, r.x - 50, 475, 100, 170, "#25b779");
    this.drawRoadLights(c, r.x, 475, 100, 170); c.restore();
    c.fillStyle = "rgba(2,17,30,.94)"; c.fillRect(20, 20, 340, 190);
    c.fillStyle = "#81e8bd"; c.font = "bold 22px sans-serif"; c.fillText("翠路 NIGHT EXPRESS", 38, 55);
    c.fillStyle = r.speed > 80 ? "#ff7a64" : "#fff"; c.font = "bold 54px monospace"; c.fillText(Math.round(r.speed) + " km/h", 38, 120);
    c.font = "20px sans-serif"; c.fillText("制限80 ／ 残り " + Math.max(0, Math.ceil(r.length - r.distance)) + "m", 38, 160);
    c.fillText(Math.floor(r.seconds) + "秒 / 150秒　減点 " + (r.hits * 5 + r.fines * 3 + r.brakeDamage * 5 + r.lanePenalties * 3), 38, 192);
    c.fillStyle = "rgba(2,17,30,.94)"; c.fillRect(20, 657, 1240, 48);
    c.fillStyle = "#fff"; c.font = "bold 23px sans-serif"; c.fillText(r.warning, 38, 690);
    c.fillStyle = "#7ce8b8"; c.fillRect(25, 638, 1230 * clamp(r.distance / r.length, 0, 1), 6);
    if (r.paused) {
      c.fillStyle = "rgba(2,17,30,.75)"; c.fillRect(0, 0, 1280, 720);
      c.fillStyle = "#fff"; c.font = "bold 46px sans-serif"; c.fillText("一時停止中", 520, 340);
      c.font = "24px sans-serif"; c.fillText("右上の再開ボタン / P・Esc", 470, 390);
    }
  };
  P.drawRoadLights = function (c, x, y, width, height) {
    c.save();
    for (const side of [-1, 1]) {
      const lx = x + side * width * .25;
      const glow = c.createLinearGradient(lx, y - 100, lx, y);
      glow.addColorStop(0, "rgba(223,244,255,0)"); glow.addColorStop(1, "rgba(223,244,255,.24)");
      c.fillStyle = glow; c.beginPath(); c.moveTo(lx - 22, y - 100); c.lineTo(lx + 22, y - 100);
      c.lineTo(lx + 5, y); c.lineTo(lx - 5, y); c.fill();
      c.fillStyle = "#edfcff"; c.fillRect(lx - 4, y + 4, 8, 5);
      c.fillStyle = "#ff384a"; c.fillRect(lx - 4, y + height - 9, 8, 5);
    }
    c.restore();
  };
})();
