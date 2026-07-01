function calendarTaskActionsCleanupStyles() {
  if (document.getElementById("calendar-task-actions-cleanup-styles")) return;
  const style = document.createElement("style");
  style.id = "calendar-task-actions-cleanup-styles";
  style.textContent = `
    section.view.active button[data-calendar-task-finish],
    section.view.active .calendar-task-finish {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function calendarTaskActionsCleanupDom() {
  if (appState.currentView !== "calendar") return;
  const section = document.querySelector("section.view.active");
  if (!section) return;

  section.querySelectorAll("button").forEach((button) => {
    const label = button.textContent.trim().toLowerCase();
    if (label === "segna finito" || label === "finito") button.remove();
  });

  section.querySelectorAll("td, span, div").forEach((node) => {
    if (node.childElementCount === 0 && node.textContent.trim().toLowerCase() === "undefined") {
      node.textContent = "Da pianificare";
    }
  });
}

const baseRenderAppCalendarTaskActionsCleanup = renderApp;
renderApp = function renderAppCalendarTaskActionsCleanup() {
  calendarTaskActionsCleanupStyles();
  baseRenderAppCalendarTaskActionsCleanup();
  calendarTaskActionsCleanupDom();
};

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("button");
    if (!button) return;
    const label = button.textContent.trim().toLowerCase();
    if (appState.currentView === "calendar" && (label === "segna finito" || label === "finito")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      button.remove();
    }
  },
  true
);

if (document.getElementById("app")?.innerHTML) renderApp();
