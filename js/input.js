(function () {
  "use strict";

  function init(game, canvas) {
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
      };
    }

    canvas.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      const p = point(event);
      canvas.setPointerCapture(event.pointerId);
      game.pointerDown(p.x, p.y, event.pointerId);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!game.drag) return;
      event.preventDefault();
      const p = point(event);
      game.pointerMove(p.x, p.y, event.pointerId);
    });
    canvas.addEventListener("pointerup", function (event) {
      event.preventDefault();
      const p = point(event);
      game.pointerUp(p.x, p.y, event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointercancel", function (event) {
      const p = point(event);
      game.pointerUp(p.x, p.y, event.pointerId);
    });
    canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });

    window.addEventListener("keydown", function (event) {
      if (/input|textarea/i.test(document.activeElement.tagName)) return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        game.rotateSelected();
      }
      if (event.key.toLowerCase() === "z" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        game.undo();
      }
      if (event.key === "1") game.useMaterial("panel");
      if (event.key === "2") game.useMaterial("foam");
      if (event.key === "3") game.useMaterial("strap");
      if (event.key.toLowerCase() === "i") game.inspectLoad();
    });
  }

  window.GameInput = { init };
})();
