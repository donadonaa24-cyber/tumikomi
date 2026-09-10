(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", function () {
    UI.init();
    const canvas = document.getElementById("gameCanvas");
    const game = new Game(canvas);
    window.game = game;
    GameInput.init(game, canvas);
    const navPanel = document.getElementById("dialoguePanel");
    const navDock = document.getElementById("mobileNavDock");
    function dockNav() {
      if (document.body.classList.contains("mobile-game")) navDock.appendChild(navPanel);
      else document.getElementById("canvasWrap").appendChild(navPanel);
    }
    dockNav();
    window.addEventListener("resize", dockNav);
    // Keep the logical canvas at 1280x720; fit its whole 16:9 image, never crop it.
    const frame = document.querySelector(".game-frame");
    const wrap = document.getElementById("canvasWrap");
    function fitGameScreen() {
      if (!frame || !frame.clientWidth) return;
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const controlsHeight = Math.max(0, frame.offsetHeight - wrap.offsetHeight);
      const header = document.querySelector(".site-header");
      const availableHeight = Math.max(90, viewportHeight - controlsHeight - (header ? header.offsetHeight : 55) - 45);
      const width = Math.floor(Math.min(1280, frame.clientWidth, availableHeight * 16 / 9));
      wrap.style.width = width + "px";
      wrap.style.height = (width * 9 / 16) + "px";
    }
    window.addEventListener("resize", fitGameScreen);
    document.addEventListener("fullscreenchange", fitGameScreen);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", fitGameScreen);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitGameScreen).observe(frame);
    fitGameScreen();
    const roadKeys = { ArrowUp: "gas", ArrowDown: "brake", ArrowLeft: "left", ArrowRight: "right", " ": "brake" };
    document.querySelectorAll("[data-road]").forEach(function (button) {
      const key = button.getAttribute("data-road");
      button.addEventListener("pointerdown", function (event) {
        event.preventDefault(); button.setPointerCapture(event.pointerId);
        game.roadControl(key, true); button.classList.add("is-pressed");
      });
      function release() { game.roadControl(key, false); button.classList.remove("is-pressed"); }
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => button.addEventListener(type, release));
    });
    window.addEventListener("keydown", function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey || /input|textarea|select/i.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
      if (game.handleControlKey(event.key, true, event.repeat)) { event.preventDefault(); return; }
      if (game.mode === "driving" && roadKeys[event.key]) { event.preventDefault(); game.roadControl(roadKeys[event.key], true); }
    });
    window.addEventListener("keyup", function (event) { game.handleControlKey(event.key, false, false); if (roadKeys[event.key]) game.roadControl(roadKeys[event.key], false); });
    document.getElementById("roadPauseButton").addEventListener("click", function () { game.toggleRoadPause(); });
    function releaseRoad() { if (game.road) { game.road.brake = false; game.road.gas = false; } }
    window.addEventListener("blur", releaseRoad);
    document.addEventListener("visibilitychange", function () { if (document.hidden) releaseRoad(); });

    document.getElementById("rotateButton").addEventListener("click", function () { game.rotateSelected(); });
    document.getElementById("undoButton").addEventListener("click", function () { game.undo(); });
    document.getElementById("restartButton").addEventListener("click", function () { game.restart(); });
    document.getElementById("panelButton").addEventListener("click", function () { game.useMaterial("panel"); });
    document.getElementById("foamButton").addEventListener("click", function () { game.useMaterial("foam"); });
    document.getElementById("strapButton").addEventListener("click", function () { game.useMaterial("strap"); });
    document.getElementById("inspectButton").addEventListener("click", function () { game.inspectLoad(); });
    document.getElementById("departButton").addEventListener("click", function () { game.depart(); });
    [
      ["padDriveBack", "drive", -1],
      ["padDriveForward", "drive", 1],
      ["padForkUp", "lift", -1],
      ["padForkDown", "lift", 1]
    ].forEach(function (control) {
      const button = document.getElementById(control[0]);
      if (!button) return;
      function stop(event) {
        if (event) event.preventDefault();
        button.classList.remove("is-pressed");
        game.setVirtualControl(control[1], control[2], false);
      }
      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        if (button.disabled) return;
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        button.classList.add("is-pressed");
        game.setVirtualControl(control[1], control[2], true);
      });
      button.addEventListener("pointerup", stop);
      button.addEventListener("pointercancel", stop);
      button.addEventListener("lostpointercapture", stop);
      button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    });
    const padPickupAction = document.getElementById("padPickupAction");
    if (padPickupAction) padPickupAction.addEventListener("click", function () { game.activateVirtualPickup(); });
    window.addEventListener("blur", function () { game.stopVirtualPad(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) game.stopVirtualPad();
    });
    document.getElementById("helpButton").addEventListener("click", function () {
      if (game.stage) UI.showHelp(game.stage);
    });
    game.updateControls();
  });
})();
