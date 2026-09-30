"use strict";
require("./transport-test.js");
const assert = require("assert");
const D = DriveConfig;
const ctx = new Proxy({}, { get: (_, k) => k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : k === "measureText" ? () => ({ width: 100 }) : () => {} });

function laneRisk(g, lane, ahead) {
  const r = g.road;
  if (g.laneClosedAt(lane, r.distance - 34, r.distance + ahead)) return 999;
  let risk = 0;
  for (const c of r.cars) {
    if (Math.abs(c.x - D.laneX[lane]) > 60) continue;
    const rel = c.at - r.distance;
    if (rel > -30 && rel < ahead) risk += (ahead - Math.max(0, rel)) * (c.speed < r.speed ? 1 : .2);
    if (rel > -48 && rel < 38) return 999; // mirror check: never steer into a car alongside
  }
  return risk;
}
// A careful driver: keeps the limit and distance, changes lanes around blockages, moves left for the exit.
function careful(g) {
  const r = g.road, limit = g.limitAt(r.distance + 60);
  const jam = r.events.find((e) => e.kind === "congestion" && r.distance > e.at - 180 && r.distance < e.at + e.length);
  const leader = r.cars.filter((c) => Math.abs(c.x - r.x) < 50 && c.at > r.distance).sort((a, b) => a.at - b.at)[0];
  const gap = leader ? leader.at - leader.len / 2 - (r.distance + 20) : 999;
  const want = Math.min(limit - 1, jam ? 38 : 90, gap < 45 ? leader.speed - 3 : 90);
  g.roadControl("gas", r.speed < want - 1); g.roadControl("brake", r.speed > want + 2 || gap < 14);
  if (r.blink > 0) return;
  const exitNear = r.exitAt - r.distance < 700;
  let best = r.lane, bestRisk = laneRisk(g, r.lane, 150);
  for (const l of [r.lane - 1, r.lane + 1]) if (l >= 0 && l < 3) {
    const k = laneRisk(g, l, 150) + (exitNear ? l * 400 : l === 2 ? 60 : 0);
    if (k < bestRisk - 40) { best = l; bestRisk = k; }
  }
  if (exitNear && r.lane > 0 && laneRisk(g, r.lane - 1, 60) < 999) best = r.lane - 1;
  if (best !== r.lane) g.roadControl(best < r.lane ? "left" : "right", true);
}

let collisions = 0, fastPasses = 0, playerPasses = 0, exits = 0;
for (let seed = 1; seed <= 12; seed++) {
  const g = new Game({ getContext: () => ctx }); g.startStage(1); g.beginDrive(seed * 7331);
  Object.assign(g.driveResult, { passed: true, netRevenue: 15500, score: 100 });
  const r = g.road;
  const seenAhead = new Set();
  let t = 0;
  while (g.mode === "driving" && t < 300) {
    careful(g); g.update(1 / 60); t += 1 / 60;
    for (const car of r.cars) {
      // Normal traffic keeps moving unless it is queued behind the player or waiting at an on-ramp.
      const behindPlayer = car.at < r.distance && Math.abs(car.x - r.x) < 75;
      if (!car.ramp && !behindPlayer && car.laneFrom >= 0 && Math.abs(car.at - r.distance) < 220) assert(car.speed >= 11.9, `Seed ${seed}: traffic must not stop on the open road`);
      if (car.at < r.distance - 30) {
        if (!car.counted && seenAhead.has(car.id)) { car.counted = true; playerPasses++; }
      } else if (car.at > r.distance + 30) {
        if (!seenAhead.has(car.id) && car.at < r.distance + 200 && car.startBehind) fastPasses++;
        seenAhead.add(car.id);
      }
      if (car.startBehind == null) car.startBehind = car.at < r.distance;
    }
    g.draw();
  }
  assert.strictEqual(g.mode, "result", `Seed ${seed}: route must be finishable`);
  assert(r.collisions <= 2, `Seed ${seed}: careful driving stays nearly contact-free (${r.collisions})`);
  assert.strictEqual(r.violations, 0, `Seed ${seed}: keeping the posted limit avoids violations`);
  collisions += r.collisions;
  if (r.exitTaken) exits++;
}
assert(collisions <= 8, "Careful driving over 12 routes stays low on contacts (" + collisions + ")");
assert(playerPasses > 20, "The player overtakes slower traffic");
assert(fastPasses > 10, "Faster traffic arrives from behind and moves ahead, so the road never looks frozen");
assert(exits >= 9, "Moving left for the exit usually works (" + exits + "/12)");
console.log("12 seeded routes passed: finishable, moving traffic, overtakes both ways, no violations at the posted limit, exits taken.");
