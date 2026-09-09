-- Reserve inventory only when a quote has become an order.
-- The replacement RPC is idempotent: saving the same order releases its previous
-- reservation before calculating and applying the new one.
create or replace function public.reserve_order_materials_on_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_materials jsonb;
begin
  select coalesce(jsonb_agg(material.value), '[]'::jsonb)
  into v_materials
  from jsonb_array_elements(coalesce(new.source_quote_payload->'articles', '[]'::jsonb)) as article(value)
  cross join lateral jsonb_array_elements(coalesce(article.value->'materials', '[]'::jsonb)) as material(value)
  where nullif(trim(coalesce(
    material.value->>'product_name',
    material.value->>'material',
    material.value->>'name',
    ''
  )), '') is not null;

  if jsonb_array_length(v_materials) > 0 then
    perform public.replace_order_materials_atomic(new.id, v_materials);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reserve_order_materials_after_insert on public.orders;
create trigger trg_reserve_order_materials_after_insert
after insert on public.orders
for each row
execute function public.reserve_order_materials_on_insert();

revoke execute on function public.reserve_order_materials_on_insert()
from public, anon, authenticated;

-- Repair historical orders whose quote payload contains materials but whose
-- inventory commitments were never created.
do $$
declare
  v_order record;
  v_materials jsonb;
begin
  for v_order in
    select o.id, o.source_quote_payload
    from public.orders o
    where not exists (
      select 1 from public.order_materials om where om.order_id = o.id
    )
      and jsonb_typeof(o.source_quote_payload->'articles') = 'array'
      and jsonb_array_length(o.source_quote_payload->'articles') > 0
    order by o.created_at, o.id
  loop
    select coalesce(jsonb_agg(material.value), '[]'::jsonb)
    into v_materials
    from jsonb_array_elements(coalesce(v_order.source_quote_payload->'articles', '[]'::jsonb)) as article(value)
    cross join lateral jsonb_array_elements(coalesce(article.value->'materials', '[]'::jsonb)) as material(value)
    where nullif(trim(coalesce(
      material.value->>'product_name',
      material.value->>'material',
      material.value->>'name',
      ''
    )), '') is not null;

    if jsonb_array_length(v_materials) > 0 then
      perform public.replace_order_materials_atomic(v_order.id, v_materials);
    end if;
  end loop;
end;
$$;

-- Make the inventory aggregate authoritative after repairing historical rows.
with expected as (
  select inventory_item_id, sum(coalesce(reserved_quantity, 0)) as reserved
  from public.order_materials
  where inventory_item_id is not null
  group by inventory_item_id
)
update public.inventory_items ii
set reserved_quantity = totals.reserved,
    updated_at = timezone('utc'::text, now())
from (
  select item.id, coalesce(expected.reserved, 0) as reserved
  from public.inventory_items item
  left join expected on expected.inventory_item_id = item.id
) totals
where ii.id = totals.id
  and coalesce(ii.reserved_quantity, 0) <> totals.reserved;
