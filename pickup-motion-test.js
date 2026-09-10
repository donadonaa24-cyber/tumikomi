"use strict";
require("./road-pattern-test.js");
const assert = require("assert");
const ctx = new Proxy({}, {get: () => () => {}});
for (const stage of [2,3,4,5]) {
  for (const input of ["pad","pointer"]) {
    const g = new Game({getContext: () => ctx}); g.startStage(stage);
    const [lower,upper] = g.packages;
    assert.equal(g.selected,lower);
    const hole = g.palletGeometry(upper);
    const targetHeight = hole.holeY + hole.holeHeight/2 - 4.5;
    g.mobilePad.lift=-1;
    for(let n=0;n<400 && g.forklift.forkY>targetHeight+.5;n++) g.stepVirtualPad(.005);
    g.stopVirtualPad();
    assert(g.palletForkCheck(upper).heightOk,"Upper hole is reachable using actual lift controls");
    if(input==="pad") {
      g.mobilePad.drive=1;
      for(let n=0;n<300 && g.palletForkCheck(upper).ratio<.8;n++) g.stepVirtualPad(.01);
      g.stopVirtualPad(); g.activateVirtualPickup();
    } else {
      g.drag={kind:"drive",pointerId:1,startX:0,startLiftX:g.forklift.x};
      const advance=hole.rect.x + hole.rect.width*.8 - g.forkRect().x - g.forkRect().width;
      g.pickupPointerMove(advance,0,1); g.pickupPointerUp(advance,0,1);
    }
    assert.equal(g.forklift.forkedId,upper.id,`${stage} ${input}: target visible upper pallet`);
    assert.equal(g.forkAccidents,0);
    assert(!lower.forkDamaged && !upper.forkDamaged);
    g.completeTransport(upper);
    g.selectPickupCargo(lower);
    assert(g.palletGeometry(lower).holeY>hole.holeY);
  }
}
function movement(speed) {
  const g = new Game({getContext:()=>ctx}); g.startStage(1); g.beginDrive();
  g.road.speed=speed; g.road.gas=speed===120; g.road.cars=[]; g.road.events=[];
  const initial=g.roadObjectY(500); g.updateRoad(.1);
  return g.roadObjectY(500)-initial;
}
assert(Math.abs(movement(120)/movement(80)-1.5)<.00001);
console.log("Upper pallet pickup via pad/pointer passed for missions 2–5; road movement scales exactly with speed.");
