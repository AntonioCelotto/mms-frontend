(function () {
  function html(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openPaymentsMetric() {
    const metrics = appData?.metrics || {};
    return {
      value: metrics.paymentValue || "0 EUR",
      count: metrics.openPayments || 0,
    };
  }

  function removeDashboardOpenPayments() {
    if (appState.currentView !== "dashboard") return;
    document.querySelectorAll(".kpi-row .kpi").forEach((card) => {
      const label = card.querySelector("small")?.textContent?.trim().toLowerCase();
      if (label === "incassi aperti") card.remove();
    });
  }

  function openPaymentsCardMarkup() {
    const metric = openPaymentsMetric();
    return `<div class="metric-box surface" data-ai-open-payments><small>Incassi aperti</small><strong>${html(metric.value)}</strong><span>${html(metric.count)} ordini con acconto o saldo ancora aperto</span></div>`;
  }

  if (typeof renderAI === "function") {
    const baseRenderAIPayments = renderAI;
    renderAI = function renderAIWithOpenPayments() {
      const markup = baseRenderAIPayments();
      if (markup.includes("data-ai-open-payments")) return markup;
      return markup.replace('<div class="metric-boxes">', `<div class="metric-boxes">${openPaymentsCardMarkup()}`);
    };
  }

  const baseRenderAppDashboardPaymentsAI = renderApp;
  renderApp = function renderAppDashboardPaymentsAI() {
    baseRenderAppDashboardPaymentsAI();
    removeDashboardOpenPayments();
  };

  if (document.getElementById("app")?.innerHTML) removeDashboardOpenPayments();
})();
