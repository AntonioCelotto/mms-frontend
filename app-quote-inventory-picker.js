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
      material_origin: origin,
      supplier_name: raw.supplier_name || "",
      supplier_material_code: raw.supplier_material_code || "",
      mms_code: raw.mms_code || "",
      unit: raw.unit || "",
      available_quantity: raw.available_quantity ?? raw.available ?? "",
      status: raw.status || "Disponibile",
    };
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

  function itemLabel(item) {
    const code = item.sku || item.mms_code || item.supplier_material_code;
    const supplier = item.supplier_name ? ` - ${item.supplier_name}` : "";
    return `${item.name || "Materiale"}${code ? ` (${code})` : ""}${supplier}`;
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
    const emptyOption = items.length ? "Seleziona dal magazzino" : "Nessun materiale in magazzino";
    return article.materials
      .map((material, materialIndex) => {
        const selected = selectedItemForMaterial(material);
        return `
          <tr>
            <td>
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
              <div class="muted" style="margin-top:6px;">
                ${
                  selected
                    ? `${html(selected.material_origin === "fornitore" ? "Fornitore" : "MMS")}${selected.available_quantity !== "" ? ` - disp. ${html(selected.available_quantity)} ${html(selected.unit)}` : ""}`
                    : "Puoi scegliere un materiale salvato o scriverlo manualmente."
                }
              </div>
            </td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="material" value="${html(material.material)}" placeholder="es. stoffa, bottoni, filo" /></td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="quantity" value="${html(material.quantity)}" placeholder="q.ta" /></td>
            <td><input class="field-value" data-quote-material="${articleIndex}" data-quote-material-index="${materialIndex}" data-quote-material-field="price" value="${html(material.price)}" placeholder="prezzo" /></td>
            <td>${quoteMoney(quoteMaterialTotal(material))}</td>
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
    material.material = item.name;
    material.inventory_item_id = item.id || "";
    material.inventory_sku = item.sku || "";
    material.sku = item.sku || "";
    material.source_type = item.material_origin === "fornitore" ? "mms" : item.material_origin;
    material.supplier_name = item.supplier_name || "";
    material.supplier_material_code = item.supplier_material_code || "";
    material.mms_code = item.mms_code || "";
    material.unit = item.unit || "";
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
      return markup.replace(
        "<th>Materiale / prodotto</th>",
        "<th>Magazzino</th><th>Materiale / prodotto</th>"
      );
    };
  }

  const baseAttachQuoteEventsInventory = typeof attachQuoteEvents === "function" ? attachQuoteEvents : null;
  if (baseAttachQuoteEventsInventory) {
    attachQuoteEvents = function attachQuoteEventsWithInventory() {
      baseAttachQuoteEventsInventory();
      document.querySelectorAll("[data-quote-inventory-pick]").forEach((select) => {
        select.addEventListener("change", (event) => {
          applyInventoryToQuoteMaterial(
            Number(event.target.dataset.quoteInventoryPick),
            Number(event.target.dataset.quoteMaterialIndex),
            event.target.value
          );
        });
      });
    };
  }

  const baseRenderAppQuoteInventory = renderApp;
  renderApp = function renderAppQuoteInventory() {
    baseRenderAppQuoteInventory();
    if (appState.currentView === "new-order") {
      loadQuoteInventory({ rerender: true });
    }
  };

  loadQuoteInventory();
  if (document.getElementById("app")?.innerHTML) renderApp();
})();
