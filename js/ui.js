(function () {
  "use strict";

  const STORAGE_KEY = "tsumeru-game-progress-v2";
  const els = {};
  let toastTimer = null;
  let progress = loadProgress();
  let modalCloseHandler = null;
  let heroTimer = null;

  function fallbackProgress() {
    return {
      unlocked: 1, completed: [], bestScores: {}, bestRanks: {}, bestEarnings: {}, sound: true, talk: true,
      dispatch: { plays: 0, clears: 0, bestEarnings: null, bestScore: null, bestRank: null }
    };
  }

  function dispatchRecord() {
    if (!progress.dispatch) progress.dispatch = fallbackProgress().dispatch;
    return progress.dispatch;
  }

  // Career level is derived from saved clears, so existing saves get their titles without migration.
  function careerLevel() {
    let level = 0;
    StageData.CAREER.forEach(function (step, index) {
      if (level !== index - 1) return;
      if (step.mission && progress.completed.indexOf(step.mission) >= 0) level = index;
      if (step.dispatch && dispatchRecord().clears > 0) level = index;
    });
    return level;
  }

  function dispatchUnlocked() {
    const index = StageData.CAREER.findIndex(function (step) { return step.key === "dispatcher"; });
    return careerLevel() >= index;
  }

  function missionLabel(stage) {
    return stage.dispatch ? "DISPATCH / 配車便" : "MISSION 0" + stage.id;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Object.assign(fallbackProgress(), saved || {});
    } catch (error) {
      return fallbackProgress();
    }
  }

  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (error) {}
  }

  function campaignEarnings() {
    return Object.keys(progress.bestEarnings || {}).reduce(function (sum, key) {
      return sum + (Number(progress.bestEarnings[key]) || 0);
    }, 0);
  }

  function updateCampaign() {
    const total = campaignEarnings();
    const target = StageData.CAMPAIGN_TARGET;
    const complete = total >= target;
    if (els.campaignTotal) els.campaignTotal.textContent = Scoring.yen(total);
    if (els.campaignTarget) els.campaignTarget.textContent = "/ " + Scoring.yen(target);
    if (els.campaignBadge) els.campaignBadge.classList.toggle("is-complete", complete);
    if (els.campaignSummary) {
      els.campaignSummary.classList.toggle("is-complete", complete);
      els.campaignSummary.innerHTML =
        "<strong>" + (complete ? "本日の目標達成！" : "本日の目標まで " + Scoring.yen(Math.max(0, target - total))) + "</strong>" +
        "<b>" + Scoring.yen(total) + " / " + Scoring.yen(target) + "</b>" +
        "<small>各便の最高『安全売上』を合計します。再挑戦して積載効率と利益を伸ばせます。</small>";
    }
  }

  function init() {
    ["homeScreen", "homeStartButton", "homeMissionButton", "homeFooterStart", "homeBackButton", "gameHomeButton",
      "startScreen", "stageGrid", "modal", "modalKicker", "modalTitle", "modalBody", "modalActions", "modalClose",
      "dialoguePanel", "speakerAvatar", "speakerName", "dialogueText", "toast", "soundButton", "resetProgressButton",
      "campaignBadge", "campaignTotal", "campaignTarget", "campaignSummary", "editionBadge",
      "careerBadge", "careerPanel", "dispatchPanel",
      "talkScreen", "talkStage", "talkKicker", "talkName", "talkRole", "talkText", "talkCount", "talkNext", "talkSkip",
      "talkToggleButton", "ceremonyScreen", "ceremonyCard", "ceremonySheet", "ceremonyTitle", "ceremonyCast", "ceremonyLine",
      "ceremonyNext", "confettiCanvas"]
      .forEach(function (id) { els[id] = document.getElementById(id); });

    Sfx.setEnabled(progress.sound !== false);
    updateSoundButton();
    els.soundButton.addEventListener("click", function () {
      progress.sound = !Sfx.isEnabled();
      Sfx.setEnabled(progress.sound);
      saveProgress();
      updateSoundButton();
    });

    els.modalClose.addEventListener("click", closeModal);
    els.modal.addEventListener("click", function (event) {
      if (event.target === els.modal) closeModal();
    });
    [els.homeStartButton, els.homeMissionButton, els.homeFooterStart].forEach(function (button) {
      if (!button) return;
      button.addEventListener("click", function () {
        Sfx.play("button");
        showStart();
      });
    });
    if (els.homeBackButton) {
      els.homeBackButton.addEventListener("click", function () {
        Sfx.play("button");
        showHome();
      });
    }
    if (els.gameHomeButton) {
      els.gameHomeButton.addEventListener("click", function () {
        Sfx.play("button");
        if (window.game) {
          window.game.mode = "menu";
          window.game.drag = null;
          window.game.updateControls();
        }
        showHome();
      });
    }
    initTalk();
    els.resetProgressButton.addEventListener("click", function () {
      openModal({
        kicker: "RESET RECORD",
        title: "研修記録を消しますか？",
        body: "<p>クリア状況、最高得点、安全売上がすべて初期化されます。</p>",
        actions: [
          { label: "やめる" },
          { label: "リセット", primary: true, action: function () {
            const sound = progress.sound;
            const talk = progress.talk;
            progress = fallbackProgress();
            progress.sound = sound;
            progress.talk = talk;
            saveProgress();
            renderStageGrid();
          } }
        ]
      });
    });
    initHeroCarousel();
    if (window.CommunityRevenue) window.CommunityRevenue.init();
    renderStageGrid();
    applyEditionMode();
  }

  function initHeroCarousel() {
    if (typeof document.querySelectorAll !== "function") return;
    const carousel = document.getElementById("homeHero");
    const slides = Array.from(document.querySelectorAll("[data-hero-slide]"));
    const captions = Array.from(document.querySelectorAll("[data-hero-caption]"));
    const dots = Array.from(document.querySelectorAll("[data-hero-dot]"));
    const indexLabel = document.getElementById("homeHeroIndex");
    if (!carousel || slides.length < 2) return;
    let current = 0;
    const reducedMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function showSlide(next) {
      current = (next + slides.length) % slides.length;
      slides.forEach(function (slide, index) {
        const active = index === current;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      captions.forEach(function (caption, index) { caption.classList.toggle("is-active", index === current); });
      dots.forEach(function (dot, index) {
        const active = index === current;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-pressed", String(active));
      });
      if (indexLabel) indexLabel.textContent = String(current + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    }

    function stopCarousel() {
      if (heroTimer) window.clearInterval(heroTimer);
      heroTimer = null;
    }

    function startCarousel() {
      stopCarousel();
      if (reducedMotion) return;
      heroTimer = window.setInterval(function () { showSlide(current + 1); }, 6000);
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        showSlide(Number(dot.getAttribute("data-hero-dot")) || 0);
        startCarousel();
      });
    });
    carousel.addEventListener("mouseenter", stopCarousel);
    carousel.addEventListener("mouseleave", startCarousel);
    carousel.addEventListener("focusin", stopCarousel);
    carousel.addEventListener("focusout", startCarousel);
    if (typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopCarousel();
        else startCarousel();
      });
    }
    showSlide(0);
    startCarousel();
  }

  function applyEditionMode() {
    let edition = "";
    try {
      const search = window.location && window.location.search ? window.location.search : "";
      edition = new URLSearchParams(search).get("view") || "";
    } catch (error) {}
    const coarsePointer = !edition && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const compactScreen = !edition && typeof window.innerWidth === "number" && window.innerWidth <= 900;
    const mobile = edition === "mobile" || Boolean(coarsePointer && compactScreen);
    const web = edition === "web";
    if (document.body && document.body.classList) {
      document.body.classList.toggle("mobile-game", mobile);
      document.body.classList.toggle("web-game", web);
    }
    if (els.editionBadge) {
      els.editionBadge.textContent = mobile ? "MOBILE EDITION" : "WEB EDITION";
      els.editionBadge.classList.toggle("is-mobile", mobile);
    }
    if (mobile || web) showStart();
  }

  function updateSoundButton() {
    els.soundButton.textContent = Sfx.isEnabled() ? "音 ON" : "音 OFF";
    els.soundButton.setAttribute("aria-pressed", String(Sfx.isEnabled()));
  }

  // --- Talk scenes (visual-novel style briefings and evaluations) ---
  let talkState = null;

  function talkEnabled() {
    return progress.talk !== false && Boolean(window.Story) && Boolean(els.talkScreen && els.talkText && els.talkNext);
  }

  function updateTalkToggle() {
    if (!els.talkToggleButton) return;
    els.talkToggleButton.textContent = progress.talk !== false ? "会話 ON" : "会話 OFF";
    els.talkToggleButton.setAttribute("aria-pressed", String(progress.talk !== false));
  }

  function initTalk() {
    updateTalkToggle();
    if (els.talkToggleButton) {
      els.talkToggleButton.addEventListener("click", function () {
        progress.talk = progress.talk === false;
        saveProgress();
        updateTalkToggle();
        Sfx.play("button");
      });
    }
    if (els.talkScreen) {
      [els.talkNext, els.talkText, els.talkStage].forEach(function (element) {
        if (element) element.addEventListener("click", advanceTalk);
      });
      if (els.talkSkip) els.talkSkip.addEventListener("click", function () { Sfx.play("button"); endTalk(); });
    }
    if (els.ceremonyScreen) {
      [els.ceremonyNext, els.ceremonyCard].forEach(function (element) {
        if (element) element.addEventListener("click", function (event) {
          if (event && event.stopPropagation && element === els.ceremonyNext) event.stopPropagation();
          advanceCeremony();
        });
      });
    }
    if (typeof document.addEventListener === "function") {
      document.addEventListener("keydown", function (event) {
        if (talkState && event.key === "Escape") endTalk();
        else if (ceremonyState && event.key === "Escape") endCeremony();
      });
    }
  }

  function figureElement(speaker) {
    const figure = document.createElement("figure");
    figure.className = "talk-figure";
    figure.setAttribute("data-speaker", speaker);
    const image = document.createElement("img");
    image.alt = "";
    figure.appendChild(image);
    figure.image = image;
    return figure;
  }

  function setFigure(figure, speaker, face) {
    const src = Story.portrait(speaker, face);
    if (src && figure.image && figure.image.src !== src) figure.image.src = src;
    const person = Story.CHARACTERS[speaker];
    if (figure.image) figure.image.alt = person ? person.name + "（架空の人物のイラスト）" : "";
  }

  function showTalk(lines, options, onDone) {
    lines = (lines || []).filter(Boolean);
    if (!lines.length || !talkEnabled()) {
      if (onDone) onDone();
      return;
    }
    const cast = [];
    lines.forEach(function (entry) { if (cast.indexOf(entry.speaker) < 0 && cast.length < 3) cast.push(entry.speaker); });
    talkState = { lines, index: 0, onDone, timer: null, full: "", figures: {} };
    if (els.talkStage) {
      els.talkStage.innerHTML = "";
      els.talkStage.setAttribute("data-cast", String(cast.length));
      cast.forEach(function (speaker, slot) {
        const figure = figureElement(speaker);
        figure.classList.add("slot-" + slot);
        const first = lines.find(function (entry) { return entry.speaker === speaker; });
        setFigure(figure, speaker, first.face);
        els.talkStage.appendChild(figure);
        talkState.figures[speaker] = figure;
      });
    }
    if (els.talkKicker) els.talkKicker.textContent = (options && options.kicker) || "TALK";
    els.talkScreen.classList.add("is-open");
    els.talkScreen.setAttribute("aria-hidden", "false");
    renderTalkLine();
    if (typeof els.talkNext.focus === "function") els.talkNext.focus();
  }

  function renderTalkLine() {
    const entry = talkState.lines[talkState.index];
    const person = Story.CHARACTERS[entry.speaker] || { name: "", role: "" };
    const last = talkState.index === talkState.lines.length - 1;
    if (els.talkName) els.talkName.textContent = person.name;
    if (els.talkRole) els.talkRole.textContent = person.role;
    if (els.talkCount) els.talkCount.textContent = (talkState.index + 1) + " / " + talkState.lines.length;
    Object.keys(talkState.figures).forEach(function (speaker) {
      const figure = talkState.figures[speaker];
      const speaking = speaker === entry.speaker;
      figure.classList.toggle("is-speaking", speaking);
      if (speaking) {
        setFigure(figure, speaker, entry.face);
        // Restart the small hop that marks who is talking.
        figure.classList.remove("is-hop");
        void figure.offsetWidth;
        figure.classList.add("is-hop");
      }
    });
    els.talkNext.textContent = last ? "閉じる" : "次へ ▶";
    typeTalkText(entry.text);
  }

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function typeTalkText(text) {
    clearInterval(talkState.timer);
    talkState.full = text;
    if (reducedMotion()) {
      els.talkText.textContent = text;
      talkState.timer = null;
      return;
    }
    let shown = 0;
    els.talkText.textContent = "";
    talkState.timer = setInterval(function () {
      shown += 2;
      els.talkText.textContent = text.slice(0, shown);
      if (shown >= text.length) {
        clearInterval(talkState.timer);
        talkState.timer = null;
      }
    }, 28);
  }

  function advanceTalk() {
    if (!talkState) return;
    if (talkState.timer) {
      // First tap finishes the line; the next tap moves on.
      clearInterval(talkState.timer);
      talkState.timer = null;
      els.talkText.textContent = talkState.full;
      return;
    }
    Sfx.play("pick");
    talkState.index += 1;
    if (talkState.index >= talkState.lines.length) endTalk();
    else renderTalkLine();
  }

  function endTalk() {
    if (!talkState) return;
    clearInterval(talkState.timer);
    const done = talkState.onDone;
    talkState = null;
    els.talkScreen.classList.remove("is-open");
    els.talkScreen.setAttribute("aria-hidden", "true");
    if (done) done();
  }

  // --- Promotion ceremony: review sheet, stamp, confetti and congratulations ---
  let ceremonyState = null;

  function gradeCells(sheet) {
    return sheet.rows.map(function (row, index) {
      return "<div class=\"review-row\" style=\"--delay:" + (index * .38 + .25) + "s\"><span>" + row.label + "</span><small>" + row.note +
        "</small><b class=\"grade grade-" + row.grade + "\">" + row.grade + "</b></div>";
    }).join("") +
      "<div class=\"review-row review-total\" style=\"--delay:" + (sheet.rows.length * .38 + .35) + "s\"><span>総合評価</span><small>現場責任者・統括部長の評価</small><b class=\"grade grade-" + sheet.total + "\">" + sheet.total + "</b></div>";
  }

  function showCeremony(stage, result, promotion, onDone) {
    if (!els.ceremonyScreen || !window.Story) {
      if (onDone) onDone();
      return;
    }
    const sheet = Story.gradeSheet(stage, result);
    ceremonyState = { onDone, lines: Story.ceremony(promotion), index: -1, stamped: false, timers: [] };
    els.ceremonyScreen.classList.remove("is-stamped");
    if (els.ceremonySheet) els.ceremonySheet.innerHTML = gradeCells(sheet);
    if (els.ceremonyTitle) els.ceremonyTitle.innerHTML = "<small>" + promotion.from.title + "</small><i>→</i><strong>" + promotion.to.title + "</strong>";
    if (els.ceremonyCast) {
      els.ceremonyCast.innerHTML = "";
      ["senpai", "president", "doki"].forEach(function (speaker) {
        const figure = figureElement(speaker);
        setFigure(figure, speaker, "cheer");
        els.ceremonyCast.appendChild(figure);
      });
    }
    if (els.ceremonyLine) els.ceremonyLine.textContent = "";
    if (els.ceremonyNext) els.ceremonyNext.textContent = "次へ ▶";
    els.ceremonyScreen.classList.add("is-open");
    els.ceremonyScreen.setAttribute("aria-hidden", "false");
    Sfx.play("review");
    const delay = reducedMotion() ? 0 : (sheet.rows.length * .38 + 1.1) * 1000;
    if (delay) ceremonyState.timers.push(setTimeout(stampCeremony, delay));
    else stampCeremony();
  }

  function stampCeremony() {
    if (!ceremonyState || ceremonyState.stamped) return;
    ceremonyState.stamped = true;
    els.ceremonyScreen.classList.add("is-stamped");
    Sfx.play("stamp");
    Sfx.play("promote");
    launchConfetti();
    advanceCeremony();
  }

  function advanceCeremony() {
    if (!ceremonyState) return;
    if (!ceremonyState.stamped) { stampCeremony(); return; }
    ceremonyState.index += 1;
    const entry = ceremonyState.lines[ceremonyState.index];
    if (!entry) { endCeremony(); return; }
    const person = Story.CHARACTERS[entry.speaker];
    if (els.ceremonyLine) els.ceremonyLine.innerHTML = "<b>" + person.name + "</b>「" + entry.text + "」";
    if (els.ceremonyCast && els.ceremonyCast.children) {
      Array.from(els.ceremonyCast.children).forEach(function (figure) {
        figure.classList.toggle("is-speaking", figure.getAttribute("data-speaker") === entry.speaker);
      });
    }
    if (els.ceremonyNext) els.ceremonyNext.textContent = ceremonyState.index === ceremonyState.lines.length - 1 ? "辞令を受け取る" : "次へ ▶";
  }

  function endCeremony() {
    if (!ceremonyState) return;
    const done = ceremonyState.onDone;
    ceremonyState.timers.forEach(clearTimeout);
    ceremonyState = null;
    els.ceremonyScreen.classList.remove("is-open");
    els.ceremonyScreen.setAttribute("aria-hidden", "true");
    if (els.careerBadge && els.careerBadge.classList) {
      els.careerBadge.classList.add("is-promoted");
      setTimeout(function () { els.careerBadge.classList.remove("is-promoted"); }, 4000);
    }
    if (done) done();
  }

  function launchConfetti() {
    const canvas = els.confettiCanvas;
    if (!canvas || !canvas.getContext || reducedMotion() || typeof requestAnimationFrame !== "function") return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width = window.innerWidth || 1280;
    const height = canvas.height = window.innerHeight || 720;
    const colors = ["#25d391", "#4aa8ff", "#ffbd59", "#ff715b", "#eef8f5"];
    const bits = Array.from({ length: 150 }, function () {
      return { x: width / 2 + (Math.random() - .5) * 200, y: height * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 4,
        size: 5 + Math.random() * 7, spin: Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)] };
    });
    const start = performance.now();
    function frame(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      bits.forEach(function (bit) {
        bit.vy += .32; bit.vx *= .992; bit.x += bit.vx; bit.y += bit.vy;
        ctx.save(); ctx.translate(bit.x, bit.y); ctx.rotate(bit.spin * t);
        ctx.fillStyle = bit.color; ctx.globalAlpha = Math.max(0, 1 - t / 4);
        ctx.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2); ctx.restore();
      });
      if (t < 4) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, width, height);
    }
    requestAnimationFrame(frame);
  }

  // Starts a fixed mission id or a stage definition, with the pre-run briefing unless told otherwise.
  function startMission(stageOrId, options) {
    const stage = stageOrId && typeof stageOrId === "object"
      ? stageOrId
      : StageData.stages.find(function (item) { return item.id === stageOrId; });
    if (!stage) return;
    function go() {
      hideStart();
      if (window.game) window.game.startStage(stageOrId);
    }
    if (options && options.briefing === false) { go(); return; }
    showTalk(window.Story ? Story.briefing(stage) : [], { kicker: "BRIEFING / " + missionLabel(stage) }, go);
  }

  function renderCareer() {
    const level = careerLevel();
    const steps = StageData.CAREER;
    const current = steps[level];
    const next = steps[level + 1];
    if (els.careerBadge) els.careerBadge.textContent = "役職 " + current.title;
    if (els.careerPanel) {
      els.careerPanel.innerHTML =
        "<div class=\"career-now\"><small>現在の役職</small><strong>" + current.title + "</strong>" +
        "<span>" + (next ? "次の昇進：" + next.title + "（" + next.requirement + "）" : "最高位の役職に到達しています") + "</span></div>" +
        "<ol class=\"career-ladder\" aria-label=\"昇進ルート\">" + steps.map(function (step, index) {
          const state = index < level ? "is-done" : index === level ? "is-current" : "";
          return "<li class=\"" + state + "\">" + step.title + "</li>";
        }).join("") + "</ol>";
    }
    renderDispatchPanel();
  }

  function renderDispatchPanel() {
    if (!els.dispatchPanel) return;
    const unlocked = dispatchUnlocked();
    const record = dispatchRecord();
    els.dispatchPanel.innerHTML = "";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "dispatch-card";
    card.disabled = !unlocked;
    card.innerHTML =
      "<span class=\"stage-number\">DISPATCH / 配車便</span>" +
      (record.bestScore != null ? "<span class=\"stage-best\">" + record.bestRank + " / " + record.bestScore + "</span>" : "") +
      "<strong>依頼を選んで、届け切れ。</strong>" +
      "<small>" + (unlocked
        ? "12件の依頼から受ける荷を選びます。受けた荷の積み残しは運賃の50%が違約金。毎回ちがう依頼が届きます。"
        : "「配車係」に昇進すると解放（MISSION 05 クリア）") + "</small>" +
      "<span class=\"stage-status\">" + (record.bestEarnings != null
        ? "BEST " + Scoring.yen(record.bestEarnings) + "　クリア " + record.clears + "回"
        : (unlocked ? "未クリア" : "LOCKED")) + "</span>";
    if (unlocked) {
      card.addEventListener("click", function () {
        Sfx.play("button");
        showDispatchBoard(StageData.createDispatchBoard(newDispatchSeed()));
      });
    }
    els.dispatchPanel.appendChild(card);
  }

  function newDispatchSeed() {
    return ((Date.now() % 2147483647) ^ Math.floor(Math.random() * 2147483647)) >>> 0;
  }

  function renderStageGrid() {
    if (!els.stageGrid) return;
    updateCampaign();
    renderCareer();
    els.stageGrid.innerHTML = "";
    StageData.stages.forEach(function (stage) {
      const unlocked = stage.id <= progress.unlocked;
      const best = progress.bestEarnings[stage.id];
      const promotion = StageData.CAREER.find(function (step) { return step.mission === stage.id; });
      const card = document.createElement("button");
      card.type = "button";
      card.className = "stage-card";
      card.disabled = !unlocked;
      card.innerHTML =
        "<span class=\"stage-number\">MISSION 0" + stage.id + "</span>" +
        (progress.bestScores[stage.id] != null ? "<span class=\"stage-best\">" + progress.bestRanks[stage.id] + " / " + progress.bestScores[stage.id] + "</span>" : "") +
        "<strong>" + stage.title + "</strong>" +
        "<small>" + (unlocked ? stage.objective : "前の研修をクリアすると解放") + "</small>" +
        "<span class=\"stage-target\">目標運賃 " + Scoring.yen(stage.targetRevenue) + "</span>" +
        (promotion ? "<span class=\"stage-promo\">クリアで「" + promotion.title + "」へ昇進</span>" : "") +
        "<span class=\"stage-status\">" + (best != null ? "BEST " + Scoring.yen(best) : (unlocked ? "未挑戦" : "LOCKED")) + "</span>";
      if (unlocked) {
        card.addEventListener("click", function () {
          Sfx.play("button");
          startMission(stage.id);
        });
      }
      els.stageGrid.appendChild(card);
    });
  }

  function showStart() {
    renderStageGrid();
    hideHome();
    els.startScreen.classList.add("is-open");
  }

  function hideStart() { els.startScreen.classList.remove("is-open"); }

  function showHome() {
    hideStart();
    if (els.homeScreen) {
      els.homeScreen.classList.add("is-open");
      els.homeScreen.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function hideHome() {
    if (els.homeScreen) els.homeScreen.classList.remove("is-open");
  }

  function dialogue(text, speaker, face) {
    const person = window.Story && Story.CHARACTERS[speaker];
    const boss = speaker === "boss";
    const art = person && Story.portrait ? Story.portrait(speaker, face) : null;
    els.speakerAvatar.textContent = art ? "" : person ? person.initial : boss ? "責" : "叉";
    els.speakerAvatar.style.background = person ? person.color : boss ? "#4aa8ff" : "#24d391";
    els.speakerAvatar.style.backgroundImage = art ? "url(\"" + art + "\")" : "";
    els.speakerAvatar.classList.toggle("has-art", Boolean(art));
    els.speakerName.textContent = person ? person.name + "（" + person.role + "）" : boss ? "現場責任者" : "積載ナビ";
    els.dialogueText.textContent = text;
    els.dialoguePanel.classList.remove("is-hidden");
  }

  // Shows one Story line ({ speaker, text }) in the in-game navigation panel.
  function say(line) {
    if (line) dialogue(line.text, line.speaker, line.face);
  }

  function hideDialogue() { els.dialoguePanel.classList.add("is-hidden"); }

  function toast(message, isError) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("is-error", Boolean(isError));
    els.toast.classList.add("is-visible");
    toastTimer = setTimeout(function () { els.toast.classList.remove("is-visible"); }, 2700);
  }

  function openModal(options) {
    const card = document.querySelector ? document.querySelector(".modal-card") : null;
    if (card && card.classList) card.classList.toggle("is-wide", Boolean(options.wide));
    els.modalKicker.textContent = options.kicker || "INFORMATION";
    els.modalTitle.textContent = options.title || "";
    els.modalBody.innerHTML = options.body || "";
    els.modalActions.innerHTML = "";
    modalCloseHandler = options.onClose || null;
    (options.actions || [{ label: "閉じる" }]).forEach(function (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.primary) button.classList.add("primary");
      button.addEventListener("click", function () {
        Sfx.play("button");
        closeModal(false);
        if (action.action) action.action();
      });
      els.modalActions.appendChild(button);
    });
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(callHandler) {
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
    if (callHandler !== false && modalCloseHandler) modalCloseHandler();
    modalCloseHandler = null;
  }

  function showHelp(stage) {
    const rules = [
      ["1", "倉庫画面：荷の手前で停止し、青い昇降ハンドルで爪先をパレット差込口の中央へ合わせる。"],
      ["穴", "車体を静かに前進。フォークを75%以上差し込んだ時だけ持上げられる。高さを外して押すと爪突き事故。"],
      ["低", "持上げ後は荷を低く保ち、左の出荷バースへ後退搬送する。"],
      ["2", "積付け画面：倉庫から運んだパレットだけを、側面図のトラック荷室へドラッグして配置する。"],
      ["kg", "荷札の実重量を合計し、最大積載量を絶対に超えない。"],
      ["重", "重い物は床へ。重心を低くし、前後へ偏らせない。"],
      ["耐", "下の箱の耐荷重を超えて上積みしない。"]
    ];
    if (stage.rules.protected) rules.push(["厳", "破損厳禁は上積み禁止。発泡材で隙間を埋める。"]);
    if (stage.rules.securement) rules.push(["固", "全品をコンパネ・発泡材・ベルトのいずれかで固定する。"]);
    if (stage.rules.delivery) rules.push(["順", "配送番号が小さいほど左側の後部ドアへ近づける。"]);
    if (stage.leftoverPenaltyRate) rules.push(["違", "受注した荷物を積み残すと、運賃の" + Math.round(stage.leftoverPenaltyRate * 100) + "%を違約金として差し引く。"]);
    rules.push(["点", "積み込み後は必ず発車前点検。積み直したら再点検する。"]);
    openModal({
      kicker: "LOADING MANUAL / " + missionLabel(stage),
      title: stage.title,
      body:
        "<p>" + stage.description + "</p>" +
        "<div class=\"help-rules\">" + rules.map(function (rule) {
          return "<div class=\"help-rule\"><i>" + rule[0] + "</i><span>" + rule[1] + "</span></div>";
        }).join("") + "</div>" +
        "<p><strong>現場メモ：</strong> " + stage.lesson + "</p>" +
        "<p><strong>この便のヒント：</strong> " + stage.tip + "</p>"
    });
  }

  function showInspection(stage, report) {
    const checks = [
      "<li class=\"" + (report.overweightKg ? "danger" : "ok") + "\">" +
        (report.overweightKg ? "✕ 過積載 " + report.overweightKg + "kg" : "✓ 積載重量 " + report.payloadKg + " / " + report.maxPayloadKg + "kg") + "</li>"
    ];
    if (report.forkDamagePackages.length) checks.push(
      "<li class=\"danger\">✕ 爪突き事故 " + report.forkDamagePackages.length + "件（破損損失 " + Scoring.yen(report.forkDamagePackages.reduce(function (sum, pkg) { return sum + pkg.replacementCost; }, 0)) + "）</li>"
    );
    if (stage.rules.balance) checks.push(
      "<li class=\"" + (report.balanceOk && !report.topHeavy ? "ok" : "danger") + "\">" +
      (report.balanceOk && !report.topHeavy ? "✓" : "✕") + " 前後荷重 " +
      (report.balanceOffsetPercent === 0 ? "中央" : Math.abs(report.balanceOffsetPercent) + "% " + (report.balanceOffsetPercent < 0 ? "後方寄り" : "前方寄り")) + "</li>"
    );
    checks.push("<li class=\"" + (report.crushed.length ? "danger" : "ok") + "\">" + (report.crushed.length ? "✕" : "✓") + " 上積み耐荷重</li>");
    if (stage.rules.protected) checks.push("<li class=\"" + (report.protectionIssues.length ? "danger" : "ok") + "\">" + (report.protectionIssues.length ? "✕" : "✓") + " 破損厳禁貨物</li>");
    if (stage.rules.securement) checks.push("<li class=\"" + (report.unsecured.length ? "danger" : "ok") + "\">" + (report.unsecured.length ? "✕" : "✓") + " 荷物の固定</li>");
    const leftoverPenalty = report.leftoverPenalty || 0;
    const plannedRevenue = report.grossRevenue - report.materialCost - leftoverPenalty;
    if (plannedRevenue < stage.targetRevenue) checks.push("<li class=\"warn\">△ 予定運賃が目標まで " + Scoring.yen(stage.targetRevenue - plannedRevenue) + " 不足</li>");
    report.warnings.forEach(function (warning) { checks.push("<li class=\"warn\">△ " + warning + "</li>"); });
    report.blockingIssues.forEach(function (issue) { checks.push("<li class=\"danger\">是正：" + issue + "</li>"); });
    const safe = report.blockingIssues.length === 0;
    openModal({
      kicker: "PRE-DEPARTURE INSPECTION",
      title: safe ? (report.forkDamagePackages.length ? "積付けOK・事故損失あり" : "発車準備OK") : "積み直しが必要です",
      body:
        "<ul class=\"inspection-list\">" + checks.join("") + "</ul>" +
        "<div class=\"revenue-panel\">予定運賃 <strong>" + Scoring.yen(plannedRevenue) + "</strong><br>" +
        "<small>総運賃 " + Scoring.yen(report.grossRevenue) + " − 資材費 " + Scoring.yen(report.materialCost) +
        (leftoverPenalty ? " − 積み残し違約金 " + Scoring.yen(leftoverPenalty) : "") +
        " / 目標 " + Scoring.yen(stage.targetRevenue) + "</small></div>" +
        "<p>" + (safe ? (report.forkDamagePackages.length ? "積付け自体は出発可能ですが、破損品の代替費用と減点は配送結果へ残ります。" : "点検済みです。積み方を変えなければ出発できます。") : "赤い項目を直し、もう一度点検してください。") + "</p>",
      actions: [{ label: safe ? "点検完了" : "積み込みへ戻る", primary: safe }]
    });
  }

  function recordDispatchResult(result) {
    const record = dispatchRecord();
    record.plays += 1;
    if (!result.passed) return;
    record.clears += 1;
    record.bestEarnings = Math.max(record.bestEarnings || 0, result.netRevenue);
    if (record.bestScore == null || result.score > record.bestScore) {
      record.bestScore = result.score;
      record.bestRank = result.rank.key;
    }
  }

  // Returns the promotion earned by this result, or null.
  function recordResult(stage, result) {
    const before = careerLevel();
    const stageId = stage.id;
    if (stage.dispatch) {
      recordDispatchResult(result);
    } else {
      if (progress.bestScores[stageId] == null || result.score > progress.bestScores[stageId]) {
        progress.bestScores[stageId] = result.score;
        progress.bestRanks[stageId] = result.rank.key;
      }
      if (result.passed) {
        if (progress.completed.indexOf(stageId) < 0) progress.completed.push(stageId);
        progress.unlocked = Math.max(progress.unlocked, Math.min(StageData.stages.length, stageId + 1));
        progress.bestEarnings[stageId] = Math.max(progress.bestEarnings[stageId] || 0, result.netRevenue);
      }
    }
    saveProgress();
    updateCampaign();
    const after = careerLevel();
    renderCareer();
    return after > before ? { from: StageData.CAREER[before], to: StageData.CAREER[after] } : null;
  }

  function promotionHtml(promotion) {
    const unlocksDispatch = promotion.to.key === "dispatcher";
    return "<div class=\"promotion-card\" role=\"status\">" +
      "<small>辞令 / APPOINTMENT</small>" +
      "<strong>「" + promotion.to.title + "」を命ずる</strong>" +
      "<span class=\"promotion-path\">" + promotion.from.title + " → " + promotion.to.title + "</span>" +
      "<p>" + promotion.to.comment + "</p>" +
      "<em>翠路ロジスティクス株式会社 代表取締役 水城 蒼太（架空の人物）</em>" +
      (unlocksDispatch ? "<b>新しい仕事「配車便」が解放されました。ミッション選択から挑戦できます。</b>" : "") +
      "</div>";
  }

  function showResult(stage, result, handlers) {
    const promotion = recordResult(stage, result);
    if (result.passed && window.CommunityRevenue && !stage.dispatch) {
      if (!result.communityCompletionId) {
        result.communityCompletionId = "delivery-" + stage.id + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
      }
      window.CommunityRevenue.submit(result.netRevenue, stage.id, result.communityCompletionId);
    }
    const materialDetail = "コンパネ" + result.usage.panel + "・発泡材" + result.usage.foam + "・ベルト" + result.usage.strap;
    const rows = [
      ["積載", result.placed.length + " / " + (result.placed.length + result.unplaced) + "個"],
      ["荷役事故", result.forkDamagePackages.length + "件"],
      ["重量", result.payloadKg + " / " + result.maxPayloadKg + "kg"],
      ["総運賃", Scoring.yen(result.grossRevenue)],
      ["資材費（" + materialDetail + "）", "−" + Scoring.yen(result.materialCost)],
      ["破損・荷つぶれ損失", "−" + Scoring.yen(result.damageLoss)],
      ["遅延損失", "−" + Scoring.yen(result.timePenalty)]
    ].concat(stage.leftoverPenaltyRate ? [["積み残し違約金", "−" + Scoring.yen(result.leftoverPenalty)]] : []).map(function (row, index) {
      const negative = (index === 1 && row[1] !== "0件") || (index >= 4 && row[1] !== "−¥0");
      return "<div class=\"score-row\"><span>" + row[0] + "</span><strong" + (negative ? " class=\"score-negative\"" : "") + ">" + row[1] + "</strong></div>";
    }).join("");
    const notes = "<ul class=\"penalty-list\">" + result.penalties.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul>";
    const actions = [
      { label: "ステージ選択", action: handlers.stages },
      { label: "もう一度", action: handlers.retry }
    ];
    if (result.passed && stage.id < StageData.stages.length) actions.push({ label: "次の研修へ", primary: true, action: handlers.next });
    // The evaluation talk plays first; the report (and any appointment) follows when it closes.
    const evaluation = window.Story ? Story.evaluation(stage, result, { promotion }) : [];
    const report = function () { openReport(stage, result, handlers, promotion, rows, notes, actions); };
    showTalk(evaluation, { kicker: "EVALUATION / " + missionLabel(stage) }, function () {
      if (promotion) showCeremony(stage, result, promotion, report);
      else report();
    });
  }

  function reviewHtml(stage, result) {
    if (!window.Story) return "";
    const sheet = Story.gradeSheet(stage, result);
    return "<div class=\"report-review\" aria-label=\"評価シート\">" + sheet.rows.map(function (row) {
      return "<span><small>" + row.label + "</small><b class=\"grade grade-" + row.grade + "\">" + row.grade + "</b></span>";
    }).join("") + "<span class=\"is-total\"><small>総合</small><b class=\"grade grade-" + sheet.total + "\">" + sheet.total + "</b></span></div>";
  }

  function openReport(stage, result, handlers, promotion, rows, notes, actions) {
    // Without the ceremony (no story data), the promotion jingle plays here.
    if (promotion && !(window.Story && els.ceremonyScreen)) Sfx.play("promote");
    openModal({
      kicker: "DELIVERY REPORT / " + missionLabel(stage),
      title: result.passed ? (stage.dispatch ? "配車便クリア" : "研修クリア") : "目標未達・再点検",
      body:
        (promotion ? promotionHtml(promotion) : "") +
        reviewHtml(stage, result) +
        "<div class=\"score-hero\"><span class=\"score-rank\">" + result.rank.key + "</span><span><b class=\"score-points\">" + result.score + "</b><br><small class=\"score-label\">SAFETY SCORE / 100</small></span></div>" +
        "<p class=\"" + (result.passed ? "result-pass" : "result-fail") + "\">" +
        (result.passed ? "✓ 安全売上 " + Scoring.yen(result.netRevenue) : "✕ 安全売上 " + Scoring.yen(result.netRevenue) + " / 目標 " + Scoring.yen(stage.targetRevenue)) + "</p>" +
        "<div class=\"score-list\">" + rows + "</div>" + notes,
      actions,
      onClose: handlers.stages
    });
  }

  function orderTags(pkg) {
    const tags = [];
    if (pkg.type === "heavy") tags.push("重量物");
    if (pkg.protectedCargo) tags.push("破損厳禁・発泡材が必要");
    if (pkg.keepUpright) tags.push("天地無用");
    if (!pkg.rotatable) tags.push("回転不可");
    if (pkg.deliveryOrder) tags.push("配送順 " + pkg.deliveryOrder + "番目");
    tags.push(pkg.maxStackKg ? "上積み " + pkg.maxStackKg + "kgまで" : "上積み禁止");
    return tags.join("・");
  }

  function dispatchSummaryHtml(board, chosen) {
    const plan = StageData.dispatchPlan(chosen, board.materials);
    const penaltyRate = Math.round(board.leftoverPenaltyRate * 100);
    const warnings = [];
    if (plan.overweightKg) warnings.push("最大積載量を " + plan.overweightKg + "kg 超えています。積み切れない荷物は運賃の" + penaltyRate + "%が違約金です。");
    if (plan.foamShort) warnings.push("破損厳禁の荷物に対して発泡材が " + plan.foamShort + "個足りません。");
    if (plan.restraintShort) warnings.push("固定資材が " + plan.restraintShort + "個足りません。全品に固定が必要です。");
    const revenueOk = plan.estimatedRevenue >= board.targetRevenue;
    return "<div class=\"dispatch-totals\">" +
      "<span><small>受注</small><b>" + chosen.length + "件</b></span>" +
      "<span class=\"" + (plan.overweightKg ? "is-over" : "") + "\"><small>重量</small><b>" + plan.weightKg + " / " + board.maxPayloadKg + "kg</b></span>" +
      "<span class=\"" + (plan.restraintShort ? "is-over" : "") + "\"><small>固定資材</small><b>" + chosen.length + " / " + plan.restraintCount + "個</b></span>" +
      "<span class=\"" + (plan.foamShort ? "is-over" : "") + "\"><small>発泡材（破損厳禁）</small><b>" + plan.protectedCount + " / " + board.materials.foam + "個</b></span>" +
      "<span class=\"" + (revenueOk ? "is-ok" : "") + "\"><small>見込み安全売上</small><b>" + Scoring.yen(plan.estimatedRevenue) + "</b></span>" +
      "</div>" +
      "<p class=\"dispatch-note\">見込み = 運賃合計 " + Scoring.yen(plan.fee) + " − 最安の固定資材費 " + Scoring.yen(plan.materialCost) +
      "。目標 " + Scoring.yen(board.targetRevenue) + (revenueOk ? "に届く見込みです。" : "まであと " + Scoring.yen(board.targetRevenue - plan.estimatedRevenue) + "。") + "</p>" +
      (warnings.length ? "<ul class=\"dispatch-warnings\">" + warnings.map(function (w) { return "<li>" + w + "</li>"; }).join("") + "</ul>" : "");
  }

  function showDispatchBoard(board, preselectedIds, options) {
    const briefing = !(options && options.briefing === false);
    const selected = new Set(preselectedIds || []);
    const m = board.materials;
    const rows = board.orders.map(function (pkg) {
      return "<label class=\"dispatch-order type-" + pkg.type + "\">" +
        "<input type=\"checkbox\" data-order=\"" + pkg.id + "\"" + (selected.has(pkg.id) ? " checked" : "") + ">" +
        "<i aria-hidden=\"true\">" + escapeHtml(pkg.icon || "箱") + "</i>" +
        "<span class=\"order-main\"><strong>" + escapeHtml(pkg.name) + "</strong><small>" + escapeHtml(pkg.client) + "　" + orderTags(pkg) + "</small></span>" +
        "<span class=\"order-kg\">" + pkg.weightKg + "kg</span>" +
        "<span class=\"order-fee\">" + Scoring.yen(pkg.fee) + "</span>" +
        "</label>";
    }).join("");
    openModal({
      wide: true,
      kicker: "DISPATCH BOARD / 配車係の依頼ボード",
      title: "どの依頼を受けますか？",
      onClose: showStart,
      body:
        "<p class=\"dispatch-brief\">最大積載量 <b>" + board.maxPayloadKg.toLocaleString("ja-JP") + "kg</b>　固定資材 コンパネ" + m.panel + "・発泡材" + m.foam + "・ベルト" + m.strap +
        "（計" + (m.panel + m.foam + m.strap) + "個）　目標安全売上 <b>" + Scoring.yen(board.targetRevenue) + "</b><br>" +
        "受けた荷物は倉庫で荷役し、すべて積むのが原則です。積み残すと運賃の" + Math.round(board.leftoverPenaltyRate * 100) + "%を違約金として差し引きます。</p>" +
        "<div class=\"dispatch-orders\">" + rows + "</div>" +
        "<div id=\"dispatchSummary\" class=\"dispatch-summary\" aria-live=\"polite\"></div>",
      actions: [
        { label: "やめる", action: showStart },
        { label: "別の依頼に替える", action: function () { showDispatchBoard(StageData.createDispatchBoard(newDispatchSeed())); } },
        { label: "受注して倉庫へ", primary: true, action: function () {
          const ids = Array.from(selected);
          startMission(StageData.createDispatchStage(board, ids), { briefing });
        } }
      ]
    });
    if (!els.modalBody.querySelectorAll) return;
    const summary = els.modalBody.querySelector("#dispatchSummary");
    const acceptButton = els.modalActions.lastChild;
    function refresh() {
      const chosen = board.orders.filter(function (pkg) { return selected.has(pkg.id); });
      summary.innerHTML = dispatchSummaryHtml(board, chosen);
      acceptButton.disabled = chosen.length === 0;
    }
    Array.from(els.modalBody.querySelectorAll("input[data-order]")).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) selected.add(input.getAttribute("data-order"));
        else selected.delete(input.getAttribute("data-order"));
        Sfx.play("pick");
        refresh();
      });
    });
    refresh();
  }

  window.UI = {
    init,
    showStart,
    hideStart,
    showHome,
    hideHome,
    dialogue,
    hideDialogue,
    toast,
    showHelp,
    showInspection,
    showResult,
    openModal,
    closeModal,
    renderStageGrid,
    showDispatchBoard,
    startMission,
    showTalk,
    showCeremony,
    say,
    careerLevel,
    getProgress: function () { return progress; },
    getCampaignEarnings: campaignEarnings
  };
})();
