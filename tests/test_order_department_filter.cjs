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
  const select=html.match(/<select class="filter-chip" data-filter="department">[\s\S]*?<\/select>/)[0];
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
