(function () {
  const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && iso(new Date(value + "T12:00:00")) === value;
  const state = () => appState.orderDateFilter ||= { period: "all", from: "", to: "" };
  const baseFilter = filterOrders;
  filterOrders = function ordersFilteredByDate() {
    const rows = baseFilter();
    const filter = state();
    if (filter.period === "all") return rows;
    let from = filter.from, to = filter.to;
    if (filter.period === "7" || filter.period === "30") {
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
      start.setDate(start.getDate() - Number(filter.period) + 1);
      from = iso(start); to = iso(end);
    }
    if ((from && !valid(from)) || (to && !valid(to)) || (from && to && from > to)) return [];
    if (!from && !to) return rows;
    return rows.filter((order) => {
      const date = String(order.orderDate || order.order_date || "").slice(0, 10);
      return valid(date) && (!from || date >= from) && (!to || date <= to);
    });
  };
  const baseRender = renderOrders;
  renderOrders = function renderOrdersWithDateFilter() {
    const filter = state();
    const choices = [["all", "Tutti i periodi"], ["7", "Ultimi 7 giorni"], ["30", "Ultimi 30 giorni"], ["custom", "Scegli date"]];
    const control = `<div class="filter-chip" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><label>Data ordine <select data-order-date-filter="period" aria-label="Periodo data ordine">${choices.map(([value, label]) => `<option value="${value}" ${filter.period === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>${filter.period === "custom" ? `<label>Dal <input type="date" data-order-date-filter="from" value="${esc(filter.from)}" aria-label="Data ordine dal"></label><label>Al <input type="date" data-order-date-filter="to" value="${esc(filter.to)}" aria-label="Data ordine al"></label>${filter.from && filter.to && filter.from > filter.to ? '<span role="alert">La data finale precede quella iniziale.</span>' : ""}` : ""}</div>`;
    return baseRender().replace('<div class="filter-chip">Periodo: ultimi 30 giorni</div>', control);
  };
  document.addEventListener("change", (event) => {
    const field = event.target?.dataset?.orderDateFilter;
    if (!["period", "from", "to"].includes(field)) return;
    state()[field] = event.target.value;
    renderApp();
  });
})();
