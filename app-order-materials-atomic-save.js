(function () {
  if (typeof orderFlowSaveMaterials !== "function") return;

  orderFlowSaveMaterials = async function orderFlowSaveMaterialsAtomic(order, materials) {
    const displayId = typeof orderFlowDisplayId === "function" ? orderFlowDisplayId(order) : Number(order?.id || appState.selectedOrderId || 0);
    const dbId = typeof orderFlowDbId === "function" ? orderFlowDbId(order) : Number(order?.db_id || order?.internal_id || 0);
    if (!displayId && !dbId) return 0;
    if (!Array.isArray(materials) || !materials.length) return 0;

    const response = await fetch("/api/save-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: displayId || order?.id || null,
        order_db_id: dbId || order?.db_id || null,
        materials,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Salvataggio materiali non riuscito");
    }

    if (typeof orderFlowLoadMaterials === "function") await orderFlowLoadMaterials(order);
    return Number(payload.saved || 0);
  };

  if (document.getElementById("app")?.innerHTML) renderApp();
})();