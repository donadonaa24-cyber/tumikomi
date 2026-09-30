"use strict";
require("./pickup-motion-test.js");
const assert = require("assert");
const D = DriveConfig;
const ctx = new Proxy({}, { get: (_, k) => k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : k === "measureText" ? () => ({ width: 100 }) : () => {} });
function make(seed) {
  const g = new Game({ getContext: () => ctx }); g.startStage(1); g.beginDrive(seed);
  Object.assign(g.road, { cars: [], events: [], patrol: null, spawnTimer: 1e9, fastTimer: 1e9 });
  return g;
}
// Traffic follows the car ahead instead of driving through it.
let g = make(31); g.road.lane = 2; g.road.x = D.laneX[2];
const lead = g.makeCar("car", 0, g.road.distance + 120, 55);
const follower = g.makeCar("car", 0, g.road.distance + 60, 80);
for (let i = 0; i < 200; i++) g.update(.05);
assert(follower.lane !== lead.lane || lead.at - follower.at > (lead.len + follower.len) / 2, "Cars keep their distance or pass in another lane");
assert(follower.speed > 30, "Following traffic slows but keeps moving");
// Blocked lanes: traffic signals and moves over well before debris.
g = make(32); g.road.lane = 2; g.road.x = D.laneX[2]; g.road.speed = 30;
g.road.events = [{ kind: "debris", at: g.road.distance + 300, lane: 0, length: 8, name: "落下物" }];
const driver = g.makeCar("car", 0, g.road.distance + 120, 70);
let signalled = false;
for (let i = 0; i < 200; i++) { g.update(.05); if (driver.signal > 0) signalled = true; }
assert(signalled && driver.lane === 1, "Traffic signals and leaves a lane blocked ahead");
assert(driver.speed > 40, "It keeps moving after the lane change");
// Faster cars come from behind in the right lane and pass the truck.
g = make(33); g.road.speed = 70; g.road.fastTimer = 0;
let overtaken = false;
for (let i = 0; i < 900 && !overtaken; i++) { g.update(.05); if (g.road.cars.some((c) => c.lane === 2 && c.at > g.road.distance + 40)) overtaken = true; }
assert(overtaken, "Fast traffic overtakes in the right lane");
assert(!g.road.cars.some((c) => c.kind === "truck" && c.laneTo === 2), "Trucks stay out of the right lane");
// On-ramp merge: staying out of the left lane lets the merging car in and earns a bonus.
g = make(34); g.road.lane = 1; g.road.x = D.laneX[1]; g.road.speed = 62;
g.road.events = [{ kind: "merge", at: g.road.distance + 60, lane: 0, length: 170, name: "合流" }];
const points = g.road.points;
for (let i = 0; i < 300 && !g.road.merged[g.road.events[0].at]; i++) { g.road.speed = 62; g.update(.05); }
assert(g.road.merged[g.road.events[0].at], "Yielding to a merging car is rewarded");
assert(g.road.points > points + 150);
console.log("Traffic passed: following distance, signalled lane changes around blockages, right-lane overtakes, trucks keep left, merge yielding bonus.");
