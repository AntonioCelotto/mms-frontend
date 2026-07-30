(function () {
  const VERSION = "inventory-form-stability-2";
  let editingUntil = 0;
  let queuedRender = false;

  function isInventoryView() {
    return typeof appState === "object" && appState?.currentView === "inventory";
  }

  function isInventoryField(target) {
    return !!target?.closest?.("[data-inventory-ma-draft], [data-inventory-ma-filter], [data-inventory-ma-code-prefix]");
  }

  function markEditing(duration = 1600) {
    editingUntil = Date.now() + duration;
  }

  function editingActive() {
    const active = document.activeElement;
    return isInventoryView() && (Date.now() < editingUntil || isInventoryField(active));
  }

  function ensureDraft() {
    if (!appState.inventoryDraft || typeof appState.inventoryDraft !== "object") appState.inventoryDraft = {};
    return appState.inventoryDraft;
  }

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
    return { prefix: match[1], number: Number.parseInt(match[2], 10) || 0 };
  }

  function currentPrefix() {
    const draft = ensureDraft();
    const parts = codeParts(draft.mms_code);
    return text(draft.mms_code_prefix || parts?.prefix || "TEX").toUpperCase() || "TEX";
  }

  function nextNumber(prefix) {
    const normalizedPrefix = text(prefix || "TEX").toUpperCase();
    const highest = (appData.inventory || [])
      .map((item) => codeParts(item?.mms_code || item?.sku))
      .filter((parts) => parts?.prefix === normalizedPrefix)
      .reduce((max, parts) => Math.max(max, parts.number || 0), 0);
    return padNumber(highest + 1);
  }

  function setMmsCode(prefix, number) {
    const draft = ensureDraft();
    const normalizedPrefix = text(prefix || "TEX").toUpperCase();
    const normalizedNumber = padNumber(number || draft.mms_code_number || nextNumber(normalizedPrefix));
    draft.mms_code_prefix = normalizedPrefix;
    draft.mms_code_number = normalizedNumber;
    draft.mms_code = `MMS-${normalizedPrefix}-${normalizedNumber}`;
    draft.sku = draft.mms_code;
  }

  function ensureMmsCode() {
    const draft = ensureDraft();
    const parts = codeParts(draft.mms_code);
    setMmsCode(draft.mms_code_prefix || parts?.prefix || "TEX", draft.mms_code_number || parts?.number || nextNumber(draft.mms_code_prefix || parts?.prefix || "TEX"));
  }

  function handleDraftField(target) {
    const field = target?.dataset?.inventoryMaDraft;
    if (!field) return;
    markEditing();
    const draft = ensureDraft();
    draft[field] = target.value;

    if (field === "material_origin") {
      ensureMmsCode();
      if (typeof renderApp === "function") {
        window.setTimeout(() => {
          if (!editingActive()) renderApp();
        }, 120);
      }
      return;
    }

    if (field === "mms_code") {
      const parts = codeParts(target.value);
      if (parts) {
        draft.mms_code_prefix = parts.prefix;
        draft.mms_code_number = padNumber(parts.number);
        draft.sku = draft.mms_code;
      }
    }
  }

  function handlePrefixField(target) {
    if (!target?.matches?.("[data-inventory-ma-code-prefix]")) return;
    markEditing();
    setMmsCode(target.value, nextNumber(target.value));
    if (typeof renderApp === "function") renderApp();
  }

  function enhanceCodeDisplay() {
    if (!isInventoryView()) return;
    const draft = ensureDraft();
    const prefixSelect = document.querySelector("[data-inventory-ma-code-prefix]");
    const codeInput = document.querySelector('[data-inventory-ma-draft="mms_code"]');
    if (!prefixSelect || !codeInput) return;

    prefixSelect.disabled = false;
    ensureMmsCode();
    prefixSelect.value = currentPrefix();
    if (document.activeElement !== codeInput) codeInput.value = draft.mms_code;
    codeInput.placeholder = "MMS-TEX-001";
  }

  function normalizeInventoryPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (Array.isArray(payload.items)) {
      payload.items = payload.items.map((item) => normalizeInventoryPayload(item));
      return payload;
    }
    if (payload.item && typeof payload.item === "object") {
      payload.item = normalizeInventoryPayload(payload.item);
      return payload;
    }
    const mmsCode = text(payload.mms_code);
    if (mmsCode && text(payload.material_origin).toLowerCase() === "fornitore") {
      payload.sku = mmsCode;
    }
    return payload;
  }

  if (typeof window.fetch === "function" && !window.fetch.__mmsInventorySharedSupplierCode) {
    const baseFetch = window.fetch.bind(window);
    window.fetch = function fetchInventorySharedSupplierCode(input, init) {
      const url = typeof input === "string" ? input : input?.url || "";
      const method = text(init?.method || "GET").toUpperCase();
      if (url.includes("/api/inventory") && ["POST", "PATCH"].includes(method) && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          const normalized = normalizeInventoryPayload(payload);
          init = { ...init, body: JSON.stringify(normalized) };
        } catch (error) {
          // Lascia passare il payload originale se non e' JSON valido.
        }
      }
      return baseFetch(input, init);
    };
    window.fetch.__mmsInventorySharedSupplierCode = true;
  }

  document.addEventListener(
    "beforeinput",
    (event) => {
      if (isInventoryView() && isInventoryField(event.target)) markEditing();
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      if (!isInventoryView()) return;
      handleDraftField(event.target);
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      if (!isInventoryView()) return;
      handleDraftField(event.target);
      handlePrefixField(event.target);
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event) => {
      if (isInventoryView() && isInventoryField(event.target)) markEditing(2400);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (event) => {
      if (!isInventoryView() || !isInventoryField(event.target)) return;
      window.setTimeout(() => {
        if (!isInventoryField(document.activeElement)) editingUntil = 0;
      }, 80);
    },
    true
  );

  if (typeof renderApp === "function" && !renderApp.__mmsInventoryFormStability) {
    const baseRenderApp = renderApp;
    renderApp = function renderAppInventoryFormStability() {
      if (editingActive()) {
        if (!queuedRender) {
          queuedRender = true;
          window.setTimeout(() => {
            queuedRender = false;
            if (!editingActive()) baseRenderApp();
            enhanceCodeDisplay();
          }, 600);
        }
        return;
      }
      baseRenderApp();
      enhanceCodeDisplay();
    };
    renderApp.__mmsInventoryFormStability = true;
  }

  window.setTimeout(enhanceCodeDisplay, 0);
  window.setTimeout(enhanceCodeDisplay, 800);
  window.mmsInventoryFormStabilityVersion = VERSION;
})();
