-- PREPARED ONLY: apply during the agreed maintenance window, before new code.
-- Constant quantity default does not recalculate historical estimated_hours.
set lock_timeout = '3s';
alter table public.order_tasks
  add column quantity integer not null default 1,
  add column unit_hours numeric;
alter table public.order_tasks
  add constraint task_quantity_positive check (quantity between 1 and 1000000),
  add constraint task_unit_hours_valid check (unit_hours is null or unit_hours between 0 and 1000000),
  add constraint task_quantity_requires_unit check (quantity = 1 or unit_hours is not null);

create or replace function private.mms_task_quantity_total()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.unit_hours is not null then
    if new.quantity < 1 or new.quantity > 1000000 or new.unit_hours < 0
      or new.unit_hours > 1000000 or new.quantity * new.unit_hours > 1000000000 then
      raise exception 'Quantita o ore per pezzo non valide';
    end if;
    if tg_op = 'UPDATE' then
      if new.quantity is not distinct from old.quantity and new.unit_hours is not distinct from old.unit_hours
        and new.estimated_hours is distinct from old.estimated_hours
        and new.estimated_hours is distinct from round(new.quantity * new.unit_hours, 6) then
        raise exception 'Aggiorna la pagina: modifica quantita e ore per pezzo, non il totale';
      end if;
    end if;
    new.estimated_hours := round(new.quantity * new.unit_hours, 6);
  end if;
  return new;
end;
$$;
revoke all on function private.mms_task_quantity_total() from public, anon, authenticated;
create trigger mms_task_quantity_total
before insert or update of quantity, unit_hours, estimated_hours on public.order_tasks
for each row execute function private.mms_task_quantity_total();
reset lock_timeout;
