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
    this.attributes = {};
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  scrollTo() {}
  click() {
    if (this.listeners.click) this.listeners.click({ target: this });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const indexSource = fs.readFileSync("index.html", "utf8");
assert(/id="webVersionLink"[^>]*href="index\.html\?view=web"[^>]*target="_blank"/.test(indexSource), "Web edition link must open in a new tab");
assert(/id="mobileVersionLink"[^>]*href="index\.html\?view=mobile"[^>]*target="_blank"/.test(indexSource), "Mobile edition link must open in a new tab");
assert(/id="virtualPad"/.test(indexSource) && /id="padDriveBack"/.test(indexSource) && /id="padForkUp"/.test(indexSource), "Mobile edition must include a virtual pad");
assert((indexSource.match(/data-hero-slide/g) || []).length === 3, "Homepage carousel must contain three generated-image slides");
assert(/home-marquee-track/.test(indexSource), "Homepage must include a flowing message strip");
assert(/5秒ごとに500円/.test(indexSource) && /2分30秒〜5分/.test(indexSource), "Homepage must explain the real overtime-loss rules");
assert(/翠路ロジスティクス株式会社/.test(indexSource) && /SUIRO LOGISTICS/.test(indexSource), "Homepage must use the fictional company identity");
assert(/id="communityRevenueTotal"/.test(indexSource) && /id="communityDeliveryCount"/.test(indexSource), "Homepage must expose community revenue counters");
assert(/現在、募集は行っておりません/.test(indexSource), "Recruitment must clearly state that no positions are open");
assert(/実在する企業・団体・人物とは一切関係ありません/.test(indexSource), "Homepage must include a prominent fictional-company disclaimer");
assert(!/豊興|1個の荷物から3PLまで|積めるもんなら積んでみろ/.test(indexSource), "Reference-site copy and the retired slogan must not be reused");
["home-hero-pickup.png", "home-hero-loading.png", "home-hero-securement.png", "company-team.png",
  "company-office.png", "company-sales.png", "company-president.png", "company-manager-east.png",
  "company-manager-central.png", "company-manager-west.png"].forEach(function (name) {
  assert(fs.existsSync("assets/images/" + name), "Generated homepage image is missing: " + name);
});

const ids = [
  "homeScreen", "homeStartButton", "homeMissionButton", "homeFooterStart", "homeBackButton", "gameHomeButton",
  "startScreen", "stageGrid", "modal", "modalKicker", "modalTitle", "modalBody", "modalActions", "modalClose",
  "dialoguePanel", "speakerAvatar", "speakerName", "dialogueText", "toast", "soundButton", "resetProgressButton",
  "campaignBadge", "campaignTotal", "campaignTarget", "campaignSummary", "editionBadge", "homeHero", "homeHeroIndex"
];
const elements = {};
ids.forEach(function (id) { elements[id] = new FakeElement(id); });
elements.homeScreen.classList.add("is-open");
const heroSlides = [new FakeElement(), new FakeElement(), new FakeElement()];
const heroCaptions = [new FakeElement(), new FakeElement(), new FakeElement()];
const heroDots = [new FakeElement(), new FakeElement(), new FakeElement()];
heroDots.forEach(function (dot, index) { dot.setAttribute("data-hero-dot", String(index)); });

global.window = global;
global.matchMedia = function (query) { return { matches: query.indexOf("reduced-motion") >= 0 }; };
global.document = {
  body: new FakeElement("body"),
  getElementById: function (id) { return elements[id] || null; },
  createElement: function () { return new FakeElement(); },
  querySelectorAll: function (selector) {
    if (selector === "[data-hero-slide]") return heroSlides;
    if (selector === "[data-hero-caption]") return heroCaptions;
    if (selector === "[data-hero-dot]") return heroDots;
    return [];
  },
  addEventListener: function () {}
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
assert(heroSlides[0].classList.contains("is-active") && elements.homeHeroIndex.textContent === "01 / 03", "Carousel must initialize on its first scene");
heroDots[2].click();
assert(heroSlides[2].classList.contains("is-active") && !heroSlides[0].classList.contains("is-active"), "Carousel dots must switch the active scene");
assert(elements.homeHeroIndex.textContent === "03 / 03", "Carousel index must follow manual scene changes");

elements.homeStartButton.click();
assert(!elements.homeScreen.classList.contains("is-open"), "Start button must hide homepage");
assert(elements.startScreen.classList.contains("is-open"), "Start button must open stage picker");

elements.homeBackButton.click();
assert(elements.homeScreen.classList.contains("is-open"), "Back button must return to homepage");
assert(!elements.startScreen.classList.contains("is-open"), "Back button must hide stage picker");

elements.gameHomeButton.click();
assert(window.game.mode === "menu" && window.game.drag === null, "Game home button must stop active play before opening homepage");
assert(elements.homeScreen.classList.contains("is-open"), "Game home button must show homepage");

global.location = { search: "?view=mobile" };
global.innerWidth = 390;
global.matchMedia = function () { return { matches: true }; };
UI.init();
assert(document.body.classList.contains("mobile-game"), "Mobile edition URL must enable the mobile layout");
assert(elements.editionBadge.textContent === "MOBILE EDITION", "Mobile edition must be identified in the game header");
assert(elements.startScreen.classList.contains("is-open") && !elements.homeScreen.classList.contains("is-open"), "Edition links must open directly at mission selection");

console.log("Homepage smoke tests passed: initial view, new-tab edition links, mission picker, back navigation, game-to-home transition, and mobile URL mode.");
