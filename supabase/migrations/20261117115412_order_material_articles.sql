-- PREPARED ONLY. Requires the agreed maintenance window; no historical rewrite.
set lock_timeout = '3s';
alter table public.order_materials add column article_key text, add column article_name text;

create or replace function private.mms_material_article_link()
returns trigger language plpgsql set search_path = '' as $$
declare v_payload jsonb; v_name text;
begin
  new.article_key := nullif(btrim(new.article_key), '');
  if new.article_key is null then new.article_name := null; return new; end if;
  select o.source_quote_payload into v_payload from public.orders o where o.id = new.order_id;
  select coalesce(nullif(btrim(a.value->>'name'),''), nullif(btrim(a.value->>'product_name'),''), 'Articolo '||a.ordinality)
    into v_name
    from jsonb_array_elements(case when jsonb_typeof(v_payload->'articles') = 'array' then v_payload->'articles' else '[]'::jsonb end)
      with ordinality as a(value,ordinality)
    where coalesce(nullif(a.value->>'id',''),nullif(a.value->>'code',''),'article-'||a.ordinality) = new.article_key
    limit 1;
  if not found then raise exception 'Articolo di destinazione non presente nell''ordine'; end if;
  new.article_name := v_name;
  return new;
end;
$$;
revoke all on function private.mms_material_article_link() from public, anon, authenticated;
create trigger mms_material_article_link
before insert or update of article_key, article_name, order_id on public.order_materials
for each row execute function private.mms_material_article_link();

-- Retain the existing invoker RPC and its privileges/reservation semantics.
-- Serialize replacements of the same order and lock inventory in stable order.
create or replace function public.replace_order_materials_atomic(p_order_id bigint, p_materials jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  material jsonb; product_name text; source_type text; delivery_status text;
  warehouse_note text; preorder_note text; notes text; unit_value text;
  quantity_required numeric; v_inventory_item_id bigint; v_inventory_sku text;
  item_available numeric; item_reserved numeric; free_quantity numeric;
  reserve_quantity numeric; missing_quantity numeric; saved_count integer := 0;
  old_material record;
begin
  if p_order_id is null then raise exception 'Ordine non valido'; end if;
  perform 1 from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Ordine non trovato'; end if;
  if p_materials is null or jsonb_typeof(p_materials) <> 'array' then raise exception 'Materiali non validi'; end if;
  if exists (select 1 from public.order_materials om where om.order_id=p_order_id and om.article_key is not null)
    and exists (select 1 from jsonb_array_elements(p_materials) m where not (m ? 'article_key' or m ? 'articleKey')) then
    raise exception 'Aggiorna la pagina prima di salvare i materiali collegati agli articoli';
  end if;
  perform 1 from public.inventory_items ii where
    ii.id in (select om.inventory_item_id from public.order_materials om where om.order_id=p_order_id)
    or ii.id in (select nullif(coalesce(m->>'inventory_item_id',m->>'inventoryItemId',''),'')::bigint from jsonb_array_elements(p_materials) m)
    or ii.sku in (select coalesce(m->>'inventory_sku',m->>'sku') from jsonb_array_elements(p_materials) m)
    order by ii.id for update;

  for old_material in select om.inventory_item_id as old_inventory_item_id,
      coalesce(om.reserved_quantity,0) as old_reserved_quantity from public.order_materials om
      where om.order_id=p_order_id and om.inventory_item_id is not null and coalesce(om.reserved_quantity,0)>0
  loop
    update public.inventory_items ii set reserved_quantity=greatest(coalesce(ii.reserved_quantity,0)-old_material.old_reserved_quantity,0),
      updated_at=timezone('utc'::text,now()) where ii.id=old_material.old_inventory_item_id;
  end loop;
  delete from public.inventory_shortages s where s.order_id=p_order_id;
  delete from public.order_materials om where om.order_id=p_order_id;

  for material in select value from jsonb_array_elements(p_materials) loop
    product_name := nullif(trim(coalesce(material->>'product_name',material->>'material',material->>'name','')),'');
    if product_name is null then continue; end if;
    quantity_required := coalesce(nullif(replace(coalesce(material->>'quantity_required',material->>'quantity',material->>'qty','1'),',','.'),'')::numeric,1);
    if quantity_required <= 0 or quantity_required > 1000000000 or quantity_required='NaN'::numeric then
      raise exception 'Quantita materiale non valida';
    end if;
    source_type := lower(nullif(trim(coalesce(material->>'source_type',material->>'source','mms')),''));
    if source_type is null or source_type not in ('mms','magazzino','fornitore','cliente') then source_type := 'mms'; end if;
    if source_type in ('magazzino','fornitore') then source_type := 'mms'; end if;
    delivery_status := lower(nullif(trim(coalesce(material->>'delivery_status',material->>'delivery','non_consegnato')),''));
    if delivery_status is null or delivery_status not in ('consegnato','non_consegnato') then delivery_status := 'non_consegnato'; end if;
    warehouse_note := nullif(trim(coalesce(material->>'warehouse_status_note',material->>'warehouse','')),'');
    preorder_note := nullif(trim(coalesce(material->>'preorder_note',material->>'preorder','')),'');
    notes := nullif(trim(coalesce(material->>'notes',material->>'note','')),'');
    unit_value := nullif(trim(coalesce(material->>'unit','')),'');
    v_inventory_item_id := nullif(coalesce(material->>'inventory_item_id',material->>'inventoryItemId',''),'')::bigint;
    v_inventory_sku := nullif(trim(coalesce(material->>'inventory_sku',material->>'sku','')),'');
    item_available := 0; item_reserved := 0; reserve_quantity := 0; missing_quantity := 0;
    if source_type='mms' then
      if v_inventory_item_id is not null then
        select ii.id,coalesce(ii.available_quantity,0),coalesce(ii.reserved_quantity,0),coalesce(ii.unit,unit_value)
          into v_inventory_item_id,item_available,item_reserved,unit_value from public.inventory_items ii where ii.id=v_inventory_item_id for update;
      elsif v_inventory_sku is not null then
        select ii.id,coalesce(ii.available_quantity,0),coalesce(ii.reserved_quantity,0),coalesce(ii.unit,unit_value)
          into v_inventory_item_id,item_available,item_reserved,unit_value from public.inventory_items ii where ii.sku=v_inventory_sku for update;
      end if;
      if v_inventory_item_id is not null then
        free_quantity := greatest(item_available-item_reserved,0);
        reserve_quantity := least(quantity_required,free_quantity);
        missing_quantity := greatest(quantity_required-reserve_quantity,0);
        if reserve_quantity>0 then
          update public.inventory_items ii set reserved_quantity=coalesce(ii.reserved_quantity,0)+reserve_quantity,
            updated_at=timezone('utc'::text,now()) where ii.id=v_inventory_item_id;
        end if;
        if missing_quantity>0 then
          insert into public.inventory_shortages(order_id,inventory_item_id,product_name,quantity_required,quantity_reserved,quantity_missing,unit,status,notes)
            values(p_order_id,v_inventory_item_id,product_name,quantity_required,reserve_quantity,missing_quantity,unit_value,'da_ordinare',preorder_note);
        end if;
      end if;
    end if;
    insert into public.order_materials(order_id,inventory_item_id,product_name,source_type,delivery_status,warehouse_status_note,preorder_note,
      quantity_required,notes,reserved_quantity,missing_quantity,article_key,article_name)
      values(p_order_id,v_inventory_item_id,product_name,source_type,delivery_status,warehouse_note,preorder_note,quantity_required,notes,
        reserve_quantity,missing_quantity,nullif(coalesce(material->>'article_key',material->>'articleKey',''),''),
        nullif(coalesce(material->>'article_name',material->>'articleName',''),''));
    saved_count := saved_count+1;
  end loop;
  return saved_count;
end;
$$;
-- New quote-to-order conversions keep their article association immediately.
-- This replaces only the existing insert trigger function, not historical rows.
create or replace function public.reserve_order_materials_on_insert()
returns trigger language plpgsql set search_path = '' as $$
declare v_materials jsonb;
begin
  select coalesce(jsonb_agg(material.value || jsonb_build_object(
      'article_key',coalesce(nullif(article.value->>'id',''),nullif(article.value->>'code',''),'article-'||article.ordinality),
      'article_name',coalesce(nullif(article.value->>'name',''),nullif(article.value->>'product_name',''),'Articolo '||article.ordinality)
    ) order by article.ordinality,material.ordinality),'[]'::jsonb) into v_materials
    from jsonb_array_elements(case when jsonb_typeof(new.source_quote_payload->'articles')='array' then new.source_quote_payload->'articles' else '[]'::jsonb end)
      with ordinality as article(value,ordinality)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(article.value->'materials')='array' then article.value->'materials' else '[]'::jsonb end)
      with ordinality as material(value,ordinality)
    where nullif(trim(coalesce(material.value->>'product_name',material.value->>'material',material.value->>'name','')),'') is not null;
  if jsonb_array_length(v_materials)>0 then perform public.replace_order_materials_atomic(new.id,v_materials); end if;
  return new;
end;
$$;
revoke all on function public.reserve_order_materials_on_insert() from public, anon, authenticated;
reset lock_timeout;
