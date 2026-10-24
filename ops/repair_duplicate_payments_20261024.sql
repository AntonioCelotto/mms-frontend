-- Authorized, narrowly targeted repair after deployment of the identity fix.
-- P24-0029 is intentionally untouched: its EUR 54 movement needs review.
-- P-0885 retains the original status AND historical paid_date unchanged.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $$
declare
  v_order bigint;
  v_rows jsonb;
  v_backup jsonb;
  v_deleted int;
begin
  for v_order in select id from public.orders where id in (393,1131,1189) order by id for update loop
    perform id from public.payments where order_id=v_order order by id for update;
    select jsonb_agg(to_jsonb(p) order by id) into v_rows from public.payments p where order_id=v_order;
    select jsonb_agg(row_data order by source_id) into v_backup
    from private.mms_payment_repair_20261024
    where source_table='payments' and (row_data->>'order_id')::bigint=v_order;
    if v_rows is distinct from v_backup then
      raise exception 'Payments changed after backup for order %, repair aborted',v_order;
    end if;
    if (select to_jsonb(o) from public.orders o where id=v_order) is distinct from
       (select row_data from private.mms_payment_repair_20261024 where source_table='orders' and source_id=v_order) then
      raise exception 'Order % changed after backup, repair aborted',v_order;
    end if;
  end loop;
  if not exists(select 1 from public.orders where id=1131 and source_quote_number='P-0830' and total=410)
     or not exists(select 1 from public.orders where id=393 and source_quote_number='P-0090' and total=113.50)
     or not exists(select 1 from public.orders where id=1189 and source_quote_number='P-0885' and total=410) then
    raise exception 'Financial references changed, repair aborted';
  end if;
  delete from public.payments where
    (order_id=1131 and id in (3449,3450)) or
    (order_id=393 and id=2903) or
    (order_id=1189 and id=3446);
  get diagnostics v_deleted = row_count;
  if v_deleted<>4 then raise exception 'Expected 4 duplicates, got %, repair rolled back',v_deleted; end if;
  if exists (
    select order_id from public.payments where order_id in (393,1131,1189)
    group by order_id having count(*)<>1
  ) then raise exception 'Unexpected movement count, repair rolled back'; end if;
  update public.orders set updated_at=now() where id in (393,1131,1189);
end;
$$;
commit;
select o.source_quote_number,p.id,p.amount,p.status,p.paid_date
from public.orders o join public.payments p on p.order_id=o.id
where o.id in (393,1131,1189) order by o.id;
