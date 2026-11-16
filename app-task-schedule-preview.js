// Read-only mirror of api/_task_schedule.py. Keep parity tests before changes.
(function (root) {
  const DAYS = ['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
  const DEFAULT_DAYS = DAYS.slice(1,6);
  const WINDOWS = [[480,780],[840,1020]];
  const PHASES = ['cartamodello','taglio','confezione','controllo'];
  const minutes = value => { const n=Number(value); return Number.isFinite(n)&&n>0 ? Math.round(n*60) : 0; };
  const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  function parse(value) {
    const m=String(value||'').trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    const d=new Date(m[1]+'T12:00:00'), h=Number(m[2]||8), min=Number(m[3]||0);
    if (!Number.isFinite(d.getTime()) || iso(d)!==m[1] || h>23 || min>59) return null;
    return {date:m[1],minute:h*60+min};
  }
  function iso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function next(day) { const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+1);return iso(d); }
  const compareStart=(a,b)=>a.date.localeCompare(b.date)||a.minute-b.minute;
  function workDays(account) {
    const raw=account.working_days;
    const days=(Array.isArray(raw)?raw:String(raw||'').split(',')).map(x=>String(x).trim().toLowerCase()).filter(Boolean);
    return new Set(days.length?days:DEFAULT_DAYS);
  }
  function allocate(start,duration,account,key,busy) {
    const days=workDays(account),limit=Math.min(480,minutes(account.daily_work_hours)||480);
    let remaining=duration,day=start.date;
    const intervals=[];
    for(let guard=0;guard<366 && remaining;guard++,day=next(day)) {
      if(!days.has(DAYS[new Date(day+'T12:00:00').getDay()])) continue;
      const dayKey=key+'|'+day,reservations=busy.get(dayKey)||[];busy.set(dayKey,reservations);
      let available=Math.max(0,limit-reservations.reduce((n,[a,b])=>n+b-a,0));
      for(const [begin,end] of WINDOWS) {
        let cursor=Math.max(begin,day===start.date?start.minute:begin);
        while(cursor<end && available>0 && remaining>0) {
          const overlap=[...reservations].sort((a,b)=>a[0]-b[0]||a[1]-b[1]).find(([a,b])=>b>cursor && a<end);
          if(overlap && overlap[0]<=cursor) {cursor=overlap[1];continue;}
          const length=Math.min(remaining,available,(overlap?Math.min(end,overlap[0]):end)-cursor);
          if(length<=0) break;
          reservations.push([cursor,cursor+length]);intervals.push([day,cursor,cursor+length]);
          remaining-=length;available-=length;cursor+=length;
        }
        if(!remaining) break;
      }
    }
    if(remaining) {
      for(const [date,a,b] of intervals) {
        const list=busy.get(key+'|'+date),index=list.findIndex(([x,y])=>x===a&&y===b);list.splice(index,1);
      }
      return {segments:[],end:null};
    }
    const grouped=new Map();
    for(const [date,a,b] of intervals) {if(!grouped.has(date))grouped.set(date,[]);grouped.get(date).push([a,b]);}
    const segments=[...grouped].map(([date,slots])=>({date,hours:Math.round(slots.reduce((n,[a,b])=>n+b-a,0)/60*100)/100,
      label:slots.map(([a,b])=>clock(a)+'–'+clock(b)).join(' / ')}));
    const last=intervals[intervals.length-1];
    return {segments,end:{date:last[0],minute:last[2]}};
  }
  function schedule(tasks,users) {
    const accounts=new Map(users.map(x=>[String(x.id),x])),chains=new Map(),busy=new Map(),result={};
    const phaseRank=row=>{const p=String(row.task_phase||'').trim().toLowerCase().replace(/_/g,' '),i=PHASES.findIndex(x=>p.includes(x));return i<0?PHASES.length:i;};
    const duration=row=>minutes(row.status==='completato'&&row.actual_hours?row.actual_hours:row.estimated_hours);
    for(const row of tasks) {
      const person=accounts.get(String(row.assigned_user_id))||{};
      if(row.assigned_user_id && person.is_active===false)continue;
      const requested=parse(row.planned_date||row.due_date);
      const supplier=String(row.external_supplier_name||'').trim().toLowerCase();
      const key=row.assigned_user_id?'user:'+row.assigned_user_id:supplier?'external:'+supplier:null;
      if(!requested||!key||!duration(row))continue;
      const chain=JSON.stringify([row.order_id,String(row.article_key||'').trim()]);
      if(!chains.has(chain))chains.set(chain,[]);
      chains.get(chain).push({row,requested,person,key});
    }
    const ready=[];
    function enqueue(chain,index,previousEnd) {
      const entry=chains.get(chain)[index],earliest=previousEnd&&compareStart(previousEnd,entry.requested)>0?previousEnd:entry.requested;
      ready.push({chain,index,earliest,due:String(entry.row.due_date||'9999-12-31').slice(0,10),entry});
    }
    for(const [chain,entries] of chains) {
      entries.sort((a,b)=>phaseRank(a.row)-phaseRank(b.row)||Number(a.row.sequence_order||99)-Number(b.row.sequence_order||99)
        ||compareStart(a.requested,b.requested)||Number(a.row.id)-Number(b.row.id));
      enqueue(chain,0);
    }
    while(ready.length) {
      ready.sort((a,b)=>compareStart(a.earliest,b.earliest)||a.due.localeCompare(b.due)
        ||String(a.entry.row.order_id).localeCompare(String(b.entry.row.order_id))
        ||String(a.entry.row.article_key||'').localeCompare(String(b.entry.row.article_key||''))||Number(a.entry.row.id)-Number(b.entry.row.id));
      const {chain,index,earliest,entry}=ready.shift();
      const scheduled=allocate(earliest,duration(entry.row),entry.person,entry.key,busy);
      result[entry.row.id]=scheduled.segments;
      if(scheduled.end && index+1<chains.get(chain).length)enqueue(chain,index+1,scheduled.end);
    }
    return result;
  }
  root.mmsTaskSchedulePreview={schedule,parse,workDays};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.mmsTaskSchedulePreview;
})(typeof window!=='undefined'?window:globalThis);
