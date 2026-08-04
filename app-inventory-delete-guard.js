(function () {
  const API_URL = "/api/inventory";
  let deletionInProgress = false;

  function normalizedItem(item) {
    return item && typeof item === "object" ? item : {};
  }

  function findItem(id) {
    const inventory = Array.isArray(window.appData?.inventory) ? window.appData.inventory : [];
    return inventory.map(normalizedItem).find((item) => String(item.id) === String(id));
  }

  function showMessage(message) {
    if (typeof window.setFlashMessage === "function") window.setFlashMessage(message);
  }

  function redraw() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (typeof window.renderApp === "function") window.renderApp();
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
    if (!Array.isArray(window.appData?.inventory)) return;
    window.appData.inventory = window.appData.inventory.filter((item) => String(item.id) !== String(id));

    if (String(window.appState?.inventoryDraft?.id || "") === String(id)) {
      window.appState.inventoryDraft = {};
    }

    const supplierFilter = window.appState?.inventoryFilters?.supplier;
    if (supplierFilter && supplierFilter !== "all") {
      const supplierStillExists = window.appData.inventory.some((item) => item?.supplier_name === supplierFilter);
      if (!supplierStillExists) window.appState.inventoryFilters.supplier = "all";
    }
  }

  async function deleteInventoryItem(id) {
    if (deletionInProgress || window.appState?.busy) return;
    const item = findItem(id);
    if (!item) {
      showMessage("Elemento non trovato: aggiorna la pagina e riprova");
      redraw();
      return;
    }

    const typeLabel = item.item_type === "articolo" ? "l'articolo" : "il materiale";
    if (!window.confirm(`Eliminare ${typeLabel} ${item.name || "selezionato"}?`)) return;

    deletionInProgress = true;
    if (window.appState) window.appState.busy = true;
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
      if (window.appState) window.appState.busy = false;
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
