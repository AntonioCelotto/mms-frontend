(function () {
  const API_URL = "/api/inventory";
  let deletionInProgress = false;

  function normalizedItem(item) {
    return item && typeof item === "object" ? item : {};
  }

  function dataStore() {
    return typeof appData !== "undefined" ? appData : null;
  }

  function stateStore() {
    return typeof appState !== "undefined" ? appState : null;
  }

  function findItem(id) {
    const data = dataStore();
    const inventory = Array.isArray(data?.inventory) ? data.inventory : [];
    return inventory.map(normalizedItem).find((item) => String(item.id) === String(id));
  }

  function showMessage(message) {
    if (typeof setFlashMessage === "function") setFlashMessage(message);
  }

  function redraw() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (typeof renderApp === "function") renderApp();
  }

  async function requestDeletion(id) {
    const response = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Elemento magazzino non eliminato");
    }
    return payload;
  }

  function removeFromLocalState(id) {
    const data = dataStore();
    const state = stateStore();
    if (!Array.isArray(data?.inventory)) return;
    data.inventory = data.inventory.filter((item) => String(item.id) !== String(id));

    if (String(state?.inventoryDraft?.id || "") === String(id)) {
      state.inventoryDraft = {};
    }

    const supplierFilter = state?.inventoryFilters?.supplier;
    if (supplierFilter && supplierFilter !== "all") {
      const supplierStillExists = data.inventory.some((item) => item?.supplier_name === supplierFilter);
      if (!supplierStillExists) state.inventoryFilters.supplier = "all";
    }
  }

  async function deleteInventoryItem(id) {
    const state = stateStore();
    if (deletionInProgress || state?.busy) return;
    const item = findItem(id);
    if (!item) {
      showMessage("Elemento non trovato: aggiorna la pagina e riprova");
      redraw();
      return;
    }

    const typeLabel = item.item_type === "articolo" ? "l'articolo" : "il materiale";
    if (!window.confirm(`Eliminare ${typeLabel} ${item.name || "selezionato"}?`)) return;

    deletionInProgress = true;
    if (state) state.busy = true;
    showMessage("Eliminazione in corso...");
    redraw();

    try {
      const result = await requestDeletion(id);
      removeFromLocalState(id);
      showMessage(result.deleted === false ? "Elemento gia' eliminato" : "Elemento eliminato dal magazzino");
    } catch (error) {
      showMessage(error.message || "Elemento magazzino non eliminato");
    } finally {
      deletionInProgress = false;
      if (state) state.busy = false;
      redraw();
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-inventory-ma-delete]") : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteInventoryItem(button.dataset.inventoryMaDelete);
    },
    true
  );
})();
