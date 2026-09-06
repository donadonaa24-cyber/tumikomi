(function () {
  "use strict";

  const API_PATH = "/api/community-revenue";
  let initialized = false;

  function yen(value) {
    return "¥" + Math.max(0, Number(value) || 0).toLocaleString("ja-JP");
  }

  function elements() {
    return {
      panel: document.querySelector ? document.querySelector(".community-revenue") : null,
      total: document.getElementById("communityRevenueTotal"),
      status: document.getElementById("communityRevenueStatus"),
      deliveries: document.getElementById("communityDeliveryCount")
    };
  }

  function render(snapshot) {
    const els = elements();
    if (els.panel) els.panel.classList.remove("is-offline");
    if (els.total) els.total.textContent = yen(snapshot.totalRevenue);
    if (els.status) {
      els.status.textContent = "全プレイヤー " + (Number(snapshot.deliveries) || 0).toLocaleString("ja-JP") + "便の合計";
    }
    if (els.deliveries) els.deliveries.textContent = (Number(snapshot.deliveries) || 0).toLocaleString("ja-JP");
  }

  function renderOffline() {
    const els = elements();
    if (els.panel) els.panel.classList.add("is-offline");
    if (els.total) els.total.textContent = "集計サーバー未接続";
    if (els.status) els.status.textContent = "接続が戻ると自動で更新します";
    if (els.deliveries) els.deliveries.textContent = "—";
  }

  function request(path, options) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(function () { controller.abort(); }, 4500) : null;
    const settings = Object.assign({ headers: { "Accept": "application/json" } }, options || {});
    if (controller) settings.signal = controller.signal;
    return fetch(path, settings).then(function (response) {
      if (!response.ok) throw new Error("Community revenue API returned " + response.status);
      return response.json();
    }).finally(function () {
      if (timer) window.clearTimeout(timer);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    refresh();
    window.setInterval(function () { if (!document.hidden) refresh(); }, 15000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    window.addEventListener("online", refresh);
  }

  function refresh() {
    return request(API_PATH).then(render).catch(renderOffline);
  }

  function completionId(stageId) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "stage-" + stageId + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
  }

  function submit(revenue, stageId, idempotencyKey) {
    const safeRevenue = Math.max(0, Math.round(Number(revenue) || 0));
    if (!safeRevenue) return Promise.resolve(null);
    return request(API_PATH, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ revenue: safeRevenue, completionId: idempotencyKey || completionId(stageId), stageId: Number(stageId) || 0 })
    }).then(function (snapshot) {
      render(snapshot);
      return snapshot;
    }).catch(function (error) {
      renderOffline();
      return null;
    });
  }

  window.CommunityRevenue = { init: init, submit: submit, formatYen: yen };
})();
