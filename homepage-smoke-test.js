/* Run with Node.js: verifies homepage and stage-picker navigation without a browser. */
const fs = require("fs");
const vm = require("vm");

class FakeClassList {
  constructor(names) { this.names = new Set(names || []); }
  add(name) { this.names.add(name); }
  remove(name) { this.names.delete(name); }
  contains(name) { return this.names.has(name); }
  toggle(name, force) {
    if (force === true) this.names.add(name);
    else if (force === false) this.names.delete(name);
    else if (this.names.has(name)) this.names.delete(name);
    else this.names.add(name);
  }
}

class FakeElement {
  constructor(id, classes) {
    this.id = id || "";
    this.classList = new FakeClassList(classes);
    this.listeners = {};
    this.children = [];
    this.style = {};
    this.innerHTML = "";
    this.textContent = "";
    this.disabled = false;
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  appendChild(child) { this.children.push(child); }
  setAttribute() {}
  scrollTo() {}
  click() {
    if (this.listeners.click) this.listeners.click({ target: this });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ids = [
  "homeScreen", "homeStartButton", "homeMissionButton", "homeFooterStart", "homeBackButton", "gameHomeButton",
  "startScreen", "stageGrid", "modal", "modalKicker", "modalTitle", "modalBody", "modalActions", "modalClose",
  "dialoguePanel", "speakerAvatar", "speakerName", "dialogueText", "toast", "soundButton", "resetProgressButton",
  "campaignBadge", "campaignTotal", "campaignTarget", "campaignSummary"
];
const elements = {};
ids.forEach(function (id) { elements[id] = new FakeElement(id); });
elements.homeScreen.classList.add("is-open");

global.window = global;
global.document = {
  getElementById: function (id) { return elements[id] || null; },
  createElement: function () { return new FakeElement(); }
};
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
global.Sfx = {
  enabled: true,
  setEnabled: function (value) { this.enabled = Boolean(value); },
  isEnabled: function () { return this.enabled; },
  play: function () {}
};

["js/stages.js", "js/collision.js", "js/scoring.js", "js/ui.js"].forEach(function (file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
});

window.game = { mode: "playing", drag: { id: "test" }, updateControls: function () {} };
UI.init();
assert(elements.homeScreen.classList.contains("is-open"), "Homepage must be initially visible");
assert(!elements.startScreen.classList.contains("is-open"), "Stage picker must be initially hidden");

elements.homeStartButton.click();
assert(!elements.homeScreen.classList.contains("is-open"), "Start button must hide homepage");
assert(elements.startScreen.classList.contains("is-open"), "Start button must open stage picker");

elements.homeBackButton.click();
assert(elements.homeScreen.classList.contains("is-open"), "Back button must return to homepage");
assert(!elements.startScreen.classList.contains("is-open"), "Back button must hide stage picker");

elements.gameHomeButton.click();
assert(window.game.mode === "menu" && window.game.drag === null, "Game home button must stop active play before opening homepage");
assert(elements.homeScreen.classList.contains("is-open"), "Game home button must show homepage");

console.log("Homepage smoke tests passed: initial view, mission picker, back navigation, and game-to-home transition.");
