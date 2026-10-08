const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function testPayments() {
  let reads = 0;
  const cell = {};
  const context = {
    appData: { orders: [{ id: 1131, db_id: 1152 }] },
    appState: { currentView: "orders", search: "" },
    filterOrders() { return this.appData.orders; }, renderOrders: () => "", renderApp() {},
    window: { addEventListener() {}, setTimeout: () => 1,
      mmsSupabaseAuth: { auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) } } },
    document: { head: { appendChild() {} }, createElement: () => ({
      content: { querySelectorAll: (selector) => selector === "tbody tr" ? [{
        querySelector: () => ({ dataset: { detail: "1131" } }),
        querySelectorAll: () => [null, null, null, null, null, null, cell],
      }] : [] },
    }) },
    fetch: async () => { reads++; return { ok: true, json: async () => ({
      payments: [{ order_id: 1152, payment_type: "saldo", amount: 366, status: "da_pagare" }],
    }) }; }, console,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("app-orders-complete-view.js", "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(reads, 1);
  context.appData.orders = [{ id: 1131, db_id: 1152, paymentRows: [
    { order_id: 1152, payment_type: "saldo", amount: 260, status: "da_pagare" },
  ] }];
  context.renderApp(); context.renderOrders();
  assert.equal(context.appData.orders[0].paymentRows[0].amount, 260);
  assert.match(cell.innerHTML, /260,00/);
  context.appData.orders[0].paymentRows[0].amount = 0;
  context.renderApp(); context.renderOrders();
  assert.match(cell.innerHTML, /0,00/);
  context.appData.orders[0].paymentRows = [];
  context.renderOrders();
  assert.match(cell.innerHTML, /Importo e scadenza da definire/);
  assert.equal(reads, 1, "Rendering does not refetch stale payment details");
  let snapshotReads = 0;
  context.fetch = async () => { snapshotReads++; throw new Error("Unexpected request"); };
  vm.runInContext(fs.readFileSync("app-orders-complete-view.js", "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(snapshotReads, 0, "Bootstrap snapshots need no additional payment endpoint");
}

async function testPhotos() {
  const requests = [];
  let flash = "";
  let compressed = "data:image/jpeg;base64,YQ==";
  const order = { id: 1131, db_id: 1152, files: 2 };
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }),
    toDataURL: () => compressed };
  const context = {
    appState: { currentView: "order-detail", selectedOrderId: 1131 },
    navigate() {}, saveDraftOrder() {}, renderApp() {},
    document: { querySelector: () => null, querySelectorAll: () => [], createElement: () => canvas },
    FileReader: class { readAsDataURL(file) { this.result = file.data; this.onload(); } },
    Image: class { constructor() { this.naturalWidth = 6000; this.naturalHeight = 4000; }
      set src(value) { this.onload(); } },
    getSelectedOrder: () => order,
    setBusy: (busy) => { context.appState.busy = busy; },
    setFlashMessage: (message) => { flash = message; },
    fetch: async (path, options) => {
      const payload = JSON.parse(options.body);
      requests.push({ path, payload });
      return { ok: true, status: 201, text: async () => JSON.stringify({ attachment: {
        id: requests.length, name: payload.file_name, mime_type: payload.file_type,
        url: "https://example.invalid/storage/v1/object/sign/private/photo", size: 1,
      } }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("app-order-enhancements.js", "utf8"), context);
  const original = "data:image/png;base64,YQ==";
  await context.uploadAttachmentFile(1152, { name: "foto.png", file: { data: original, type: "image/png" } });
  assert.equal(requests[0].payload.data, original, "Small originals are unchanged");
  assert.equal(requests[0].payload.order_id, 1152, "Photos are linked to the database order ID");
  const large = "data:image/png;base64," + "A".repeat(6 * 1024 * 1024);
  await context.uploadAttachmentFile(1152, { name: "telefono.png", file: { data: large, type: "image/png" } });
  assert.equal(requests[1].payload.file_name, "telefono.jpg");
  assert.equal(requests[1].payload.file_type, "image/jpeg");
  assert.ok(JSON.stringify(requests[1].payload).length < 4.5 * 1000 * 1000);
  assert.equal(canvas.width, 2560);
  assert.equal(canvas.height, 1707);
  await assert.rejects(context.uploadAttachmentFile(1152, { dataUrl: "data:image/heic;base64,YQ==" }), /Formato foto/);
  compressed = large;
  await assert.rejects(context.uploadAttachmentFile(1152, { file: { data: large } }), /troppo grande/);
  assert.equal(requests.length, 2, "Unsupported or still oversized files never reach the server");
  await assert.rejects(context.readAttachmentJson({ status: 413 }, "Upload"), /troppo grande/);
  await context.uploadFilesToExistingOrder([
    { name: "prima.png", data: original, type: "image/png" },
    { name: "seconda.heic", data: "data:image/heic;base64,YQ==", type: "image/heic" },
  ]);
  assert.equal(context.appState.orderAttachments[1131].length, 1);
  assert.equal(order.files, 3);
  assert.equal(context.appState.busy, false);
  assert.match(flash, /1 foto già salvate/);
}

Promise.resolve().then(testPayments).then(testPhotos).then(() => {
  console.log("Payment snapshots and order photo uploads: passed");
}).catch((error) => { console.error(error); process.exitCode = 1; });
