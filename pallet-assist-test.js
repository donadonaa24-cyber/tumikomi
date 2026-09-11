"use strict";
require("./keyboard-pause-test.js");
const assert = require("assert");
for (let stage = 2; stage <= 5; stage++) {
  const g = new Game({getContext:()=>({})}); g.startStage(stage);
  const top = g.packages[1];
  g.handleControlKey("w",true,false);
  for (let i=0;i<300 && !g.autoPalletReady;i++) g.stepVirtualPad(.016);
  assert.equal(g.autoPalletReady,top.id);
  assert(g.palletForkCheck(top).valid);
  assert(!g.forklift.forkedId,"Auto insertion must not lift immediately");
  g.handleControlKey("w",true,true); g.stepVirtualPad(.016);
  assert(!g.forklift.forkedId,"Held key must wait for release");
  g.handleControlKey("w",false,false); g.handleControlKey("w",true,false);
  assert.equal(g.forklift.forkedId,top.id);
  const oldY=top.y;
  g.handleControlKey("w",false,false); g.handleControlKey("w",true,false); g.stepVirtualPad(.1);
  assert(top.y<oldY,"Up must raise a carried pallet");
  assert.equal(g.forkAccidents,0);
}
console.log("Upper pallet auto-insert, release/repress lift and carried-pallet elevation passed for stages 2–5.");
