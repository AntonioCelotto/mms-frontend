const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Clock extends Date {constructor(...a){super(...(a.length?a:['2026-11-16T20:08:00']));}}
const users=[20,22].map(id=>({id,name:id===20?'Olga Zaporojan':'Eleonora',daily_work_hours:8,working_days:['lunedi','martedi','mercoledi','giovedi','venerdi']}));
function fixture(rows=[],tasks=[]) {
  const draft={tasks},appData={accounts:structuredClone(users),orderTasks:structuredClone(rows)};
  const events={};
  const c=vm.createContext({Date:Clock,window:{},appState:{selectedOrderId:1150},appData,
    orderDetailEditCurrentDraft:()=>draft,renderApp(){},attachEvents(){},document:{getElementById:()=>null,
      addEventListener:(name,fn)=>events[name]=fn,querySelector:()=>null,querySelectorAll:()=>[]}});
  vm.runInContext(fs.readFileSync('app-task-schedule-preview.js','utf8'),c);
  vm.runInContext(fs.readFileSync('app-task-deadline-capacity.js','utf8')
    .replace('function warningMarkup(','window.check=checkTask; window.warning=warningMarkup; function warningMarkup('),c);
  return {c,draft,events,check:t=>c.window.check(t)};
}
const task=(id,hours,time,extra={})=>({id,assignedUserId:20,hours,time,dueDate:time.slice(0,10),phase:'confezione',articleKey:'article-2',state:'Da avviare',...extra});
const old=[task(2901,8,'2026-10-26',{state:'In corso'}),task(2902,5.5,'2026-10-27 08:00'),task(2913,2.5,'2026-10-28')];
const candidate=task('new',5,'2026-11-17');
let f=fixture({1146:old.slice(0,2),1199:old.slice(2)},[candidate]);
const before=JSON.stringify({data:f.c.appData,draft:f.draft});
let r=f.check(candidate);
assert.equal(r.state,'ok');assert.equal(r.freeHours,8);assert.equal(r.firstDate,'2026-11-17');
assert.equal(r.segments[0].label,'08:00–13:00');assert.equal(r.overdueCount,3);assert.equal(r.overdueHours,16);
assert.match(f.c.window.warning(r,0),/task precedenti ancora aperte/);
assert.equal(JSON.stringify({data:f.c.appData,draft:f.draft}),before,'Read-only check never edits data or drafts');
// A past task whose actual calendar intervals spill into tomorrow DOES reserve time.
f=fixture({1:[task(1,12,'2026-11-16')]},[candidate]);r=f.check(candidate);
assert.equal(r.state,'error');assert.equal(r.freeHours,4);assert.equal(r.firstDate,'2026-11-18');
assert.equal(r.segments[0].label,'12:00–13:00 / 14:00–17:00');
// Fully booked day, true next slot; weekends are not available.
f=fixture({1:[task(1,8,'2026-11-17')]},[candidate]);r=f.check(candidate);
assert.equal(r.freeHours,0);assert.equal(r.firstDate,'2026-11-18');
f=fixture({1:[task(1,8,'2026-11-20')]},[task('new',1,'2026-11-20')]);
assert.equal(f.check(f.draft.tasks[0]).firstDate,'2026-11-23');
// Optional start time and lunch break are honored; 4.5h remain after 11:30.
let late=task('new',5,'2026-11-17',{plannedTime:'11:30'});f=fixture({},[late]);r=f.check(late);
assert.equal(r.state,'error');assert.equal(r.firstDate,'2026-11-18');assert.equal(r.segments[0].hours,4.5);
assert.equal(r.segments[0].label,'11:30–13:00 / 14:00–17:00');
f.events.click({target:{closest:()=>({dataset:{taskUseFirstDate:'0',firstDate:r.firstDate}})},preventDefault(){}});
assert.equal(late.time,'2026-11-17');assert.equal(late.plannedTime,'11:30');assert.equal(late.dueDate,'2026-11-18');
assert.equal(f.check(late).state,'ok','Accepting completion date must not postpone the original start again');
// Same-article predecessor delays even another operator; a different article does not.
const cut=task(2,8,'2026-11-17',{phase:'taglio',assignedUserId:22});
f=fixture({1150:[cut]},[cut,candidate]);r=f.check(candidate);
assert.equal(r.firstDate,'2026-11-18');
const other={...candidate,articleKey:'article-3'};f=fixture({1150:[cut]},[cut,other]);
assert.equal(f.check(other).firstDate,'2026-11-17');
// Stable numeric/client identity counts an edited saved row only once.
const saved=task(2918,5,'2026-11-18',{clientTaskKey:'stable'});
const edited=task(2918,5,'2026-11-17',{clientTaskKey:'stable'});
f=fixture({1150:[saved]},[edited]);r=f.check(edited);
assert.equal(r.state,'ok');assert.equal(r.freeHours,8);assert.equal(r.segments.length,1);
// Closed tasks aren't reported as arrears; inactive operators cannot be falsely green.
f=fixture({1:[task(1,8,'2026-10-26',{state:'Completato'})]},[candidate]);assert.equal(f.check(candidate).overdueCount,0);
f.c.appData.accounts[0].is_active=false;r=f.check(candidate);assert.equal(r.state,'error');assert.equal(r.firstDate,'');
assert.doesNotMatch(f.c.window.warning(r,0),/data-task-use-first-date/);
assert.match(fs.readFileSync('index.html','utf8'),/app-task-schedule-preview.js\?v=20261116-calendar-capacity-1/);
console.log('Olga 17 November, October arrears, true spillover/bookings, lunch/start times, phase dependencies, weekends, self identity and immutable data passed.');
