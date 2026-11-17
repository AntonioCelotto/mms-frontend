// Optional isolated PostgreSQL/WASM test: never connects to Supabase.
// MMS_PGLITE_MODULE points to a locally installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.MMS_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
await db.exec('create schema private; create role anon; create role authenticated; create table public.order_tasks(id integer primary key,estimated_hours numeric); insert into public.order_tasks values(1,8),(2,7.25);');
await db.exec(fs.readFileSync('supabase/migrations/20261117113529_task_quantity_unit_hours.sql','utf8'));
let rows=(await db.query('select * from public.order_tasks order by id')).rows;
assert.deepEqual(rows.map(x=>Number(x.estimated_hours)),[8,7.25]);
assert(rows.every(x=>x.quantity===1&&x.unit_hours===null));
await db.exec('insert into public.order_tasks(id,quantity,unit_hours,estimated_hours) values(3,10,7,999)');
assert.equal(Number((await db.query('select estimated_hours from public.order_tasks where id=3')).rows[0].estimated_hours),70);
await db.exec('update public.order_tasks set quantity=20 where id=3');
assert.equal(Number((await db.query('select estimated_hours from public.order_tasks where id=3')).rows[0].estimated_hours),140);
await assert.rejects(db.exec('update public.order_tasks set estimated_hours=999 where id=3'),/Aggiorna la pagina/);
await db.exec('update public.order_tasks set estimated_hours=9 where id=1');
assert.equal(Number((await db.query('select estimated_hours from public.order_tasks where id=1')).rows[0].estimated_hours),9);
await db.exec('update public.order_tasks set quantity=10,unit_hours=7.5,estimated_hours=75 where id=3');
assert.equal(Number((await db.query('select estimated_hours from public.order_tasks where id=3')).rows[0].estimated_hours),75);
for(const [q,u] of [[0,'7'],[-1,'7'],[2,'null'],[2,"'NaN'"],[1000000,'1000000']]) {
  await assert.rejects(db.exec(`insert into public.order_tasks(id,quantity,unit_hours) values(99,${q},${u})`));
}
await db.exec('insert into public.order_tasks(id,quantity,unit_hours) values(4,10,0)');
assert.equal(Number((await db.query('select estimated_hours from public.order_tasks where id=4')).rows[0].estimated_hours),0);
assert.equal((await db.query("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='mms_task_quantity_total'")).rows[0].prosecdef,false);
await db.close();
console.log('Isolated PostgreSQL migration: historical totals preserved; quantity calculation, edits, old-client guard, invalid values, zero and invoker security passed.');
