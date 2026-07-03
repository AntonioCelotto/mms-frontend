const QUOTE_CATEGORY_OPTIONS = ["Sartoria interna", "Sartoria esterna", "Commercio"];
const QUOTE_PRIORITY_OPTIONS = ["Standard", "Express"];

function quoteText(value) {
  return String(value || "").trim();
}

function quoteHtml(value) {
  return quoteText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quoteNumber(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteMoney(value) {
  return quoteNumber(value).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function emptyQuoteMaterial() {
  return { material: "", quantity: "", price: "" };
}

function emptyQuoteArticle() {
  return { name: "", quantity: "1", cost: "", materials: [emptyQuoteMaterial()] };
}

function emptyQuoteClientDraft() {
  return {
    email: "",
    phone: "",
    vat: "",
    pec: "",
    address: "",
    paymentTerms: "",
    note: "",
  };
}

function ensureQuoteClientDraft() {
  if (!appState.quoteClientDraft || typeof appState.quoteClientDraft !== "object") {
    appState.quoteClientDraft = emptyQuoteClientDraft();
  }
  appState.quoteClientDraft = { ...emptyQuoteClientDraft(), ...appState.quoteClientDraft };
  return appState.quoteClientDraft;
}

function quoteClientCandidates() {
  return [
    ...(Array.isArray(appState.realClients) ? appState.realClients : []),
    ...(Array.isArray(appData?.clients) ? appData.clients : []),
  ];
}

function quoteClientName(client) {
  return quoteText(client?.name || client?.client || client?.client_name || client?.company_name || client?.business_name);
}

function quoteClientExists(name) {
  const normalized = quoteText(name).toLowerCase();
  if (!normalized) return false;
  return quoteClientCandidates().some((client) => quoteClientName(client).toLowerCase() === normalized);
}

function renderQuoteOptions(options, selected) {
  return options
    .map((option) => `<option value="${quoteHtml(option)}" ${selected === option ? "selected" : ""}>${quoteHtml(option)}</option>`)
    .join("");
}

function renderQuoteClientProfile(draft) {
  const clientDraft = ensureQuoteClientDraft();
  const clientName = quoteText(draft.client);
  const existing = quoteClientExists(clientName);
  const title = existing ? "Scheda cliente" : "Scheda nuovo cliente";
  const description = existing
    ? "Cliente gia' presente: puoi completare o aggiornare i dati utili al preventivo."
    : "Compila subito i dati del nuovo cliente, cosi' restano salvati nel preventivo.";

  return `
    <div style="height:18px;"></div>
    <div class="section-title">
      <div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <span class="table-status ${existing ? "done" : "progress"}">${existing ? "Gia' in archivio" : "Nuovo cliente"}</span>
    </div>
    <div class="form-grid">
      <div class="field">
        <label>Email</label>
        <input class="field-value" data-quote-client-field="email" value="${quoteHtml(clientDraft.email)}" placeholder="email cliente" />
      </div>
      <div class="field">
        <label>Telefono</label>
        <input class="field-value" data-quote-client-field="phone" value="${quoteHtml(clientDraft.phone)}" placeholder="telefono" />
      </div>
      <div class="field">
        <label>Partita IVA / CF</label>
        <input class="field-value" data-quote-client-field="vat" value="${quoteHtml(clientDraft.vat)}" placeholder="P.IVA o codice fiscale" />
      </div>
      <div class="field">
        <label>PEC / SDI</label>
        <input class="field-value" data-quote-client-field="pec" value="${quoteHtml(clientDraft.pec)}" placeholder="PEC o codice SDI" />
      </div>
      <div class="field span-2">
        <label>Indirizzo / sede</label>
        <input class="field-value" data-quote-client-field="address" value="${quoteHtml(clientDraft.address)}" placeholder="indirizzo cliente" />
      </div>
      <div class="field span-2">
        <label>Condizioni pagamento / note cliente</label>
        <textarea class="field-value" data-quote-client-field="paymentTerms" style="min-height:76px; align-items:flex-start; padding-top:12px;" placeholder="es. acconto, saldo, note amministrative">${quoteHtml(clientDraft.paymentTerms)}</textarea>
      </div>
      <div class="field span-2">
        <label>Note operative cliente</label>
        <textarea class="field-value" data-quote-client-field="note" style="min-height:76px; align-items:flex-start; padding-top:12px;" placeholder="preferenze, riferimenti, note utili">${quoteHtml(clientDraft.note)}</textarea>
      </div>
    </div>
  `;
}

function ensureQuoteState() {
  if (!appState.draftOrder) appState.draftOrder = {};
  if (!QUOTE_CATEGORY_OPTIONS.includes(appState.draftOrder.category)) appState.draftOrder.category = "Sartoria interna";
  if (!QUOTE_PRIORITY_OPTIONS.includes(appState.draftOrder.priority)) appState.draftOrder.priority = "Standard";
  if (!Array.isArray(appState.quoteArticles) || !appState.quoteArticles.length) {
    appState.quoteArticles = [emptyQuoteArticle()];
  }
  appState.quoteArticles.forEach((article) => {
    if (!Array.isArray(article.materials) || !article.materials.length) article.materials = [emptyQuoteMaterial()];
  });
  ensureQuoteClientDraft();
}

function quoteMaterialTotal(material) {
  return quoteNumber(material.quantity) * quoteNumber(material.price);
}

function quoteArticleTotal(article) {
  const base = quoteNumber(article.quantity) * quoteNumber(article.cost);
  const materials = article.materials.reduce((sum, material) => sum + quoteMaterialTotal(material), 0);
  return base + materials;
}

function quoteGrandTotal() {
  ensureQuoteState();
  return appState.quoteArticles.reduce((sum, article) => sum + quoteArticleTotal(article), 0);
}

function renderQuoteMaterialRows(article, articleIndex) {
  return article.materials
    .map(
      (material, materialIndex) => `
        <tr>
          <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="material" value="${quoteHtml(material.material)}" placeholder="es. stoffa, bottoni, filo" /></td>
          <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="quantity" value="${quoteHtml(material.quantity)}" placeholder="q.ta" /></td>
          <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="price" value="${quoteHtml(material.price)}" placeholder="prezzo" /></td>
          <td>${quoteMoney(quoteMaterialTotal(material))}</td>
          <td><button class="mini-btn" data-quote-remove-material="${articleIndex}" data-quote-remove-material-index="${materialIndex}" type="button">Rimuovi</button></td>
        </tr>
      `
    )
    .join("");
}

function renderQuoteArticle(article, articleIndex) {
  return `
    <div class="surface quote-article">
      <div class="surface-inner">
        <div class="section-title">
          <div>
            <h3>Articolo ${articleIndex + 1}</h3>
            <p>Nome articolo, quantita', costo e materiali collegati al magazzino.</p>
          </div>
          <div class="pill-row">
            <div class="ghost-pill">Totale: ${quoteMoney(quoteArticleTotal(article))}</div>
            <button class="mini-btn" data-quote-remove-article="${articleIndex}" type="button">Rimuovi articolo</button>
          </div>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label>Nome articolo</label>
            <input class="field-value" data-quote-article="${articleIndex}" data-quote-article-field="name" value="${quoteHtml(article.name)}" placeholder="es. Giacca, pantalone, camicia" />
          </div>
          <div class="field">
            <label>Quantita'</label>
            <input class="field-value" data-quote-article="${articleIndex}" data-quote-article-field="quantity" value="${quoteHtml(article.quantity)}" />
          </div>
          <div class="field">
            <label>Costo articolo</label>
            <input class="field-value" data-quote-article="${articleIndex}" data-quote-article-field="cost" value="${quoteHtml(article.cost)}" placeholder="0,00" />
          </div>
        </div>
        <div style="height:16px;"></div>
        <div class="section-title">
          <div>
            <h3>Materiali articolo</h3>
            <p>Ogni articolo puo' avere piu' prodotti collegati: stoffa, bottoni, filo, accessori.</p>
          </div>
          <button class="mini-btn" data-quote-add-material="${articleIndex}" type="button">+ Prodotto</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Materiale / prodotto</th>
              <th>Quantita'</th>
              <th>Prezzo</th>
              <th>Totale</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${renderQuoteMaterialRows(article, articleIndex)}</tbody>
        </table>
      </div>
    </div>
  `;
}

renderNewOrder = function renderQuote() {
  ensureQuoteState();
  const draft = appState.draftOrder;
  return `
    <section class="view ${appState.currentView === "new-order" ? "active" : ""}">
      <div class="screen-header">
        <div>
          <h2>Preventivo</h2>
          <p>Crea il preventivo prima dell'ordine operativo. I task verranno gestiti solo dopo accettazione del cliente.</p>
        </div>
        <div class="screen-actions">
          <div class="ghost-pill">Totale: ${quoteMoney(quoteGrandTotal())}</div>
          <button class="mini-btn" data-quote-add-article type="button">+ Articolo</button>
          <button class="action-pill" data-action="save-quote" type="button">${appState.busy ? "Salvataggio..." : "Salva preventivo"}</button>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="steps">
            <div class="step"><small>Step 1</small><strong>Dati preventivo</strong><span>Cliente, categoria, priorita' e data preventivo.</span></div>
            <div class="step"><small>Step 2</small><strong>Scheda cliente</strong><span>Dati anagrafici subito se e' un nuovo cliente.</span></div>
            <div class="step"><small>Step 3</small><strong>Articoli</strong><span>Uno o piu' articoli nello stesso preventivo.</span></div>
            <div class="step"><small>Step 4</small><strong>Materiali</strong><span>Prodotti collegati al magazzino per ogni articolo.</span></div>
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Dati preventivo</h3>
              <p>Solo i dati necessari prima dell'approvazione: niente acconto, reparto, stato ordine, task o magazzino generale.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field span-2">
              <label>Cliente / brand</label>
              <input class="field-value" data-draft="client" value="${quoteHtml(draft.client)}" placeholder="nome cliente o brand" />
            </div>
            <div class="field">
              <label>Categoria</label>
              <select class="filter-chip" data-draft="category">
                ${renderQuoteOptions(QUOTE_CATEGORY_OPTIONS, draft.category)}
              </select>
            </div>
            <div class="field">
              <label>Priorita'</label>
              <select class="filter-chip" data-draft="priority">
                ${renderQuoteOptions(QUOTE_PRIORITY_OPTIONS, draft.priority)}
              </select>
            </div>
            <div class="field">
              <label>Data preventivo</label>
              <input class="field-value" type="date" data-draft="orderDate" value="${quoteHtml(draft.orderDate)}" />
            </div>
            <div class="field span-2">
              <label>Note preventivo</label>
              <textarea class="field-value" data-draft="note" style="min-height:86px; align-items:flex-start; padding-top:12px;">${quoteHtml(draft.note)}</textarea>
            </div>
          </div>
          ${renderQuoteClientProfile(draft)}
        </div>
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Articoli preventivo</h3>
              <p>Usa + Articolo quando nello stesso preventivo ci sono piu' capi o lavorazioni.</p>
            </div>
            <button class="action-pill" data-quote-add-article type="button">+ Articolo</button>
          </div>
        </div>
      </div>

      <div class="quote-articles">
        ${appState.quoteArticles.map(renderQuoteArticle).join("")}
      </div>

      <div class="surface">
        <div class="surface-inner">
          <div class="section-title">
            <div>
              <h3>Azioni preventivo</h3>
              <p>Il preventivo salvato andra' nella sezione Preventivi, dove potra' essere esportato in PDF e inviato via mail al cliente per accettazione.</p>
            </div>
            <div class="pill-row">
              <button class="mini-btn" data-quote-add-article type="button">+ Articolo</button>
              <button class="action-pill" data-action="save-quote" type="button">${appState.busy ? "Salvataggio..." : "Salva preventivo"}</button>
            </div>
          </div>
          <div class="alert-list">
            <div class="alert-item">
              <strong>Task rimossi dal preventivo</strong>
              <span>Cartamodello, taglio e confezione saranno gestiti nella parte Ordine dopo accettazione.</span>
            </div>
            <div class="alert-item">
              <strong>Materiali collegati agli articoli</strong>
              <span>Ogni articolo puo' avere piu' prodotti: stoffa, bottoni, filo o altri materiali di magazzino.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
};

function attachQuoteEvents() {
  document.querySelectorAll("[data-quote-article-field]").forEach((input) => {
    const handler = (event) => {
      const index = Number(event.target.dataset.quoteArticle);
      const field = event.target.dataset.quoteArticleField;
      ensureQuoteState();
      if (!appState.quoteArticles[index]) return;
      appState.quoteArticles[index][field] = event.target.value;
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-quote-material-field]").forEach((input) => {
    const handler = (event) => {
      const articleIndex = Number(event.target.dataset.quoteMaterial);
      const materialIndex = Number(event.target.dataset.quoteMaterialIndex);
      const field = event.target.dataset.quoteMaterialField;
      ensureQuoteState();
      const material = appState.quoteArticles[articleIndex]?.materials?.[materialIndex];
      if (!material) return;
      material[field] = event.target.value;
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-quote-client-field]").forEach((input) => {
    const handler = (event) => {
      ensureQuoteState();
      appState.quoteClientDraft[event.target.dataset.quoteClientField] = event.target.value;
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-draft='client']").forEach((input) => {
    input.addEventListener("change", () => {
      ensureQuoteState();
      renderApp();
    });
  });

  document.querySelectorAll("[data-quote-add-article]").forEach((button) => {
    button.addEventListener("click", () => {
      ensureQuoteState();
      appState.quoteArticles.push(emptyQuoteArticle());
      renderApp();
    });
  });

  document.querySelectorAll("[data-quote-remove-article]").forEach((button) => {
    button.addEventListener("click", () => {
      ensureQuoteState();
      if (appState.quoteArticles.length === 1) {
        appState.quoteArticles = [emptyQuoteArticle()];
      } else {
        appState.quoteArticles.splice(Number(button.dataset.quoteRemoveArticle), 1);
      }
      renderApp();
    });
  });

  document.querySelectorAll("[data-quote-add-material]").forEach((button) => {
    button.addEventListener("click", () => {
      ensureQuoteState();
      appState.quoteArticles[Number(button.dataset.quoteAddMaterial)].materials.push(emptyQuoteMaterial());
      renderApp();
    });
  });

  document.querySelectorAll("[data-quote-remove-material]").forEach((button) => {
    button.addEventListener("click", () => {
      ensureQuoteState();
      const article = appState.quoteArticles[Number(button.dataset.quoteRemoveMaterial)];
      if (!article) return;
      if (article.materials.length === 1) {
        article.materials = [emptyQuoteMaterial()];
      } else {
        article.materials.splice(Number(button.dataset.quoteRemoveMaterialIndex), 1);
      }
      renderApp();
    });
  });

  document.querySelectorAll("[data-action='save-quote']").forEach((button) => {
    button.addEventListener("click", () => {
      ensureQuoteState();
      const client = quoteText(appState.draftOrder.client);
      if (!client) {
        setFlashMessage("Inserisci almeno il cliente prima di salvare il preventivo");
        renderApp();
        return;
      }
      const articleCount = appState.quoteArticles.filter((article) => quoteText(article.name)).length;
      setFlashMessage(`Preventivo salvato: ${articleCount || appState.quoteArticles.length} articoli, totale ${quoteMoney(quoteGrandTotal())}. Prossimo step: PDF e invio mail per accettazione.`);
      renderApp();
    });
  });
}

function renameQuoteEntryPoints() {
  document.querySelectorAll("[data-nav='new-order'] strong").forEach((node) => {
    node.textContent = "Preventivo";
  });
  document.querySelectorAll("[data-nav='new-order'] span").forEach((node) => {
    node.textContent = "PDF e accettazione cliente";
  });
  document.querySelectorAll("[data-open='new-order']").forEach((button) => {
    if (button.textContent.trim() === "Nuovo ordine") button.textContent = "Preventivo";
  });
}

const baseAttachEventsQuoteWorkspace = attachEvents;
attachEvents = function attachEventsQuoteWorkspace() {
  baseAttachEventsQuoteWorkspace();
  attachQuoteEvents();
};

const baseRenderAppQuoteWorkspace = renderApp;
renderApp = function renderAppQuoteWorkspace() {
  baseRenderAppQuoteWorkspace();
  renameQuoteEntryPoints();
};

ensureQuoteState();
if (document.getElementById("app")?.innerHTML) renderApp();