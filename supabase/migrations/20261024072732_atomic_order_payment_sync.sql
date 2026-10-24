-- Only the authenticated Python API may call this RPC with its server key.
-- No SECURITY DEFINER and no changes to existing client RLS policies.
create or replace function public.mms_sync_order_payments(
  p_order_id bigint, p_expected jsonb, p_rows jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_current jsonb;
  v_expected jsonb;
  v_current_values jsonb;
  v_desired_values jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_expected) is distinct from 'array'
     or jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_expected) > 500 or jsonb_array_length(p_rows) > 500 then
    raise sqlstate 'PT400' using message = 'Elenco pagamenti non valido';
  end if;

  -- Lock only this order and its movements, for the duration of one RPC.
  perform id from public.orders where id = p_order_id for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Ordine non trovato';
  end if;
  perform id from public.payments where order_id = p_order_id order by id for update;

  if exists (
    select 1 from jsonb_to_recordset(p_rows) as d(id bigint, payment_type text, amount numeric, status text, paid_date text)
    where d.payment_type is null or d.payment_type not in ('acconto','saldo','scadenza')
      or d.status is null or d.status not in ('pagato','da_pagare','scaduto','autorizzato')
      or d.amount < 0 or d.amount::text in ('NaN','Infinity','-Infinity')
      or (d.status = 'pagato' and coalesce(d.paid_date, '') = '')
      or (d.id is not null and not exists (
        select 1 from public.payments p where p.id = d.id and p.order_id = p_order_id))
  ) or exists (
    select 1 from jsonb_to_recordset(p_rows) as d(id bigint)
    where d.id is not null group by d.id having count(*) > 1
  ) then
    raise sqlstate 'PT400' using message = 'Movimenti o identificativi non validi';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
  into v_current from (
    select id,order_id,payment_type,amount,due_date,paid_date,status,notes
    from public.payments where order_id = p_order_id
  ) c;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
  into v_expected from jsonb_to_recordset(p_expected) as e(
    id bigint,order_id bigint,payment_type text,amount numeric,
    due_date text,paid_date text,status text,notes text
  );

  -- Safe replay after an interrupted response: same business values => no write.
  select coalesce(jsonb_agg(x.value - 'id' - 'order_id' order by (x.value - 'id' - 'order_id')::text), '[]'::jsonb)
  into v_current_values from jsonb_array_elements(v_current) x;
  select coalesce(jsonb_agg(to_jsonb(d) - 'id' order by (to_jsonb(d) - 'id')::text), '[]'::jsonb)
  into v_desired_values from jsonb_to_recordset(p_rows) as d(
    id bigint,payment_type text,amount numeric,due_date text,paid_date text,status text,notes text
  );
  if v_current_values is distinct from v_desired_values then
    if v_current is distinct from v_expected then
      raise sqlstate 'PT409' using message = 'Pagamenti modificati da un altro operatore. Riapri la scheda prima di salvare.';
    end if;

    update public.payments p set
      payment_type=d.payment_type,amount=d.amount,due_date=d.due_date,
      paid_date=d.paid_date,status=d.status,notes=d.notes
    from jsonb_to_recordset(p_rows) as d(
      id bigint,payment_type text,amount numeric,due_date text,paid_date text,status text,notes text
    ) where p.id=d.id and p.order_id=p_order_id
      and (p.payment_type,p.amount,p.due_date,p.paid_date,p.status,p.notes)
        is distinct from (d.payment_type,d.amount,d.due_date,d.paid_date,d.status,d.notes);

    delete from public.payments p where p.order_id=p_order_id
      and not exists (select 1 from jsonb_to_recordset(p_rows) as d(id bigint) where d.id=p.id);

    insert into public.payments(order_id,payment_type,amount,due_date,paid_date,status,notes)
    select p_order_id,d.payment_type,d.amount,d.due_date,d.paid_date,d.status,d.notes
    from jsonb_to_recordset(p_rows) as d(
      id bigint,payment_type text,amount numeric,due_date text,paid_date text,status text,notes text
    ) where d.id is null;
    update public.orders set updated_at=now() where id=p_order_id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
  into v_result from public.payments p where p.order_id=p_order_id;
  return v_result;
end;
$$;
revoke all on function public.mms_sync_order_payments(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mms_sync_order_payments(bigint,jsonb,jsonb) to service_role;
