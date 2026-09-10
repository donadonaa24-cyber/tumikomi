"use strict";
require("./road-yield-test.js");
const assert = require("assert");
document.querySelectorAll = () => [];
const g = new Game({getContext:()=>({})}); g.startStage(1);
for(const [key,axis,value] of [["W","lift",-1],["s","lift",1],["a","drive",-1],["d","drive",1]]) {
  assert(g.handleControlKey(key,true,false)); assert.equal(g.mobilePad[axis],value);
  g.handleControlKey(key,false,false); assert.equal(g.mobilePad[axis],0);
}
g.beginDrive(); g.handleControlKey("w",true,false); assert(g.road.gas);
g.handleControlKey("d",true,false); assert.equal(g.road.lane,1);
g.handleControlKey("p",true,false); assert(g.road.paused && !g.road.gas);
const snapshot=JSON.stringify(g.road);
g.update(5); assert.equal(JSON.stringify(g.road),snapshot);
g.handleControlKey("w",true,false); assert(!g.road.gas);
g.handleControlKey("p",true,true); assert(g.road.paused,"Held P must not repeatedly toggle");
g.handleControlKey("escape",true,false); assert(!g.road.paused);
g.handleControlKey("s",true,false); assert(g.road.brake);
g.handleControlKey("s",false,false); assert(!g.road.brake);
g.update(.1); assert(g.road.distance>0);
console.log("WASD forklift/driving and full pause/resume passed.");
