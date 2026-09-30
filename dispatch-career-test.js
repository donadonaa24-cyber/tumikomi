/* Run with Node.js: verifies career promotions and the dispatch (order selection) run without a browser. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class FakeClassList {
  constructor() { this.names = new Set(); }
  add(name) { this.names.add(name); }
  remove(name) { this.names.delete(name); }
  contains(name) { return this.names.has(name); }
  toggle(name, force) {
    const on = force === undefined ? !this.names.has(name) : force;
    if (on) this.names.add(name); else this.names.delete(name);
  }
}
class FakeElement {
  constructor(id) {
    this.id = id || "";
    this.classList = new FakeClassList();
    this.listeners = {};
    this.children = [];
    this.style = {};
    this.innerHTML = "";
    this.textContent = "";
    this.disabled = false;
    this.attributes = {};
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  scrollTo() {}
  click() { if (this.listeners.click) this.listeners.click({ target: this }); }
}

const elements = {};
global.window = global;
global.matchMedia = function () { return { matches: false }; };
global.document = {
  body: new FakeElement("body"),
  getElementById: function (id) {
    if (!elements[id]) elements[id] = new FakeElement(id);
    return elements[id];
  },
  createElement: function () { return new FakeElement(); },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  hidden: false
};
const saved = {};
global.localStorage = {
  getItem: function (key) { return saved[key] || null; },
  setItem: function (key, value) { saved[key] = value; }
};
global.Sfx = { played: [], play: function (name) { this.played.push(name); }, setEnabled: function () {}, isEnabled: function () { return true; } };
global.performance = { now: function () { return 0; } };
global.requestAnimationFrame = function () {};
global.Image = function () { this.complete = false; this.naturalWidth = 0; };

["js/stages.js", "js/collision.js", "js/scoring.js", "js/ui.js", "js/game.js", "js/transport.js"].forEach(function (file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
});
const context = new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : key === "measureText" ? () => ({ width: 100 }) : () => {} });
UI.init();

// --- Dispatch board generation ---
const boardA = StageData.createDispatchBoard(424242);
const boardB = StageData.createDispatchBoard(424242);
assert.deepStrictEqual(boardA.orders.map((p) => [p.name, p.fee]), boardB.orders.map((p) => [p.name, p.fee]), "Same seed must build the same board");
assert.strictEqual(boardA.orders.length, 12, "Board must offer 12 orders");
assert.strictEqual(new Set(boardA.orders.map((p) => p.id)).size, 12, "Order ids must be unique");
assert(boardA.orders.every((p) => p.client && p.fee > 0 && p.weightKg > 0), "Every order needs a client, fee and weight");
for (let seed = 1; seed <= 40; seed += 1) {
  const board = StageData.createDispatchBoard(seed * 7919);
  const all = StageData.dispatchPlan(board.orders, board.materials);
  assert(all.restraintShort > 0, "Accepting every order must exceed the restraint stock, so choosing is required");
  assert(board.targetRevenue > 0 && board.targetRevenue <= board.bestRevenue, "Target must be reachable on paper");
}

// --- Leftover penalty only applies to dispatch runs ---
const stage = StageData.createDispatchStage(boardA, boardA.orders.slice(0, 3).map((p) => p.id));
assert.strictEqual(stage.packages.length, 3);
assert(stage.packages.every((p) => !p.placed), "Accepted cargo starts unloaded");
let audit = Scoring.analyze(stage, stage.packages);
const expectedPenalty = stage.packages.reduce((sum, p) => sum + Math.round(p.fee * .5 / 100) * 100, 0);
assert.strictEqual(audit.leftoverPenalty, expectedPenalty, "Unloaded accepted cargo must cost 50% of its fee");
const mission1 = JSON.parse(JSON.stringify(StageData.stages[0]));
assert.strictEqual(Scoring.analyze(mission1, mission1.packages).leftoverPenalty, 0, "Fixed missions must not charge leftover penalties");
const floorY = stage.truck.y + stage.truck.height;
let x = stage.truck.x;
stage.packages.forEach((p) => { p.placed = true; p.x = x; p.y = floorY - p.height; x += p.width; });
audit = Scoring.analyze(stage, stage.packages);
assert.strictEqual(audit.leftoverPenalty, 0, "Loaded cargo must not be charged");

// --- The game accepts a dispatch stage object, even with fewer pallets than the yard slots ---
for (const count of [1, 2, 5, 9]) {
  const run = StageData.createDispatchStage(boardA, boardA.orders.slice(0, count).map((p) => p.id));
  const g = new Game({ getContext: () => context });
  g.startStage(run);
  assert.strictEqual(g.stage.id, 6);
  assert.strictEqual(g.packages.length, count);
  assert.doesNotThrow(() => {
    g.update(.016); g.draw();
    g.setVirtualControl("lift", -1, true); g.setVirtualControl("lift", -1, false);
    g.activateVirtualPickup(); g.update(.016); g.draw();
  }, "Pickup must work with " + count + " accepted pallets");
  g.restart();
  assert.strictEqual(g.packages.length, count, "Restart must reload the same accepted orders");
  assert.strictEqual(g.missionLabel(), "DISPATCH / 配車便");
}

// --- Career promotions through the result screen ---
function passedResult(stageDef) {
  return { passed: true, score: 96, rank: Scoring.rankFor(96), netRevenue: stageDef.targetRevenue, usage: { panel: 0, foam: 0, strap: 0 },
    placed: [], unplaced: 0, forkDamagePackages: [], payloadKg: 0, maxPayloadKg: 0, grossRevenue: 0, materialCost: 0,
    damageLoss: 0, timePenalty: 0, leftoverPenalty: 0, penalties: [] };
}
const noop = { retry() {}, next() {}, stages() {} };
assert.strictEqual(UI.careerLevel(), 0, "New players start as 研修生");
assert(/研修生/.test(elements.careerBadge.textContent));
elements.dispatchPanel.children = [];
UI.renderStageGrid();
assert(elements.dispatchPanel.children[0].disabled, "Dispatch is locked before 配車係");

StageData.stages.forEach(function (mission, index) {
  Sfx.played = [];
  UI.showResult(mission, passedResult(mission), noop);
  assert.strictEqual(UI.careerLevel(), index + 1, "Clearing mission " + mission.id + " must promote once");
  assert(/辞令/.test(elements.modalBody.innerHTML) && elements.modalBody.innerHTML.includes(StageData.CAREER[index + 1].title), "Result must show the appointment");
  assert(Sfx.played.includes("promote"), "Promotion must play its jingle");
});
UI.showResult(StageData.stages[0], passedResult(StageData.stages[0]), noop);
assert(!/辞令/.test(elements.modalBody.innerHTML), "Replaying a cleared mission must not promote again");
assert(/配車便が解放/.test(elements.modalBody.innerHTML) === false);

elements.dispatchPanel.children = [];
UI.renderStageGrid();
assert(!elements.dispatchPanel.children[0].disabled, "Dispatch unlocks at 配車係");
const failed = Object.assign(passedResult(stage), { passed: false });
UI.showResult(stage, failed, noop);
assert.strictEqual(UI.careerLevel(), 5, "A failed dispatch must not promote");
UI.showResult(stage, passedResult(stage), noop);
assert.strictEqual(UI.careerLevel(), 6, "First dispatch clear promotes to 営業所長");
assert(elements.modalBody.innerHTML.includes("営業所長"));
const progress = UI.getProgress();
assert.strictEqual(progress.dispatch.clears, 1);
assert.strictEqual(progress.dispatch.plays, 2);
assert(!progress.completed.includes(6) && progress.bestEarnings[6] == null, "Dispatch must not alter the 5-mission campaign");
assert(JSON.parse(saved["tsumeru-game-progress-v2"]).dispatch.clears === 1, "Dispatch record must be saved");

console.log("Dispatch/career tests passed: seeded boards, restraint pressure, leftover penalty, small-run pickup, restart, promotions 1–6, and separate dispatch records.");
