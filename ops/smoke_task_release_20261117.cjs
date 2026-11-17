// Read-only public smoke checks. API calls have no credentials and must be denied.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),util=require('util');
const exec=util.promisify(cp.execFile);
const files=['index.html','app-task-quantity.js','app-task-quantity-controls.js','app-order-material-articles.js',
  'app-calendar-unassigned.js','app-order-inventory-link-fix.js','app-order-material-row-picker.js','app-production-task-planner.js','app-live-sync.js'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function request(path,args=[]) {
  const r=await exec('curl',['-sS','--location','--max-time','20',...args,'-w','\n%{http_code}',
    'https://www.mmsgestionale.com/'+path],{maxBuffer:2e6});
  const at=r.stdout.lastIndexOf('\n');return {status:Number(r.stdout.slice(at+1)),body:r.stdout.slice(0,at)};
}
(async()=>{
  const results=await Promise.all(files.map(async path=>{
    const r=await request(path==='index.html'?'':path+'?v=20261117-release-verification');
    return {path,status:r.status,exactHashMatch:hash(r.body)===hash(fs.readFileSync(path)),hash:hash(r.body)};
  }));
  const checks=await Promise.all([
    ['api/bootstrap',[]],
    ['api/assign-task',['-X','PATCH','-H','Content-Type: application/json','--data','{}']],
    ['api/save-materials',['-X','POST','-H','Content-Type: application/json','--data','{}']],
  ].map(async([path,args])=>{const r=await request(path,args);return {path,status:r.status};}));
  process.stdout.write(JSON.stringify({files:results,unauthenticated:checks}));
  if(results.some(r=>r.status!==200||!r.exactHashMatch)||checks.some(r=>r.status!==401&&r.status!==403))process.exitCode=1;
})().catch(e=>{process.stderr.write(e.message);process.exitCode=1;});
