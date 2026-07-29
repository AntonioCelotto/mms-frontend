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
    return {
      mms_code: raw.mms_code || "",
      sku: raw.sku || "",
    };
  }

  function selectedPrefix() {
    const draft = appState.inventoryDraft || {};
    const parts = codeParts(draft.mms_code);
    const prefix = text(draft.mms_code_prefix || parts?.prefix || "TEX").toUpperCase();
    return PREFIXES.includes(prefix) ? prefix : "TEX";
  }

  function nextNumber(prefix) {
    const highest = (appData.inventory || [])
      .map(normalizeItem)
      .map((item) => codeParts(item.mms_code || item.sku))
      .filter((parts) => parts?.prefix === prefix)
      .reduce((max, parts) => Math.max(max, Number.parseInt(parts.number, 10) || 0), 0);
    return padNumber(highest + 1);
  }

  function composeCode(prefix, number) {
    return `MMS-${prefix}-${padNumber(number)}`;
  }

  function draftNumber() {
    const parts = codeParts(appState.inventoryDraft?.mms_code);
    return parts?.number || nextNumber(selectedPrefix());
  }

  function setDraftCode(prefix, number) {
    if (!appState.inventoryDraft) appState.inventoryDraft = {};
    const normalizedPrefix = PREFIXES.includes(text(prefix).toUpperCase()) ? text(prefix).toUpperCase() : "TEX";
    appState.inventoryDraft.mms_code_prefix = normalizedPrefix;
    appState.inventoryDraft.mms_code_number = padNumber(number);
    appState.inventoryDraft.mms_code = composeCode(normalizedPrefix, appState.inventoryDraft.mms_code_number);
    appState.inventoryDraft.sku = appState.inventoryDraft.mms_code;
  }

  function enhanceCodeField() {
    if (appState.currentView !== "inventory") return;
    const select = document.querySelector("[data-inventory-ma-code-prefix]");
    const input = document.querySelector('[data-inventory-ma-draft="mms_code"]');
    if (!select || !input || input.dataset.inventoryCodeNumberReady === "1") return;

    const prefix = selectedPrefix();
    const number = draftNumber();
    setDraftCode(prefix, number);
    select.value = prefix;

    input.dataset.inventoryCodeNumberReady = "1";
    input.dataset.inventoryMaCodeNumber = "1";
    input.removeAttribute("data-inventory-ma-draft");
    input.value = number;
    input.placeholder = "001";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";

    const wrapper = input.parentElement;
    if (wrapper && !wrapper.querySelector("[data-inventory-code-prefix-label]")) {
      select.insertAdjacentHTML("afterend", `<div class="field-value" data-inventory-code-prefix-label style="align-items:center;justify-content:center;background:#f7f7f7;font-weight:700;">MMS-${prefix}</div>`);
      wrapper.style.gridTemplateColumns = "minmax(130px,.9fr) minmax(96px,.65fr) minmax(90px,.45fr)";
    }
    const label = wrapper?.querySelector("[data-inventory-code-prefix-label]");
    if (label) label.textContent = `MMS-${prefix}`;
  }

  function handlePrefixChange(select) {
    const prefix = text(select.value).toUpperCase();
    const number = nextNumber(prefix);
    setDraftCode(prefix, number);
    renderApp();
  }

  function handleNumberInput(input) {
    setDraftCode(selectedPrefix(), input.value);
    input.value = appState.inventoryDraft.mms_code_number;
  }

  document.addEventListener(
    "change",
    (event) => {
      const select = event.target.closest?.("[data-inventory-ma-code-prefix]");
      if (!select) return;
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
      event.preventDefault();
      event.stopImmediatePropagation();
      handleNumberInput(input);
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      const input = event.target.closest?.("[data-inventory-ma-code-number]");
      if (!input) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handleNumberInput(input);
      renderApp();
    },
    true
  );

  function wrapRender() {
    if (typeof renderApp !== "function" || renderApp.__mmsInventoryCodeNumberField) return;
    const baseRenderApp = renderApp;
    renderApp = function renderAppInventoryCodeNumberField() {
      baseRenderApp();
      enhanceCodeField();
    };
    renderApp.__mmsInventoryCodeNumberField = true;
  }

  wrapRender();
  window.setTimeout(wrapRender, 300);
  window.setTimeout(enhanceCodeField, 300);
  window.setTimeout(enhanceCodeField, 1200);
})();
