-- Run only inside this transaction: all existing rows remain unchanged.
begin;
set local lock_timeout = '3s';
do $$
declare
  photo public.attachments%rowtype;
  admin_uid uuid;
  original_order_time timestamptz;
begin
  select * into strict photo from public.attachments
    where order_id is not null and storage_path is not null and deleted_at is null and file_type = 'foto'
    order by id limit 1;
  select auth_user_id into strict admin_uid from public.users where id = 12 and role = 'admin' and is_active;
  select updated_at into original_order_time from public.orders where id = photo.order_id;
  update public.attachments set deleted_at = clock_timestamp(), deleted_by_user_id = 12 where id = photo.id;
  if not exists (select 1 from public.attachments where id = photo.id and storage_path = photo.storage_path and deleted_at is not null) then
    raise exception 'Soft delete changed the file reference';
  end if;
  if not exists (select 1 from public.orders where id = photo.order_id and updated_at is distinct from original_order_time) then
    raise exception 'Live-sync marker did not change';
  end if;
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  set local role authenticated;
  if exists (select 1 from public.attachments where id = photo.id) then
    raise exception 'Legacy REST readers can still see a trashed row';
  end if;
  reset role;
  update public.attachments set deleted_at = null, restored_at = clock_timestamp(), restored_by_user_id = 12 where id = photo.id;
  if not exists (select 1 from public.attachments where id = photo.id and deleted_at is null and storage_path = photo.storage_path) then
    raise exception 'Restore did not preserve original file';
  end if;
  set local role authenticated;
  if not exists (select 1 from public.attachments where id = photo.id) then
    raise exception 'Restored photo is not visible to existing authorized staff';
  end if;
  reset role;
end;
$$;
rollback;
