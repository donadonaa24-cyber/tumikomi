/* Run with Node.js: verifies briefings, evaluations, coworker cheers and the talk-scene flow without a browser. */
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
  removeAttribute(name) { delete this.attributes[name]; }
  scrollTo() {}
  click() { if (this.listeners.click) this.listeners.click({ target: this }); }
}

const elements = {};
global.window = global;
// Reduced motion shows each line at once, so the flow can be driven synchronously.
global.matchMedia = function (query) { return { matches: query.indexOf("reduced-motion") >= 0 }; };
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
global.localStorage = { getItem: (key) => saved[key] || null, setItem: (key, value) => { saved[key] = value; } };
global.Sfx = { play() {}, setEnabled() {}, isEnabled() { return true; } };
global.performance = { now: () => 0 };
global.requestAnimationFrame = function () {};
global.Image = function () { this.complete = false; this.naturalWidth = 0; };

["js/stages.js", "js/collision.js", "js/scoring.js", "js/portraits.js", "js/story.js", "js/ui.js", "js/game.js", "js/transport.js", "js/drive.js"].forEach(function (file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
});

// --- Content ---
const stages = StageData.stages.concat([StageData.createDispatchStage(StageData.createDispatchBoard(7), ["d_1", "d_2"])]);
stages.forEach(function (stage) {
  const lines = Story.briefing(stage);
  assert(lines.length >= 3, "Stage " + stage.id + " needs a briefing");
  lines.forEach(function (line) {
    const person = Story.CHARACTERS[line.speaker];
    assert(person && person.name && person.role && line.text, "Briefing speakers must be known characters");
    assert(Portraits.EXPRESSIONS.includes(line.face), "Every line carries a valid expression");
  });
  assert(lines.some((line) => line.speaker === "senpai" || line.speaker === "doki"), "Coworkers must encourage the player before stage " + stage.id);
  assert(Story.CHARACTERS[Story.EVALUATOR[stage.id]], "Stage " + stage.id + " needs an evaluator");
});
Object.keys(Story.CHARACTERS).forEach(function (key) {
  Portraits.EXPRESSIONS.forEach(function (face) {
    const svg = Portraits.svg(key, face);
    assert(/^<svg[\s\S]*<\/svg>$/.test(svg) && svg.length > 2000, key + "/" + face + " must render an illustration");
    assert(Story.portrait(key, face).startsWith("data:image/svg+xml"), "Illustrations are inline SVG until replaced");
  });
});
Story.CHARACTERS.senpai.art = { smile: "assets/images/example.png" };
assert.strictEqual(Story.portrait("senpai", "smile"), "assets/images/example.png", "An image path replaces the SVG for that expression");
assert(Story.portrait("senpai", "normal").startsWith("data:image/svg+xml"), "Other expressions keep the SVG");
Story.CHARACTERS.senpai.art = null;
assert(/全部積み終えると/.test(Story.briefing(StageData.stages[4]).map((l) => l.text).join("")), "Mission 05 briefing must hint at the urgent extra order");

const mission1 = StageData.stages[0];
function result(extra) {
  return Object.assign({
    passed: true, score: 100, loadScore: 100, rank: Scoring.rankFor(100), netRevenue: 15500, usage: { panel: 0, foam: 0, strap: 0 },
    placed: [], unplaced: 0, forkDamagePackages: [], leftoverPackages: [], unstable: [], deliveryInversions: 0,
    payloadKg: 0, maxPayloadKg: 700, grossRevenue: 15500, materialCost: 0, damageLoss: 0, timePenalty: 0, leftoverPenalty: 0,
    penalties: [], drive: { collisions: 0, violations: 0, swayDamage: 0, lateSeconds: 0, exitMissed: false }
  }, extra || {});
}
const text = (lines) => lines.map((l) => l.text).join("／");
let lines = Story.evaluation(mission1, result());
assert(lines[0].speaker === "central" && lines[0].face === "cheer" && /見事/.test(lines[0].text) && /減点なし/.test(text(lines)), "A clean S run gets praise");
assert(["senpai", "doki"].includes(lines[lines.length - 1].speaker), "A coworker speaks last");
lines = Story.evaluation(mission1, result({ passed: false, score: 75, rank: Scoring.rankFor(75), netRevenue: 4600, forkDamagePackages: [{}] }));
assert(/目標に届きませんでした/.test(text(lines)) && /爪突き事故が1件/.test(text(lines)) && lines[0].face === "concern", "A failed run names the gap and the fork accident");
lines = Story.evaluation(mission1, result({ passed: false, score: 65, rank: Scoring.rankFor(65) }));
assert(/合格にできません/.test(text(lines)), "Revenue without a passing safety score is called out");
lines = Story.evaluation(mission1, result({ score: 90, rank: Scoring.rankFor(90), drive: { collisions: 2 } }));
assert(/接触が2件/.test(text(lines)), "Road contacts are named");
lines = Story.evaluation(mission1, result({ drive: { swayDamage: 1 } }));
assert(/荷傷みが1件/.test(text(lines)), "Cargo sway damage is named");
lines = Story.evaluation(mission1, result({ drive: { violations: 2 } }));
assert(/制限速度を超えた区間が2/.test(text(lines)), "Speeding zones are named");
lines = Story.evaluation(mission1, result({ drive: { exitMissed: true } }));
assert(/出口/.test(text(lines)), "A missed exit is named");
const dispatchStage = stages[stages.length - 1];
lines = Story.evaluation(dispatchStage, result({ leftoverPackages: [{}, {}] }));
assert(lines[0].speaker === "west" && /積み残しが2件/.test(text(lines)), "Dispatch leftovers are named by the dispatch evaluator");
lines = Story.evaluation(mission1, result(), { promotion: { from: StageData.CAREER[0], to: StageData.CAREER[1] } });
assert(lines.some((l) => l.speaker === "president" && l.text.includes("荷役スタッフ")), "The president announces the promotion");
assert(Story.cheer("firstTransport") && Story.cheer("inspectionPassed"), "In-play cheers exist");
// Review sheet.
let sheet = Story.gradeSheet(mission1, result());
assert.deepStrictEqual(sheet.rows.map((r) => r.grade), ["S", "S", "S", "S"], "A clean run 10% over target");
assert.strictEqual(sheet.total, "S");
sheet = Story.gradeSheet(mission1, result({ forkDamagePackages: [{}, {}], loadScore: 80, netRevenue: 12000, drive: { collisions: 3 } }));
assert.deepStrictEqual(sheet.rows.map((r) => r.grade), ["D", "B", "C", "C"]);
assert.strictEqual(sheet.total, "C");
assert.notStrictEqual(Story.gradeSheet(mission1, result({ drive: { lateSeconds: 5 } })).rows[2].grade, "S", "Arriving late costs the driving S");

// --- Talk flow: briefing before a mission ---
const started = [];
window.game = { mode: "menu", startStage: (id) => started.push(id), updateControls() {} };
UI.init();
const talk = elements.talkScreen;
UI.renderStageGrid();
elements.stageGrid.children[0].click();
assert(talk.classList.contains("is-open"), "Choosing a mission opens the briefing");
assert.strictEqual(started.length, 0, "The mission (and its timer) must wait for the briefing");
const figures = elements.talkStage.children.slice(-3);
assert.deepStrictEqual(figures.map((f) => f.getAttribute("data-speaker")), ["central", "senpai", "doki"], "The cast stands on stage together");
assert(figures[0].classList.contains("is-speaking") && !figures[1].classList.contains("is-speaking"), "Only the speaker is highlighted");
assert(figures[0].image.src.startsWith("data:image/svg+xml"), "Figures show illustrations");
assert.strictEqual(elements.talkName.textContent, "森川 遥");
elements.talkNext.click(); elements.talkNext.click();
assert(figures[1].classList.contains("is-speaking"), "The highlight follows the speaker");
let guard = 0;
while (talk.classList.contains("is-open") && guard++ < 20) elements.talkNext.click();
assert.deepStrictEqual(started, [1], "Closing the briefing starts the mission");

elements.stageGrid.children[0].click();
elements.talkSkip.click();
assert.deepStrictEqual(started, [1, 1], "Skip starts the mission at once");

elements.talkToggleButton.click();
assert.strictEqual(elements.talkToggleButton.textContent, "会話 OFF");
elements.stageGrid.children[0].click();
assert(!talk.classList.contains("is-open") && started.length === 3, "With talk off, missions start immediately");
assert(JSON.parse(saved["tsumeru-game-progress-v2"]).talk === false, "Talk preference is saved");
elements.talkToggleButton.click();

// --- Evaluation, promotion ceremony, then the report ---
const ceremony = elements.ceremonyScreen;
elements.modal.classList.remove("is-open");
UI.showResult(mission1, result(), { retry() {}, next() {}, stages() {} });
assert(talk.classList.contains("is-open") && !elements.modal.classList.contains("is-open"), "Evaluation plays before the report");
guard = 0;
while (talk.classList.contains("is-open") && guard++ < 20) elements.talkNext.click();
assert(ceremony.classList.contains("is-open") && ceremony.classList.contains("is-stamped"), "A first clear opens the promotion ceremony with the stamp");
assert(!elements.modal.classList.contains("is-open"), "The report waits for the ceremony");
assert(/荷役/.test(elements.ceremonySheet.innerHTML) && /総合評価/.test(elements.ceremonySheet.innerHTML), "The ceremony shows the review sheet");
assert(/研修生[\s\S]*荷役スタッフ/.test(elements.ceremonyTitle.innerHTML), "The ceremony shows the new title");
assert(/水城 蒼太/.test(elements.ceremonyLine.innerHTML), "The president speaks first");
guard = 0;
while (ceremony.classList.contains("is-open") && guard++ < 10) elements.ceremonyNext.click();
assert(elements.modal.classList.contains("is-open") && /辞令/.test(elements.modalBody.innerHTML) && /report-review/.test(elements.modalBody.innerHTML), "The report follows with the appointment and review sheet");
assert(elements.careerBadge.classList.contains("is-promoted"), "The header title glows after a promotion");
elements.modal.classList.remove("is-open");
UI.showResult(mission1, result(), { retry() {}, next() {}, stages() {} });
elements.talkSkip.click();
assert(!ceremony.classList.contains("is-open") && elements.modal.classList.contains("is-open"), "Replaying a cleared mission skips the ceremony");

// --- In-play coworker cheers ---
const context = new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : key === "measureText" ? () => ({ width: 100 }) : () => {} });
const g = new Game({ getContext: () => context });
g.startStage(1);
g.completeTransport(g.packages[0]);
assert(/「.+」/.test(elements.toast.textContent), "The first transported pallet gets a coworker cheer");
g.packages.forEach((p) => { p.transported = true; });
g.beginLoadingPhase();
const floorY = g.stage.truck.y + g.stage.truck.height;
let x = g.stage.truck.x;
g.packages.forEach((p) => { p.placed = true; p.x = x; p.y = floorY - p.height; x += p.width; });
g.inspectLoad();
assert(g.inspected && /早瀬|小田/.test(elements.speakerName.textContent), "Passing inspection brings a coworker cheer");
assert(elements.speakerAvatar.classList.contains("has-art"), "The navigation panel shows the coworker's illustration");

console.log("Story/talk tests passed: illustrated cast and expressions, briefings, outcome-based evaluations, review sheet, promotion ceremony, talk skip/toggle, report order, and in-play cheers.");
