-- Real database constraint test; all test rows and audit events are rolled back.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $$
declare
  v_order bigint;
  v_department bigint;
  v_key text := 'regression-task-' || txid_current()::text;
  v_count integer;
begin
  select id into strict v_order from public.orders order by id limit 1;
  select id into strict v_department from public.departments order by id limit 1;
  insert into public.order_tasks(order_id,department_id,task_name,task_phase,status,estimated_hours,client_task_key)
  values(v_order,v_department,'REGRESSION TEST','confezione','da_avviare',8,v_key)
  on conflict(order_id,client_task_key) do nothing;
  -- Replay deliberately has a different estimate: never overwrite the first save.
  insert into public.order_tasks(order_id,department_id,task_name,task_phase,status,estimated_hours,client_task_key)
  values(v_order,v_department,'REGRESSION TEST','confezione','da_avviare',24,v_key)
  on conflict(order_id,client_task_key) do nothing;
  select count(*) into v_count from public.order_tasks where order_id=v_order and client_task_key=v_key;
  if v_count<>1 or (select estimated_hours from public.order_tasks where order_id=v_order and client_task_key=v_key)<>8 then
    raise exception 'Task replay duplicated or overwrote a task';
  end if;
  -- A new intention with identical business fields is allowed (another article/task).
  insert into public.order_tasks(order_id,department_id,task_name,task_phase,status,estimated_hours,client_task_key)
  values(v_order,v_department,'REGRESSION TEST','confezione','da_avviare',8,v_key || '-second');
end $$;
rollback;
select 'task identity constraint verified; test rows rolled back' as result;
