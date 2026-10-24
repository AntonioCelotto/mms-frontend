-- Integration test against the deployed RPC. Every write is rolled back.
begin;
set local statement_timeout = '5s';
do $$
declare
  v_order bigint := 1131;
  v_expected jsonb;
  v_rows jsonb;
  v_saved jsonb;
  v_replayed jsonb;
  v_before timestamptz;
begin
  select jsonb_agg(to_jsonb(p) order by p.id) into v_expected from public.payments p where order_id=v_order;
  select updated_at into v_before from public.orders where id=v_order;
  v_saved := public.mms_sync_order_payments(v_order,v_expected,v_expected);
  assert v_saved=v_expected, 'An unchanged save must preserve IDs and created_at';
  assert (select updated_at=v_before from public.orders where id=v_order), 'No-op must not touch the order';

  v_rows := jsonb_set(v_expected,'{0,amount}','410.01');
  v_saved := public.mms_sync_order_payments(v_order,v_expected,v_rows);
  assert jsonb_array_length(v_saved)=jsonb_array_length(v_expected), 'Update must not add movements';
  assert v_saved->0->'id'=v_expected->0->'id', 'Update must preserve ID';
  v_replayed := public.mms_sync_order_payments(v_order,v_expected,v_rows);
  assert v_replayed=v_saved, 'Replaying a completed save must not duplicate payments';

  begin
    perform public.mms_sync_order_payments(v_order,v_expected,jsonb_set(v_rows,'{0,amount}','411'));
    raise exception 'A stale snapshot was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.mms_sync_order_payments(v_order,v_saved,jsonb_set(v_saved,'{0,id}','2902'));
    raise exception 'An ID from another order was accepted';
  exception when sqlstate 'PT400' then null;
  end;

  v_rows := v_saved || jsonb_build_array(jsonb_build_object('id',null,'payment_type','scadenza','amount',1,
    'due_date',null,'paid_date',null,'status','autorizzato','notes','__mms_payment_sync_rollback_test__'));
  v_replayed := public.mms_sync_order_payments(v_order,v_saved,v_rows);
  assert jsonb_array_length(v_replayed)=jsonb_array_length(v_saved)+1, 'Adding a legitimate installment failed';
  assert public.mms_sync_order_payments(v_order,v_saved,v_rows)=v_replayed, 'A retried new installment was inserted twice';
  assert public.mms_sync_order_payments(v_order,v_replayed,'[]')='[]'::jsonb, 'Explicit removal failed';
end;
$$;
rollback;
select 'Payment identity, no-op, replay, conflict, cross-order isolation, new installment and deletion tests passed; all writes rolled back' as result;
