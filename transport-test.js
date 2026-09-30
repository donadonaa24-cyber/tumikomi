"use strict";
require("./smoke-test.js");
const assert = require("assert");
const vm = require("vm");
const fs = require("fs");
vm.runInThisContext(fs.readFileSync("js/transport.js", "utf8"));
UI.hideDialogue = function () {};
const context = new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : key === "measureText" ? () => ({ width: 100 }) : () => {} });
function game(stage) { const g = new Game({ getContext: () => context }); g.startStage(stage); return g; }
// The animation loop runs on the homepage before a mission has been selected.
const idleGame = new Game({ getContext: () => context });
assert.doesNotThrow(() => { idleGame.update(.016); idleGame.draw(); });
assert.strictEqual(idleGame.checkRearStrike(), false);
assert.deepStrictEqual(idleGame.yardRelations(), { bottom: null, top: null, front: null, rear: null });
idleGame.startStage(1);
assert.doesNotThrow(() => { idleGame.update(.016); idleGame.draw(); });
function insert(g, p, ratio) {
  const hole = g.palletGeometry(p), box = g.renderRect(p);
  g.forklift.forkY = hole.holeY + hole.holeHeight / 2 - 4.5;
  g.forklift.targetForkY = g.forklift.forkY;
  g.forklift.x = box.x + box.width * ratio - g.forkliftGeometry().mastOffset - g.forklift.forkLength;
  g.forklift.targetX = g.forklift.x;
}
let g = game(2), [bottom, top] = g.packages;
assert(top.y < bottom.y, "Upper pallet must be visibly above lower pallet");
insert(g, bottom, .9);
assert(!g.attemptPickup(bottom));
assert(bottom.forkDamaged && top.forkDamaged, "Lifting the lower pallet must topple and damage the stack");
assert(g.yardDebris.length === 2);
g.draw();
g = game(2); [bottom, top] = g.packages;
g.selectPickupCargo(top); insert(g, top, .85);
assert(g.attemptPickup(top), "Upper pallet must be independently removable");
g.completeTransport(top); g.selectPickupCargo(bottom); insert(g, bottom, .85);
assert(g.attemptPickup(bottom), "Lower pallet becomes safe after top is removed");
g = game(3);
let front = g.packages[2], rear = g.packages[3];
g.selectPickupCargo(front); g.selectPickupCargo(rear);
assert(g.selected === front, "Rear selection is blocked until front is removed");
insert(g, front, .85);
assert(!g.checkRearStrike()); assert(g.attemptPickup(front));
g = game(3); front = g.packages[2]; rear = g.packages[3];
g.selectPickupCargo(front); insert(g, front, 1.2);
assert(g.checkRearStrike()); assert(rear.forkDamaged && !front.forkDamaged);
vm.runInThisContext(fs.readFileSync("js/drive.js", "utf8"));
const D = DriveConfig;
function drive(seed) { const d = game(1); d.beginDrive(seed); return d; }
function quiet(d) { d.road.cars = []; d.road.events = []; d.road.patrol = null; d.road.fastTimer = 1e9; d.road.spawnTimer = 1e9; return d; }
// Speed: starts at 60, gas tops out at the 90 km/h limiter, no input holds speed, brake slows.
g = quiet(drive(11));
assert.strictEqual(g.road.speed, D.startSpeed);
g.update(1); assert.strictEqual(g.road.speed, D.startSpeed, "No pedal input cruises at the current speed");
g.roadControl("gas", true); for (let n = 0; n < 200; n++) g.update(.05);
assert.strictEqual(g.road.speed, 90, "Trucks are limited to 90km/h");
g.roadControl("gas", false); g.roadControl("brake", true); g.update(.5);
assert(g.road.speed < 90 && g.road.speed > 60);
g.roadControl("brake", false);
// Three lanes, one step per press.
g.roadControl("right", true); assert.strictEqual(g.road.lane, 1);
g.roadControl("right", true); g.roadControl("right", true); assert.strictEqual(g.road.lane, 2, "Lane changes clamp at the right lane");
for (let n = 0; n < 20; n++) g.update(.05);
assert(Math.abs(g.road.x - D.laneX[2]) < 3);
// Quick steering at speed shakes the cargo; loose loads shake more.
g = quiet(drive(12)); g.road.speed = 90; g.road.sway = 0; g.roadControl("right", true);
const calmSway = g.road.sway;
assert(calmSway > 10, "A lane change at 90km/h adds sway");
g = quiet(drive(12)); g.road.speed = 90; g.road.sway = 0; g.road.sensitivity = 1.8; g.roadControl("right", true);
assert(g.road.sway > calmSway * 1.7, "Loose loads sway more");
g.road.sway = 99; g.road.speed = 90; g.roadControl("brake", true); g.update(.5);
assert.strictEqual(g.road.swayDamage, 1, "Excess sway damages the cargo once and settles");
assert(g.road.sway < 100);
// Rear-ending a slower car counts once and knocks speed down.
g = quiet(drive(13)); g.road.speed = 90;
g.makeCar("car", 0, g.road.distance + 32, 40);
g.update(.1); g.update(.1);
assert.strictEqual(g.road.collisions, 1, "Contact with a car ahead counts");
for (let n = 0; n < 10; n++) g.update(.1);
assert.strictEqual(g.road.collisions, 1, "The same car counts only once");
// A car that closes in from behind is held behind the truck, never the player's fault.
g = quiet(drive(14)); g.road.speed = 50;
g.makeCar("car", 0, g.road.distance - 30, 100);
for (let n = 0; n < 40; n++) g.update(.05);
assert.strictEqual(g.road.collisions, 0, "Traffic from behind never causes a player collision");
// A car cutting in backs out; a close call, no penalty.
g = quiet(drive(15)); g.road.speed = 70;
const cutter = g.makeCar("car", 1, g.road.distance + 5, 70); cutter.laneFrom = 1; cutter.laneTo = 0; cutter.laneT = .7;
g.update(.02);
assert.strictEqual(g.road.collisions, 0);
// Obstacles.
g = quiet(drive(16)); g.road.speed = 80;
g.road.events = [{ kind: "debris", at: g.road.distance + 40, lane: 0, length: 8, name: "落下物" }];
for (let n = 0; n < 40; n++) g.update(.05);
assert.strictEqual(g.road.collisions, 1, "Hitting debris counts once");
g = quiet(drive(16)); g.road.speed = 80; g.roadControl("right", true); for (let n = 0; n < 10; n++) g.update(.02);
g.road.events = [{ kind: "debris", at: g.road.distance + 60, lane: 0, length: 8, name: "落下物" }];
for (let n = 0; n < 60; n++) g.update(.05);
assert.strictEqual(g.road.collisions, 0, "Another lane avoids debris");
// Speed-limit zones: over the limit for 1.5s is one violation; staying within earns the section bonus.
g = quiet(drive(17)); g.road.speed = 85;
g.road.events = [{ kind: "construction", at: g.road.distance + 10, signAt: g.road.distance - 5, lane: 2, length: 200, limit: 60, name: "工事・車線規制" }];
for (let n = 0; n < 40; n++) g.update(.05);
assert.strictEqual(g.road.violations, 1, "Speeding through a 60 zone is a violation");
for (let n = 0; n < 40; n++) g.update(.05);
assert.strictEqual(g.road.violations, 1, "Each zone is judged once");
g = quiet(drive(17)); g.road.speed = 58;
g.road.events = [{ kind: "tunnel", at: g.road.distance + 5, signAt: g.road.distance, length: 60, limit: 70, name: "トンネル" }];
const before = g.road.points;
for (let n = 0; n < 80; n++) g.update(.05);
assert.strictEqual(g.road.violations, 0);
assert(g.road.points > before + 150, "Clearing a zone within the limit earns a bonus");
// Overtaking builds a combo only for cars that were actually ahead.
g = quiet(drive(18)); g.road.speed = 90; g.roadControl("right", true); for (let n = 0; n < 10; n++) g.update(.02);
g.makeCar("car", 0, g.road.distance + 60, 50);
g.makeCar("car", 2, g.road.distance - 80, 100);
for (let n = 0; n < 120; n++) g.update(.05);
assert.strictEqual(g.road.bestCombo, 1, "Only the slower car ahead counts as an overtake");
// Patrol: passing it over the zone limit is a violation.
g = quiet(drive(19)); g.road.speed = 80; g.roadControl("right", true); for (let n = 0; n < 10; n++) g.update(.02);
g.road.events = [{ kind: "tunnel", at: g.road.distance - 50, signAt: g.road.distance - 60, length: 2400, limit: 70, name: "トンネル" }];
g.road.zoneFlags[g.road.events[0].at] = { over: 0, violated: true };
g.makeCar("patrol", 0, g.road.distance + 50, 55);
for (let n = 0; n < 500 && !g.road.patrolTicketed; n++) { g.road.speed = 80; g.update(.05); }
assert(g.road.patrolTicketed, "Passing a patrol car above the limit is noticed");
// Routes: seeded, varied, patrol only sometimes.
const kinds = new Set();
let patrols = 0;
for (let seed = 1; seed <= 200; seed++) {
  const route = g.buildRoute(seed);
  route.events.forEach((e) => kinds.add(e.kind));
  if (route.patrol) patrols++;
  assert(route.events.length >= 4, "Every route has several sections");
  for (let i = 1; i < route.events.length; i++) assert(route.events[i].at - (route.events[i - 1].at + (route.events[i - 1].length || 0)) >= 300, "Sections are spaced apart");
}
assert.deepStrictEqual([...kinds].sort(), ["breakdown", "congestion", "construction", "debris", "merge", "tunnel"]);
assert(patrols > 40 && patrols < 110, "Patrol cars appear only in some runs (" + patrols + "/200)");
assert.deepStrictEqual(g.buildRoute(77), g.buildRoute(77), "Routes replay from their seed");
// Arrival: drive incidents cut the safety score, not the fare; lateness costs money; missing the exit adds a detour.
let delivered;
UI.showResult = (_, result) => { delivered = result; };
g = quiet(drive(20)); Object.assign(g.driveResult, { passed: true, netRevenue: 15500, score: 100 });
Object.assign(g.road, { collisions: 1, violations: 1, swayDamage: 1, distance: g.road.length - 1, lane: 0, x: D.laneX[0] });
g.update(.1);
assert(g.mode === "result" && delivered.passed && delivered.score === 87 && delivered.loadScore === 100, "Incidents reduce the score: 100-5-3-5");
assert(delivered.drive && delivered.drive.collisions === 1 && delivered.netRevenue === 15500);
g = quiet(drive(21)); Object.assign(g.driveResult, { passed: true, netRevenue: 15500, score: 100 });
Object.assign(g.road, { distance: g.road.exitAt - 1, lane: 2, x: D.laneX[2], seconds: 10 });
g.update(.1);
assert(g.road.exitMissed && Math.abs(g.road.seconds - 35.1) < 1e-6, "Driving past the exit in the right lane adds a 25s detour");
g.road.seconds = g.road.target + 12.9; g.road.distance = g.road.length - 1; g.update(.1);
assert(delivered.drive.exitMissed && delivered.drive.lateSeconds === 13, "Arrival reports the detour and lateness");
assert(delivered.timePenalty === 1500 && delivered.netRevenue === 14000, "13s late costs 3 x ¥500");
console.log("Transport tests passed: top-first pickup, collapse, rear strikes, 90km/h limiter, cruise, three lanes, cargo sway, collisions, cut-ins, zones, overtakes, patrol, routes and arrival.");
