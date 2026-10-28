const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const orderTasks = {1199:[{id:2911,name:'Cartamodello Kilt',phase:'cartamodello',assignedUserId:23,hours:'4 h',estimated_hours:4,time:'2026-11-05'}]};
const original = JSON.stringify(orderTasks);
const c = vm.createContext({console,Date,
  appState:{currentView:'calendar',selectedOrderId:1199,calendarWeekStart:'2026-11-02',calendarFilters:{employee:'all',phase:'all'}},
  appData:{orderTasks,orders:[{id:1199,sourceQuoteNumber:'P-0918',client:'Cliente'}],accounts:[{id:23,name:'Operatrice',is_active:true}],
    calendarTaskSlots:{2911:{segments:[{date:'2026-11-05',hours:3,label:'14:00–17:00'},{date:'2026-11-06',hours:1,label:'08:00–09:00'}]}}},
  document:{getElementById:()=>null,addEventListener(){},head:{appendChild(){}}},
  window:{mmsAuthProfile:{access_profile:'admin'}},localStorage:{getItem:()=>null},
  renderApp(){},renderCalendar(){},calendarOrderSyncEnsureOrderTasks(){},
  fetch:async()=>({ok:false,json:async()=>({})}),
});
for(const f of ['app-calendar-worklog.js','app-calendar-week-navigation.js','app-calendar-hour-distribution.js','app-calendar-production-fix.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
for(let attempt=0;attempt<3;attempt++) {
  const html=c.renderCalendar();
  assert.equal((html.match(/class="calendar-event-time"/g)||[]).length,2,'One calendar card per actual working day');
  assert.match(html,/14:00–17:00/);assert.match(html,/08:00–09:00/);
  assert.equal((html.match(/class="calendar-production-report-row"/g)||[]).length,1,'Report counts the saved task once');
  assert.equal((html.match(/class="worklog-row"/g)||[]).length,1,'Employee list counts the saved task once');
  assert.match(html,/4 h previste/);assert.doesNotMatch(html,/8 h previste/);
  assert.equal(JSON.stringify(orderTasks),original,'No temporary or permanent mutation of canonical task data');
}
c.appState.calendarWeekStart='2026-11-09';
assert.equal((c.renderCalendar().match(/class="calendar-event-time"/g)||[]).length,0,'Calendar respects the selected week');
assert.equal(c.calendarWorklogAllTasks().length,1);
console.log('Multiday task: two calendar cards, one worklog/report row, four total hours, immutable canonical data.');
