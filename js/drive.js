(function () {
  "use strict";
  // Night highway delivery (arcade style). Loaded after transport.js; owns every driving method on Game.prototype.
  const P = Game.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const DRIVE = {
    lanes: 3,
    laneX: [504, 640, 776],
    roadLeft: 436,
    roadRight: 844,
    pxPerM: 3.6,
    playerY: 590,
    tempo: 2.2,
    maxSpeed: 90,
    startSpeed: 60,
    length: 3600,
    baseLimit: 90,
    patrolChance: .35,
    delayStep: 5,
    delayYen: 500
  };
  const SIZE = {
    player: { w: 76, len: 140 / DRIVE.pxPerM },
    car: { w: 58, len: 96 / DRIVE.pxPerM },
    truck: { w: 66, len: 150 / DRIVE.pxPerM },
    patrol: { w: 58, len: 96 / DRIVE.pxPerM },
    broken: { w: 58, len: 96 / DRIVE.pxPerM }
  };

  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Route ----------
  // A route is a list of sections placed along the road: lane closures, debris, a broken-down car,
  // a congestion tail, an on-ramp merge and a tunnel. Every run shuffles them, so routes vary.
  P.buildRoute = function (seed) {
    const random = seeded(seed);
    const pool = ["construction", "debris", "breakdown", "congestion", "merge", "tunnel", "debris"];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const events = [];
    let at = 520;
    for (const kind of pool) {
      if (at > DRIVE.length - 900) break;
      const e = { kind, at: Math.round(at) };
      if (kind === "construction") Object.assign(e, { lane: random() < .5 ? 0 : 2, length: 190, limit: 60, signAt: e.at - 160, name: "工事・車線規制" });
      if (kind === "debris") Object.assign(e, { lane: Math.floor(random() * 3), length: 8, name: "落下物" });
      if (kind === "breakdown") Object.assign(e, { lane: 0, length: 10, name: "故障車" });
      if (kind === "congestion") Object.assign(e, { length: 260, advisory: 40, signAt: e.at - 420, name: "渋滞" });
      if (kind === "merge") Object.assign(e, { lane: 0, length: 170, name: "合流" });
      if (kind === "tunnel") Object.assign(e, { length: 340, limit: 70, signAt: e.at - 140, name: "トンネル" });
      events.push(e);
      at = e.at + (e.length || 0) + 330 + random() * 170;
    }
    const patrol = random() < DRIVE.patrolChance ? { at: 700 + Math.round(random() * 1700), lane: 1 } : null;
    return { seed, events, patrol, length: DRIVE.length, exitAt: DRIVE.length - 40 };
  };

  P.laneX = function (lane) { return DRIVE.laneX[clamp(lane, 0, DRIVE.lanes - 1)]; };

  P.limitAt = function (distance) {
    const r = this.road;
    let limit = DRIVE.baseLimit;
    for (const e of r.events) if (e.limit && distance >= (e.signAt || e.at) && distance <= e.at + e.length) limit = Math.min(limit, e.limit);
    return limit;
  };

  P.zoneAt = function (distance) {
    return this.road.events.find(e => (e.limit || e.advisory) && distance >= (e.signAt || e.at) && distance <= e.at + e.length) || null;
  };

  // Lane blocked by a closure, debris or broken-down car around a distance.
  P.laneClosedAt = function (lane, from, to) {
    return this.road.events.some(e => ["construction", "debris", "breakdown"].includes(e.kind) && e.lane === lane && to >= e.at - 20 && from <= e.at + e.length);
  };

  P.targetSeconds = function () {
    const r = this.road;
    let seconds = 0;
    for (let d = 0; d < r.length; d += 10) {
      const e = r.events.find(ev => ev.advisory && d >= ev.at && d <= ev.at + ev.length);
      const speed = e ? e.advisory : this.limitAt(d);
      seconds += 10 / (speed / 3.6 * DRIVE.tempo);
    }
    return Math.round(seconds * 1.45 + 12);
  };

  // ---------- Setup ----------
  function asset(name) { const i = new Image(); i.src = "assets/images/" + name + ".png"; return i; }

  const baseBegin = P.beginDrive;
  P.beginDrive = function (seed) {
    baseBegin.call(this);
    if (this.mode !== "driving") return;
    this.roadImages = this.roadImages || { city: asset("night-city"), truck: asset("truck-top-cutout"), car: asset("car-civilian"), patrol: asset("patrol-top-cutout") };
    const route = this.buildRoute(seed == null ? Math.floor(Math.random() * 2147483647) : seed);
    const audit = this.driveResult || {};
    // Loose or badly balanced loads sway more under hard steering and braking.
    const sensitivity = 1 + .3 * ((audit.unstable || []).length) + (audit.topHeavy ? .5 : 0) + (audit.balanceOk === false ? .3 : 0) +
      .15 * ((audit.unsecured || []).length);
    this.road = Object.assign({
      speed: DRIVE.startSpeed, distance: 0, lane: 0, x: DRIVE.laneX[0], seconds: 0, gas: false, brake: false, paused: false,
      cars: [], popups: [], nextCarId: 1, spawnTimer: 0, fastTimer: 2,
      collisions: 0, violations: 0, swayDamage: 0, sway: 0, sensitivity, points: 0, combo: 0, bestCombo: 0,
      overSeconds: 0, zoneFlags: {}, tailgate: 0, laneMove: 0, blink: 0, shake: 0, cooldown: 0, warning: "",
      exitMissed: false, exitTaken: false, finished: false, merged: {}, patrolTicketed: false
    }, route);
    // Traffic draws from its own seeded stream so a route replays identically.
    this.road.random = seeded((this.road.seed ^ 0x5bd1e995) >>> 0);
    this.road.target = this.targetSeconds();
    this.seedTraffic();
    this.updateControls();
    UI.toast("夜間配送スタート！最高90km/h。標識の制限速度と車間距離を守って、出口まで届けよう。");
  };

  P.makeCar = function (kind, lane, at, speed) {
    const size = SIZE[kind];
    const car = { id: this.road.nextCarId++, kind, lane, x: DRIVE.laneX[lane], at, speed, cruise: speed, len: size.len, w: size.w,
      laneFrom: lane, laneTo: lane, laneT: 1, signal: 0, braking: false, passed: false, hit: false };
    this.road.cars.push(car);
    return car;
  };

  function laneSpeed(lane, random) {
    return lane === 0 ? 62 + random() * 12 : lane === 1 ? 74 + random() * 10 : 94 + random() * 10;
  }

  P.spaceFree = function (lane, at, margin, ignore) {
    const r = this.road;
    if (lane === r.lane || Math.abs(r.x - DRIVE.laneX[lane]) < 60) {
      if (Math.abs(at - r.distance) < margin) return false;
    }
    return !r.cars.some(c => c !== ignore && (c.lane === lane || c.laneTo === lane) && Math.abs(c.at - at) < margin);
  };

  P.seedTraffic = function () {
    const r = this.road;
    for (let at = 120; at < 520; at += 70 + r.random() * 60) {
      const lane = r.random() < .55 ? 0 : 1;
      if (this.spaceFree(lane, at, 45) && !this.laneClosedAt(lane, at - 60, at + 120)) this.makeCar(lane === 0 && r.random() < .5 ? "truck" : "car", lane, at, laneSpeed(lane, r.random));
    }
    if (r.patrol) r.patrolSpawned = false;
  };

  // Keeps a steady flow: slower traffic appears ahead, faster traffic arrives from behind in the right lanes.
  P.spawnTraffic = function (dt) {
    const r = this.road;
    r.spawnTimer -= dt;
    r.fastTimer -= dt;
    const ahead = r.distance + 330 + r.random() * 60;
    const congestion = r.events.find(e => e.kind === "congestion" && ahead >= e.at && ahead <= e.at + e.length);
    if (r.spawnTimer <= 0 && ahead < r.length - 60) {
      r.spawnTimer = congestion ? .35 : .9 + r.random() * .9;
      const lanes = congestion ? [0, 1, 2] : [0, 0, 1];
      const lane = lanes[Math.floor(r.random() * lanes.length)];
      const speed = congestion ? 32 + r.random() * 8 : laneSpeed(lane, r.random);
      if (this.spaceFree(lane, ahead, congestion ? 34 : 60) && !this.laneClosedAt(lane, ahead - 80, ahead + 160)) {
        this.makeCar(lane === 0 && !congestion && r.random() < .5 ? "truck" : "car", lane, ahead, speed);
      }
    }
    if (r.fastTimer <= 0) {
      r.fastTimer = 2.5 + r.random() * 2.5;
      const lane = r.random() < .75 ? 2 : 1;
      const behind = r.distance - 190;
      if (behind > 0 && this.spaceFree(lane, behind, 70) && !this.laneClosedAt(lane, behind, behind + 260)) this.makeCar("car", lane, behind, laneSpeed(2, r.random));
    }
    if (r.patrol && !r.patrolSpawned && r.distance > r.patrol.at - 360) {
      r.patrolSpawned = true;
      this.makeCar("patrol", r.patrol.lane, r.distance + 210, 75);
    }
    for (const e of r.events) {
      if (e.kind === "merge" && !e.spawned && r.distance > e.at - 260) {
        e.spawned = true;
        const car = this.makeCar("car", 0, e.at - 40, 58);
        car.ramp = true; car.x = DRIVE.roadLeft - 70; car.mergeEvent = e;
      }
    }
    r.cars = r.cars.filter(c => c.at > r.distance - 260 && c.at < r.distance + 650);
  };

  // ---------- Controls ----------
  P.roadControl = function (key, pressed) {
    if (this.mode !== "driving" || !this.road) return;
    const r = this.road;
    if (r.paused && pressed) return;
    if (key === "gas") r.gas = pressed;
    if (key === "brake") r.brake = pressed;
    if (pressed && (key === "left" || key === "right")) this.changeLane(key === "left" ? -1 : 1);
  };

  P.changeLane = function (dir) {
    const r = this.road;
    const next = clamp(r.lane + dir, 0, DRIVE.lanes - 1);
    if (next === r.lane) return;
    r.lane = next;
    r.blink = 1.1;
    r.blinkDir = dir;
    // Quick steering at speed shakes the cargo.
    r.sway += Math.pow(r.speed / DRIVE.maxSpeed, 2) * 14 * r.sensitivity;
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
      const action = { w: "gas", arrowup: "gas", s: "brake", arrowdown: "brake", " ": "brake", a: "left", arrowleft: "left", d: "right", arrowright: "right" }[key];
      if (action) {
        if ((action === "left" || action === "right") && repeat) return true;
        this.roadControl(action, pressed);
        return true;
      }
    }
    if (this.mode === "playing" && this.phase === "pickup") {
      const action = { w: ["lift", -1], s: ["lift", 1], a: ["drive", -1], d: ["drive", 1] }[key];
      if (action) { this.setVirtualControl(action[0], action[1], pressed); return true; }
      if (key === "e") { if (pressed && !repeat) this.activateVirtualPickup(); return true; }
    }
    return false;
  };

  // ---------- Simulation ----------
  P.roadObjectY = function (at) { return DRIVE.playerY - (at - this.road.distance) * DRIVE.pxPerM; };

  P.popup = function (text, color) {
    this.road.popups.push({ text, color: color || "#7ce8b8", age: 0 });
  };

  P.addPoints = function (points, text, color) {
    const r = this.road;
    r.points = Math.max(0, r.points + points);
    if (text) this.popup(text + (points > 0 ? " +" + points : " " + points), color);
  };

  P.breakCombo = function () { this.road.combo = 0; };

  P.driveIncident = function (message, kind) {
    const r = this.road;
    r.warning = message; r.cooldown = 1.4;
    this.flash = .4; r.shake = .45;
    this.breakCombo();
    if (kind === "collision") {
      r.collisions++; r.speed = Math.min(r.speed, 35); r.sway += 45 * r.sensitivity;
      this.addPoints(-300, "接触", "#ff715b"); Sfx.play("bump");
    } else if (kind === "violation") {
      r.violations++; this.addPoints(-200, "速度超過", "#ff715b"); Sfx.play("error");
    } else if (kind === "sway") {
      r.swayDamage++; this.addPoints(-200, "荷傷み", "#ff715b"); Sfx.play("glass");
    }
    UI.toast(message, true);
  };

  function overlaps(ax, aw, aAt, aLen, bx, bw, bAt, bLen) {
    return Math.abs(ax - bx) < (aw + bw) / 2 * .82 && Math.abs(aAt - bAt) < (aLen + bLen) / 2 * .86;
  }

  P.updateTraffic = function (dt, travel) {
    const r = this.road;
    const cars = r.cars.slice().sort((a, b) => b.at - a.at);
    const zoneDesired = at => {
      const jam = r.events.find(e => e.kind === "congestion" && at >= e.at - 30 && at <= e.at + e.length);
      return jam ? 34 : null;
    };
    for (const car of cars) {
      if (car.kind === "broken") continue;
      let desired = car.cruise;
      const jam = zoneDesired(car.at);
      if (jam) desired = Math.min(desired, jam + (car.id % 5));
      const limit = this.limitAt(car.at);
      if (car.kind !== "patrol" && limit < DRIVE.baseLimit) desired = Math.min(desired, limit - 2 + (car.id % 4));
      if (car.kind === "patrol") desired = Math.min(75, limit);
      // Follow whatever is ahead in the same lane, including the player.
      const lane = car.laneTo;
      let leaderGap = Infinity, leaderSpeed = desired;
      for (const other of cars) {
        if (other === car || other.ramp || (other.laneTo !== lane && other.lane !== lane) || other.at <= car.at) continue;
        const gap = other.at - other.len / 2 - (car.at + car.len / 2);
        if (gap < leaderGap) { leaderGap = gap; leaderSpeed = other.speed; }
      }
      if (Math.abs(r.x - car.x) < 70 && r.distance > car.at) {
        const gap = r.distance - SIZE.player.len / 2 - (car.at + car.len / 2);
        if (gap < leaderGap) { leaderGap = gap; leaderSpeed = r.speed; }
      }
      // The safe gap grows with speed and with how fast the car is closing in (in compressed game time).
      const closing = Math.max(0, (car.speed - leaderSpeed) / 3.6 * DRIVE.tempo);
      const safeGap = 12 + car.speed * .3 + closing * 1.4;
      if (leaderGap < safeGap) desired = Math.min(desired, leaderSpeed - (safeGap - leaderGap) * .5);
      // Obstacles ahead in this lane: change lanes early, otherwise slow down behind them (never a dead stop).
      const blockedAhead = car.laneT >= 1 && this.laneClosedAt(car.lane, car.at, car.at + 230);
      if (blockedAhead) {
        if (!this.tryCarLaneChange(car, true)) desired = Math.min(desired, 22);
      } else if (car.laneT >= 1 && !car.ramp && leaderGap < safeGap * 1.6 && leaderSpeed < car.cruise - 8 && r.random() < dt * .8) {
        this.tryCarLaneChange(car, false);
      }
      if (car.ramp) {
        const e = car.mergeEvent;
        desired = Math.max(desired, 62);
        if (car.at >= e.at + e.length - 15) { desired = 0; car.at = Math.min(car.at, e.at + e.length - 15); }
        if (car.at > e.at && car.laneT >= 1) {
          if (this.spaceFree(0, car.at, 40, car)) {
            car.ramp = false; car.laneFrom = -1; car.laneT = 0; car.signal = 0;
            if (r.lane !== 0 && Math.abs(r.distance - car.at) < 90 && !r.merged[e.at]) { r.merged[e.at] = true; this.addPoints(150, "ナイス譲り", "#ffbd59"); r.combo++; }
          } else desired = Math.min(desired, 45);
        }
      }
      desired = Math.max(car.ramp ? 0 : blockedAhead ? 20 : 12, desired);
      const accel = desired > car.speed ? 10 : -45;
      const before = car.speed;
      car.speed = desired > car.speed ? Math.min(desired, car.speed + accel * dt) : Math.max(desired, car.speed + accel * dt);
      if (leaderGap < 4) car.speed = Math.min(car.speed, leaderSpeed);
      car.braking = car.speed < before - .05;
      car.nextAt = car.at + car.speed / 3.6 * travel;
      if (car.laneT < 1) {
        car.signal = Math.max(0, car.signal - dt);
        if (car.signal <= 0) car.laneT = Math.min(1, car.laneT + dt / 1.1);
      }
    }
    for (const car of r.cars) {
      if (car.nextAt != null) { car.at = car.nextAt; car.nextAt = null; }
      const fromX = car.laneFrom < 0 ? DRIVE.roadLeft - 70 : DRIVE.laneX[car.laneFrom];
      if (!car.ramp) car.x = fromX + (DRIVE.laneX[car.laneTo] - fromX) * easeInOut(car.laneT);
      if (car.laneT >= 1) car.lane = car.laneTo;
    }
  };

  function easeInOut(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  P.tryCarLaneChange = function (car, forced) {
    const options = [car.lane - 1, car.lane + 1].filter(l => l >= 0 && l < DRIVE.lanes && !(car.kind === "truck" && l === 2));
    if (!forced) options.sort((a, b) => b - a);
    for (const lane of options) {
      if (this.laneClosedAt(lane, car.at - 20, car.at + 200)) continue;
      if (!this.spaceFree(lane, car.at, forced ? car.len + 14 : car.len + 30, car)) continue;
      car.laneFrom = car.lane; car.laneTo = lane; car.laneT = 0; car.signal = forced ? .5 : 1;
      return true;
    }
    return false;
  };

  P.updateRoad = function (dt) {
    const r = this.road;
    if (!r || r.paused || document.hidden || r.finished) return;
    r.seconds += dt;
    r.cooldown = Math.max(0, r.cooldown - dt);
    r.shake = Math.max(0, r.shake - dt);
    r.blink = Math.max(0, r.blink - dt);
    // Speed: gas accelerates (slower with heavy payloads), brake slows, otherwise the truck holds its speed.
    const payloadRatio = this.driveResult ? clamp(this.driveResult.payloadKg / Math.max(1, this.driveResult.maxPayloadKg), 0, 1.2) : 0;
    const accel = 15 * (1 - payloadRatio * .35);
    if (r.brake) {
      r.speed = Math.max(0, r.speed - 34 * dt);
      if (r.speed > 40) r.sway += (r.speed / DRIVE.maxSpeed) * 16 * dt * r.sensitivity;
    } else if (r.gas) r.speed = Math.min(DRIVE.maxSpeed, r.speed + accel * dt);
    // No pedal input: the truck cruises at its current speed.
    const travel = dt * DRIVE.tempo;
    const previous = r.distance;
    r.distance += r.speed / 3.6 * travel;
    const moved = r.distance - previous;
    r.x += (DRIVE.laneX[r.lane] - r.x) * Math.min(1, dt * 7);
    this.spawnTraffic(dt);
    this.updateTraffic(dt, travel);
    r.points += (r.speed / DRIVE.maxSpeed) * moved * .5;

    // Collisions with traffic and obstacles.
    const px = r.x, pw = SIZE.player.w, pAt = r.distance, pLen = SIZE.player.len;
    if (!r.cooldown) {
      for (const car of r.cars) {
        if (car.hit) continue;
        if (overlaps(px, pw, pAt, pLen, car.x, car.w, car.at, car.len)) {
          if (car.at < pAt && r.blink <= 0 && Math.abs(r.x - DRIVE.laneX[r.lane]) < 8) {
            car.at = pAt - (pLen + car.len) / 2 - 2; car.speed = Math.min(car.speed, r.speed);
            continue;
          }
          if (car.laneT < 1) {
            // A car cutting in backs out of its lane change; a close call, not the player's fault.
            const from = car.laneFrom; car.laneFrom = car.laneTo; car.laneTo = from < 0 ? car.laneTo : from; car.laneT = 1 - car.laneT;
            r.warning = "危ない！割り込み車に注意"; r.cooldown = 1; this.breakCombo();
            continue;
          }
          car.hit = true; car.speed = Math.max(car.speed, r.speed + 5);
          this.driveIncident("他の車に接触！ 車間距離と車線変更に注意 −5点", "collision");
          break;
        }
      }
      for (const e of r.events) {
        if (e.hit || !["construction", "debris", "breakdown"].includes(e.kind)) continue;
        const center = e.at + e.length / 2;
        if (overlaps(px, pw, pAt, pLen, DRIVE.laneX[e.lane], 110, center, e.length + 6)) {
          e.hit = true; this.driveIncident(e.name + "に接触！ −5点", "collision");
        }
      }
    }
    // Overtakes: passing a car in another lane without touching it builds a combo.
    for (const car of r.cars) {
      if (car.at > r.distance + (pLen + car.len) / 2) car.wasAhead = true;
      if (car.passed || car.hit || !car.wasAhead || car.at > r.distance) continue;
      if (car.at < r.distance - (pLen + car.len) / 2 && Math.abs(car.x - r.x) > 60) {
        car.passed = true;
        if (car.kind === "broken") continue;
        r.combo = Math.min(9, r.combo + 1); r.bestCombo = Math.max(r.bestCombo, r.combo);
        this.addPoints(40 * Math.min(5, r.combo), r.combo > 1 ? "追い越し x" + r.combo : "追い越し");
        if (car.kind === "patrol" && r.speed > this.limitAt(r.distance) + 3 && !r.patrolTicketed) {
          r.patrolTicketed = true;
          this.driveIncident("パトカーの前で速度超過！ −3点", "violation");
        }
      }
    }
    // Speed limits: each zone is judged once; staying within it earns a section bonus.
    const zone = this.zoneAt(r.distance);
    const limit = this.limitAt(r.distance);
    if (zone && zone.limit) {
      const flags = r.zoneFlags[zone.at] = r.zoneFlags[zone.at] || { over: 0, violated: false, collisions: r.collisions };
      if (r.speed > limit + 3) {
        flags.over += dt;
        if (!r.cooldown) r.warning = "制限" + limit + "km/h！ 減速してください";
        if (flags.over >= 1.5 && !flags.violated) { flags.violated = true; this.driveIncident(zone.name + "で速度超過 −3点", "violation"); }
      }
    }
    for (const e of r.events) {
      if (e.cleared || r.distance < e.at + e.length) continue;
      e.cleared = true;
      if (!["construction", "tunnel", "congestion"].includes(e.kind)) continue;
      const flags = r.zoneFlags[e.at] || { violated: false, collisions: r.collisions };
      if (!flags.violated && !e.hit && (flags.collisions == null || flags.collisions === r.collisions)) this.addPoints(200, e.name + " クリア", "#ffbd59");
    }
    // Tailgating drains points.
    const leader = r.cars.filter(c => Math.abs(c.x - r.x) < 50 && c.at > r.distance).sort((a, b) => a.at - b.at)[0];
    const gap = leader ? leader.at - leader.len / 2 - (r.distance + pLen / 2) : Infinity;
    if (gap < 9 && r.speed > 30) {
      r.tailgate += dt;
      if (r.tailgate > .8) { r.points = Math.max(0, r.points - 15 * dt); if (!r.cooldown) r.warning = "車間距離が近すぎます！"; }
      if (r.tailgate > 2.5) { this.breakCombo(); r.tailgate = 0; }
    } else r.tailgate = 0;
    // Cargo sway settles over time; too much damages the load.
    r.sway = Math.max(0, r.sway - 13 * dt);
    if (r.sway >= 100) { this.driveIncident("急な操作で荷物が大きく揺れた！ 荷傷み −5点", "sway"); r.sway = 45; }
    // Upcoming hazard guidance.
    if (!r.cooldown && !(zone && zone.limit && r.speed > limit + 3) && r.tailgate <= .8) r.warning = this.upcomingMessage();
    for (const p of r.popups) p.age += dt;
    r.popups = r.popups.filter(p => p.age < 1.4);
    // Exit.
    if (!r.exitTaken && !r.exitMissed && r.distance >= r.exitAt) {
      if (r.lane === 0 && Math.abs(r.x - DRIVE.laneX[0]) < 40) { r.exitTaken = true; this.addPoints(300, "出口OK", "#ffbd59"); }
      else { r.exitMissed = true; r.seconds += 25; this.breakCombo(); UI.toast("出口を通過… 次のインターから戻ります（+25秒）", true); }
    }
    this.updateRoadTelemetry();
    if (r.distance >= r.length) this.arriveDrive();
  };

  P.upcomingMessage = function () {
    const r = this.road;
    const exitLeft = r.exitAt - r.distance;
    if (exitLeft < 900 && exitLeft > 0) return "出口まで" + Math.ceil(exitLeft / 100) * 100 + "m ／ " + (r.lane === 0 ? "左車線OK、このまま出口へ" : "左車線へ移ってください");
    const next = r.events.find(e => e.at + e.length > r.distance && r.distance >= e.at - 360);
    if (next) {
      const d = Math.max(0, Math.ceil(next.at - r.distance));
      const laneName = ["左", "中央", "右"][next.lane];
      if (next.kind === "construction") return d ? next.name + "まで" + d + "m ／ " + laneName + "車線が閉鎖・制限60" : "工事区間 ／ 制限60km/h";
      if (next.kind === "debris") return next.name + "まで" + d + "m ／ " + laneName + "車線をふさいでいます";
      if (next.kind === "breakdown") return next.name + "まで" + d + "m ／ 左車線に停車中・ハザード点灯";
      if (next.kind === "congestion") return d ? "この先" + d + "m 渋滞 ／ 早めに減速" : "渋滞中 ／ 前の車に合わせて";
      if (next.kind === "merge") return d ? "合流まで" + d + "m ／ 左から車が入ります。譲るとボーナス" : "合流地点 ／ 左の車に注意";
      if (next.kind === "tunnel") return d ? "トンネルまで" + d + "m ／ 制限70km/h" : "トンネル内 ／ 制限70km/h";
    }
    if (r.patrolSpawned && r.cars.some(c => c.kind === "patrol" && Math.abs(c.at - r.distance) < 160)) return "パトカーが走行中 ／ 制限速度を守って追い越そう";
    return "最高90km/h ／ 追い越しでコンボ ／ 急ハンドル・急ブレーキは荷揺れに注意";
  };

  P.updateRoadTelemetry = function () {
    const r = this.road;
    const telemetry = document.getElementById("roadTelemetry");
    const alert = document.getElementById("roadAlert");
    if (telemetry) telemetry.textContent = Math.round(r.speed) + " km/h（制限" + this.limitAt(r.distance) + "）　残り" + Math.max(0, Math.ceil(r.length - r.distance)) + "m　" + Math.round(r.points) + "pt";
    if (alert) alert.textContent = r.warning;
  };

  P.arriveDrive = function () {
    const r = this.road;
    r.finished = true;
    const result = this.driveResult;
    const late = Math.max(0, r.seconds - r.target);
    const delay = late > 0 ? Math.ceil(late / DRIVE.delayStep) * DRIVE.delayYen : 0;
    if (late <= 0) this.addPoints(Math.round((r.target - r.seconds) * 20), "定時到着");
    result.loadScore = result.score;
    result.netRevenue = Math.max(0, result.netRevenue - delay);
    result.timePenalty += delay;
    result.score = Math.max(0, result.score - r.collisions * 5 - r.violations * 3 - r.swayDamage * 5);
    result.rank = Scoring.rankFor(result.score);
    result.passed = result.passed && result.netRevenue >= this.stage.targetRevenue;
    result.penalties = result.penalties.filter(p => !p.includes("荷物は無事"));
    result.penalties.push("夜間配送 " + Math.round(r.seconds) + "秒（目安" + r.target + "秒） ／ 接触 " + r.collisions + "件 ／ 速度超過 " + r.violations + "件 ／ 荷傷み " + r.swayDamage + "件");
    result.penalties.push("運転ポイント " + Math.round(r.points) + "pt ／ 最大コンボ x" + r.bestCombo + (r.patrol ? " ／ パトカー出現" : "") + (r.exitMissed ? " ／ 出口通過（+25秒）" : ""));
    if (delay) result.penalties.push("配送目安" + r.target + "秒超過：" + Scoring.yen(delay));
    result.drive = { collisions: r.collisions, violations: r.violations, swayDamage: r.swayDamage, points: Math.round(r.points), bestCombo: r.bestCombo,
      seconds: Math.round(r.seconds), target: r.target, lateSeconds: Math.round(late), exitMissed: r.exitMissed, patrol: Boolean(r.patrol) };
    this.finishDrive();
  };

  const baseUpdate = P.update;
  P.update = function (dt) {
    for (const d of this.yardDebris || []) d.age += dt;
    if (this.mode === "driving") { this.flash = Math.max(0, this.flash - dt); this.updateRoad(dt); }
    else baseUpdate.call(this, dt);
  };

  const baseControls = P.updateControls;
  P.updateControls = function () {
    baseControls.call(this);
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

  // ---------- Drawing ----------
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
    } else {
      c.fillStyle = color; c.fillRect(x + w * .12, y, w * .76, h);
      c.fillStyle = "rgba(10,20,30,.55)"; c.fillRect(x + w * .2, y + h * .18, w * .6, h * .2);
    }
  }

  P.drawVehicleLights = function (c, x, top, w, h, opts) {
    const o = opts || {};
    c.save();
    for (const side of [-1, 1]) {
      const lx = x + side * w * .28;
      const glow = c.createLinearGradient(lx, top - 90, lx, top);
      glow.addColorStop(0, "rgba(223,244,255,0)"); glow.addColorStop(1, "rgba(223,244,255,.2)");
      c.fillStyle = glow; c.beginPath(); c.moveTo(lx - 20, top - 90); c.lineTo(lx + 20, top - 90); c.lineTo(lx + 5, top); c.lineTo(lx - 5, top); c.fill();
      c.fillStyle = "#edfcff"; c.fillRect(lx - 4, top + 3, 8, 4);
      c.fillStyle = o.braking ? "#ff2436" : "#a3202c";
      c.fillRect(lx - 5, top + h - 8, 10, 5);
      if (o.braking) { c.fillStyle = "rgba(255,40,60,.35)"; c.beginPath(); c.arc(lx, top + h - 5, 13, 0, Math.PI * 2); c.fill(); }
      const blinkOn = Math.floor(performance.now() / 260) % 2 === 0;
      if ((o.hazard || (o.signal && ((o.signal < 0 && side < 0) || (o.signal > 0 && side > 0)))) && blinkOn) {
        c.fillStyle = "#ffb627"; c.fillRect(lx + side * 5 - 3, top + 1, 6, 5); c.fillRect(lx + side * 5 - 3, top + h - 10, 6, 5);
      }
    }
    c.restore();
  };

  P.drawDriving = function (c) {
    const r = this.road; if (!r) return;
    const i = this.roadImages;
    const px = DRIVE.pxPerM;
    const scroll = r.distance * px;
    const shakeX = r.shake ? Math.sin(r.seconds * 90) * 6 * r.shake : 0;
    c.save(); c.translate(shakeX, 0);
    // City backdrop, parallax.
    c.fillStyle = "#031020"; c.fillRect(-10, 0, 1300, 720);
    if (i.city.complete && i.city.naturalWidth) {
      const offset = (r.distance * .8) % 720;
      c.globalAlpha = .75;
      c.drawImage(i.city, 0, offset - 720, 1280, 720); c.drawImage(i.city, 0, offset, 1280, 720);
      c.globalAlpha = 1;
    }
    c.fillStyle = "rgba(2,12,25,.45)"; c.fillRect(0, 0, 1280, 720);
    const inTunnel = r.events.some(e => e.kind === "tunnel" && r.distance >= e.at && r.distance <= e.at + e.length);
    // Road surface and shoulders.
    c.fillStyle = "#1b222c"; c.fillRect(DRIVE.roadLeft - 34, 0, DRIVE.roadRight - DRIVE.roadLeft + 68, 720);
    c.fillStyle = "#262f3b"; c.fillRect(DRIVE.roadLeft, 0, DRIVE.roadRight - DRIVE.roadLeft, 720);
    // On-ramp surfaces for merges.
    for (const e of r.events) {
      if (e.kind !== "merge") continue;
      const y1 = this.roadObjectY(e.at + e.length), y0 = this.roadObjectY(e.at - 240);
      if (y1 > 760 || y0 < -40) continue;
      c.fillStyle = "#262f3b";
      c.beginPath(); c.moveTo(DRIVE.roadLeft - 110, y0); c.lineTo(DRIVE.roadLeft, y0); c.lineTo(DRIVE.roadLeft, y1); c.lineTo(DRIVE.roadLeft - 10, y1); c.closePath(); c.fill();
      c.strokeStyle = "#e9f0f4"; c.setLineDash([14, 14]); c.beginPath(); c.moveTo(DRIVE.roadLeft, y0); c.lineTo(DRIVE.roadLeft, this.roadObjectY(e.at)); c.stroke(); c.setLineDash([]);
    }
    // Lane markings.
    c.strokeStyle = "#e9f0f4"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(DRIVE.roadLeft + 4, 0); c.lineTo(DRIVE.roadLeft + 4, 720); c.moveTo(DRIVE.roadRight - 4, 0); c.lineTo(DRIVE.roadRight - 4, 720); c.stroke();
    c.lineWidth = 3; c.setLineDash([34, 40]); c.lineDashOffset = -scroll;
    for (const lx of [572, 708]) { c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx, 720); c.stroke(); }
    c.setLineDash([]);
    // Guardrail posts and street lamps scroll with distance, so speed is always readable.
    for (let m = Math.floor((r.distance - 60) / 20) * 20; m < r.distance + 200; m += 20) {
      const y = this.roadObjectY(m);
      c.fillStyle = "#6f7c8c"; c.fillRect(DRIVE.roadLeft - 30, y, 6, 12); c.fillRect(DRIVE.roadRight + 24, y, 6, 12);
      if (m % 80 === 0) {
        for (const lx of [DRIVE.roadLeft - 20, DRIVE.roadRight + 20]) {
          const glow = c.createRadialGradient(lx, y, 2, lx, y, 60);
          glow.addColorStop(0, inTunnel ? "rgba(255,170,70,.55)" : "rgba(255,226,160,.42)");
          glow.addColorStop(1, "rgba(255,226,160,0)");
          c.fillStyle = glow; c.beginPath(); c.arc(lx, y, 60, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#fff4d6"; c.beginPath(); c.arc(lx, y, 3, 0, Math.PI * 2); c.fill();
        }
      }
      if (m % 100 === 0 && m > 0) {
        c.fillStyle = "#e7eef2"; c.font = "bold 11px sans-serif"; c.fillText((m / 1000).toFixed(1) + "km", DRIVE.roadRight + 36, y + 10);
      }
    }
    c.fillStyle = "#8b98a8"; c.fillRect(DRIVE.roadLeft - 34, 0, 4, 720); c.fillRect(DRIVE.roadRight + 30, 0, 4, 720);
    // Events.
    for (const e of r.events) this.drawRoadEvent(c, e);
    this.drawRoadSigns(c);
    // Vehicles.
    for (const car of r.cars) {
      const y = this.roadObjectY(car.at);
      const h = car.len * px;
      const top = y - h / 2;
      if (top > 740 || top + h < -60) continue;
      const img = car.kind === "patrol" ? i.patrol : car.kind === "truck" ? i.truck : i.car;
      if (car.kind === "truck") {
        c.save(); c.globalAlpha = .92; sprite(c, img, car.x - car.w / 2, top, car.w, h, "#8aa0b5"); c.restore();
        // Other trucks get a different cab and body color so they never read as the player's green truck.
        c.fillStyle = ["rgba(210,90,60,.82)", "rgba(80,120,190,.82)", "rgba(230,190,70,.82)"][car.id % 3];
        c.fillRect(car.x - car.w * .34, top + h * .02, car.w * .68, h * .2);
        c.fillStyle = "rgba(20,30,50,.35)"; c.fillRect(car.x - car.w / 2 + 8, top + h * .3, car.w - 16, h * .62);
      } else sprite(c, img, car.x - car.w / 2, top, car.w, h, car.kind === "patrol" ? "#f2f5f7" : "#b5c4d0");
      const signal = car.laneT < 1 || car.signal > 0 ? Math.sign(car.laneTo - car.laneFrom) || -1 : 0;
      this.drawVehicleLights(c, car.x, top, car.w, h, { braking: car.braking, signal, hazard: car.speed < 40 && !car.ramp });
      if (car.kind === "patrol") { c.fillStyle = Math.floor(r.seconds * 5) % 2 ? "#ff3846" : "#4a7bff"; c.fillRect(car.x - 14, top + h * .45, 28, 6); }
    }
    // Player truck.
    const ph = SIZE.player.len * px;
    const pTop = DRIVE.playerY - ph / 2;
    const tilt = (DRIVE.laneX[r.lane] - r.x) * -.0022;
    c.save(); c.translate(r.x, DRIVE.playerY); c.rotate(tilt); c.translate(-r.x, -DRIVE.playerY);
    sprite(c, i.truck, r.x - SIZE.player.w / 2, pTop, SIZE.player.w, ph, "#25b779");
    this.drawVehicleLights(c, r.x, pTop, SIZE.player.w, ph, { braking: r.brake, signal: r.blink > 0 ? r.blinkDir : 0 });
    c.restore();
    if (inTunnel) { c.fillStyle = "rgba(10,8,4,.35)"; c.fillRect(0, 0, 1280, 720); }
    // Speed lines at the edges.
    if (r.speed > 75) {
      c.strokeStyle = "rgba(200,230,255," + ((r.speed - 75) / 60) + ")"; c.lineWidth = 2;
      for (let n = 0; n < 12; n++) {
        const y = ((n * 97 + scroll * 1.6) % 760) - 40;
        c.beginPath(); c.moveTo(60 + (n % 3) * 90, y); c.lineTo(60 + (n % 3) * 90, y + 50); c.moveTo(1220 - (n % 3) * 90, y); c.lineTo(1220 - (n % 3) * 90, y + 50); c.stroke();
      }
    }
    // Floating score popups.
    for (const p of r.popups) {
      c.globalAlpha = 1 - p.age / 1.4; c.fillStyle = p.color; c.font = "900 24px sans-serif"; c.textAlign = "center";
      c.fillText(p.text, r.x, pTop - 20 - p.age * 60); c.globalAlpha = 1; c.textAlign = "left";
    }
    c.restore();
    this.drawDriveHud(c);
  };

  P.drawRoadEvent = function (c, e) {
    const px = DRIVE.pxPerM;
    const yStart = this.roadObjectY(e.at), yEnd = this.roadObjectY(e.at + e.length);
    if (yEnd > 760 || yStart < -60) return;
    if (e.kind === "construction") {
      const x = DRIVE.laneX[e.lane];
      c.fillStyle = "rgba(238,150,40,.22)"; c.fillRect(x - 66, yEnd, 132, yStart - yEnd);
      for (let m = 0; m <= e.length; m += 12) {
        const y = this.roadObjectY(e.at + m);
        const offset = m < 30 ? (30 - m) * (e.lane === 0 ? -1.4 : 1.4) : 0;
        c.fillStyle = "#ff7b22"; c.beginPath(); c.moveTo(x + offset - 10, y); c.lineTo(x + offset, y - 22); c.lineTo(x + offset + 10, y); c.fill();
        c.fillStyle = "#f5f5f5"; c.fillRect(x + offset - 5, y - 12, 10, 3);
      }
      c.fillStyle = "#ffcc33"; c.fillRect(x - 40, yStart - 10, 80, 20); c.fillStyle = "#222"; c.font = "bold 13px sans-serif"; c.textAlign = "center"; c.fillText("工事中", x, yStart + 5); c.textAlign = "left";
    } else if (e.kind === "debris") {
      const x = DRIVE.laneX[e.lane], y = (yStart + yEnd) / 2;
      c.fillStyle = e.hit ? "#5e5048" : "#8a6a44"; c.fillRect(x - 30, y - 10, 60, 20); c.fillStyle = "#c79a5e"; c.fillRect(x - 22, y - 16, 34, 10);
      c.fillStyle = "#fff"; c.font = "bold 13px sans-serif"; c.fillText("落下物", x - 20, y - 22);
    } else if (e.kind === "breakdown") {
      const x = DRIVE.laneX[e.lane], h = SIZE.car.len * px, top = yEnd;
      sprite(c, this.roadImages.car, x - SIZE.car.w / 2, top, SIZE.car.w, h, "#9aa7b4");
      this.drawVehicleLights(c, x, top, SIZE.car.w, h, { hazard: true });
      c.fillStyle = "#ff3a3a"; c.beginPath(); c.moveTo(x, yStart + 40); c.lineTo(x - 10, yStart + 58); c.lineTo(x + 10, yStart + 58); c.closePath(); c.fill();
      c.fillStyle = "#fff"; c.font = "bold 12px sans-serif"; c.fillText("故障車", x - 18, top - 8);
    } else if (e.kind === "tunnel") {
      c.fillStyle = "rgba(60,48,32,.9)"; c.fillRect(DRIVE.roadLeft - 60, yEnd, 26, yStart - yEnd); c.fillRect(DRIVE.roadRight + 34, yEnd, 26, yStart - yEnd);
      c.fillStyle = "#3a3f47"; c.fillRect(DRIVE.roadLeft - 60, yStart - 14, DRIVE.roadRight - DRIVE.roadLeft + 120, 14);
    } else if (e.kind === "congestion") {
      c.fillStyle = "rgba(255,90,60,.08)"; c.fillRect(DRIVE.roadLeft, yEnd, DRIVE.roadRight - DRIVE.roadLeft, yStart - yEnd);
    }
  };

  P.drawRoadSigns = function (c) {
    const r = this.road;
    const sign = (at, draw) => { const y = this.roadObjectY(at); if (y > -60 && y < 760) draw(y); };
    for (const e of r.events) {
      if (e.limit) sign(e.signAt, y => this.drawLimitSign(c, DRIVE.roadRight + 70, y, e.limit));
      if (e.kind === "congestion") sign(e.signAt, y => this.drawGantry(c, y, "この先 渋滞 追突注意"));
      if (e.kind === "construction") sign(e.at - 300, y => this.drawGantry(c, y, "工事 " + ["左", "中央", "右"][e.lane] + "車線規制 300m"));
      if (e.kind === "merge") sign(e.at - 200, y => this.drawGantry(c, y, "合流注意"));
      if (e.limit) sign(e.at + e.length, y => this.drawLimitSign(c, DRIVE.roadRight + 70, y, DRIVE.baseLimit));
    }
    for (const d of [900, 500, 250]) sign(r.exitAt - d, y => this.drawExitSign(c, y, d));
  };

  P.drawLimitSign = function (c, x, y, limit) {
    c.fillStyle = "#6f7c8c"; c.fillRect(x - 2, y, 4, 34);
    c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y - 4, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#e0202c"; c.lineWidth = 6; c.beginPath(); c.arc(x, y - 4, 19, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#1a3fa0"; c.font = "900 18px sans-serif"; c.textAlign = "center"; c.fillText(String(limit), x, y + 2); c.textAlign = "left";
  };

  P.drawGantry = function (c, y, text) {
    c.fillStyle = "#56616e"; c.fillRect(DRIVE.roadLeft - 30, y - 4, DRIVE.roadRight - DRIVE.roadLeft + 60, 8);
    c.fillStyle = "#0c1a12"; c.fillRect(560, y - 24, 160, 34);
    c.fillStyle = "#ffb627"; c.font = "bold 14px sans-serif"; c.textAlign = "center"; c.fillText(text, 640, y - 2, 150); c.textAlign = "left";
  };

  P.drawExitSign = function (c, y, distance) {
    c.fillStyle = "#1b7a4a"; c.fillRect(DRIVE.roadLeft - 150, y - 26, 118, 44);
    c.strokeStyle = "#fff"; c.lineWidth = 2; c.strokeRect(DRIVE.roadLeft - 147, y - 23, 112, 38);
    c.fillStyle = "#fff"; c.font = "bold 13px sans-serif"; c.fillText("出口 " + distance + "m", DRIVE.roadLeft - 138, y - 6); c.fillText("← 左車線", DRIVE.roadLeft - 138, y + 10);
  };

  P.drawDriveHud = function (c) {
    const r = this.road;
    const limit = this.limitAt(r.distance);
    // Speedometer.
    c.fillStyle = "rgba(2,17,30,.9)"; c.fillRect(20, 20, 300, 180);
    c.fillStyle = "#81e8bd"; c.font = "bold 18px sans-serif"; c.fillText("翠路 NIGHT EXPRESS", 36, 46);
    const cx = 110, cy = 150;
    c.lineWidth = 10; c.strokeStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(cx, cy, 70, Math.PI, Math.PI * 2); c.stroke();
    c.strokeStyle = r.speed > limit + 3 ? "#ff5b47" : "#25d391"; c.beginPath(); c.arc(cx, cy, 70, Math.PI, Math.PI + Math.PI * clamp(r.speed / 100, 0, 1)); c.stroke();
    const la = Math.PI + Math.PI * limit / 100; c.strokeStyle = "#ffbd59"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx + Math.cos(la) * 58, cy + Math.sin(la) * 58); c.lineTo(cx + Math.cos(la) * 82, cy + Math.sin(la) * 82); c.stroke();
    c.fillStyle = r.speed > limit + 3 ? "#ff7a64" : "#fff"; c.font = "bold 40px monospace"; c.textAlign = "center"; c.fillText(String(Math.round(r.speed)), cx, cy - 8);
    c.font = "12px sans-serif"; c.fillStyle = "#9fb0c0"; c.fillText("km/h", cx, cy + 10); c.textAlign = "left";
    this.drawLimitSign(c, 240, 118, limit);
    c.fillStyle = "#cfe0ea"; c.font = "12px sans-serif"; c.fillText("制限速度", 214, 170);
    // Score, combo, progress, time.
    c.fillStyle = "rgba(2,17,30,.9)"; c.fillRect(960, 20, 300, 180);
    c.fillStyle = "#9fb0c0"; c.font = "bold 12px sans-serif"; c.fillText("DRIVE POINTS", 978, 44);
    c.fillStyle = "#fff"; c.font = "bold 36px monospace"; c.fillText(String(Math.round(r.points)), 978, 84);
    if (r.combo > 1) { c.fillStyle = "#ffbd59"; c.font = "900 22px sans-serif"; c.fillText("COMBO x" + r.combo, 1128, 82); }
    c.fillStyle = "#9fb0c0"; c.font = "13px sans-serif";
    c.fillText("残り " + Math.max(0, Math.ceil(r.length - r.distance)) + "m", 978, 116);
    c.fillStyle = r.seconds > r.target ? "#ff7a64" : "#cfe0ea";
    c.fillText(Math.floor(r.seconds) + "秒 / 目安" + r.target + "秒", 1100, 116);
    c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(978, 130, 264, 8);
    c.fillStyle = "#7ce8b8"; c.fillRect(978, 130, 264 * clamp(r.distance / r.length, 0, 1), 8);
    c.fillStyle = "#cfe0ea"; c.font = "13px sans-serif";
    c.fillText("接触 " + r.collisions + "　速度超過 " + r.violations + "　荷傷み " + r.swayDamage, 978, 166);
    if (r.patrol) { c.fillStyle = "#6fa0ff"; c.fillText("パトカー巡回中", 978, 188); }
    // Cargo sway gauge.
    c.fillStyle = "rgba(2,17,30,.9)"; c.fillRect(20, 220, 70, 250);
    c.fillStyle = "#9fb0c0"; c.font = "bold 12px sans-serif"; c.fillText("荷揺れ", 34, 242);
    c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(44, 254, 22, 200);
    const sway = clamp(r.sway, 0, 100);
    c.fillStyle = sway > 75 ? "#ff5b47" : sway > 45 ? "#ffbd59" : "#25d391";
    c.fillRect(44, 454 - sway * 2, 22, sway * 2);
    if (r.sensitivity > 1.05) { c.fillStyle = "#ffbd59"; c.font = "10px sans-serif"; c.fillText("揺れやすい", 28, 466); }
    // Guidance bar.
    c.fillStyle = "rgba(2,17,30,.94)"; c.fillRect(20, 657, 1240, 48);
    c.fillStyle = "#fff"; c.font = "bold 22px sans-serif"; c.fillText(r.warning || "", 38, 690, 1200);
    if (r.paused) {
      c.fillStyle = "rgba(2,17,30,.75)"; c.fillRect(0, 0, 1280, 720);
      c.fillStyle = "#fff"; c.font = "bold 46px sans-serif"; c.textAlign = "center"; c.fillText("一時停止中", 640, 340);
      c.font = "24px sans-serif"; c.fillText("右上の再開ボタン / P・Esc", 640, 390); c.textAlign = "left";
    }
  };

  window.DriveConfig = DRIVE;
})();
