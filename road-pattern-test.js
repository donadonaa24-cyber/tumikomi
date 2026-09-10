"use strict";
require("./transport-test.js");
const assert = require("assert");
const ctx = new Proxy({}, {get: () => () => {}});
const make = () => { const g = new Game({getContext: () => ctx}); g.startStage(1); g.beginDrive(); return g; };
let g = make(); g.road.cars = []; g.road.events = [];
g.update(1); assert.equal(g.road.speed,80);
g.roadControl("gas",true); for(let n=0;n<100;n++) g.update(.05);
assert.equal(g.road.speed,120);
g.roadControl("gas",false); g.update(.1); assert(g.road.speed <120 && g.road.speed>80);
for(let n=0;n<100;n++) g.update(.05); assert.equal(g.road.speed,80);
g.road.speed=120; g.roadControl("brake",true); g.road.brakeRisk=0;
for(let n=0;n<20;n++) g.update(.05); assert.equal(g.road.brakeDamage,1);
for(let n=0;n<20;n++) g.update(.05); assert.equal(g.road.brakeDamage,1);
g.roadControl("brake",false); g.road.speed=120; g.roadControl("brake",true); g.road.brakeRisk=.99;
for(let n=0;n<20;n++) g.update(.05); assert.equal(g.road.brakeDamage,1);
const patterns = new Set();
for(let pattern=0;pattern<10;pattern++) {
  for(const speed of [80,120]) {
    g=make(); Object.assign(g.road,g.makeRoadPattern(pattern));
    patterns.add(JSON.stringify(g.road.events));
    g.driveResult.passed=true; g.driveResult.netRevenue=15500; g.driveResult.score=100;
    for(let n=0;n<3500 && g.mode==="driving";n++) {
      const r=g.road;
      const hazard=r.events.find(e=>r.distance>=e.at-110 && r.distance<=e.at+(e.length||0)+110);
      g.roadControl(hazard ? (hazard.lane ? "left":"right") : "right",true);
      g.roadControl("gas",speed===120);
      g.update(.05);
      for(const car of r.cars) for(const e of r.events) {
        if(r.distance>e.at+(e.length||0)+220) continue;
        assert(car.at<=e.at-239 || car.at>=e.at+(e.length||0)+220,"Escape corridor must remain empty");
      }
      const cars=[...r.cars].sort((a,b)=>a.at-b.at);
      for(let j=1;j<cars.length;j++) if(cars[j].lane===cars[j-1].lane) assert(cars[j].at-cars[j-1].at>=219.9);
    }
    assert.equal(g.mode,"result"); assert.equal(g.road.hits,0,`Pattern ${pattern}, speed ${speed}: avoidable without collision`);
    assert(g.road.seconds<150);
  }
}
assert.equal(patterns.size,10);
console.log("10 patterns x 2 speeds passed: clear escape corridors, separated traffic, construction, cruise and brake risk.");
