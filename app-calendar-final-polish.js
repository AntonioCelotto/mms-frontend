(function () {
  function calendarPolishText(value) {
    return String(value ?? "").trim();
  }

  function calendarPolishEscape(value) {
    return calendarPolishText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function calendarPolishEnsureFilters() {
    if (!appState.calendarFilters || typeof appState.calendarFilters !== "object") {
      appState.calendarFilters = {};
    }
    if (!appState.calendarFilters.employee) appState.calendarFilters.employee = "all";
    if (!appState.calendarFilters.phase) appState.calendarFilters.phase = "all";
    if (!("orderQuery" in appState.calendarFilters)) appState.calendarFilters.orderQuery = "";
  }

  function calendarPolishStatusClass(status) {
    const normalized = calendarPolishText(status).toLowerCase();
    if (normalized.includes("complet") || normalized.includes("stop")) return "done";
    if (normalized.includes("pausa") || normalized.includes("stand")) return "hold";
    return "progress";
  }

  function calendarPolishDuration(session) {
    if (!session || typeof calendarWorklogRuntime !== "function" || typeof calendarWorklogFormatDuration !== "function") return "";
    return calendarWorklogFormatDuration(calendarWorklogRuntime(session));
  }

  function calendarPolishTaskId(card) {
    const button = card.querySelector("[data-weekly-worklog-task]");
    return calendarPolishText(button?.dataset.weeklyWorklogTask);
  }

  function calendarPolishInjectCardStatus() {
    if (appState.currentView !== "calendar") return;
    document.querySelectorAll(".calendar-event").forEach((card) => {
      const actions = card.querySelector(".calendar-event-actions");
      if (!actions) return;
      const taskId = calendarPolishTaskId(card);
      if (!taskId) {
        actions.querySelectorAll("[data-weekly-worklog-action]").forEach((button) => {
          button.disabled = true;
          button.title = "Task non ancora disponibile";
        });
        return;
      }
      const session = typeof calendarWorklogSessionFor === "function" ? calendarWorklogSessionFor(taskId) : null;
      const status = session?.status || "Da avviare";
      const worked = calendarPolishDuration(session);
      let badge = card.querySelector(".calendar-event-status");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "calendar-event-status";
        actions.insertAdjacentElement("beforebegin", badge);
      }
      badge.className = `calendar-event-status ${calendarPolishStatusClass(status)}`;
      badge.innerHTML = `${calendarPolishEscape(status)}${worked ? ` · ${calendarPolishEscape(worked)}` : ""}`;
    });
  }

  function calendarPolishEnsureStyles() {
    if (document.getElementById("calendar-final-polish-styles")) return;
    const style = document.createElement("style");
    style.id = "calendar-final-polish-styles";
    style.textContent = `
      .calendar-weekly-surface .surface-inner{overflow:hidden}
      .calendar-week-board{scrollbar-width:thin}
      .calendar-week-day{min-width:165px}
      .calendar-event-status{display:inline-flex!important;width:max-content;max-width:100%;align-items:center;border-radius:999px;padding:4px 7px;font-size:10px;line-height:1.1;border:1px solid var(--line);background:rgba(255,255,255,.72);color:var(--muted)}
      .calendar-event-status.progress{color:#2563eb;background:rgba(37,99,235,.08)}
      .calendar-event-status.hold{color:#b45309;background:rgba(180,83,9,.10)}
      .calendar-event-status.done{color:#047857;background:rgba(4,120,87,.10)}
      .calendar-event-actions .mini-btn:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:1280px){.calendar-week-board{grid-template-columns:repeat(7,180px)!important}.calendar-week-day{min-height:320px}}
      @media(max-width:760px){.calendar-week-board{grid-template-columns:repeat(7,170px)!important}.calendar-event-actions .mini-btn{padding:6px 7px}}
    `;
    document.head.appendChild(style);
  }

  function calendarPolishRenderSoon() {
    window.setTimeout(() => {
      if (appState.currentView === "calendar" && document.getElementById("app")?.innerHTML) renderApp();
    }, 0);
  }

  const baseRenderAppCalendarPolish = renderApp;
  renderApp = function renderAppCalendarFinalPolish() {
    calendarPolishEnsureFilters();
    calendarPolishEnsureStyles();
    baseRenderAppCalendarPolish();
    calendarPolishInjectCardStatus();
  };

  document.addEventListener(
    "click",
    (event) => {
      if (appState.currentView !== "calendar") return;
      const button = event.target.closest?.("[data-weekly-worklog-action], [data-worklog-action]");
      if (!button || button.disabled) return;
      calendarPolishRenderSoon();
    },
    true
  );

  document.addEventListener("change", (event) => {
    const filter = event.target.closest?.("[data-calendar-filter]");
    if (!filter) return;
    calendarPolishEnsureFilters();
    appState.calendarFilters[filter.dataset.calendarFilter] = filter.value;
  });

  if (document.getElementById("app")?.innerHTML) renderApp();
})();