const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture() {
 const a={id:847,db_id:1100,sourceQuoteNumber:'P-0847',client:'Cliente'},b={id:848,db_id:1101,sourceQuoteNumber:'P-0848',client:'Altro'};
 const task=(id,extra={})=>({id,name:'Confezione',phase:'confezione',articleKey:'article-1',articleName:'Camicia',hours:'1 h',state:'Da avviare',...extra});
 const events={},requests=[],draft={materials:[{product_name:'Non perdere'}],tasks:[task('local')],notes:'Non perdere'};
 let refreshes=0,reject=false;
 const c=vm.createContext({window:{mmsAuthProfile:{access_profile:'admin'},confirm:()=>true},
  appState:{currentView:'calendar',selectedOrderId:999,orderDetailEdits:{999:draft}},
  appData:{orders:[a,b],accounts:[{id:20,name:'Olga',daily_work_hours:8},{id:22,name:'Eleonora',daily_work_hours:8}],
   orderTasks:{847:[task(1,{quantity:10,unitHours:7,hours:'70 h'}),task(2,{assignedUserId:20}),task(3,{state:'Completato'}),task('local-only')],
    848:[task(4,{external_supplier_name:'Laboratorio'}),task(5,{time:'2027-01-01'})]}},
  document:{querySelector:()=>null,addEventListener:(name,fn)=>events[name]=fn},renderApp(){},
  renderCalendar:()=>'<section><div class="surface calendar-weekly-surface">Board</div></section>',
  taskAssignmentOptionsMarkup:()=>'<option value="20">Olga</option>',setFlashMessage(){},
  refreshBootstrap:async()=>{refreshes++;},
  fetch:async(url,options)=>{requests.push(JSON.parse(options.body));await new Promise(setImmediate);
   return reject?{ok:false,status:409,json:async()=>({error:'Task già assegnata'})}:{ok:true,json:async()=>({id:requests.at(-1).task_id,assigned_user_id:20,external_supplier_name:null})};},
 });
 vm.runInContext(fs.readFileSync('app-task-schedule-preview.js','utf8'),c);
 vm.runInContext(fs.readFileSync('app-calendar-unassigned.js','utf8'),c);
 return {c,api:c.window.mmsUnassignedTasks,requests,events,draft,refreshes:()=>refreshes,reject:()=>reject=true};
}
(async()=>{
 const f=fixture(),{c,api}=f;
 assert.deepEqual(Array.from(api.rows(),r=>r.task.id),[1,5],'All dates, only saved unassigned noncompleted tasks');
 assert.match(c.renderCalendar(),/Task ancora da assegnare/);assert.match(c.renderCalendar(),/2027-01-01/);
 const row=api.rows().find(r=>r.task.id===1);
 const before=JSON.stringify(c.appData),result=api.preview(row,{assignedUserId:'20',date:'2026-11-17',time:'08:00'});
 assert.equal(result.segments.reduce((n,s)=>n+s.hours,0),70);assert.equal(result.segments.length,9);
 assert.match(result.message,/08:00–13:00 \/ 14:00–17:00/);assert.equal(JSON.stringify(c.appData),before);
 // Different operator's predecessor still gates the final control phase.
 c.appData.orderTasks[847]=[{id:10,assignedUserId:22,hours:'2 h',time:'2026-11-17',phase:'confezione',articleKey:'article-1'},
  {id:11,hours:'0,5 h',phase:'controllo',articleKey:'article-1',state:'Da avviare'}];
 const control=api.rows().find(r=>r.task.id===11),r=api.preview(control,{assignedUserId:'20',date:'2026-11-17',time:''});
 assert.equal(r.segments[0].label,'10:00–10:30');
 c.appData.orderTasks[847]=[row.task];
 const html=api.markup();assert.match(html,/70 h totali/);
 Object.assign(c.appState.calendarTaskQueue.drafts[1],{assignedUserId:'20',date:'2026-11-17',time:'08:00'});
 const draftBefore=JSON.stringify(f.draft),first=api.assign('1'),double=api.assign('1');
 await Promise.all([first,double]);assert.equal(f.requests.length,1);assert.equal(f.refreshes(),1);
 assert.equal(f.requests[0].only_if_unassigned,true);
 assert.equal(f.requests[0].planned_date,'2026-11-17 08:00');
 assert.equal(f.requests[0].calendar_day_label,"Martedi'");
 for(const key of ['estimated_hours','quantity','unit_hours','article_key','due_date','status'])assert.equal(key in f.requests[0],false,key+' must remain unchanged');
 assert.equal(row.task.hours,'70 h');assert.equal(row.task.quantity,10);assert.equal(JSON.stringify(f.draft),draftBefore);
 assert.equal(c.appState.selectedOrderId,999);assert(!api.rows().some(r=>r.task.id===1));
 const denied=fixture();denied.c.window.mmsAuthProfile.access_profile='operator';
 assert.equal(denied.api.markup(),'');await denied.api.assign('1');assert.equal(denied.requests.length,0);
 const conflict=fixture();conflict.api.markup();
 Object.assign(conflict.c.appState.calendarTaskQueue.drafts[1],{assignedUserId:'20',date:'2026-11-17',time:''});
 conflict.reject();await assert.rejects(conflict.api.assign('1'),/già assegnata/);
 assert(!conflict.c.appData.orderTasks[847][0].assignedUserId);assert.equal(conflict.c.appState.calendarTaskQueue.drafts[1].assignedUserId,'20');
 c.appData.orders[1].client='<img src=x onerror=alert(1)>';assert.doesNotMatch(api.markup(),/<img/);
 console.log('Unassigned calendar: all dates, stable IDs, privileges, 70-hour and cross-operator schedules, minimal assignment payload, double clicks, conflicts, escaping and unsaved draft preservation passed.');
})().catch(e=>{console.error(e);process.exit(1);});
