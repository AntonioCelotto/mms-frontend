(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? "0").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmt(value) {
    const parsed = numberValue(value);
    return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.?0+$/, "");
  }

  function trackedItems() {
    return (Array.isArray(appData?.inventory) ? appData.inventory : []).filter((item) => {
      return numberValue(item.reserved_quantity ?? item.reserved) > 0 || numberValue(item.shortage_quantity) > 0;
    });
  }

  function shortageLine(detail, fallbackUnit) {
    const unit = text(detail.unit || fallbackUnit);
    const orderNumber = detail.order_number || detail.order_id || "";
    const qty = fmt(detail.quantity_missing);
    return `Ordine #${escapeHtml(orderNumber)}: da ordinare ${escapeHtml(qty)}${unit ? ` ${escapeHtml(unit)}` : ""}`;
  }

  function renderInventoryCommitmentsSummary() {
    const rows = trackedItems();
    if (!rows.length) return "";

    const body = rows
      .map((item) => {
        const available = numberValue(item.available_quantity ?? item.available);
        const reserved = numberValue(item.reserved_quantity ?? item.reserved);
        const free = Math.max(available - reserved, 0);
        const missing = numberValue(item.shortage_quantity);
        const unit = text(item.unit);
        const details = Array.isArray(item.shortage_details) ? item.shortage_details : [];
        const detailMarkup = missing > 0 && details.length
          ? `<div class="inventory-shortage-details">${details.map((detail) => shortageLine(detail, unit)).join("<br>")}</div>`
          : "";
        return `
          <tr>
            <td><strong>${escapeHtml(item.name || item.product || "Materiale")}</strong><div class="muted">${escapeHtml(item.sku || item.mms_code || "")}</div></td>
            <td>${escapeHtml(fmt(available))}${unit ? ` ${escapeHtml(unit)}` : ""}</td>
            <td>${escapeHtml(fmt(reserved))}${unit ? ` ${escapeHtml(unit)}` : ""}</td>
            <td>${escapeHtml(fmt(free))}${unit ? ` ${escapeHtml(unit)}` : ""}</td>
            <td>${missing > 0 ? `<span class="table-status warning">${escapeHtml(fmt(missing))}${unit ? ` ${escapeHtml(unit)}` : ""}</span>${detailMarkup}` : "-"}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <section class="inventory-shortage-summary surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Impegni e materiali da ordinare</h3>
              <p>Qui vedi quanto materiale e' gia' impegnato dagli ordini e quanto manca da comprare.</p>
            </div>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr><th>Materiale</th><th>Disponibile</th><th>Impegnato</th><th>Libero</th><th>Da ordinare</th></tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function mountInventoryCommitmentsSummary() {
    if (appState.currentView !== "inventory") return;
    const section = document.querySelector("section.view.active");
    if (!section || section.querySelector(".inventory-shortage-summary")) return;
    const target = Array.from(section.querySelectorAll(".section-title h3")).find((heading) =>
      text(heading.textContent).toLowerCase().includes("materiali salvati")
    );
    const markup = renderInventoryCommitmentsSummary();
    if (!markup) return;
    const container = target?.closest(".surface") || section.querySelector(".surface:last-of-type");
    if (container) container.insertAdjacentHTML("beforebegin", markup);
  }

  const style = document.createElement("style");
  style.textContent = `
    .inventory-shortage-summary { margin-top: 18px; }
    .inventory-shortage-summary .table-scroll { overflow-x: auto; }
    .inventory-shortage-summary table { min-width: 760px; }
    .inventory-shortage-summary th,
    .inventory-shortage-summary td { vertical-align: top; }
    .inventory-shortage-details { margin-top: 6px; color: var(--muted, #667085); font-size: 12px; line-height: 1.35; }
  `;
  document.head.appendChild(style);

  const baseRenderAppInventoryShortageSummary = renderApp;
  renderApp = function renderAppInventoryShortageSummary() {
    baseRenderAppInventoryShortageSummary();
    mountInventoryCommitmentsSummary();
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();