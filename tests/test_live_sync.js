const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  let markers = { inventory: { id: 1 }, orders: { id: 1 }, tasks: { id: 1 }, quotes: { id: 1 } };
  let redraws = 0;
  let poll;
  const options = [{ value: "1" }];
  const picker = { options, appendChild(fragment) { options.push(...fragment.options); } };
  const document = {
    hidden: false,
    activeElement: { matches: () => true },
    addEventListener() {},
    createDocumentFragment: () => ({ options: [], appendChild(option) { this.options.push(option); } }),
    querySelectorAll: (selector) => selector === "[data-quote-inventory-pick]" ? [picker] : [],
  };
  const appState = { busy: false, currentView: "new-order", draftOrder: { client: "Bozza di Nicola" } };
  const context = {
    appState,
    appData: { inventory: [{ id: 1, name: "Vecchio" }], orders: [{ id: 1 }], orderTasks: {} },
    document,
    window: { mmsAuthProfile: { access_profile: "commerce" }, addEventListener() {} },
    Option: function (label, value) { this.label = label; this.value = value; },
    setInterval: (callback) => { poll = callback; },
    setTimeout: (callback) => callback(),
    renderApp: () => { redraws += 1; },
    console,
    fetch: async (path) => ({
      ok: true,
      json: async () => path === "/api/sync-state" ? markers
        : path === "/api/inventory" ? { items: [{ id: 1, name: "Vecchio" }, { id: 2, name: "Nuovo di Roberta", sku: "ART-2" }] }
        : path === "/api/bootstrap" ? { orders: [{ id: 1 }, { id: 2 }], inventory: [] }
        : {},
    }),
  };
  vm.runInNewContext(fs.readFileSync("app-live-sync.js", "utf8"), context);
  await new Promise((resolve) => setImmediate(resolve));
  markers = { ...markers, inventory: { id: 2 }, orders: { id: 2 } };
  await poll();
  assert.equal(context.appData.inventory.length, 2);
  assert.equal(context.appData.orders.length, 2);
  assert.equal(appState.draftOrder.client, "Bozza di Nicola");
  assert.equal(options.some((option) => option.value === "2"), true);
  assert.equal(redraws, 0, "The form must remain mounted while Nicola is typing");

  document.activeElement = { matches: () => false };
  appState.currentView = "orders";
  markers = { ...markers, tasks: { id: 2 } };
  await poll();
  assert.equal(redraws, 1, "The order list is rendered when a change arrives and no field is active");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
