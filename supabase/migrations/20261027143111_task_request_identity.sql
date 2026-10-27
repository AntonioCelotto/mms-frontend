-- Nullable additive identity: no existing task or schedule is rewritten.
alter table public.order_tasks add column if not exists client_task_key text;
create unique index if not exists order_tasks_order_client_task_key_uidx
  on public.order_tasks(order_id, client_task_key);
-- Existing RLS, grants and authorization remain unchanged.
