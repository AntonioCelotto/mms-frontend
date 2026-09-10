-- When warehouse stock increases, assign the newly free quantity to existing
-- shortages in chronological order and keep every inventory aggregate aligned.
create or replace function public.reconcile_inventory_shortages(p_inventory_item_id bigint)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_shortage record;
  v_material record;
  v_free numeric := 0;
  v_shortage_allocation numeric := 0;
  v_material_allocation numeric := 0;
  v_material_remaining numeric := 0;
  v_total_allocated numeric := 0;
begin
  select *
  into v_item
  from public.inventory_items
  where id = p_inventory_item_id
  for update;

  if not found then
    return 0;
  end if;

  v_free := greatest(
    coalesce(v_item.available_quantity, 0) - coalesce(v_item.reserved_quantity, 0),
    0
  );

  if v_free <= 0 then
    return 0;
  end if;

  for v_shortage in
    select s.id, s.order_id, coalesce(s.quantity_missing, 0) as quantity_missing
    from public.inventory_shortages s
    where s.inventory_item_id = p_inventory_item_id
      and coalesce(s.quantity_missing, 0) > 0
      and coalesce(s.status, 'da_ordinare') in ('da_ordinare', 'ordinato')
    order by s.created_at, s.id
    for update
  loop
    exit when v_free <= 0;

    v_shortage_allocation := least(v_free, v_shortage.quantity_missing);
    v_material_remaining := v_shortage_allocation;

    for v_material in
      select om.id, coalesce(om.missing_quantity, 0) as missing_quantity
      from public.order_materials om
      where om.order_id = v_shortage.order_id
        and om.inventory_item_id = p_inventory_item_id
        and coalesce(om.missing_quantity, 0) > 0
      order by om.created_at, om.id
      for update
    loop
      exit when v_material_remaining <= 0;

      v_material_allocation := least(v_material_remaining, v_material.missing_quantity);

      update public.order_materials
      set reserved_quantity = coalesce(reserved_quantity, 0) + v_material_allocation,
          missing_quantity = greatest(coalesce(missing_quantity, 0) - v_material_allocation, 0),
          updated_at = timezone('utc'::text, now())
      where id = v_material.id;

      v_material_remaining := v_material_remaining - v_material_allocation;
    end loop;

    -- Do not consume stock if the shortage no longer has a matching order row.
    v_shortage_allocation := v_shortage_allocation - v_material_remaining;
    if v_shortage_allocation <= 0 then
      continue;
    end if;

    if v_shortage.quantity_missing - v_shortage_allocation <= 0 then
      delete from public.inventory_shortages where id = v_shortage.id;
    else
      update public.inventory_shortages
      set quantity_reserved = coalesce(quantity_reserved, 0) + v_shortage_allocation,
          quantity_missing = quantity_missing - v_shortage_allocation,
          updated_at = timezone('utc'::text, now())
      where id = v_shortage.id;
    end if;

    v_free := v_free - v_shortage_allocation;
    v_total_allocated := v_total_allocated + v_shortage_allocation;
  end loop;

  if v_total_allocated > 0 then
    update public.inventory_items
    set reserved_quantity = coalesce(reserved_quantity, 0) + v_total_allocated,
        updated_at = timezone('utc'::text, now())
    where id = p_inventory_item_id;
  end if;

  return v_total_allocated;
end;
$$;

revoke execute on function public.reconcile_inventory_shortages(bigint)
from public, anon, authenticated;
create or replace function public.reconcile_inventory_shortages_after_stock_increase()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shortage record;
  v_material record;
  v_free numeric := greatest(
    coalesce(new.available_quantity, 0) - coalesce(new.reserved_quantity, 0),
    0
  );
  v_shortage_allocation numeric := 0;
  v_material_allocation numeric := 0;
  v_material_remaining numeric := 0;
  v_total_allocated numeric := 0;
begin
  if v_free <= 0 then
    return new;
  end if;

  for v_shortage in
    select s.id, s.order_id, coalesce(s.quantity_missing, 0) as quantity_missing
    from public.inventory_shortages s
    where s.inventory_item_id = new.id
      and coalesce(s.quantity_missing, 0) > 0
      and coalesce(s.status, 'da_ordinare') in ('da_ordinare', 'ordinato')
    order by s.created_at, s.id
    for update
  loop
    exit when v_free <= 0;

    v_shortage_allocation := least(v_free, v_shortage.quantity_missing);
    v_material_remaining := v_shortage_allocation;

    for v_material in
      select om.id, coalesce(om.missing_quantity, 0) as missing_quantity
      from public.order_materials om
      where om.order_id = v_shortage.order_id
        and om.inventory_item_id = new.id
        and coalesce(om.missing_quantity, 0) > 0
      order by om.created_at, om.id
      for update
    loop
      exit when v_material_remaining <= 0;

      v_material_allocation := least(v_material_remaining, v_material.missing_quantity);

      update public.order_materials
      set reserved_quantity = coalesce(reserved_quantity, 0) + v_material_allocation,
          missing_quantity = greatest(coalesce(missing_quantity, 0) - v_material_allocation, 0),
          updated_at = timezone('utc'::text, now())
      where id = v_material.id;

      v_material_remaining := v_material_remaining - v_material_allocation;
    end loop;

    v_shortage_allocation := v_shortage_allocation - v_material_remaining;
    if v_shortage_allocation <= 0 then
      continue;
    end if;

    if v_shortage.quantity_missing - v_shortage_allocation <= 0 then
      delete from public.inventory_shortages where id = v_shortage.id;
    else
      update public.inventory_shortages
      set quantity_reserved = coalesce(quantity_reserved, 0) + v_shortage_allocation,
          quantity_missing = quantity_missing - v_shortage_allocation,
          updated_at = timezone('utc'::text, now())
      where id = v_shortage.id;
    end if;

    v_free := v_free - v_shortage_allocation;
    v_total_allocated := v_total_allocated + v_shortage_allocation;
  end loop;

  if v_total_allocated > 0 then
    update public.inventory_items
    set reserved_quantity = coalesce(reserved_quantity, 0) + v_total_allocated,
        updated_at = timezone('utc'::text, now())
    where id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function public.reconcile_inventory_shortages_after_stock_increase()
from public, anon, authenticated;

drop trigger if exists trg_reconcile_shortages_after_stock_increase on public.inventory_items;
create trigger trg_reconcile_shortages_after_stock_increase
after update of available_quantity on public.inventory_items
for each row
when (coalesce(new.available_quantity, 0) > coalesce(old.available_quantity, 0))
execute function public.reconcile_inventory_shortages_after_stock_increase();

-- Reconcile stock increases already recorded before the trigger existed.
do $$
declare
  v_item record;
begin
  for v_item in
    select distinct s.inventory_item_id
    from public.inventory_shortages s
    join public.inventory_items ii on ii.id = s.inventory_item_id
    where s.inventory_item_id is not null
      and coalesce(s.quantity_missing, 0) > 0
      and coalesce(ii.available_quantity, 0) > coalesce(ii.reserved_quantity, 0)
    order by s.inventory_item_id
  loop
    perform public.reconcile_inventory_shortages(v_item.inventory_item_id);
  end loop;
end;
$$;

-- The helper is needed only for the one-time reconciliation above. Keeping the
-- recurring logic inside the trigger avoids exposing a callable RPC to API roles.
drop function public.reconcile_inventory_shortages(bigint);
