const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{},appState:{},appData:{},renderApp(){},attachEvents(){},document:{getElementById:()=>null,addEventListener(){}}});
vm.runInContext(fs.readFileSync('app-task-quantity.js','utf8'),c);
const task={id:4000,quantity:10,unitHours:7,hours:'70'};
for(let n=0;n<4;n++) {assert.equal(c.taskQuantityApply(task).totalHours,70);assert.equal(task.hours,'70');}
assert.equal(c.taskQuantityApply({hours:'7,25 h'}).totalHours,7.25,'Legacy task = quantity 1, unchanged exact total');
for(const [quantity,unitHours] of [[0,7],[1.5,7],[10,NaN],[10,''],[10,-1],[1000000,1000000]])
  assert.throws(()=>c.taskQuantityApply({quantity,unitHours}));
vm.runInContext(fs.readFileSync('app-order-task-sync-v2.js','utf8'),c);
const canonical=c.taskSyncTaskFromDraft(task,0,1150),draft=c.taskSyncDraftFromTask(canonical,0,1150);
assert.equal(draft.quantity,10);assert.equal(draft.unitHours,7);assert.equal(draft.hours,'70');
// Execute the actual capture handler: it must update the total despite legacy event interception.
const output={textContent:''};c.document.querySelector=()=>output;
c.orderDetailEditCurrentDraft=()=>({tasks:[draft]});
vm.runInContext(fs.readFileSync('app-order-detail-edit.js','utf8').match(/function orderDetailEditHandleField\(target\) \{[\s\S]*?\n\}/)[0],c);
const input={dataset:{orderDetailTaskIndex:'0',orderDetailTaskField:'unitHours'},value:'8',matches:s=>s==='[data-order-detail-task-field]'};
c.orderDetailEditHandleField(input);assert.equal(draft.hours,'80');assert.equal(output.textContent,'80 h');
input.dataset.orderDetailTaskField='quantity';input.value='5';c.orderDetailEditHandleField(input);
assert.equal(draft.hours,'40');assert.equal(output.textContent,'40 h');
// Shape after a detail reload preserves metadata instead of turning 10 x 7 into 10 x 70.
vm.runInContext(fs.readFileSync('app-order-completion-fix-v2.js','utf8').match(/function orderFlowTaskShape\(task\) \{[\s\S]*?\n\}/)[0],c);
const reloaded=c.orderFlowTaskShape({id:4000,estimated_hours:70,quantity:10,unit_hours:7});
assert.equal(c.taskQuantityApply(reloaded).totalHours,70);
const legacy=c.orderFlowTaskShape({id:1,estimated_hours:7.25});assert.equal(c.taskQuantityApply(legacy).totalHours,7.25);
// Invalid drafts must stop before any order, payment or task save starts.
let saves=0;c.orderDetailEditSave=()=>saves++;c.setFlashMessage=()=>{};
c.orderDetailEditCurrentDraft=()=>({tasks:[{quantity:0,unitHours:7}]});
vm.runInContext(fs.readFileSync('app-task-quantity-controls.js','utf8'),c);
(async()=>{await assert.rejects(c.orderDetailEditSave());assert.equal(saves,0);
console.log('Task quantity: 10 x 7 = 70, repeated roundtrips, legacy precision, capture events, metadata reload and pre-save validation passed.');})().catch(e=>{console.error(e);process.exit(1);});
