"use strict";
require("./keyboard-pause-test.js");
const assert = require("assert");
for (let stage = 2; stage <= 5; stage++) {
  const g = new Game({getContext:()=>({})}); g.startStage(stage);
  const top = g.packages[1];
  const hole=g.palletGeometry(top), initialX=g.forklift.x;
  const targetY=hole.holeY+hole.holeHeight/2-4.5+12;
  g.handleControlKey("w",true,false);
  for (let i=0;i<600 && g.forklift.forkY>targetY;i++) g.stepVirtualPad(.005);
  g.handleControlKey("w",false,false);
  assert.equal(g.forklift.x,initialX,"Raising forks must never auto-drive");
  assert(g.palletForkCheck(top).heightOk);
  assert.equal(g.palletForkCheck(top).ratio,0,"Height alone must not insert forks");
  assert(!g.forklift.forkedId);
  g.handleControlKey("d",true,false);
  for(let i=0;i<600 && g.palletForkCheck(top).ratio<.8;i++)g.stepVirtualPad(.005);
  g.handleControlKey("d",false,false);
  assert(!g.forklift.forkedId,"Manual insertion must wait for lift input");
  g.handleControlKey("w",true,false);
  assert.equal(g.forklift.forkedId,top.id);
  const oldY=top.y;
  g.handleControlKey("w",false,false); g.handleControlKey("w",true,false); g.stepVirtualPad(.1);
  assert(top.y<oldY,"Up must raise a carried pallet");
  assert.equal(g.forkAccidents,0);
}
console.log("Upper height tolerance, no automatic movement/insertion, manual approach and up-to-lift passed for stages 2–5.");
