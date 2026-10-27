const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const order = { id: 1146, db_id: 1168 };
  const draft = { tasks: [] };
  const rows = new Map(), requests = [], patches = [];
  let loseResponse = false;
  const c = vm.createContext({
    console, Date, Promise, Number, Map, Set,
    appState: { currentView: 'order-detail', selectedOrderId: 1146, orderDetailEdits: { 1146: draft } },
    appData: { orders: [order], orderTasks: { 1146: [] } }, window: {},
    document: { getElementById: () => null, addEventListener() {} },
    getSelectedOrder: () => order, orderDetailEditDraftFor: () => draft,
    orderDetailEditWriteStored() {}, saveDraftOrder() {}, renderApp() {},
    setFlashMessage() { c.renderApp(); },
    orderDetailEditSave() {
      c.appData.orderTasks[order.id] = draft.tasks.map((t) => c.taskSyncTaskFromDraft(t, 0, order.id));
      c.setFlashMessage('Salvataggio');
    },
    taskAssignmentPatchTask: async (id, user, date, time, note, extra) => { patches.push(id); return true; },
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body); requests.push(payload);
      assert.equal(payload.order_id, 1168);
      assert.ok(payload.client_task_key.startsWith('local-task-'));
      await new Promise(setImmediate);
      if (!rows.has(payload.client_task_key)) rows.set(payload.client_task_key, { ...payload, id: rows.size + 2901 });
      if (loseResponse) { loseResponse = false; throw new Error('Risposta interrotta'); }
      return { ok: true, json: async () => rows.get(payload.client_task_key) };
    },
  });
  for (const f of ['app-order-task-sync-v2.js', 'app-order-core-tasks.js', 'app-order-extra-task-fix.js'])
    vm.runInContext(fs.readFileSync(f, 'utf8'), c, { filename: f });
  const add = (key, article = 'article-2') => draft.tasks.push({
    id: `local-task-1146-manual-${key}`, name: 'Confezione', phase: 'confezione',
    hours: '8', time: '2026-10-26', plannedTime: '08:30', dueDate: '2026-10-26',
    articleKey: article, articleName: article, assignedUserId: '20', sequenceOrder: 3,
  });
  return { c, draft, rows, requests, patches, add, loseNext: () => { loseResponse = true; } };
}

(async () => {
  const x = setup(); x.add('one');
  const first = x.c.window.orderTaskPersistPending();
  x.c.renderApp(); // The exact row-object replacement that used to cause 8 -> 16 -> 24.
  const double = x.c.window.orderTaskPersistPending();
  assert.equal(first, double);
  await first;
  for (let i = 0; i < 3; i++) { x.c.renderApp(); await x.c.orderDetailEditSave(); }
  assert.equal(x.requests.length, 1);
  assert.equal(x.rows.size, 1);
  assert.equal(x.draft.tasks.length, 1);
  assert.equal(x.draft.tasks[0].id, 2901);
  assert.equal(x.draft.tasks[0].articleKey, 'article-2');
  assert.equal(x.draft.tasks[0].plannedTime, '08:30');
  assert.equal(x.draft.tasks[0].hours, '8');
  x.add('two', 'article-1'); await x.c.orderDetailEditSave();
  assert.equal(x.rows.size, 2, 'Same phase/name on another article is a legitimate task');
  assert.equal(x.draft.tasks.length, 2);
  assert.equal(new Set(x.draft.tasks.map(t => t.id)).size, 2);

  const y = setup(); y.add('network'); y.loseNext();
  await assert.rejects(y.c.window.orderTaskPersistPending(), /interrotta/);
  y.c.renderApp(); await y.c.window.orderTaskPersistPending();
  assert.equal(y.rows.size, 1, 'Retry uses the same persisted request key');
  assert.equal(y.draft.tasks.length, 1);

  const z = setup(); z.add('editing');
  const saving = z.c.window.orderTaskPersistPending();
  z.c.renderApp(); z.draft.tasks[0].hours = '5'; z.draft.tasks[0].articleKey = 'article-edited';
  await saving;
  assert.equal(z.draft.tasks[0].hours, '5', 'A delayed response must not discard newer edits');
  assert.equal(z.draft.tasks[0].articleKey, 'article-edited');
  assert.equal(z.draft.tasks[0].id, 2901);

  const b = setup(); b.add('bootstrap');
  b.c.appData.orderTasks[1146] = [{ id: 9, phase: 'confezione', clientTaskKey: 'local-task-1146-manual-bootstrap', hours: '8 h' }];
  b.c.orderDetailEditDraftFor({ id: 1146, db_id: 1168 });
  assert.equal(b.draft.tasks.length, 1, 'A bootstrap confirmation reconciles the local copy by key');
  assert.equal(b.draft.tasks[0].id, 9);
  console.log('Task identity: re-render, repeated saves, lost response, articles, edits and bootstrap reconciliation passed.');
})().catch(error => { console.error(error); process.exit(1); });
