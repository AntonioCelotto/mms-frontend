with current_rows as (
 select 'order_tasks'::text as source_table,id as source_id,to_jsonb(t)-'quantity'-'unit_hours' as row_data from public.order_tasks t union all
 select 'order_materials',id,to_jsonb(t)-'article_key'-'article_name' from public.order_materials t union all
 select 'inventory_items',id,to_jsonb(t) from public.inventory_items t union all
 select 'inventory_shortages',id,to_jsonb(t) from public.inventory_shortages t union all
 select 'orders',id,to_jsonb(t) from public.orders t union all
 select 'payments',id,to_jsonb(t) from public.payments t
), compared as (
 select coalesce(c.source_table,b.source_table) as source_table,c.source_id as current_id,b.source_id as backup_id,
   c.row_data is distinct from b.row_data as changed
 from current_rows c full join private.mms_task_release_20261117_backup b using(source_table,source_id)
)
select source_table,count(current_id) as current_count,count(backup_id) as backup_count,
 count(*) filter(where changed) as changed_or_missing_rows from compared group by source_table order by source_table;
