(function () {
  let selectInteractionUntil = 0;
  let renderQueued = false;

  function markSelectInteraction(duration = 900) {
    selectInteractionUntil = Date.now() + duration;
  }

  function isSelectInteractionActive() {
    const active = document.activeElement;
    return Date.now() < selectInteractionUntil || active instanceof HTMLSelectElement;
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof HTMLSelectElement || event.target?.closest?.("select")) {
        markSelectInteraction(1400);
      }
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLSelectElement) {
        markSelectInteraction(1400);
      }
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      if (event.target instanceof HTMLSelectElement) {
        markSelectInteraction(180);
      }
    },
    true
  );

  if (typeof renderApp === "function") {
    const baseRenderApp = renderApp;
    renderApp = function renderAppSelectStabilityGuard() {
      if (isSelectInteractionActive()) {
        if (!renderQueued) {
          renderQueued = true;
          window.setTimeout(() => {
            renderQueued = false;
            if (!isSelectInteractionActive()) baseRenderApp();
          }, 220);
        }
        return;
      }
      baseRenderApp();
    };
  }
})();