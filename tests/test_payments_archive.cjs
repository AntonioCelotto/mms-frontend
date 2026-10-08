const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  let rows = Array.from({ length: 1184 }, (_, index) => ({ id: index + 1, order_id: index + 2000,
    display_order_id: index + 1, order_number: `P-${String(index + 1).padStart(4, "0")}`,
    client: `Cliente ${index + 1}`, status: index < 967 ? "pagato" : "da_pagare", payment_type: "saldo",
    amount: index === 1183 ? 0 : "10.10", due_date: "2026-10-31" }));
  let click;
  let poll;
  let reads = 0;
  let fail = false;
  let currentFrame;
  let frameCount = 0;
  let prints = 0;
  const host = { innerHTML: "" };
  const paymentDraft = { amount: "Bozza da conservare" };
  const context = {
    appState: { currentView: "dashboard", paymentDraft },
    window: { mmsAuthProfile: { access_profile: "admin" }, addEventListener() {} },
    document: { hidden: false, querySelector: () => host, addEventListener: (kind, handler) => { if (kind === "click") click = handler; },
      head: { appendChild() {} }, body: { appendChild: (frame) => { frameCount++; currentFrame = frame; } },
      createElement: () => ({ style: {}, addEventListener(kind, handler) { this.load = handler; },
        contentWindow: { addEventListener() {}, focus() {}, print() { prints++; } }, remove() {} }) },
    renderPayments: () => '<section class="view active"><div class="layout-2">Scheda esistente</div></section>',
    navigate: () => {}, savePaymentDraftForSelectedOrder: async () => {}, resetPaymentDraft() {},
    normalizePaymentLabel: (type) => type === "saldo" ? "Saldo" : type,
    setInterval: (handler) => { poll = handler; },
    fetch: async (path, options) => {
      reads++;
      assert.equal(path, "/api/payments-archive");
      assert.equal(options.cache, "no-store");
      if (fail) throw new Error("Connessione interrotta");
      return { ok: true, json: async () => ({ payments: rows, loaded_at: "2026-10-08T07:30:00Z" }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("app-payments-archive.js", "utf8"), context);
  await poll();
  assert.equal(reads, 0, "No background reads while the payments view is closed");
  context.appState.currentView = "payments";
  context.navigate("payments");
  await new Promise(setImmediate);
  assert.equal(reads, 1);
  assert.match(host.innerHTML, /1184 movimenti/);
  assert.match(host.innerHTML, /Pagina 1 di 24/);
  assert.equal((host.innerHTML.match(/data-payments-archive-open=/g) || []).length, 50);
  assert.match(context.renderPayments(), /Scheda esistente/);

  function button(attribute, value = "") {
    const dataset = { paymentsArchiveFilter: value, paymentsArchivePage: value, paymentsArchiveOpen: value };
    click({ target: { closest: () => ({ dataset, hasAttribute: (key) => key === attribute }) } });
  }
  button("data-payments-archive-filter", "unpaid");
  assert.match(host.innerHTML, /217 movimenti/);
  assert.match(host.innerHTML, /Pagina 1 di 5/);
  assert.match(host.innerHTML, /2\.?181,60/);
  context.window.mmsApplyPaymentArchiveSearch("P-1184");
  assert.match(host.innerHTML, /1 movimenti/);
  assert.match(host.innerHTML, /0,00/);
  assert.match(host.innerHTML, /P-1184/);
  button("data-payments-archive-filter", "paid");
  assert.match(host.innerHTML, /Nessun pagamento per i filtri/);
  context.window.mmsApplyPaymentArchiveSearch("");
  assert.match(host.innerHTML, /967 movimenti/);

  // Print refreshes the server and includes all unpaid rows, independent of
  // paid/search/page filters, without altering the draft form.
  rows[1183].amount = "45.00";
  button("data-payments-archive-print");
  await new Promise(setImmediate);
  assert.equal(reads, 2);
  assert.equal(frameCount, 1);
  assert.match(currentFrame.srcdoc, /217 movimenti/);
  assert.equal((currentFrame.srcdoc.match(/<tr>/g) || []).length, 218);
  assert.match(currentFrame.srcdoc, /2\.?226,60/);
  assert.doesNotMatch(currentFrame.srcdoc, /P-0001/);
  assert.match(currentFrame.srcdoc, /P-1184/);
  currentFrame.load();
  assert.equal(prints, 1, "The prepared document opens the browser print dialog");
  assert.equal(context.appState.paymentDraft, paymentDraft);
  assert.equal(context.appState.paymentDraft.amount, "Bozza da conservare");

  fail = true;
  button("data-payments-archive-print");
  await new Promise(setImmediate);
  assert.equal(frameCount, 1, "A failed refresh must not print stale financial data");
  assert.match(host.innerHTML, /Stampa non preparata/);
  assert.match(host.innerHTML, /I dati precedenti restano visibili/);
  context.window.mmsAuthProfile.access_profile = "operator";
  const before = reads;
  await poll();
  assert.equal(reads, before, "Operators never request the financial archive");
  console.log("Complete payments archive, filters, pagination and fresh print: passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
