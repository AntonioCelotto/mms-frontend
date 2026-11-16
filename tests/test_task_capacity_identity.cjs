const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const key = 'local-task-1146-manual-test';
const draft = {tasks:[{id:key,clientTaskKey:key,assignedUserId:20,hours:'8',time:'2026-10-27'}]};
class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-26T08:00:00'])); } }
const c = vm.createContext({Date:Clock,window:{},appState:{},appData:{accounts:[{id:20,name:'Test'}],
  orderTasks:{1146:[{id:2901,clientTaskKey:key,assignedUserId:20,hours:'8',time:'2026-10-27'}]}},
  orderDetailEditCurrentDraft:()=>draft,renderApp(){},attachEvents(){},document:{getElementById:()=>null,addEventListener(){}}});
const source = fs.readFileSync('app-task-deadline-capacity.js','utf8')
  .replace('function warningMarkup(', 'window.checkTaskForTest = checkTask; function warningMarkup(');
vm.runInContext(fs.readFileSync('app-task-schedule-preview.js','utf8'),c);
vm.runInContext(source,c);
const result = c.window.checkTaskForTest({id:'new',assignedUserId:20,hours:8,time:'2026-10-27'});
assert.equal(result.freeHours,0,'The existing 8 hours occupy the requested day once');
assert.equal(result.firstDate,'2026-10-28','One stored task + draft delays by one working day, not two');
assert.equal(result.state,'error');
const own = c.window.checkTaskForTest(draft.tasks[0]);
assert.equal(own.freeHours,8,'The task being edited must not count against itself');
assert.equal(own.state,'ok');
console.log('Capacity counts a task once by stable key and excludes itself.');
