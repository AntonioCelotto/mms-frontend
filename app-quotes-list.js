const QUOTE_LIST_VIEW = "quotes";

function quoteListEnsureState() {
  if (!Array.isArray(appState.savedQuotes)) appState.savedQuotes = [];
  if (!appState.selectedQuoteId && appState.savedQuotes[0]) appState.selectedQuoteId = appState.savedQuotes[0].id;
}

function quoteListClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function quoteListNextId() {
  quoteListEnsureState();
  const numericIds = appState.savedQuotes
    .map((quote) => Number(String(quote.id || "").replace(/\D/g, "")))
    .filter((id) => Number.isFinite(id));
  return `P-${String((Math.max(0, ...numericIds) || 0) + 1).padStart(4, "0")}`;
}

function quoteListStatusClass(status) {
  const normalized = quoteText(status).toLowerCase();
  if (normalized === "accettato" || normalized === "trasformato in ordine") return "done";
  if (normalized === "rifiutato" || normalized === "scaduto") return "hold";
  return "progress";
}

function quoteListSnapshot() {
  ensureQuoteState();
  const client = quoteText(appState.draftOrder.client);
  const articles = quoteListClone(appState.quoteArticles);
  const clientInfo = typeof ensureQuoteClientDraft === "function" ? quoteListClone(ensureQuoteClientDraft()) : quoteListClone(appState.quoteClientDraft || {});
  return {
    id: quoteListNextId(),
    client,
    clientInfo,
    category: appState.draftOrder.category,
    priority: appState.draftOrder.priority,
    quoteDate: appState.draftOrder.orderDate || new Date().toISOString().slice(0, 10),
    note: appState.draftOrder.note || "",
    status: "Bozza",
    articles,
    total: quoteGrandTotal(),
    createdAt: new Date().toISOString(),
  };
}

function quoteListArticleCount(quote) {
  return (quote.articles || []).filter((article) => quoteText(article.name)).length || (quote.articles || []).length;
}

function quoteListMaterialCount(quote) {
  return (quote.articles || []).reduce((sum, article) => sum + (article.materials || []).length, 0);
}

function quoteListClientInfo(quote) {
  return quote?.clientInfo && typeof quote.clientInfo === "object" ? quote.clientInfo : {};
}

function quoteListHasClientInfo(quote) {
  const info = quoteListClientInfo(quote);
  return [info.email, info.phone, info.vat, info.pec, info.address, info.paymentTerms, info.note].some((value) => quoteText(value));
}

function quoteListClientInfoHtml(quote) {
  const info = quoteListClientInfo(quote);
  if (!quoteListHasClientInfo(quote)) return "";
  const rows = [
    ["Email", info.email],
    ["Telefono", info.phone],
    ["P.IVA / CF", info.vat],
    ["PEC / SDI", info.pec],
    ["Indirizzo", info.address],
    ["Pagamento", info.paymentTerms],
    ["Note cliente", info.note],
  ]
    .filter(([, value]) => quoteText(value))
    .map(([label, value]) => `<div class="alert-item"><strong>${quoteHtml(label)}</strong><span>${quoteHtml(value)}</span></div>`)
    .join("");
  return `
    <div style="height:16px;"></div>
    <div class="section-title">
      <div>
        <h3>Scheda cliente preventivo</h3>
        <p>Dati raccolti durante la compilazione del preventivo.</p>
      </div>
    </div>
    <div class="alert-list">${rows}</div>
  `;
}

function quoteListFind(id = appState.selectedQuoteId) {
  quoteListEnsureState();
  return appState.savedQuotes.find((quote) => quote.id === id) || appState.savedQuotes[0] || null;
}

function quoteListEmailText(quote) {
  return [
    `Buongiorno,`,
    ``,
    `in allegato trova il preventivo ${quote.id} per ${quote.client}.`,
    `Totale preventivo: ${quoteMoney(quote.total)}.`,
    ``,
    `Resto a disposizione per conferma o modifiche.`,
    `MMS Studio`,
  ].join("\n");
}

function quoteListPdfHtml(quote) {
  const clientInfo = quoteListClientInfo(quote);
  const clientDetails = quoteListHasClientInfo(quote)
    ? `
      <section style="margin-top:18px; padding:14px; background:#f7f7f7;">
        <strong>Dati cliente</strong><br />
        ${clientInfo.email ? `Email: ${quoteHtml(clientInfo.email)}<br />` : ""}
        ${clientInfo.phone ? `Telefono: ${quoteHtml(clientInfo.phone)}<br />` : ""}
        ${clientInfo.vat ? `P.IVA / CF: ${quoteHtml(clientInfo.vat)}<br />` : ""}
        ${clientInfo.pec ? `PEC / SDI: ${quoteHtml(clientInfo.pec)}<br />` : ""}
        ${clientInfo.address ? `Indirizzo: ${quoteHtml(clientInfo.address)}<br />` : ""}
        ${clientInfo.paymentTerms ? `Pagamento: ${quoteHtml(clientInfo.paymentTerms)}<br />` : ""}
      </section>
    `
    : "";
  const rows = (quote.articles || [])
    .map((article, index) => {
      const materialRows = (article.materials || [])
        .map(
          (material) => `
            <tr>
              <td style="padding:6px 0 6px 18px;">${quoteHtml(material.material || "Materiale")}</td>
              <td style="text-align:right;">${quoteHtml(material.quantity)}</td>
              <td style="text-align:right;">${quoteMoney(material.price)}</td>
              <td style="text-align:right;">${quoteMoney(quoteMaterialTotal(material))}</td>
            </tr>
          `
        )
        .join("");
      return `
        <tr>
          <td style="padding-top:12px;"><strong>${index + 1}. ${quoteHtml(article.name || "Articolo")}</strong></td>
          <td style="text-align:right;">${quoteHtml(article.quantity || "1")}</td>
          <td style="text-align:right;">${quoteMoney(article.cost)}</td>
          <td style="text-align:right;">${quoteMoney(quoteArticleTotal(article))}</td>
        </tr>
        ${materialRows}
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Preventivo ${quoteHtml(quote.id)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1d2320; padding: 40px; }
          header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 18px; margin-bottom: 28px; }
          h1 { margin: 0; font-size: 28px; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th { text-align: left; border-bottom: 1px solid #999; padding: 8px 0; }
          td { border-bottom: 1px solid #ddd; padding: 8px 0; }
          .total { margin-top: 28px; text-align: right; font-size: 22px; font-weight: 700; }
          .note { margin-top: 28px; padding: 16px; background: #f6f3ec; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Stampa / salva PDF</button>
        <header>
          <div>
            <h1>MMS Studio</h1>
            <p>Preventivo ${quoteHtml(quote.id)}</p>
          </div>
          <div>
            <strong>Cliente</strong><br />
            ${quoteHtml(quote.client)}<br />
            Data: ${quoteHtml(quote.quoteDate)}
          </div>
        </header>
        <section>
          <p><strong>Categoria:</strong> ${quoteHtml(quote.category)}<br />
          <strong>Priorita':</strong> ${quoteHtml(quote.priority)}</p>
        </section>
        ${clientDetails}
        <table>
          <thead>
            <tr>
              <th>Voce</th>
              <th style="text-align:right;">Quantita'</th>
              <th style="text-align:right;">Prezzo</th>
              <th style="text-align:right;">Totale</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="total">Totale: ${quoteMoney(quote.total)}</div>
        ${quote.note ? `<div class="note"><strong>Note</strong><br />${quoteHtml(quote.note)}</div>` : ""}
      </body>
    </html>
  `;
}

function quoteListDownloadPdf(quoteId) {
  const quote = quoteListFind(quoteId);
  if (!quote) return;
  const win = window.open("", "_blank");
  if (!win) {
    setFlashMessage("Il browser ha bloccato la finestra PDF. Consenti i popup per scaricare il preventivo.");
    renderApp();
    return;
  }
  win.document.write(quoteListPdfHtml(quote));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function quoteListMailto(quoteId) {
  const quote = quoteListFind(quoteId);
  if (!quote) return;
  const subject = encodeURIComponent(`Preventivo ${quote.id} - MMS Studio`);
  const body = encodeURIComponent(quoteListEmailText(quote));
  const to = encodeURIComponent(quoteListClientInfo(quote).email || "");
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}

function quoteListSaveCurrent() {
  quoteListEnsureState();
  const snapshot = quoteListSnapshot();
  if (!snapshot.client) {
    setFlashMessage("Inserisci almeno il cliente prima di salvare il preventivo");
    renderApp();
    return;
  }
  appState.savedQuotes.unshift(snapshot);
  appState.selectedQuoteId = snapshot.id;
  appState.currentView = QUOTE_LIST_VIEW;
  setFlashMessage(`Preventivo ${snapshot.id} salvato in Preventivi. Puoi creare il PDF, inviarlo via mail o confermarlo.`);
  renderApp();
}

function quoteListSetStatus(quoteId, status) {
  const quote = quoteListFind(quoteId);
  if (!quote) return;
  quote.status = status;
  appState.selectedQuoteId = quote.id;
  setFlashMessage(`Preventivo ${quote.id}: stato aggiornato a ${status}.`);
  renderApp();
}

function quoteListConvertToOrder(quoteId) {
  const quote = quoteListFind(quoteId);
  if (!quote) return;
  quote.status = "Trasformato in ordine";
  const clientInfo = quoteListClientInfo(quote);
  appState.draftOrder = {
    ...(appState.draftOrder || {}),
    client: quote.client,
    category: quote.category,
    priority: quote.priority,
    orderDate: quote.quoteDate,
    note: quote.note,
  };
  appState.clientDraft = {
    ...(appState.clientDraft || {}),
    email: clientInfo.email || appState.clientDraft?.email || "",
    phone: clientInfo.phone || appState.clientDraft?.phone || "",
    paymentRule: clientInfo.paymentTerms || appState.clientDraft?.paymentRule || "",
    note: clientInfo.note || appState.clientDraft?.note || "",
  };
  appState.currentView = "orders";
  setFlashMessage(`Preventivo ${quote.id} confermato. Ora va creato l'ordine operativo con task, calendario e pagamento.`);
  renderApp();
}

function renderQuotes() {
  quoteListEnsureState();
  const quotes = appState.savedQuotes;
  const selected = quoteListFind();
  return `
    <section class="view ${appState.currentView === QUOTE_LIST_VIEW ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Preventivi</h2>
          <p>Archivio commerciale prima dell'ordine: PDF, invio al cliente, accettazione o rifiuto.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">${quotes.length} preventivi salvati</div>
          <button class="action-pill" data-open="new-order" type="button">Nuovo preventivo</button>
        </div>
      </div>

      <div class="layout-2">
        <div class="surface">
          <div class="surface-inner">
            <div class="section-title">
              <div>
                <h3>Elenco preventivi</h3>
                <p>Solo i preventivi accettati vengono trasformati in ordini operativi.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>N.</th>
                  <th>Cliente</th>
                  <th>Categoria</th>
                  <th>Articoli</th>
                  <th>Totale</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                ${
                  quotes.length
                    ? quotes
                        .map(
                          (quote) => `
                            <tr>
                              <td><button class="mini-btn" data-quote-select="${quote.id}" type="button">${quote.id}</button></td>
                              <td>${quoteHtml(quote.client)}</td>
                              <td>${quoteHtml(quote.category)}</td>
                              <td>${quoteListArticleCount(quote)}</td>
                              <td>${quoteMoney(quote.total)}</td>
                              <td><span class="table-status ${quoteListStatusClass(quote.status)}">${quoteHtml(quote.status)}</span></td>
                              <td><button class="mini-btn" data-quote-pdf="${quote.id}" type="button">PDF</button></td>
                            </tr>
                          `
                        )
                        .join("")
                    : `<tr><td colspan="7"><div class="empty-state">Nessun preventivo salvato. Crea un preventivo e salvalo per vederlo qui.</div></td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="surface">
          <div class="surface-inner">
            ${
              selected
                ? `
                  <div class="section-title">
                    <div>
                      <h3>Scheda ${quoteHtml(selected.id)}</h3>
                      <p>${quoteHtml(selected.client)} - ${quoteListArticleCount(selected)} articoli, ${quoteListMaterialCount(selected)} materiali.</p>
                    </div>
                    <span class="table-status ${quoteListStatusClass(selected.status)}">${quoteHtml(selected.status)}</span>
                  </div>
                  <div class="alert-list">
                    <div class="alert-item"><strong>Totale</strong><span>${quoteMoney(selected.total)}</span></div>
                    <div class="alert-item"><strong>Data preventivo</strong><span>${quoteHtml(selected.quoteDate || "Da definire")}</span></div>
                    <div class="alert-item"><strong>Note</strong><span>${quoteHtml(selected.note || "Nessuna nota")}</span></div>
                  </div>
                  ${quoteListClientInfoHtml(selected)}
                  <div style="height:16px;"></div>
                  <div class="pill-row">
                    <button class="mini-btn" data-quote-pdf="${selected.id}" type="button">Scarica PDF</button>
                    <button class="mini-btn" data-quote-email="${selected.id}" type="button">Invia mail</button>
                    <button class="mini-btn" data-quote-status="${selected.id}" data-next-status="Inviato" type="button">Segna inviato</button>
                    <button class="mini-btn" data-quote-status="${selected.id}" data-next-status="Rifiutato" type="button">Rifiutato</button>
                    <button class="action-pill" data-quote-convert="${selected.id}" type="button">Conferma e crea ordine</button>
                  </div>
                `
                : `<div class="empty-state">Seleziona un preventivo per vedere azioni e dettaglio.</div>`
            }
          </div>
        </div>
      </div>
    </section>
  `;
}

const baseRenderLayoutQuotesList = renderLayout;
renderLayout = function renderLayoutQuotesList() {
  let html = baseRenderLayoutQuotesList();
  if (!html.includes('data-nav="quotes"')) {
    const quotesClass = appState.currentView === QUOTE_LIST_VIEW ? "active" : "";
    html = html.replace(
      /<button class="([^"]*)" data-nav="new-order">/,
      `<button class="${quotesClass}" data-nav="quotes"><strong>Preventivi</strong><span>PDF, invio e conferma</span></button><button class="$1" data-nav="new-order">`
    );
  }
  if (!html.includes('data-quotes-list-view="true"')) {
    html = html.replace(
      "\n        </div>\n      </main>",
      `\n          <div data-quotes-list-view="true">${renderQuotes()}</div>\n        </div>\n      </main>`
    );
  }
  return html;
};

function attachQuotesListEvents() {
  document.querySelectorAll("[data-action='save-quote']").forEach((button) => {
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        quoteListSaveCurrent();
      },
      true
    );
  });

  document.querySelectorAll("[data-quote-select]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.selectedQuoteId = button.dataset.quoteSelect;
      renderApp();
    });
  });

  document.querySelectorAll("[data-quote-pdf]").forEach((button) => {
    button.addEventListener("click", () => quoteListDownloadPdf(button.dataset.quotePdf));
  });

  document.querySelectorAll("[data-quote-email]").forEach((button) => {
    button.addEventListener("click", () => quoteListMailto(button.dataset.quoteEmail));
  });

  document.querySelectorAll("[data-quote-status]").forEach((button) => {
    button.addEventListener("click", () => quoteListSetStatus(button.dataset.quoteStatus, button.dataset.nextStatus));
  });

  document.querySelectorAll("[data-quote-convert]").forEach((button) => {
    button.addEventListener("click", () => quoteListConvertToOrder(button.dataset.quoteConvert));
  });
}

const baseAttachEventsQuotesList = attachEvents;
attachEvents = function attachEventsQuotesList() {
  baseAttachEventsQuotesList();
  attachQuotesListEvents();
};

quoteListEnsureState();
if (document.getElementById("app")?.innerHTML) renderApp();