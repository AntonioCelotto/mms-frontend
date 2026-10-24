const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const clone = (value) => JSON.parse(JSON.stringify(value));
const original = { id: 2930, order_id: 1131, payment_type: "acconto", amount: 410,
  due_date: "2026-09-30", paid_date: "2026-10-08", status: "pagato", notes: "CONTANTI" };

function fixture(initial = [original]) {
  let rows = clone(initial), reads = 0, writes = 0, nextId = 5000, fail = false;
  const order = { id: 1111, db_id: 1131 };
  const draft = { payments: [], notes: "Conserva le modifiche non salvate" };
  const context = {
    appState: { currentView: "order-detail", selectedOrderId: 1111, orderDetailEdits: { 1111: draft } },
    appData: { orders: [order] }, window: {}, console, renderApp() {}, navigate() {},
    getPaymentOrderId: () => 1131, getSelectedOrder: () => order,
    orderDetailEditDraftFor: () => draft, setFlashMessage() {},
    paymentRequest: async (path, options) => {
      assert.equal(options, undefined, "The old direct POST/DELETE path must never be used");
      reads++; return clone(rows);
    },
    fetch: async (path, options) => {
      writes++;
      assert.equal(path, "/api/sync-order-payments");
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.order_id, 1131);
      if (fail || JSON.stringify(body.expected) !== JSON.stringify(rows)) {
        return { ok: false, status: 409, json: async () => ({ error: "Pagamenti modificati da un altro operatore" }) };
      }
      rows = body.payments.map((row) => ({ ...row, id: row.id || nextId++, order_id: 1131 }));
      return { ok: true, json: async () => ({ payments: clone(rows) }) };
    },
  };
  const source = fs.readFileSync("app-order-payments-sync.js", "utf8").replace(
    "  const baseSaveDraftOrderPaymentsSync",
    "  window.testApi = { syncOrderPaymentRows, loadOrderDetailPayments, autoPaymentBody, dbPaymentToDraft };\n  const baseSaveDraftOrderPaymentsSync"
  );
  vm.runInNewContext(source, context);
  return { context, order, draft, api: context.window.testApi, rows: () => rows,
    writes: () => writes, reads: () => reads, conflict: () => { fail = true; } };
}

test("Repeated order saves keep imported/manual payments and stable IDs, never double or triple", async () => {
  const f = fixture();
  await f.api.loadOrderDetailPayments(f.order);
  for (let i = 0; i < 4; i++) {
    await f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine");
    assert.equal(f.rows().length, 1);
    assert.equal(f.rows()[0].id, 2930);
    assert.equal(f.rows()[0].amount, 410);
    assert.equal(f.rows()[0].notes, "CONTANTI");
  }
  assert.equal(f.draft.notes, "Conserva le modifiche non salvate");
});

test("Editing, adding legitimate installments and deleting a row do not copy other payments", async () => {
  const f = fixture();
  await f.api.loadOrderDetailPayments(f.order);
  f.draft.payments[0].amount = 200;
  f.draft.payments.push({ type: "Saldo", amount: 210, status: "da_pagare", dueDate: "2026-10-30" });
  await f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine");
  assert.equal(f.rows().length, 2);
  assert.equal(f.rows()[0].id, 2930);
  assert.equal(f.rows()[0].amount, 200);
  const secondId = f.rows()[1].id;
  await f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine");
  assert.equal(f.rows()[1].id, secondId);
  f.draft.payments.splice(1, 1);
  await f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine");
  assert.equal(f.rows().length, 1);
  await f.api.syncOrderPaymentRows(f.order, [], "Da scheda ordine");
  assert.equal(f.rows().length, 0, "Explicit removal of the last row is persisted");
});

test("Concurrent clicks share one atomic request", async () => {
  const f = fixture();
  await f.api.loadOrderDetailPayments(f.order);
  await Promise.all([1, 2, 3].map(() => f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine")));
  assert.equal(f.writes(), 1);
  assert.equal(f.rows().length, 1);
});

test("Missing baseline or a concurrent change never overwrites saved payments", async () => {
  const f = fixture();
  await assert.rejects(f.api.syncOrderPaymentRows(f.order, [], "Da scheda ordine"), /caricamento/);
  assert.equal(f.writes(), 0);
  await f.api.loadOrderDetailPayments(f.order);
  f.draft.payments[0].amount = 999;
  f.conflict();
  await assert.rejects(f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine"), /altro operatore/);
  assert.equal(f.rows()[0].amount, 410);
  assert.equal(f.draft.payments[0].amount, 999, "Keep the rejected draft for review");
});

test("Historical status/date discrepancies, notes, zero and authorized deadlines survive a round trip", async () => {
  for (const row of [
    { ...original, status: "da_pagare" },
    { ...original, status: "scaduto", paid_date: null },
    { ...original, payment_type: "scadenza", amount: 0, status: "autorizzato", paid_date: null },
    { ...original, amount: null, status: "autorizzato", paid_date: null, due_date: null, notes: null },
    { ...original, notes: "Da scheda ordine: BONIFICO" },
  ]) {
    const f = fixture([row]);
    await f.api.loadOrderDetailPayments(f.order);
    await f.api.syncOrderPaymentRows(f.order, f.draft.payments, "Da scheda ordine");
    for (const key of ["id", "payment_type", "status", "paid_date", "amount", "notes"]) assert.equal(f.rows()[0][key], row[key]);
  }
});

test("A newly created order can replace only its empty initial placeholder", async () => {
  const f = fixture([{ ...original, amount: null, paid_date: null, status: "da_pagare", notes: "Stato acconto iniziale: Da pagare" }]);
  await f.api.syncOrderPaymentRows(f.order, [{ type: "Saldo", amount: 410, status: "da_pagare" }], "Da ordine da preventivo");
  assert.equal(f.rows().length, 1);
  const occupied = fixture();
  await assert.rejects(occupied.api.syncOrderPaymentRows(occupied.order, [], "Da ordine da preventivo"), /già presenti/);
  assert.equal(occupied.writes(), 0);
});

test("Reopening an order invalidates the stale baseline", async () => {
  const f = fixture();
  await f.api.loadOrderDetailPayments(f.order);
  f.context.navigate("order-detail", 1111);
  assert.equal(f.context.appState.orderPaymentSnapshots[1131], undefined);
  await f.api.loadOrderDetailPayments(f.order);
  assert.equal(f.reads(), 2);
});
