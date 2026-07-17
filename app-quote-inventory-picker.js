(function () {
  const INVENTORY_API = "/api/inventory";
  let quoteInventoryLoaded = false;
  let quoteInventoryLoading = false;

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

  function normalizeInventoryItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    const origin = raw.material_origin || "mms";
    const sku = raw.sku || raw.mms_code || raw.supplier_material_code || "";
    return {
      ...raw,
      id: raw.id || "",
      name: raw.name || raw.product || "",
      sku,
      item_type: raw.item_type === "articolo" ? "articolo" : "materiale",
      material_origin: origin,
      supplier_name: raw.supplier_name || "",
      supplier_material_code: raw.supplier_material_code || "",
      mms_code: raw.mms_code || "",
      unit: raw.unit || "",
      color: raw.color || "",
      description: raw.description || "",
      unit_cost: raw.unit_cost ?? raw.cost ?? "",
      retail_price: raw.retail_price ?? raw.public_price ?? "",
      available_quantity: raw.available_quantity ?? raw.available ?? "",
      reserved_quantity: raw.reserved_quantity ?? raw.reserved ?? "",
      status: raw.status || "Disponibile",
    };
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function freeQuantity(item) {
    return Math.max(0, numberValue(item?.available_quantity ?? item?.available) - numberValue(item?.reserved_quantity ?? item?.reserved));
  }

  function quantityWarning(material, item) {
    if (!item) return "";
    const requested = numberValue(material?.quantity);
    if (!requested) return "";
    const free = freeQuantity(item);
    if (requested <= free) {
      return `<div class="quote-stock-ok">Disponibilita' ok: libero ${html(free)} ${html(item.unit || "")}</div>`;
    }
    const missing = requested - free;
    return `<div class="quote-stock-warning"><strong>Materiale insufficiente</strong>: richiesto ${html(requested)} ${html(
      item.unit || ""
    )}, libero ${html(free)}. Da comprare ${html(missing)} ${html(item.unit || "")}.</div>`;
  }

  function ensureInventoryList() {
    if (!Array.isArray(appData.inventory)) appData.inventory = [];
  }

  async function loadQuoteInventory({ rerender = false } = {}) {
    ensureInventoryList();
    if (quoteInventoryLoading || quoteInventoryLoaded) return;
    quoteInventoryLoading = true;
    try {
      const response = await fetch(INVENTORY_API);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.detail || "Magazzino non disponibile");
      appData.inventory = (payload.items || []).map(normalizeInventoryItem);
      quoteInventoryLoaded = true;
      if (rerender && appState.currentView === "new-order") renderApp();
    } catch (error) {
      console.warn("Magazzino preventivo non caricato", error);
    } finally {
      quoteInventoryLoading = false;
    }
  }

  function inventoryItems() {
    ensureInventoryList();
    return appData.inventory.map(normalizeInventoryItem).filter((item) => item.id || item.name || item.sku);
  }

  function itemCode(item) {
    return item.mms_code || item.sku || item.supplier_material_code || "";
  }

  function itemLabel(item) {
    const type = item.item_type === "articolo" ? "Articolo" : "Materiale";
    const code = itemCode(item);
    const publicPrice = text(item.retail_price) || text(item.unit_cost);
    const cost = publicPrice ? ` - prezzo ${quoteMoney(publicPrice)}` : "";
    return `${type}: ${item.name || "Elemento"}${code ? ` (${code})` : ""}${cost}`;
  }

  function selectValue(item) {
    return String(item.id || item.sku || item.name);
  }

  function selectedItemForMaterial(material) {
    const materialId = text(material.inventory_item_id || material.inventoryItemId);
    const sku = text(material.inventory_sku || material.sku);
    const name = text(material.material || material.product_name || material.name);
    return inventoryItems().find((item) => {
      return (
        (materialId && String(item.id) === materialId) ||
        (sku && item.sku === sku) ||
        (name && item.name.toLowerCase() === name.toLowerCase())
      );
    });
  }

  function quoteInventoryMaterialRows(article, articleIndex) {
    const items = inventoryItems();
    const loadingOption = quoteInventoryLoading ? `<option value="">Caricamento magazzino...</option>` : "";
    const emptyOption = items.length ? "Seleziona materiale/articolo" : "Nessun materiale in magazzino";
    return article.materials
      .map((material, materialIndex) => {
        const source = material.source_type === "cliente" ? "cliente" : "mms";
        const selected = source === "mms" ? selectedItemForMaterial(material) : null;
        const selector =
          source === "mms"
            ? `
              <select class="filter-chip" data-quote-inventory-pick="${articleIndex}" data-quote-material-index="${materialIndex}">
                <option value="">${emptyOption}</option>
                ${loadingOption}
                ${items
                  .map(
                    (item) =>
                      `<option value="${html(selectValue(item))}" ${selected && selectValue(selected) === selectValue(item) ? "selected" : ""}>${html(itemLabel(item))}</option>`
                  )
                  .join("")}
              </select>
            `
            : `<div class="muted">Materiale del cliente: nessun prezzo da magazzino.</div>`;
        const codeValue = material.product_code || material.inventory_sku || material.sku || "";
        const costInput =
          source === "mms"
            ? `<input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="price" value="${html(material.price)}" placeholder="prezzo pubblico" />`
            : `<span class="muted">Nessun prezzo</span>`;
        return `
          <tr>
            <td>
              <select class="filter-chip" data-quote-source-choice="${articleIndex}" data-quote-material-index="${materialIndex}">
                <option value="mms" ${source === "mms" ? "selected" : ""}>MMS</option>
                <option value="cliente" ${source === "cliente" ? "selected" : ""}>Cliente</option>
              </select>
            </td>
            <td>
              ${selector}
              <input class="field-value" style="margin-top:8px;" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="material" value="${html(material.material)}" placeholder="nome materiale/articolo" />
              ${
                selected
                  ? `<div class="muted" style="margin-top:6px;">${html(selected.material_origin === "fornitore" ? "Fornitore" : "MMS")} - disp. ${html(
                      selected.available_quantity || 0
                    )} ${html(selected.unit)} - impegnato ${html(selected.reserved_quantity || 0)} - libero ${html(freeQuantity(selected))}</div>`
                  : ""
              }
              ${quantityWarning(material, selected)}
            </td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="product_code" value="${html(codeValue)}" placeholder="codice" /></td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="quantity" value="${html(material.quantity)}" placeholder="q.ta" /></td>
            <td>${costInput}</td>
            <td>${source === "mms" ? quoteMoney(quoteMaterialTotal(material)) : ""}</td>
            <td><button class="mini-btn" data-quote-remove-material="${articleIndex}" data-quote-remove-material-index="${materialIndex}" type="button">Rimuovi</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function applyInventoryToQuoteMaterial(articleIndex, materialIndex, itemKey) {
    ensureQuoteState();
    const item = inventoryItems().find((candidate) => selectValue(candidate) === itemKey);
    const material = appState.quoteArticles?.[articleIndex]?.materials?.[materialIndex];
    if (!item || !material) return;
    material.source_type = "mms";
    material.material = item.name;
    material.inventory_item_id = item.id || "";
    material.inventoryItemId = item.id || "";
    material.inventory_sku = item.sku || "";
    material.sku = item.sku || "";
    material.product_code = itemCode(item);
    material.warehouse_origin = item.material_origin || "mms";
    material.item_type = item.item_type || "materiale";
    material.supplier_name = item.supplier_name || "";
    material.supplier_material_code = item.supplier_material_code || "";
    material.mms_code = item.mms_code || "";
    material.unit = item.unit || "";
    material.color = item.color || "";
    material.description = item.description || "";
    material.price = text(item.retail_price) || text(item.unit_cost) || "";
    if (!text(material.quantity)) material.quantity = "1";
    renderApp();
  }

  if (typeof renderQuoteMaterialRows === "function") {
    renderQuoteMaterialRows = quoteInventoryMaterialRows;
  }

  if (typeof renderQuoteArticle === "function") {
    const baseRenderQuoteArticleInventory = renderQuoteArticle;
    renderQuoteArticle = function renderQuoteArticleWithInventory(article, articleIndex) {
      const markup = baseRenderQuoteArticleInventory(article, articleIndex);
      return markup
        .replace("<th>Materiale / prodotto</th>", "<th>Origine</th><th>Materiale / articolo</th><th>Codice</th>")
        .replace("<th>Prezzo</th>", "<th>Prezzo pubblico</th>");
    };
  }

  const baseAttachQuoteEventsInventory = typeof attachQuoteEvents === "function" ? attachQuoteEvents : null;
  if (baseAttachQuoteEventsInventory) {
    attachQuoteEvents = function attachQuoteEventsWithInventory() {
      baseAttachQuoteEventsInventory();
      document.querySelectorAll("[data-quote-source-choice]").forEach((select) => {
        select.addEventListener("change", (event) => {
          const material = appState.quoteArticles?.[Number(event.target.dataset.quoteSourceChoice)]?.materials?.[Number(event.target.dataset.quoteMaterialIndex)];
          if (!material) return;
          material.source_type = event.target.value === "cliente" ? "cliente" : "mms";
          if (material.source_type === "cliente") {
            material.inventory_item_id = "";
            material.inventoryItemId = "";
            material.inventory_sku = "";
            material.sku = "";
            material.product_code = "";
            material.price = "";
          }
          renderApp();
        });
      });
      document.querySelectorAll("[data-quote-inventory-pick]").forEach((select) => {
        select.addEventListener("change", (event) => {
          applyInventoryToQuoteMaterial(
            Number(event.target.dataset.quoteInventoryPick),
            Number(event.target.dataset.quoteMaterialIndex),
            event.target.value
          );
        });
      });
      document.querySelectorAll("[data-quote-material-field='quantity'],[data-quote-material-field='price']").forEach((input) => {
        input.addEventListener("change", () => {
          if (appState.currentView === "new-order") renderApp();
        });
      });
    };
  }

  function ensureQuoteInventoryStyles() {
    if (document.getElementById("quote-inventory-stock-styles")) return;
    const style = document.createElement("style");
    style.id = "quote-inventory-stock-styles";
    style.textContent = `
      .quote-stock-warning,.quote-stock-ok{margin-top:7px;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.35}
      .quote-stock-warning{border:1px solid rgba(180,83,9,.32);background:rgba(245,158,11,.13);color:#7c2d12}
      .quote-stock-ok{border:1px solid rgba(15,118,110,.22);background:rgba(20,184,166,.10);color:#115e59}
    `;
    document.head.appendChild(style);
  }

  const baseRenderAppQuoteInventory = renderApp;
  renderApp = function renderAppQuoteInventory() {
    ensureQuoteInventoryStyles();
    baseRenderAppQuoteInventory();
    if (appState.currentView === "new-order") {
      loadQuoteInventory({ rerender: true });
    }
  };

  loadQuoteInventory();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();