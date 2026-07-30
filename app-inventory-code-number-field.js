(function () {
  const PREFIXES = ["TEX", "HRD", "PCK", "PM", "RIC", "STM", "CRT", "SRT", "STK", "CNZ", "TRT"];

  function text(value) {
    return String(value ?? "").trim();
  }

  function padNumber(value) {
    const digits = text(value).replace(/\D/g, "");
    const parsed = Number.parseInt(digits || "0", 10);
    return String(Number.isFinite(parsed) && parsed > 0 ? parsed : 1).padStart(3, "0");
  }

  function codeParts(value) {
    const match = text(value).toUpperCase().match(/^MMS-([A-Z0-9]+)-(\d+)$/);
    if (!match) return null;
    return { prefix: match[1], number: padNumber(match[2]) };
  }

  function normalizeItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    return { mms_code: raw.mms_code || "", sku: raw.sku || "" };
  }

  function draft() {
    return appState.inventoryDraft || {};
  }

  function isSupplierDraft() {
    return text(draft().material_origin).toLowerCase() === "fornitore";
  }

  function selectedPrefix() {
    const currentDraft = draft();
    const parts = codeParts(currentDraft.mms_code);
    const prefix = text(currentDraft.mms_code_prefix || parts?.prefix || "TEX").toUpperCase();
    return PREFIXES.includes(prefix) ? prefix : "TEX";
  }

  function nextNumber(prefix) {
    const normalizedPrefix = PREFIXES.includes(text(prefix).toUpperCase()) ? text(prefix).toUpperCase() : "TEX";
    const highest = (appData.inventory || [])
      .map(normalizeItem)
      .map((item) => codeParts(item.mms_code || item.sku))
      .filter((parts) => parts?.prefix === normalizedPrefix)
      .reduce((max, parts) => Math.max(max, Number.parseInt(parts.number, 10) || 0), 0);
    return padNumber(highest + 1);
  }

  function composeCode(prefix, number) {
    return `MMS-${prefix}-${padNumber(number)}`;
  }

  function draftNumber() {
    const currentDraft = draft();
    const explicit = text(currentDraft.mms_code_number);
    if (explicit) return padNumber(explicit);
    const parts = codeParts(currentDraft.mms_code);
    return parts?.number || nextNumber(selectedPrefix());
  }

  function clearSupplierMmsCode() {
    if (!appState.inventoryDraft) return;
    appState.inventoryDraft.mms_code = "";
    appState.inventoryDraft.mms_code_number = "";
    appState.inventoryDraft.sku = "";
  }

  function setDraftCode(prefix, number) {
    if (isSupplierDraft()) return;
    if (!appState.inventoryDraft) appState.inventoryDraft = {};
    const normalizedPrefix = PREFIXES.includes(text(prefix).toUpperCase()) ? text(prefix).toUpperCase() : "TEX";
    appState.inventoryDraft.mms_code_prefix = normalizedPrefix;
    appState.inventoryDraft.mms_code_number = padNumber(number);
    appState.inventoryDraft.mms_code = composeCode(normalizedPrefix, appState.inventoryDraft.mms_code_number);
    appState.inventoryDraft.sku = appState.inventoryDraft.mms_code;
  }

  function shouldResetEmptyCreateDraft() {
    const currentDraft = draft();
    if (appState.currentView !== "inventory") return false;
    if (isSupplierDraft()) return false;
    if (appState.inventorySaveMode === "edit" && text(currentDraft.id)) return false;
    if ((appData.inventory || []).length > 0) return false;
    return !text(currentDraft.name) && !text(currentDraft.category) && !text(currentDraft.supplier_name) && !text(currentDraft.supplier_material_code);
  }

  function resetEmptyCreateDraftNumber() {
    if (!shouldResetEmptyCreateDraft()) return;
    const prefix = selectedPrefix();
    appState.inventorySaveMode = "create";
    setDraftCode(prefix, nextNumber(prefix));
  }

  function relabelPrefixOptions(select) {
    Array.from(select.options || []).forEach((option) => {
      const prefix = text(option.value).toUpperCase();
      if (PREFIXES.includes(prefix)) option.textContent = `MMS-${prefix}`;
    });
  }

  function codeInput() {
    return document.querySelector('[data-inventory-ma-code-number], [data-inventory-ma-draft="mms_code"]');
  }

  function restoreSupplierCodeField(select, input) {
    clearSupplierMmsCode();
    if (select) select.disabled = true;
    if (!input) return;
    input.dataset.inventoryMaDraft = "mms_code";
    delete input.dataset.inventoryMaCodeNumber;
    delete input.dataset.inventoryCodeNumberReady;
    input.value = "";
    input.placeholder = "Non necessario per fornitore";
    input.inputMode = "text";
    input.removeAttribute("pattern");
    input.style.textAlign = "left";
    input.style.fontWeight = "400";
  }

  function enhanceCodeField() {
    if (appState.currentView !== "inventory") return;
    const select = document.querySelector("[data-inventory-ma-code-prefix]");
    const input = codeInput();
    if (!select || !input) return;

    if (isSupplierDraft()) {
      restoreSupplierCodeField(select, input);
      return;
    }

    select.disabled = false;
    relabelPrefixOptions(select);
    resetEmptyCreateDraftNumber();
    const prefix = selectedPrefix();
    const number = draftNumber();
    setDraftCode(prefix, number);
    select.value = prefix;

    input.dataset.inventoryMaCodeNumber = "1";
    input.dataset.inventoryCodeNumberReady = "1";
    input.removeAttribute("data-inventory-ma-draft");
    if (document.activeElement !== input) input.value = appState.inventoryDraft.mms_code_number;
    input.placeholder = "001";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.style.textAlign = "center";
    input.style.fontWeight = "700";

    const wrapper = input.parentElement;
    const oldLabel = wrapper?.querySelector("[data-inventory-code-prefix-label]");
    if (oldLabel) oldLabel.remove();
    if (wrapper) wrapper.style.gridTemplateColumns = "minmax(150px,.9fr) minmax(90px,.45fr)";
  }

  function handlePrefixChange(select) {
    if (isSupplierDraft()) return;
    const prefix = text(select.value).toUpperCase();
    setDraftCode(prefix, nextNumber(prefix));
    renderApp();
  }

  function handleNumberInput(input, shouldRender = false) {
    if (isSupplierDraft()) return;
    setDraftCode(selectedPrefix(), input.value);
    input.value = appState.inventoryDraft.mms_code_number;
    if (shouldRender) renderApp();
  }

  document.addEventListener(
    "change",
    (event) => {
      const select = event.target.closest?.("[data-inventory-ma-code-prefix]");
      if (!select) return;
      if (isSupplierDraft()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handlePrefixChange(select);
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      const input = event.target.closest?.("[data-inventory-ma-code-number]");
      if (!input) return;
      if (isSupplierDraft()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handleNumberInput(input, false);
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      const input = event.target.closest?.("[data-inventory-ma-code-number]");
      if (!input) return;
      if (isSupplierDraft()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handleNumberInput(input, true);
    },
    true
  );

  function wrapRender() {
    if (typeof renderApp !== "function" || renderApp.__mmsInventoryCodeNumberFieldV4) return;
    const baseRenderApp = renderApp;
    renderApp = function renderAppInventoryCodeNumberField() {
      baseRenderApp();
      enhanceCodeField();
    };
    renderApp.__mmsInventoryCodeNumberFieldV4 = true;
  }

  wrapRender();
  window.setTimeout(wrapRender, 300);
  window.setTimeout(enhanceCodeField, 300);
  window.setTimeout(enhanceCodeField, 1200);
})();
