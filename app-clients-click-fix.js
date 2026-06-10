document.addEventListener("click", function (event) {
  const clientButton = event.target.closest("[data-clients-fallback-select]");
  if (clientButton && typeof clientsFallbackState === "function") {
    event.preventDefault();
    event.stopPropagation();
    const state = clientsFallbackState();
    state.selectedClientId = Number(clientButton.dataset.clientsFallbackSelect);
    renderApp();
    return;
  }

  const orderButton = event.target.closest("section.view.active [data-detail]");
  if (orderButton && typeof navigate === "function") {
    const orderId = Number(orderButton.dataset.detail);
    if (orderId) {
      event.preventDefault();
      event.stopPropagation();
      navigate("order-detail", orderId);
    }
  }
});