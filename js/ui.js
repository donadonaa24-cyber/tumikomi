(function () {
  "use strict";

  const STORAGE_KEY = "tsumeru-game-progress-v2";
  const els = {};
  let toastTimer = null;
  let progress = loadProgress();
  let modalCloseHandler = null;

  function fallbackProgress() {
    return { unlocked: 1, completed: [], bestScores: {}, bestRanks: {}, bestEarnings: {}, sound: true };
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
      "campaignBadge", "campaignTotal", "campaignTarget", "campaignSummary"]
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
    els.resetProgressButton.addEventListener("click", function () {
      openModal({
        kicker: "RESET RECORD",
        title: "研修記録を消しますか？",
        body: "<p>クリア状況、最高得点、安全売上がすべて初期化されます。</p>",
        actions: [
          { label: "やめる" },
          { label: "リセット", primary: true, action: function () {
            const sound = progress.sound;
            progress = fallbackProgress();
            progress.sound = sound;
            saveProgress();
            renderStageGrid();
          } }
        ]
      });
    });
    renderStageGrid();
  }

  function updateSoundButton() {
    els.soundButton.textContent = Sfx.isEnabled() ? "音 ON" : "音 OFF";
    els.soundButton.setAttribute("aria-pressed", String(Sfx.isEnabled()));
  }

  function renderStageGrid() {
    if (!els.stageGrid) return;
    updateCampaign();
    els.stageGrid.innerHTML = "";
    StageData.stages.forEach(function (stage) {
      const unlocked = stage.id <= progress.unlocked;
      const best = progress.bestEarnings[stage.id];
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
        "<span class=\"stage-status\">" + (best != null ? "BEST " + Scoring.yen(best) : (unlocked ? "未挑戦" : "LOCKED")) + "</span>";
      if (unlocked) {
        card.addEventListener("click", function () {
          Sfx.play("button");
          hideStart();
          if (window.game) window.game.startStage(stage.id);
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

  function dialogue(text, speaker) {
    const boss = speaker === "boss";
    els.speakerAvatar.textContent = boss ? "責" : "叉";
    els.speakerAvatar.style.background = boss ? "#ffbd59" : "#ff6b4a";
    els.speakerName.textContent = boss ? "現場責任者" : "積載ナビ";
    els.dialogueText.textContent = text;
    els.dialoguePanel.classList.remove("is-hidden");
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
      ["1", "倉庫画面：荷の手前で停止し、黄色い昇降ハンドルで爪先をパレット差込口の中央へ合わせる。"],
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
    rules.push(["点", "積み込み後は必ず発車前点検。積み直したら再点検する。"]);
    openModal({
      kicker: "LOADING MANUAL / MISSION 0" + stage.id,
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
    if (report.grossRevenue - report.materialCost < stage.targetRevenue) checks.push("<li class=\"warn\">△ 予定運賃が目標まで " + Scoring.yen(stage.targetRevenue - (report.grossRevenue - report.materialCost)) + " 不足</li>");
    report.warnings.forEach(function (warning) { checks.push("<li class=\"warn\">△ " + warning + "</li>"); });
    report.blockingIssues.forEach(function (issue) { checks.push("<li class=\"danger\">是正：" + issue + "</li>"); });
    const safe = report.blockingIssues.length === 0;
    openModal({
      kicker: "PRE-DEPARTURE INSPECTION",
      title: safe ? (report.forkDamagePackages.length ? "積付けOK・事故損失あり" : "発車準備OK") : "積み直しが必要です",
      body:
        "<ul class=\"inspection-list\">" + checks.join("") + "</ul>" +
        "<div class=\"revenue-panel\">予定運賃 <strong>" + Scoring.yen(report.grossRevenue - report.materialCost) + "</strong><br>" +
        "<small>総運賃 " + Scoring.yen(report.grossRevenue) + " − 資材費 " + Scoring.yen(report.materialCost) + " / 目標 " + Scoring.yen(stage.targetRevenue) + "</small></div>" +
        "<p>" + (safe ? (report.forkDamagePackages.length ? "積付け自体は出発可能ですが、破損品の代替費用と減点は配送結果へ残ります。" : "点検済みです。積み方を変えなければ出発できます。") : "赤い項目を直し、もう一度点検してください。") + "</p>",
      actions: [{ label: safe ? "点検完了" : "積み込みへ戻る", primary: safe }]
    });
  }

  function recordResult(stageId, result) {
    if (progress.bestScores[stageId] == null || result.score > progress.bestScores[stageId]) {
      progress.bestScores[stageId] = result.score;
      progress.bestRanks[stageId] = result.rank.key;
    }
    if (result.passed) {
      if (progress.completed.indexOf(stageId) < 0) progress.completed.push(stageId);
      progress.unlocked = Math.max(progress.unlocked, Math.min(StageData.stages.length, stageId + 1));
      progress.bestEarnings[stageId] = Math.max(progress.bestEarnings[stageId] || 0, result.netRevenue);
    }
    saveProgress();
    updateCampaign();
  }

  function showResult(stage, result, handlers) {
    recordResult(stage.id, result);
    const materialDetail = "コンパネ" + result.usage.panel + "・発泡材" + result.usage.foam + "・ベルト" + result.usage.strap;
    const rows = [
      ["積載", result.placed.length + " / " + (result.placed.length + result.unplaced) + "個"],
      ["荷役事故", result.forkDamagePackages.length + "件"],
      ["重量", result.payloadKg + " / " + result.maxPayloadKg + "kg"],
      ["総運賃", Scoring.yen(result.grossRevenue)],
      ["資材費（" + materialDetail + "）", "−" + Scoring.yen(result.materialCost)],
      ["破損・荷つぶれ損失", "−" + Scoring.yen(result.damageLoss)],
      ["遅延損失", "−" + Scoring.yen(result.timePenalty)]
    ].map(function (row, index) {
      const negative = (index === 1 && row[1] !== "0件") || (index >= 4 && row[1] !== "−¥0");
      return "<div class=\"score-row\"><span>" + row[0] + "</span><strong" + (negative ? " class=\"score-negative\"" : "") + ">" + row[1] + "</strong></div>";
    }).join("");
    const notes = "<ul class=\"penalty-list\">" + result.penalties.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul>";
    const actions = [
      { label: "ステージ選択", action: handlers.stages },
      { label: "もう一度", action: handlers.retry }
    ];
    if (result.passed && stage.id < StageData.stages.length) actions.push({ label: "次の研修へ", primary: true, action: handlers.next });
    openModal({
      kicker: "DELIVERY REPORT / MISSION 0" + stage.id,
      title: result.passed ? "研修クリア" : "目標未達・再点検",
      body:
        "<div class=\"score-hero\"><span class=\"score-rank\">" + result.rank.key + "</span><span><b class=\"score-points\">" + result.score + "</b><br><small class=\"score-label\">SAFETY SCORE / 100</small></span></div>" +
        "<p class=\"" + (result.passed ? "result-pass" : "result-fail") + "\">" +
        (result.passed ? "✓ 安全売上 " + Scoring.yen(result.netRevenue) : "✕ 安全売上 " + Scoring.yen(result.netRevenue) + " / 目標 " + Scoring.yen(stage.targetRevenue)) + "</p>" +
        "<div class=\"score-list\">" + rows + "</div>" + notes,
      actions,
      onClose: handlers.stages
    });
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
    getProgress: function () { return progress; },
    getCampaignEarnings: campaignEarnings
  };
})();
