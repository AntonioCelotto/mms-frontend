const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('app.js','utf8');
const options = source.match(/function orderArchiveDepartmentOptions\(\) \{[\s\S]*?\n\}/)[0];
const render = source.match(/function renderOrders\(\) \{[\s\S]*?\n\}/)[0];
const expected = ['all','Da assegnare','Sartoria interna','Sartoria esterna','Commercio'];
const departments = expected.slice(2).map((name,id)=>({id,name}));
const contexts = [];
for(const rows of [
  [{department:'Da assegnare'},{department:'Sartoria interna'}],
  [{department:'Commercio'},{department:'Sartoria esterna'}],
  [],
]) {
  const c = vm.createContext({appData:{orders:structuredClone(rows),departments},
    appState:{currentView:'orders',search:'',filters:{department:'all',status:'all',payment:'all',priority:'all'}},filterOrders:()=>[]});
  vm.runInContext(options+'\n'+render,c);
  assert.deepEqual(Array.from(c.orderArchiveDepartmentOptions()),expected);
  const before=JSON.stringify(c.appData.orders);
  const html=c.renderOrders();
  const select=html.match(/<select class="filter-chip" data-filter="department"[^>]*>[\s\S]*?<\/select>/)[0];
  assert.deepEqual(Array.from(select.matchAll(/<option value="([^"]+)"/g),m=>m[1]),expected);
  assert.equal(JSON.stringify(c.appData.orders),before,'No order assignment is changed');
  contexts.push(select);
  c.appState.filters.department='Sartoria esterna'; c.renderOrders();
  assert.equal(c.appState.filters.department,'Sartoria esterna','Keep a valid selection even if it has no current orders');
  c.appState.filters.department='Old browser-only name'; c.renderOrders();
  assert.equal(c.appState.filters.department,'all','Invalid saved filters must not leave the visible selection inconsistent');
  c.appData.departments=[];
  assert.deepEqual(Array.from(c.orderArchiveDepartmentOptions()),expected,'Safe startup fallback');
}
assert.equal(new Set(contexts).size,1,'Different browser copies render exactly the same department options');
console.log('Shared department filter: identical options across browsers, empty archives, selection retention; no order mutation.');

// Exercise the actual filter too, not only the options rendered in the menu.
const category = source.match(/function orderArchiveCategory\(order\) \{[\s\S]*?\n\}/)[0];
const filter = source.match(/function filterOrders\(\) \{[\s\S]*?\n\}/)[0];
const rows = [
  {id:918,db_id:1222,category:'Sartoria interna',department:'Da assegnare',status:'Da Avviare',priority:'Standard',payment:'Da pagare',orderDate:'2026-10-26'},
  {id:839,category:'Sartoria interna',department:'Sartoria interna',status:'Completato',priority:'Standard',payment:'Pagato',orderDate:'2026-09-23'},
  {id:917,category:'Commercio',department:'Da assegnare',status:'Completato',priority:'Standard',payment:'Da pagare',orderDate:'2026-10-25'},
  {id:916,category:'Sartoria esterna',department:'Da assegnare',status:'Da Avviare',priority:'Urgente',payment:'Da pagare',orderDate:'2026-10-25'},
  {id:915,category:'',department:'Da assegnare',status:'Da Avviare',priority:'Standard',payment:'Da pagare',orderDate:'2026-10-25'},
];
for (const browserDepartment of ['Da assegnare','Sartoria interna','Commercio']) {
  const c=vm.createContext({appData:{orders:structuredClone(rows)},appState:{search:'',filters:{department:'Sartoria interna',status:'all',payment:'all',priority:'all'}}});
  c.appData.orders[0].department=browserDepartment;
  vm.runInContext(category+'\n'+filter,c);
  assert.deepEqual(Array.from(c.filterOrders(),x=>x.id),[918,839]);
  c.appState.filters.department='Commercio'; assert.deepEqual(Array.from(c.filterOrders(),x=>x.id),[917]);
  c.appState.filters.department='Sartoria esterna'; assert.deepEqual(Array.from(c.filterOrders(),x=>x.id),[916]);
  c.appState.filters.department='Da assegnare'; assert.deepEqual(Array.from(c.filterOrders(),x=>x.id),[915]);
  c.appState.filters.department='Sartoria interna'; c.appState.filters.status='Completato';
  assert.deepEqual(Array.from(c.filterOrders(),x=>x.id),[839]);
  c.appState.filters.status='all';
  vm.runInContext(fs.readFileSync('app-orders-date-filter.js','utf8'),Object.assign(c,{renderOrders:()=>'',renderApp(){},document:{addEventListener(){}}}));
  c.appState.orderDateFilter={period:'custom',from:'2026-10-01',to:'2026-10-31'};
  assert.deepEqual(Array.from(c.filterOrders(),x=>x.id),[918],'Category composes with order dates');
}
const replay=fs.readFileSync('app-order-detail-edit.js','utf8').match(/function orderDetailEditApplyStoredToOrders\(\) \{[\s\S]*?\n\}/)[0];
const c=vm.createContext({appData:{orders:structuredClone(rows)},orderDetailEditReadStored:()=>({918:{category:'Commercio'}}),
  orderDetailEditFormatPayment:()=>'',orderDetailEditMaterialFromDraft:x=>x,orderDetailEditTaskFromDraft:x=>x});
vm.runInContext(replay,c);c.orderDetailEditApplyStoredToOrders();
assert.equal(c.appData.orders[0].category,'Sartoria interna','Old browser drafts cannot replace the shared category');
console.log('Category filtering includes orders without tasks, composes with status/date filters and ignores stale browser categories.');
