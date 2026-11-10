const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture(reply) {
  const calls = [], waits = [];
  let token = 'user-A';
  const window = { location: { origin: 'https://www.mmsgestionale.com' },
    mmsSupabaseAuth: { auth: { getSession: async () => ({data:{session:{access_token:token}}}) } },
    fetch: async (input, init) => { calls.push({input, init}); return reply(calls.length, input, init); } };
  const c = vm.createContext({window, URL, Headers, Request, Response, TypeError, DOMException,
    setTimeout(callback, delay) { waits.push(delay); return setTimeout(callback, 0); }, clearTimeout});
  vm.runInContext(fs.readFileSync('app-api-security.js', 'utf8'), c);
  return {window, calls, waits, token(value) { token = value; }};
}

test('Transient read errors retry once with authentication; simultaneous loads share one response', async () => {
  for (const path of ['/api/bootstrap', '/api/inventory', '/api/list-attachments?order_id=913']) {
    const f = fixture((attempt) => new Response(JSON.stringify({orders:[]}), {status:attempt === 1 ? 503 : 200}));
    const responses = await Promise.all([f.window.fetch(path), f.window.fetch(path), f.window.fetch(path)]);
    assert.equal(f.calls.length, 2);
    for (const r of responses) assert.deepEqual(await r.json(), {orders:[]}, 'Each consumer can read its own body');
    assert(f.calls.every(call => call.init.headers.get('Authorization') === 'Bearer user-A'));
    assert.equal(f.waits.length, 1);
    assert(f.waits[0] >= 350 && f.waits[0] < 700);
    await f.window.fetch(path);
    assert.equal(f.calls.length, 3, 'No stale response is cached after completion');
  }
});

test('Permanent 503 and network failures stop after one retry and unlock the next independent load', async () => {
  for (const network of [true, false]) {
    const f = fixture(() => { if (network) throw new TypeError('Network failed'); return new Response('', {status:503}); });
    if (network) await assert.rejects(f.window.fetch('/api/bootstrap'), /Network failed/);
    else assert.equal((await f.window.fetch('/api/bootstrap')).status, 503);
    assert.equal(f.calls.length, 2);
  }
});

test('Writes, auth failures, unrelated GETs and external URLs never retry', async () => {
  for (const [path, method, status] of [
    ['/api/inventory','POST',503], ['/api/bootstrap','PATCH',503], ['/api/auth-profile','POST',503],
    ['/api/sync-order-payments','POST',503], ['/api/update-attachment','POST',503],
    ['/api/bootstrap','GET',401], ['/api/bootstrap','GET',403], ['/api/bootstrap','GET',500],
    ['/api/accounts','GET',503], ['https://other.example/api/bootstrap','GET',503],
  ]) {
    const f = fixture(() => new Response('', {status}));
    assert.equal((await f.window.fetch(path, {method})).status, status);
    assert.equal(f.calls.length, 1, `${method} ${path} ${status}`);
  }
  const f = fixture(() => { throw new TypeError('lost write response'); });
  await assert.rejects(f.window.fetch('/api/inventory', {method:'POST'}));
  assert.equal(f.calls.length, 1);
});

test('Independent authorization, URLs, Request semantics and cancellation do not share data', async () => {
  const f = fixture((n, input, init) => new Response(JSON.stringify({token:init.headers.get('Authorization')})));
  const a = await f.window.fetch('/api/bootstrap', {headers:{Authorization:'Bearer explicit-A'}});
  const b = await f.window.fetch('/api/bootstrap', {headers:{Authorization:'Bearer explicit-B'}});
  assert.notDeepEqual(await a.json(), await b.json());
  assert.equal(f.calls.length, 2);
  const post = new Request('https://www.mmsgestionale.com/api/inventory', {method:'POST',body:'{}'});
  await f.window.fetch(post);
  assert.equal(f.calls.length, 3);
  const controller = new AbortController();
  const aborted = fixture(() => { controller.abort(); return new Response('', {status:503}); });
  await assert.rejects(aborted.window.fetch('/api/bootstrap', {signal:controller.signal}), {name:'AbortError'});
  assert.equal(aborted.calls.length, 1);
});

test('Calendar and account workspace do not request admin-only accounts for other profiles', async () => {
  const events = {};
  let requests = 0;
  const c = vm.createContext({console, setTimeout, appState:{}, appData:{accounts:[{id:22,name:'Operatrice',is_active:true}]},
    window:{mmsAuthProfile:null,addEventListener(name, callback){(events[name] ||= []).push(callback);}},
    document:{getElementById:()=>null}, renderApp(){}, attachEvents(){},
    fetch:async()=>{ requests++; return {ok:true,json:async()=>({accounts:[{id:22,name:'Operatrice',is_active:true}]})}; },
  });
  for (const path of ['app-accounts-workspace.js','app-calendar-production-fix.js']) vm.runInContext(fs.readFileSync(path,'utf8'), c);
  const flush = () => new Promise(resolve => setTimeout(resolve, 5));
  await flush();
  assert.equal(requests, 0, 'Unverified startup must not call account management');
  for (const access_profile of ['operator','commerce']) {
    c.window.mmsAuthProfile = {access_profile};
    events['mms-auth-profile'].forEach(fn => fn());
    await flush();
    assert.equal(requests, 0);
    assert.equal(c.window.getCalendarEmployees()[1], 'Operatrice', 'Authorized bootstrap roster stays usable');
  }
  c.window.mmsAuthProfile = {access_profile:'admin'};
  events['mms-auth-profile'].forEach(fn => fn());
  await flush();
  assert.equal(requests, 2, 'Both legitimate admin consumers still work');
});
