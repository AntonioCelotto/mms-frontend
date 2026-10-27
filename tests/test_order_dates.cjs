const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {};
const today = new Date();
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const old = n => { const d = new Date(today); d.setDate(d.getDate()-n); return iso(d); };
const rows = [{id:1,orderDate:old(0)},{id:2,orderDate:old(6)},{id:3,orderDate:old(7)},
  {id:4,orderDate:old(29)},{id:5,orderDate:old(30)},{id:6,orderDate:'',estimatedDelivery:old(0)}];
const c = vm.createContext({Date,appState:{},filterOrders:()=>rows,renderOrders:()=>'<div class="filter-chip">Periodo: ultimi 30 giorni</div>',
  renderApp(){}, document:{addEventListener:(name,cb)=>listeners[name]=cb}});
vm.runInContext(fs.readFileSync('app-orders-date-filter.js','utf8'),c);
assert.equal(c.filterOrders().length,6);
assert.match(c.renderOrders(),/data-order-date-filter="period"/);
function change(field,value){listeners.change({target:{dataset:{orderDateFilter:field},value}});}
change('period','7'); assert.equal(c.filterOrders().length,2);
change('period','30'); assert.equal(c.filterOrders().length,4);
change('period','custom'); change('from',old(7)); change('to',old(6));
assert.deepEqual(Array.from(c.filterOrders(),r=>r.id),[2,3]);
change('from',old(0)); change('to',old(7)); assert.equal(c.filterOrders().length,0);
assert.match(c.renderOrders(),/role="alert"/);
change('period','all'); assert.equal(c.filterOrders().length,6);
console.log('Order dates: all, inclusive 7/30 days, date range, missing dates, invalid range passed.');
