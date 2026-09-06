/* Run with Node.js: verifies core loading rules without a browser. */
const fs = require("fs");
const vm = require("vm");

global.window = global;
["js/stages.js", "js/collision.js", "js/scoring.js"].forEach(function (file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
});
global.performance = { now: function () { return 0; } };
global.requestAnimationFrame = function () {};
global.Image = function () { this.complete = false; this.naturalWidth = 0; this.src = ""; };
global.document = { getElementById: function () { return null; } };
global.UI = { toast: function () {}, dialogue: function () {} };
global.Sfx = { play: function () {} };
vm.runInThisContext(fs.readFileSync("js/game.js", "utf8"), { filename: "js/game.js" });

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function floor(stage) { return stage.truck.y + stage.truck.height; }
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canvasContextStub() {
  const gradient = { addColorStop: function () {} };
  return new Proxy({
    createLinearGradient: function () { return gradient; },
    measureText: function (text) { return { width: String(text).length * 7 }; }
  }, {
    get: function (target, property) {
      if (property in target) return target[property];
      return function () {};
    },
    set: function (target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

const stage1 = clone(StageData.stages[0]);
let cursorX = stage1.truck.x;
stage1.packages.forEach(function (pkg) {
  pkg.placed = true;
  pkg.x = cursorX;
  pkg.y = floor(stage1) - pkg.height;
  cursorX += pkg.width;
});
const stage1Result = Scoring.calculate(stage1, stage1.packages, 100, 0);
assert(stage1Result.payloadKg === 670, "Stage 1 payload should be 670kg");
assert(stage1Result.netRevenue === 15500, "Stage 1 revenue calculation failed");
assert(stage1Result.passed, "Stage 1 safe full load should pass");

const stage3 = clone(StageData.stages[2]);
const glass = stage3.packages.find(function (pkg) { return pkg.type === "glass"; });
glass.placed = true;
glass.x = stage3.truck.x + stage3.truck.width / 2 - glass.width / 2;
glass.y = floor(stage3) - glass.height;
let audit = Scoring.analyze(stage3, stage3.packages);
assert(audit.protectionIssues.length === 1, "Uncushioned glass must fail protection check");
glass.cushioned = true;
audit = Scoring.analyze(stage3, stage3.packages);
assert(audit.protectionIssues.length === 0, "Foam must clear the glass gap-protection check");

const stage4 = clone(StageData.stages[3]);
const loose = stage4.packages[0];
loose.placed = true;
loose.x = stage4.truck.x + stage4.truck.width / 2 - loose.width / 2;
loose.y = floor(stage4) - loose.height;
audit = Scoring.analyze(stage4, stage4.packages);
assert(audit.unsecured.length === 1, "Unsecured cargo must be reported");
loose.braced = true;
audit = Scoring.analyze(stage4, stage4.packages);
assert(audit.unsecured.length === 0, "Plywood bracing must clear the securement check");

const stage5 = clone(StageData.stages[4]);
stage5.packages.forEach(function (pkg, index) {
  pkg.placed = true;
  pkg.x = stage5.truck.x + index * 30;
  pkg.y = floor(stage5) - pkg.height;
});
audit = Scoring.analyze(stage5, stage5.packages);
assert(audit.payloadKg === 1890, "Stage 5 initial payload should be 1890kg");
stage5.packages.push(clone(stage5.additionalPackage));
stage5.packages[stage5.packages.length - 1].placed = true;
stage5.packages[stage5.packages.length - 1].x = stage5.truck.x;
stage5.packages[stage5.packages.length - 1].y = floor(stage5) - stage5.packages[stage5.packages.length - 1].height;
audit = Scoring.analyze(stage5, stage5.packages);
assert(audit.overweightKg === 310, "Final express cargo must create a 310kg overload");

const game = new Game({ getContext: function () { return canvasContextStub(); } });
const forkCargo = clone(StageData.stages[0].packages[0]);
forkCargo.x = 360;
forkCargo.y = 420;
forkCargo.trayScale = 1;
game.stage = clone(StageData.stages[0]);
game.packages = [forkCargo];
game.selectedId = forkCargo.id;
game.drag = { id: forkCargo.id, moved: true };
let forkCheck = game.syncForkliftToCargo(forkCargo);
assert(forkCheck.valid && forkCheck.ratio >= .75, "Forks must support at least 75% of cargo width");
assert(forkCheck.verticalError === 0, "Cargo bottom must rest on the fork top");
game.forklift.x += 150;
forkCheck = game.forkEngagement(forkCargo);
assert(!forkCheck.valid, "Shallow fork insertion must fail the pickup check");

game.phase = "pickup";
forkCargo.pickupActive = true;
forkCargo.transported = false;
forkCargo.forkDamaged = false;
forkCargo.trayScale = 1.12;
forkCargo.x = 850;
forkCargo.y = 520 - Collision.dimensions(forkCargo).height * forkCargo.trayScale;
game.packages = [forkCargo];
game.selectedId = forkCargo.id;
game.forklift.x = 500;
const pallet = game.palletGeometry(forkCargo);
game.forklift.forkY = pallet.holeY + pallet.holeHeight / 2 - game.forkRect().height / 2;
let palletCheck = game.palletForkCheck(forkCargo);
assert(palletCheck.valid && palletCheck.heightOk && palletCheck.ratio >= .75, "Forks aligned with pallet opening and inserted 75% must pick up");
game.forklift.forkY -= 30;
palletCheck = game.palletForkCheck(forkCargo);
assert(!palletCheck.heightOk && palletCheck.penetration > 6, "Fork tip outside the pallet opening must be an accident risk");
game.triggerForkAccident(forkCargo);
assert(forkCargo.forkDamaged && !forkCargo.transported, "Fork strike must quarantine damaged cargo");
const damageAudit = Scoring.analyze(game.stage, [forkCargo]);
assert(damageAudit.forkDamagePackages.length === 1, "Fork damage must appear in the safety audit");
assert(damageAudit.damageLoss === forkCargo.replacementCost, "Fork damage must charge replacement loss");

const renderGame = new Game({ getContext: function () { return canvasContextStub(); } });
renderGame.startStage(1);
renderGame.draw();
renderGame.packages[0].transported = true;
renderGame.beginLoadingPhase();
renderGame.draw();

const interactionGame = new Game({ getContext: function () { return canvasContextStub(); } });
interactionGame.startStage(1);
const interactionCargo = interactionGame.selected;
let interactionPallet = interactionGame.palletGeometry(interactionCargo);
const alignedForkY = interactionPallet.holeY + interactionPallet.holeHeight / 2 - interactionGame.forkRect().height / 2;
let handle = interactionGame.forkLiftHandleRect();
interactionGame.pickupPointerDown(handle.x + 10, handle.y + 10, 1);
interactionGame.pickupPointerMove(handle.x + 10, handle.y + 10 + alignedForkY - interactionGame.forklift.forkY, 1);
interactionGame.pickupPointerUp(handle.x + 10, handle.y + 10 + alignedForkY - 490, 1);
assert(interactionGame.palletForkCheck(interactionCargo).heightOk, "Lift handle drag must align forks with pallet opening");
let body = interactionGame.sideForkliftBodyRect();
interactionGame.pickupPointerDown(body.x + 30, body.y + 50, 2);
interactionGame.pickupPointerMove(body.x + 30 + (510 - interactionGame.forklift.x), body.y + 50, 2);
interactionGame.pickupPointerUp(body.x + 30 + (510 - 300), body.y + 50, 2);
assert(interactionGame.forklift.forkedId === interactionCargo.id, "Forward drag with valid alignment must lift the pallet");
body = interactionGame.sideForkliftBodyRect();
interactionGame.pickupPointerDown(body.x + 30, body.y + 50, 3);
interactionGame.pickupPointerMove(body.x + 30 + (100 - interactionGame.forklift.x), body.y + 50, 3);
interactionGame.pickupPointerUp(body.x + 30 + (100 - 510), body.y + 50, 3);
assert(interactionCargo.transported, "Backward drag to outbound bay must complete warehouse transport");

const padGame = new Game({ getContext: function () { return canvasContextStub(); } });
padGame.startStage(1);
const padCargo = padGame.selected;
const padPallet = padGame.palletGeometry(padCargo);
padGame.forklift.forkY = padPallet.holeY + padPallet.holeHeight / 2 - padGame.forkRect().height / 2;
padGame.forklift.targetForkY = padGame.forklift.forkY;
padGame.setVirtualControl("drive", 1, true);
for (let step = 0; step < 9; step += 1) padGame.stepVirtualPad(.1);
padGame.setVirtualControl("drive", 1, false);
assert(padGame.mobilePad.drive === 0, "Virtual pad must stop driving when the finger is released");
assert(padGame.palletForkCheck(padCargo).valid, "Virtual pad forward motion must support valid pallet insertion");
padGame.activateVirtualPickup();
assert(padGame.forklift.forkedId === padCargo.id, "Virtual pad center action must lift a correctly engaged pallet");
padGame.setVirtualControl("drive", -1, true);
for (let step = 0; step < 20 && !padCargo.transported; step += 1) padGame.stepVirtualPad(.1);
assert(padCargo.transported, "Virtual pad backward motion must deliver cargo to the left truck");
assert(padGame.mobilePad.drive === 0 && padGame.mobilePad.lift === 0, "Virtual pad must safely reset after delivery");

console.log("Smoke tests passed: weight, revenue, protection, securement, overload, pallet opening, fork strike, damage loss, two-screen rendering, pointer pickup, and virtual-pad delivery.");
