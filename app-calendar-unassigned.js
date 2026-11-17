(function () {
  const text=value=>String(value??'').trim();
  const esc=value=>text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const num=value=>{const n=Number(text(value).replace(/\s*h\s*$/i,'').replace(',','.'));return Number.isFinite(n)?n:0;};
  const rank={cartamodello:1,taglio:2,confezione:3,controllo:4};
  function canAssign() {
    const p=window.mmsAuthProfile || {};
    return ['admin','amministratore'].includes(text(p.access_profile || p.profile || p.role).toLowerCase());
  }
  function state() {return appState.calendarTaskQueue ||= {query:'',page:0,drafts:{},pending:{},error:''};}
  function allRows() {
    const seen=new Set(),rows=[];
    for(const [orderId,tasks] of Object.entries(appData.orderTasks || {})) {
      const order=(appData.orders || []).find(order=>String(order.id)===String(orderId));
      if(!order)continue;
      for(const task of Array.isArray(tasks)?tasks:[]) {
        if(!/^\d+$/.test(text(task.id)) || Number(task.id)<=0 || seen.has(String(task.id)))continue;
        seen.add(String(task.id));rows.push({task,order,orderId});
      }
    }
    return rows;
  }
  function rows() {
    return allRows().filter(({task:t})=>!t.assignedUserId && !t.assigned_user_id && !text(t.externalSupplierName || t.external_supplier_name)
      && !/(complet|annull|cancel)/i.test(text(t.state || t.status)))
      .sort((a,b)=>text(a.task.dueDate || a.task.due_date || '9999').localeCompare(text(b.task.dueDate || b.task.due_date || '9999'))
        || Number(a.orderId)-Number(b.orderId) || (rank[a.task.phase || a.task.task_phase]||99)-(rank[b.task.phase || b.task.task_phase]||99)
        || Number(a.task.id)-Number(b.task.id));
  }
  function draftFor(row) {
    const t=row.task,raw=text(t.time || t.planned_date);
    return state().drafts[t.id] ||= {assignedUserId:'',date:raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
      time:t.plannedTime || raw.match(/[ T](\d{2}:\d{2})/)?.[1] || ''};
  }
  function preview(row,draft) {
    if(!draft.assignedUserId || !draft.date)return {message:'Scegli operatrice e data per vedere gli orari previsti.'};
    if(!window.mmsTaskSchedulePreview)return {message:'Anteprima orari non disponibile: aggiorna la pagina.'};
    const adapted=allRows().map(item=>{
      const t=item.task,candidate=String(t.id)===String(row.task.id),raw=text(t.time || t.planned_date);
      const date=candidate?draft.date:raw.slice(0,10),time=candidate?draft.time:(t.plannedTime || raw.match(/[ T](\d{2}:\d{2})/)?.[1] || '');
      const assignee=candidate?draft.assignedUserId:(t.assignedUserId || t.assigned_user_id || '');
      const external=String(assignee).startsWith('external:')?decodeURIComponent(assignee.slice(9)):(t.externalSupplierName || t.external_supplier_name || '');
      return {id:Number(t.id),order_id:item.order.db_id || item.order.internal_id || item.orderId,
        article_key:t.articleKey || t.article_key || '',task_phase:t.phase || t.task_phase || 'altro',sequence_order:t.sequenceOrder || t.sequence_order || 99,
        assigned_user_id:external?null:assignee,external_supplier_name:external,estimated_hours:num(t.hours ?? t.estimated_hours),
        actual_hours:num(t.actualHours ?? t.actual_hours),status:text(t.state || t.status).toLowerCase().replace(/\s+/g,'_'),
        planned_date:/^\d{4}-\d{2}-\d{2}$/.test(date)?[date,time].filter(Boolean).join(' '):'',due_date:t.dueDate || t.due_date || ''};
    });
    const people=(appData.accounts || []).map(p=>({...p,daily_work_hours:p.daily_work_hours || p.dailyWorkHours,working_days:p.working_days || p.workingDays}));
    const segments=window.mmsTaskSchedulePreview.schedule(adapted,people)[Number(row.task.id)] || [];
    if(!segments.length)return {message:'Orario non calcolabile: controlla durata, operatrice e fasi precedenti nell’ordine.'};
    const first=segments[0],last=segments.at(-1),due=text(row.task.dueDate || row.task.due_date);
    return {segments,late:!!due && last.date>due,message:first.date===last.date?`${first.date}: ${first.label}`:
      `Dal ${first.date} (${first.label}) al ${last.date} (${last.label})`};
  }
  function previewMarkup(r) {return esc(r.message)+(r.late?'<br><strong>La fine prevista supera la consegna della task.</strong>':'');}
  function orderNumber(row) {return row.order.sourceQuoteNumber || row.order.source_quote_number || row.order.order_number || row.orderId;}
  function markup() {
    if(!canAssign())return '';
    const all=rows(),query=state().query.toLowerCase(),filtered=all.filter(row=>
      [orderNumber(row),`P-${String(orderNumber(row)).padStart(4,'0')}`,row.order.client,row.task.name,row.task.phase,row.task.articleName,row.task.article_name].join(' ').toLowerCase().includes(query));
    state().page=Math.max(0,Math.min(state().page || 0,Math.max(0,Math.ceil(filtered.length/50)-1)));
    const visible=filtered.slice(state().page*50,state().page*50+50);
    return `<div class="surface" data-unassigned-queue><div class="surface-inner"><div class="section-title"><div><h3>Task ancora da assegnare</h3>`+
      `<p>Tutti gli ordini, anche fuori dalla settimana visualizzata. L’assegnazione mantiene articolo, quantità, durata e consegna.</p></div><span class="ghost-pill">${all.length} da assegnare</span></div>`+
      `<input class="filter-chip" data-task-queue-query value="${esc(state().query)}" placeholder="Cerca ordine, cliente, articolo o fase" />`+
      `<p>${filtered.length} risultati · pagina ${state().page+1} di ${Math.max(1,Math.ceil(filtered.length/50))} <button class="mini-btn" type="button" data-task-queue-page="-1" ${state().page?'':'disabled'}>Precedenti</button> <button class="mini-btn" type="button" data-task-queue-page="1" ${(state().page+1)*50<filtered.length?'':'disabled'}>Successive</button></p>`+
      (state().error?`<p role="alert">${esc(state().error)}</p>`:'')+
      `<div style="overflow-x:auto"><table><thead><tr><th>Ordine / articolo</th><th>Task e durata</th><th>Operatrice</th><th>Data inizio / ora facoltativa</th><th>Orari previsti</th><th></th></tr></thead><tbody>`+
      visible.map(row=>{
        const t=row.task,d=draftFor(row),busy=state().pending[t.id]?'disabled':'';
        const options=typeof taskAssignmentOptionsMarkup==='function'?taskAssignmentOptionsMarkup(t.phase || t.task_phase,d.assignedUserId):'<option value="">Operatori non disponibili</option>';
        const field=(name,type,value)=>`<input aria-label="${name} task ${esc(t.id)}" class="field-value" type="${type}" data-task-queue-id="${esc(t.id)}" data-task-queue-field="${name}" value="${esc(value)}" ${busy}/>`;
        return `<tr><td><strong>${esc(orderNumber(row))}</strong> · ${esc(row.order.client)}<br>${esc(t.articleName || t.article_name || 'Articolo da collegare')}</td>`+
          `<td>${esc(t.name || t.task_name || t.phase)}<br>${num(t.hours ?? t.estimated_hours)} h totali${t.quantity?` · ${esc(t.quantity)} pezzi`:''}<br>Consegna: ${esc(t.dueDate || t.due_date || 'Da definire')}</td>`+
          `<td><select aria-label="Operatrice task ${esc(t.id)}" class="filter-chip" data-task-queue-id="${esc(t.id)}" data-task-queue-field="assignedUserId" ${busy}>${options}</select></td>`+
          `<td>${field('date','date',d.date)}${field('time','time',d.time)}</td><td data-task-queue-preview="${esc(t.id)}">${previewMarkup(preview(row,d))}</td>`+
          `<td><button class="mini-btn" type="button" data-task-queue-assign="${esc(t.id)}" ${busy}>${busy?'Salvataggio…':'Assegna'}</button></td></tr>`;
      }).join('')+(!visible.length?'<tr><td colspan="6">Nessuna task da assegnare per questa ricerca.</td></tr>':'')+'</tbody></table></div></div></div>';
  }
  async function assign(id) {
    if(!canAssign() || state().pending[id])return;
    const row=rows().find(row=>String(row.task.id)===String(id));
    if(!row)throw new Error('Task non più disponibile: aggiorna l’elenco.');
    const d={...draftFor(row)};
    if(!d.assignedUserId || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || (d.time && !/^\d{2}:\d{2}$/.test(d.time)))throw new Error('Seleziona operatrice e data di inizio.');
    const result=preview(row,d);
    if(!result.segments?.length)throw new Error(result.message);
    if(result.late && !window.confirm(`${result.message}. La fine supera la consegna indicata. Confermi l’assegnazione?`))return;
    state().pending[id]=true;state().error='';renderApp();
    try {
      const external=d.assignedUserId.startsWith('external:');
      const response=await fetch('/api/assign-task',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        task_id:Number(id),only_if_unassigned:true,assigned_user_id:external?null:Number(d.assignedUserId),
        external_supplier_name:external?decodeURIComponent(d.assignedUserId.slice(9)):null,planned_date:[d.date,d.time].filter(Boolean).join(' '),
        calendar_day_label:["Domenica","Lunedi'","Martedi'","Mercoledi'","Giovedi'","Venerdi'","Sabato"][new Date(`${d.date}T12:00:00`).getDay()],
      })});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) {
        if(response.status===409 && typeof refreshBootstrap==='function')await refreshBootstrap().catch(()=>{});
        throw new Error(payload.error || payload.detail || 'Assegnazione non salvata');
      }
      if(Number(payload.id)!==Number(id))throw new Error('Il server non ha confermato questa task.');
      const person=(appData.accounts || []).find(p=>String(p.id)===d.assignedUserId);
      Object.assign(row.task,{assignedUserId:external?'':Number(d.assignedUserId),assigned_user_id:payload.assigned_user_id,
        externalSupplierName:payload.external_supplier_name || '',external_supplier_name:payload.external_supplier_name || '',
        team:external?decodeURIComponent(d.assignedUserId.slice(9)):(person?.name || d.assignedUserId),time:d.date,plannedTime:d.time});
      delete state().drafts[id];
      if(typeof refreshBootstrap==='function')await refreshBootstrap().catch(()=>{state().error='Assegnazione salvata. Aggiornamento calendario non riuscito: riprova l’aggiornamento, non l’assegnazione.';});
      if(typeof setFlashMessage==='function')setFlashMessage(state().error || 'Task assegnata: calendario aggiornato');
    } finally {delete state().pending[id];renderApp();}
  }
  window.mmsUnassignedTasks={rows,preview,assign,markup};
  if(typeof renderCalendar==='function') {
    const base=renderCalendar;
    renderCalendar=function renderCalendarWithQueue() {
      const html=base(),queue=markup();
      return queue?html.replace(/(<div class="surface calendar-weekly-surface">)/,queue+'$1'):html;
    };
  }
  function handleField(event) {
    const target=event.target;
    if(target.matches?.('[data-task-queue-query]')){state().query=target.value;state().page=0;if(event.type!=='input')renderApp();return;}
    if(!target.matches?.('[data-task-queue-field]') || !canAssign())return;
    const row=rows().find(row=>String(row.task.id)===target.dataset.taskQueueId);
    if(!row || !['assignedUserId','date','time'].includes(target.dataset.taskQueueField))return;
    const draft=draftFor(row);draft[target.dataset.taskQueueField]=target.value;
    const output=document.querySelector(`[data-task-queue-preview="${Number(row.task.id)}"]`);
    if(output)output.innerHTML=previewMarkup(preview(row,draft));
  }
  document.addEventListener('input',handleField);
  document.addEventListener('change',handleField);
  document.addEventListener('click',event=>{
    const page=event.target.closest?.('[data-task-queue-page]');
    if(page){event.preventDefault();state().page=Math.max(0,(state().page||0)+Number(page.dataset.taskQueuePage));renderApp();return;}
    const button=event.target.closest?.('[data-task-queue-assign]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    assign(button.dataset.taskQueueAssign).catch(error=>{state().error=error.message;renderApp();});
  });
})();
