-- Manual rollback only; must be reviewed and explicitly requested.
-- Restore only removed rows and never overwrite newer payment edits.
begin;
insert into public.payments(id,order_id,payment_type,amount,due_date,paid_date,status,notes,created_at)
overriding system value
select p.id,p.order_id,p.payment_type,p.amount,p.due_date,p.paid_date,p.status,p.notes,p.created_at
from private.mms_payment_repair_20261024 b,
lateral jsonb_populate_record(null::public.payments,b.row_data) p
where b.source_table='payments' and b.source_id in (2903,3449,3450,3446)
on conflict(id) do nothing;
update public.orders set updated_at=now() where id in (393,1131,1189);
commit;
