-- Recoverable order-only removal. Never delete or move Storage objects.
alter table public.attachments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id bigint references public.users(id) on delete set null,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id) on delete set null;

-- Existing staff authorization remains required. Legacy REST readers must not
-- include trashed attachments in their archive counts.
create policy "MMS hide trashed attachments" on public.attachments
  as restrictive for select to authenticated using (deleted_at is null);

create or replace function private.mms_touch_order_photo_visibility()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.orders set updated_at = clock_timestamp() where id = new.order_id;
  return new;
end;
$$;
revoke all on function private.mms_touch_order_photo_visibility() from public, anon, authenticated;
grant execute on function private.mms_touch_order_photo_visibility() to service_role;
create trigger mms_order_photo_visibility
  after update of deleted_at on public.attachments
  for each row when (old.deleted_at is distinct from new.deleted_at)
  execute function private.mms_touch_order_photo_visibility();
