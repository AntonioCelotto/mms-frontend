// Task.hours remains the TOTAL consumed by every calendar and report.
function taskQuantityValues(task) {
  const number=value=>Number(String(value ?? '').replace(/\s*h\s*$/i,'').replace(',','.').trim());
  const quantity=number(task.quantity ?? 1);
  const raw=task.unitHours ?? task.unit_hours ?? task.hours ?? task.estimated_hours;
  const unitHours=raw === undefined || raw === null || String(raw).trim()==='' ? NaN : number(raw);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!Number.isFinite(unitHours)||unitHours<0||unitHours>1000000
    ||quantity*unitHours>1000000000) throw new Error('Inserisci una quantità intera positiva e ore per pezzo valide.');
  return {quantity,unitHours,totalHours:Math.round(quantity*unitHours*1000000)/1000000};
}

function taskQuantityApply(task) {
  const values=taskQuantityValues(task);
  task.quantity=values.quantity;task.unitHours=values.unitHours;task.hours=String(values.totalHours);
  return values;
}

function taskQuantityValidateDraft(draft) {
  for(const task of draft?.tasks || []) taskQuantityApply(task);
}
