const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const names = ['orderArchiveCategory','orderArchiveDepartmentOptions','orderArchiveFilterKey',
  'orderArchiveFilterValue','orderArchiveFilterOptions','orderArchiveFilterLabel','filterOrders','renderOrders'];
const functions = names.map(name => source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0]).join('\n');
const rows = [
  {id:976,status:'Da avviare',statusKey:'da_avviare',category:'Sartoria interna',priority:'Standard',payment:'Da pagare',orderDate:'2026-11-16'},
  {id:980,status:'Da Avviare',statusKey:'da_avviare',category:'Sartoria interna',priority:'STANDARD',payment:'Da Pagare',orderDate:'2026-11-15'},
  {id:979,status:'  DA   AVVIARE  ',category:'Sartoria interna',priority:' standard ',payment:'da_pagare',orderDate:'2026-11-14'},
  {id:975,status:'In Produzione',statusKey:'in_produzione',category:'Sartoria interna',priority:'Urgente',payment:'Pagato',orderDate:'2026-11-13'},
  {id:974,status:'In corso',category:'Sartoria interna',priority:'Urgente',payment:'pagato',orderDate:'2026-11-12'},
  {id:973,status:'Completato',statusKey:'completato',category:'Commercio',priority:'Standard',payment:'Pagato',orderDate:'2026-11-11'},
  {id:972,status:'Da Avviare',statusKey:'sospeso',category:'Sartoria interna',priority:'Standard',payment:'Da pagare',orderDate:'2026-11-10'},
  {id:971,status:'Controllo speciale',category:'Sartoria interna',priority:'Standard',payment:'Parziale',orderDate:'2026-11-09'},
];
const c = vm.createContext({appData:{orders:structuredClone(rows),departments:['Sartoria interna','Sartoria esterna','Commercio']},
  appState:{currentView:'orders',search:'',filters:{department:'all',status:'all',payment:'all',priority:'all'}},
  getStatusClass:()=>'',getPriorityClass:()=>'',getWarehouseClass:()=>'',getMaterialStatus:()=>'',formatOrderNumber:x=>x,
});
vm.runInContext(functions,c);
const ids=()=>Array.from(c.filterOrders(),r=>r.id);
const before=JSON.stringify(c.appData.orders);
for(const selected of ['Da Avviare','Da avviare','da_avviare','  DA  AVVIARE ']) {
  c.appState.filters.status=selected;
  assert.deepEqual(ids(),[976,980,979],'Labels and saved keys must return the same orders');
}
for(const selected of ['In Produzione','In produzione','In corso','in_produzione']) {
  c.appState.filters.status=selected;
  assert.deepEqual(ids(),[975,974]);
}
assert.equal(c.orderArchiveFilterKey('status','Controllo speciale'),'controllo_speciale','Unknown states are not changed into Da avviare');
assert.deepEqual(Array.from(c.orderArchiveFilterOptions('status')),['all','da_avviare','in_produzione','completato','sospeso','controllo_speciale']);
c.appState.filters.status='Da Avviare';
c.appState.filters.priority='STANDARD';c.appState.filters.payment='Da Pagare';
assert.deepEqual(ids(),[976,980,979]);
c.appState.filters.department='Commercio';assert.deepEqual(ids(),[]);
c.appState.filters.department='Sartoria interna';c.appState.search='980';assert.deepEqual(ids(),[980]);
c.appState.search='';
// Render actual menus without exercising unrelated row decorators.
const actualFilter=c.filterOrders;c.filterOrders=()=>[];
const html=c.renderOrders();
assert.equal(c.appState.filters.status,'da_avviare','Old browser selections migrate to a canonical key');
assert.equal(c.appState.filters.payment,'da_pagare');assert.equal(c.appState.filters.priority,'standard');
const statusSelect=html.match(/<select[^>]+data-filter="status"[^>]*>[\s\S]*?<\/select>/)[0];
assert.equal((statusSelect.match(/value="da_avviare"/g)||[]).length,1);
assert.match(statusSelect,/<option value="da_avviare" selected>\s*Da avviare/);
assert.doesNotMatch(statusSelect,/value="Da Avviare"|value="Da avviare"/);
for (const field of ['payment','priority']) {
  const select=html.match(new RegExp('<select[^>]+data-filter="'+field+'"[^>]*>[^]*?<\\/select>'))[0];
  const values=Array.from(select.matchAll(/<option value="([^"]+)"/g),m=>m[1]);
  assert.equal(new Set(values).size,values.length,'No case-only duplicate menu options');
}
c.filterOrders=actualFilter;
// Opening/saving another order changes its label but not filter membership.
c.appData.orders[1].status='Da avviare';assert.deepEqual(ids(),[976,980,979]);
c.appData.orders[1].status='Da Avviare';
assert.equal(JSON.stringify(c.appData.orders),before,'Filtering/rendering never changes saved orders, tasks, payments or categories');
vm.runInContext(fs.readFileSync('app-orders-date-filter.js','utf8'),Object.assign(c,{renderApp(){},document:{addEventListener(){}}}));
c.appState.orderDateFilter={period:'custom',from:'2026-11-15',to:'2026-11-16'};
assert.deepEqual(ids(),[976,980],'Canonical states compose with category, payment, priority and date filters');
assert.match(fs.readFileSync('index.html','utf8'),/app\.js\?v=20261116-canonical-order-filters-1/);
console.log('Order filters: canonical status keys, duplicate labels, old selections, priority/payment casing, stable saves, date/category/search composition and no data mutations passed.');
