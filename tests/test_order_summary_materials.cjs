const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scripts = Object.fromEntries(['detail-edit', 'quote-summary-bridge'].map(name => [name,
  fs.readFileSync(path.join(__dirname, `../app-order-${name}.js`), 'utf8')]));

function fixture(rows) {
  const order = { id: 983, db_id: 1288, sourceQuoteNumber: 'P-0983', total: 500,
    sourceQuotePayload: { total: 610, articles: [
      { name: 'Articolo A', quantity: '1', materials: [{ name: 'Materiale A', quantity: '3', price: '110' }] },
      { id: 'part-b', name: 'Articolo B', quantity: '1', materials: [{ name: 'Materiale A', inventory_item_id: 22, quantity: '3', price: '80' }] },
      { code: 'part-c', name: 'Articolo C', quantity: '1', materials: [{ name: 'Materiale C', quantity: '2', price: '150' }] },
    ] } };
  const rowsByOrder = { 1288: [{ product_name: 'Materiale di un altro ordine', quantity_required: 9 }] };
  if (rows !== undefined) rowsByOrder[983] = rows;
  const storage = new Map();
  let markup = '';
  const editPanel = { insertAdjacentHTML: (_where, html) => { markup = html; } };
  const section = { querySelector: selector => selector === '.order-detail-edit-panel' ? editPanel : null };
  const ctx = vm.createContext({ appState: { currentView: 'order-detail' }, appData: { orders: [order], orderMaterials: rowsByOrder, orderTasks: {} },
    console, window: {}, getSelectedOrder: () => order, saveDraftOrder() {}, setFlashMessage() {}, renderApp() {},
    document: { getElementById: () => null, querySelector: () => section, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  return { ctx, order, rowsByOrder, storage, render: () => { ctx.renderApp(); return markup; } };
}

const rows = [
  { product_name: 'Materiale A', quantity_required: 1, quantity: 3, article_key: 'article-1' },
  { product_name: 'Materiale A', inventory_item_id: 22, quantity_required: 1, article_key: 'part-b' },
  { product_name: 'Materiale C', quantity_required: 2, article_key: 'part-c' },
];
function loadBridge(f) { vm.runInContext(scripts['quote-summary-bridge'], f.ctx); }
function hasRow(html, label, quantity, price) {
  assert.match(html, new RegExp(`${label}(?:</strong>)?</td>\\s*<td>${quantity}</td>\\s*<td>${price}</td>`));
}

test('shows saved quantities under the correct articles and preserves quote pricing and original snapshot', () => {
  const f = fixture(rows);
  const before = JSON.stringify(f.order);
  loadBridge(f);
  let html = f.render();
  assert.match(html, /Articoli e materiali dell’ordine/);
  assert.match(html, /Totale preventivo \(IVA inclusa\)/);
  hasRow(html, 'Materiale A', '1', '110');
  hasRow(html, 'Materiale A', '1', '80');
  hasRow(html, 'Materiale C', '2', '150');
  assert.doesNotMatch(html, /<td>3<\/td>|un altro ordine/);
  f.rowsByOrder[983] = [{ ...rows[0], quantity_required: 4 }, ...rows.slice(1)];
  html = f.render();
  hasRow(html, 'Materiale A', '4', '110');
  assert.equal(JSON.stringify(f.order), before);
});

test('does not reuse old rows or assign a quote price to replacements and ambiguous duplicates', () => {
  const f = fixture([
    { ...rows[0], quantity_required: 2 }, { ...rows[0], quantity_required: 5 },
    { ...rows[1], inventory_item_id: 33, quantity_required: 4 },
    { product_name: 'Nuovo & <materiale>', quantity_required: '0,5', article_key: 'obsolete' },
  ]);
  loadBridge(f);
  const html = f.render();
  hasRow(html, 'Materiale A', '2', '');
  hasRow(html, 'Materiale A', '5', '');
  hasRow(html, 'Materiale A', '4', '');
  hasRow(html, 'Nuovo &amp; &lt;materiale&gt;', '0,5', '');
  assert.match(html, /Materiali non collegati a un articolo/);
  assert.doesNotMatch(html, /Materiale C|<td>(110|80|150)<\/td>/);
});

test('handles older unlinked rows and distinguishes a missing load from a confirmed empty order', () => {
  const f = fixture();
  loadBridge(f);
  assert.match(f.render(), /Riepilogo originale del preventivo/);
  f.rowsByOrder[983] = [{ product_name: 'Materiale C', quantity_required: 6 }];
  hasRow(f.render(), 'Materiale C', '6', '150');
  f.rowsByOrder[983] = [];
  assert.match(f.render(), /Articoli e materiali dell’ordine/);
  assert.doesNotMatch(f.render(), /Materiale [AC]|<td>3<\/td>/);
});

test('keeps an unconfirmed local edit from replacing saved materials, but preserves local-only behavior', () => {
  const f = fixture(rows);
  vm.runInContext(scripts['detail-edit'], f.ctx);
  f.storage.set('mms_order_detail_edits_v1', JSON.stringify({ 983: { materials: [{ product_name: 'Bozza', quantity_required: 9 }], payments: [], tasks: [] } }));
  f.ctx.orderDetailEditApplyStoredToOrders();
  assert.equal(f.rowsByOrder[983], rows);
  f.ctx.orderDetailEditSave();
  assert.equal(f.rowsByOrder[983], rows);
  delete f.order.db_id;
  f.ctx.orderDetailEditApplyStoredToOrders();
  assert.equal(f.rowsByOrder[983][0].product_name, 'Bozza');
});
