(function () {
  function text(value) {
    return String(value ?? "").trim();
  }

  function html(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return numberValue(value).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  }

  function normalizeItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      ...raw,
      id: raw.id || "",
      name: raw.name || raw.product || "",
      sku: raw.sku || raw.mms_code || raw.supplier_material_code || "",
      item_type: raw.item_type === "articolo" ? "articolo" : "materiale",
      unit_cost: raw.unit_cost ?? raw.cost ?? "",
      retail_price: raw.retail_price ?? raw.public_price ?? "",
    };
  }

  function inventoryItems() {
    if (!Array.isArray(appData.inventory)) appData.inventory = [];
    return appData.inventory.map(normalizeItem).filter((item) => item.id || item.name || item.sku);
  }

  function itemCode(item) {
    return item.mms_code || item.supplier_material_code || item.sku || "";
  }

  function itemLabel(item) {
    const type = item.item_type === "articolo" ? "Articolo" : "Materiale";
    const code = itemCode(item);
    return `${type} - ${item.name || "Senza nome"}${code ? ` (${code})` : ""}`;
  }

  function inventoryById(id) {
    return inventoryItems().find((item) => String(item.id) === String(id));
  }

  function inventoryOptions(selectedId) {
    return inventoryItems()
      .map((item) => {
        const selected = String(item.id) === String(selectedId) ? "selected" : "";
        return `<option value="${html(item.id)}" ${selected}>${html(itemLabel(item))}</option>`;
      })
      .join("");
  }

  function applyInventoryItem(articleIndex, materialIndex, itemId) {
    const item = inventoryById(itemId);
    const material = appState.quoteArticles?.[articleIndex]?.materials?.[materialIndex];
    if (!item || !material) return;

    material.material = item.name;
    material.inventory_item_id = item.id;
    material.inventoryItemId = item.id;
    material.inventory_sku = item.sku || itemCode(item);
    material.sku = item.sku || itemCode(item);
    material.product_code = itemCode(item);
    material.item_type = item.item_type;
    material.source_type = "mms";
    material.source = "mms";
    material.unit = item.unit || "";
    material.color = item.color || "";
    material.description = item.description || "";
    material.price = text(item.unit_cost) || text(item.retail_price) || "";
    if (!text(material.quantity)) material.quantity = "1";
    renderApp();
  }

  function renderCostRows(article, articleIndex) {
    return (article.materials || [])
      .map((material, materialIndex) => {
        const source = text(material.source_type || material.source) === "cliente" ? "cliente" : "mms";
        const selectedId = text(material.inventory_item_id || material.inventoryItemId);
        const quantity = numberValue(material.quantity);
        const cost = numberValue(material.price);
        const selector = source === "mms"
          ? `<select class="filter-chip" data-quote-cost-inventory-pick="${articleIndex}" data-quote-material-index="${materialIndex}">
              <option value="">Seleziona da MMS</option>
              ${inventoryOptions(selectedId)}
            </select>`
          : `<span class="muted">Materiale fornito dal cliente</span>`;
        const costInput = source === "mms"
          ? `<input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="price" value="${html(material.price)}" placeholder="costo" />`
          : `<span class="muted">Nessun costo</span>`;

        return `
          <tr>
            <td>
              <select class="filter-chip" data-quote-cost-source="${articleIndex}" data-quote-material-index="${materialIndex}">
                <option value="mms" ${source === "mms" ? "selected" : ""}>MMS</option>
                <option value="cliente" ${source === "cliente" ? "selected" : ""}>Cliente</option>
              </select>
            </td>
            <td>
              ${selector}
              <input class="field-value" style="margin-top:8px;" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="material" value="${html(material.material)}" placeholder="nome materiale/articolo" />
            </td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="product_code" value="${html(material.product_code || material.inventory_sku || material.sku)}" placeholder="codice" /></td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="quantity" value="${html(material.quantity)}" placeholder="q.ta" /></td>
            <td>${costInput}</td>
            <td>${source === "mms" ? money(quantity * cost) : ""}</td>
            <td><button class="mini-btn" data-quote-remove-material="${articleIndex}" data-quote-remove-material-index="${materialIndex}" type="button">Rimuovi</button></td>
          </tr>
        `;
      })
      .join("");
  }

  if (typeof renderQuoteMaterialRows === "function") {
    renderQuoteMaterialRows = renderCostRows;
  }

  if (typeof renderQuoteArticle === "function") {
    const baseRenderQuoteArticle = renderQuoteArticle;
    renderQuoteArticle = function renderQuoteArticleCostHeaders(article, articleIndex) {
      return baseRenderQuoteArticle(article, articleIndex).replace(
        /<thead>\s*<tr>[\s\S]*?<\/tr>\s*<\/thead>/,
        `<thead>
          <tr>
            <th>Origine</th>
            <th>Materiale / articolo</th>
            <th>Codice</th>
            <th>Quantita'</th>
            <th>Costo</th>
            <th>Totale</th>
            <th></th>
          </tr>
        </thead>`
      );
    };
  }

  const baseAttachQuoteEvents = typeof attachQuoteEvents === "function" ? attachQuoteEvents : null;
  if (baseAttachQuoteEvents) {
    attachQuoteEvents = function attachQuoteEventsCostPolish() {
      baseAttachQuoteEvents();
      document.querySelectorAll("[data-quote-cost-source]").forEach((select) => {
        select.onchange = (event) => {
          const material = appState.quoteArticles?.[Number(event.target.dataset.quoteCostSource)]?.materials?.[Number(event.target.dataset.quoteMaterialIndex)];
          if (!material) return;
          material.source_type = event.target.value;
          material.source = event.target.value;
          if (event.target.value === "cliente") {
            material.price = "";
            material.inventory_item_id = "";
            material.inventoryItemId = "";
            material.inventory_sku = "";
          }
          renderApp();
        };
      });
      document.querySelectorAll("[data-quote-cost-inventory-pick]").forEach((select) => {
        select.onchange = (event) => {
          applyInventoryItem(
            Number(event.target.dataset.quoteCostInventoryPick),
            Number(event.target.dataset.quoteMaterialIndex),
            event.target.value
          );
        };
      });
    };
  }
})();