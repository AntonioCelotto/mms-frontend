function renderOrderFromQuoteV2PaymentPanel(draft) {
  const rows = orderFromQuoteV2PaymentRows();
  return `
    <div class="surface">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Stato pagamento</h3>
            <p>Aggiungi acconti multipli o saldo finale senza uscire dal pannello.</p>
          </div>
          <button class="mini-btn" data-order-from-quote-add-payment type="button">+ Pagamento</button>
        </div>
        <div class="alert-list">
          ${rows
            .map(
              (row, index) => `
                <div class="alert-item">
                  <div class="section-title" style="margin-bottom:10px;">
                    <div>
                      <strong>Pagamento ${index + 1}</strong>
                      <span>${orderFromQuoteEscape(row.type || "Acconto")}</span>
                    </div>
                    <button class="mini-btn" data-order-from-quote-remove-payment="${index}" type="button">Rimuovi</button>
                  </div>
                  <div class="form-grid">
                    <div class="field">
                      <label>Tipo</label>
                      <select class="filter-chip" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="type">
                        ${["Acconto", "Saldo"].map((type) => `<option value="${type}" ${row.type === type ? "selected" : ""}>${type}</option>`).join("")}
                      </select>
                    </div>
                    <div class="field">
                      <label>Importo</label>
                      <input class="field-value" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="amount" value="${orderFromQuoteEscape(row.amount)}" placeholder="0,00" />
                    </div>
                    <div class="field">
                      <label>Data</label>
                      <input class="field-value" type="date" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="date" value="${orderFromQuoteEscape(row.date)}" />
                    </div>
                    <div class="field">
                      <label>Nota</label>
                      <input class="field-value" data-order-from-quote-payment-index="${index}" data-order-from-quote-payment-field="note" value="${orderFromQuoteEscape(row.note)}" placeholder="es. bonifico" />
                    </div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

if (document.getElementById("app")?.innerHTML) renderApp();