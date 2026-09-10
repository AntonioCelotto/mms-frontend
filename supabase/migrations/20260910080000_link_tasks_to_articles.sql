alter table public.order_tasks
  add column if not exists article_key text,
  add column if not exists article_name text,
  add column if not exists due_date date,
  add column if not exists sequence_order integer,
  add column if not exists schedule_warning text;

create index if not exists order_tasks_article_sequence_idx
  on public.order_tasks (order_id, article_key, sequence_order);

create index if not exists order_tasks_assignee_due_idx
  on public.order_tasks (assigned_user_id, due_date)
  where assigned_user_id is not null and status <> 'completato';

update public.order_tasks
set sequence_order = case task_phase
  when 'cartamodello' then 1
  when 'taglio' then 2
  when 'confezione' then 3
  else 99
end
where sequence_order is null;

update public.order_tasks
set due_date = substring(planned_date from '^\\d{4}-\\d{2}-\\d{2}')::date
where due_date is null
  and planned_date ~ '^\\d{4}-\\d{2}-\\d{2}';
