-- Maintenance backup only: no public business table is changed.
set lock_timeout = '3s';
set statement_timeout = '45s';
lock table public.order_tasks, public.order_materials, public.inventory_items,
  public.inventory_shortages, public.orders, public.payments in share mode;
create table private.mms_task_release_20261117_backup (
  source_table text not null, source_id bigint not null, row_data jsonb not null,
  primary key(source_table, source_id)
);
alter table private.mms_task_release_20261117_backup enable row level security;
revoke all on private.mms_task_release_20261117_backup from public, anon, authenticated, service_role;
insert into private.mms_task_release_20261117_backup
select 'order_tasks',id,to_jsonb(t) from public.order_tasks t union all
select 'order_materials',id,to_jsonb(t) from public.order_materials t union all
select 'inventory_items',id,to_jsonb(t) from public.inventory_items t union all
select 'inventory_shortages',id,to_jsonb(t) from public.inventory_shortages t union all
select 'orders',id,to_jsonb(t) from public.orders t union all
select 'payments',id,to_jsonb(t) from public.payments t;
create table private.mms_task_release_20261117_meta (name text primary key, payload jsonb not null);
alter table private.mms_task_release_20261117_meta enable row level security;
revoke all on private.mms_task_release_20261117_meta from public, anon, authenticated, service_role;
insert into private.mms_task_release_20261117_meta values
 ('release',jsonb_build_object('created_at',now(),'project','fzdqemzowxjuotqalaol',
 'previous_main','47c32a3af50fbabcc60c544240d6ada00ad942be','feature_commit','0948a516619848b3090cffd5315804dc0a20d7e6',
 'previous_deployment','dpl_9dhFC2rYi1tHNm6axQdZm3SfxdoQ','authorization','Antonio confirmed Roberta and Matteo are out and requested publication'));
insert into private.mms_task_release_20261117_meta
select 'baseline_hashes',jsonb_agg(to_jsonb(s)) from (
 select source_table,count(*) as row_count,md5(string_agg(row_data::text,'|' order by source_id)) as hash
 from private.mms_task_release_20261117_backup group by source_table order by source_table
) s;
insert into private.mms_task_release_20261117_meta
select 'functions',jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
 'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'security_definer',p.prosecdef))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('replace_order_materials_atomic','reserve_order_materials_on_insert');
insert into private.mms_task_release_20261117_meta
select 'columns',jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position)
 from information_schema.columns c where c.table_schema='public' and c.table_name in ('order_tasks','order_materials','inventory_items','inventory_shortages','orders','payments');
insert into private.mms_task_release_20261117_meta
select 'policies',coalesce(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname),'[]'::jsonb)
 from pg_policies p where p.schemaname='public' and p.tablename in ('order_tasks','order_materials','inventory_items','inventory_shortages','orders','payments');
insert into private.mms_task_release_20261117_meta
select 'grants',coalesce(jsonb_agg(to_jsonb(g) order by g.table_name,g.grantee,g.privilege_type),'[]'::jsonb)
 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name in ('order_tasks','order_materials','inventory_items','inventory_shortages','orders','payments');
insert into private.mms_task_release_20261117_meta
select 'rls',jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('order_tasks','order_materials','inventory_items','inventory_shortages','orders','payments');
insert into private.mms_task_release_20261117_meta
select 'triggers',jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and n.nspname='public' and c.relname in ('order_tasks','order_materials','inventory_items','inventory_shortages','orders','payments');
reset statement_timeout;
reset lock_timeout;
