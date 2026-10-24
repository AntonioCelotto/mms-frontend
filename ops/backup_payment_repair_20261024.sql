-- Operational backup only: never store customer rows in Git.
begin;
create table if not exists private.mms_payment_repair_20261024 (
  source_table text not null check(source_table in ('orders','payments')),
  source_id bigint not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key(source_table,source_id)
);
alter table private.mms_payment_repair_20261024 enable row level security;
revoke all on table private.mms_payment_repair_20261024 from public,anon,authenticated,service_role;
insert into private.mms_payment_repair_20261024(source_table,source_id,row_data)
select 'orders',id,to_jsonb(o) from public.orders o where id in (48,393,1131,1189)
on conflict do nothing;
insert into private.mms_payment_repair_20261024(source_table,source_id,row_data)
select 'payments',id,to_jsonb(p) from public.payments p where order_id in (48,393,1131,1189)
on conflict do nothing;
commit;
select source_table,count(*) as backed_up from private.mms_payment_repair_20261024 group by source_table;
