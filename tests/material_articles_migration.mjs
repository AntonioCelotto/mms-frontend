// Isolated PostgreSQL/WASM only. No network or production credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.MMS_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create schema private; create role anon; create role authenticated;
create table orders(id bigint primary key,source_quote_payload jsonb);
create table inventory_items(id bigint primary key,sku text,available_quantity numeric,reserved_quantity numeric,unit text,updated_at timestamptz);
create table order_materials(id bigint generated always as identity primary key,order_id bigint,inventory_item_id bigint,
 product_name text,source_type text,delivery_status text,warehouse_status_note text,preorder_note text,quantity_required numeric,
 notes text,reserved_quantity numeric,missing_quantity numeric);
create table inventory_shortages(id bigint generated always as identity,order_id bigint,inventory_item_id bigint,product_name text,
 quantity_required numeric,quantity_reserved numeric,quantity_missing numeric,unit text,status text,notes text);
insert into orders values(1,'{"articles":[{"id":"shirt","name":"Camicia"},{"code":"trousers","name":"Pantalone"}]}'),
 (2,'{"articles":[{"name":"Altro"}]}');
insert into inventory_items values(1,'FABRIC',10,6,'m',null),(2,'BUTTON',100,0,'pz',null);
insert into order_materials(order_id,inventory_item_id,product_name,quantity_required,reserved_quantity,missing_quantity)
 values(2,1,'Tessuto altro ordine',6,6,0);
create function public.replace_order_materials_atomic(bigint,jsonb) returns integer language sql as 'select 0';
revoke all on function public.replace_order_materials_atomic(bigint,jsonb) from public;
grant execute on function public.replace_order_materials_atomic(bigint,jsonb) to authenticated;`);
const old=(await db.query('select * from order_materials')).rows;
const acl=(await db.query("select proacl from pg_proc where proname='replace_order_materials_atomic'")).rows[0].proacl;
await db.exec(fs.readFileSync('supabase/migrations/20261117115412_order_material_articles.sql','utf8'));
const historical=(await db.query('select * from order_materials')).rows[0];
assert.equal(historical.article_key,null);assert.equal(historical.article_name,null);
delete historical.article_key;delete historical.article_name;assert.deepEqual(historical,old[0]);
assert.deepEqual((await db.query("select proacl from pg_proc where proname='replace_order_materials_atomic'")).rows[0].proacl,acl);
const material=(article,qty,extra={})=>({product_name:'Tessuto',source_type:'mms',inventory_item_id:1,quantity_required:qty,article_key:article,article_name:'UNTRUSTED',...extra});
const replace=items=>db.query('select public.replace_order_materials_atomic($1,$2::jsonb) as saved',[1,JSON.stringify(items)]);
const snapshot=async()=>({materials:(await db.query('select * from order_materials order by id')).rows,
 inventory:(await db.query('select * from inventory_items order by id')).rows,shortages:(await db.query('select * from inventory_shortages order by id')).rows});
assert.equal((await replace([material('shirt','3'),material('trousers','3')])).rows[0].saved,2);
let rows=(await db.query('select * from order_materials where order_id=1 order by id')).rows;
assert.deepEqual(rows.map(r=>[r.article_key,r.article_name,Number(r.reserved_quantity),Number(r.missing_quantity)]),
 [['shirt','Camicia',3,0],['trousers','Pantalone',1,2]]);
assert.equal(Number((await db.query('select reserved_quantity from inventory_items where id=1')).rows[0].reserved_quantity),10);
await replace([material('shirt','3'),material('trousers','3')]);
assert.equal(Number((await db.query('select reserved_quantity from inventory_items where id=1')).rows[0].reserved_quantity),10,'Repeated save does not duplicate reservations');
await replace([material('shirt','2,5'),material('trousers','1')]);
assert.equal(Number((await db.query('select reserved_quantity from inventory_items where id=1')).rows[0].reserved_quantity),9.5);
const before=await snapshot();
await assert.rejects(replace([material('foreign-article',4)]),/non presente/);
assert.deepEqual(await snapshot(),before,'A failed link rolls back released stock and deleted rows');
await assert.rejects(replace([{product_name:'Tessuto',quantity_required:2,inventory_item_id:1,source_type:'mms'}]),/Aggiorna la pagina/);
for(const qty of [0,-1,'NaN','Infinity'])await assert.rejects(replace([material('shirt',qty)]),/non valida/);
assert.deepEqual(await snapshot(),before);
await replace([material('shirt',5,{source_type:'cliente',inventory_item_id:null})]);
assert.equal(Number((await db.query('select reserved_quantity from inventory_items where id=1')).rows[0].reserved_quantity),6,'Customer material does not reserve MMS stock');
assert.equal((await db.query('select article_name from order_materials where order_id=1')).rows[0].article_name,'Camicia');
await assert.rejects(db.exec("insert into order_materials(order_id,article_key) values(2,'shirt')"),/non presente/);
await db.exec(`create trigger isolated_after_order_insert after insert on orders for each row execute function public.reserve_order_materials_on_insert();
insert into orders values(3,'{"articles":[{"name":"Giacca","materials":[{"name":"Bottone","inventory_item_id":2,"quantity":3}]}]}');`);
const converted=(await db.query('select * from order_materials where order_id=3')).rows[0];
assert.equal(converted.article_key,'article-1');assert.equal(converted.article_name,'Giacca');assert.equal(Number(converted.reserved_quantity),3);
// Invoker stays invoker and continues obeying existing table RLS.
assert((await db.query("select prosecdef from pg_proc where proname in ('replace_order_materials_atomic','mms_material_article_link')")).rows.every(r=>!r.prosecdef));
await db.exec(`alter table orders enable row level security;
create policy isolated_order on orders to authenticated using(id=1) with check(id=1);
grant select,update on orders to authenticated;
grant select,insert,update,delete on order_materials,inventory_items,inventory_shortages to authenticated;
grant usage,select on all sequences in schema public to authenticated;
set role authenticated;`);
assert.equal((await db.query('select public.replace_order_materials_atomic(1,$1::jsonb) as saved',[JSON.stringify([material('shirt',2)])])).rows[0].saved,1,'Authorized invoker can run private validation trigger');
await assert.rejects(db.query('select public.replace_order_materials_atomic(2,$1::jsonb)',[JSON.stringify([])]),/Ordine non trovato/);
await db.exec('reset role');
// Database-level compare-and-set used by the unassigned-task API.
await db.exec(`create table order_tasks(id integer primary key,assigned_user_id bigint,external_supplier_name text,status text,
 updated_at timestamptz,estimated_hours numeric,quantity integer,unit_hours numeric,article_key text,due_date date);
insert into order_tasks values(9,null,null,'da_avviare','2026-11-17T08:00:00Z',70,10,7,'shirt','2026-11-30');`);
const assign=person=>db.query(`update order_tasks set assigned_user_id=$1 where id=9 and assigned_user_id is null
 and external_supplier_name is null and status='da_avviare' and updated_at='2026-11-17T08:00:00Z' returning *`,[person]);
assert.equal((await assign(20)).rows.length,1);assert.equal((await assign(22)).rows.length,0);
const assigned=(await db.query('select * from order_tasks')).rows[0];
assert.equal(Number(assigned.assigned_user_id),20);assert.equal(Number(assigned.estimated_hours),70);
assert.equal(assigned.quantity,10);assert.equal(assigned.article_key,'shirt');assert.equal(assigned.due_date.toISOString().slice(0,10),'2026-11-30');
await db.close();
console.log('Material articles SQL: historical preservation, canonical links, shared stock, repeated saves, shortage/decimal quantities, rollback, client materials, old clients, privileges and RLS passed.');
