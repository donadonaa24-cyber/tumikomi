(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", function () {
    UI.init();
    const canvas = document.getElementById("gameCanvas");
    const game = new Game(canvas);
    window.game = game;
    GameInput.init(game, canvas);

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
