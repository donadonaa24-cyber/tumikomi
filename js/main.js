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
    document.getElementById("helpButton").addEventListener("click", function () {
      if (game.stage) UI.showHelp(game.stage);
    });
    game.updateControls();
  });
})();
