-- Run against the target database after loading the migration. All test data
-- and stock changes roll back; order-number sequences may advance.
begin;
do $$
declare
  v_item public.items%rowtype;
  v_result json;
  v_order public.orders%rowtype;
  v_method text;
  v_stock integer;
  v_orders bigint;
begin
  select * into strict v_item from public.items where stock_quantity >= 4 order by id limit 1 for update;
  foreach v_method in array array['dinheiro', 'pix', 'cartao'] loop
    v_result := public.create_cashier_order(
      jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'quantity', 1)),
      'Teste transacional caixa', v_method, E'Sem cebola\nMolho separado'
    );
    select * into strict v_order from public.orders where id = (v_result->>'order_id')::uuid;
    assert v_order.status = 'paid' and v_order.payment_status = 'approved' and v_order.status_pagamento = 'pago', 'Cashier must be paid immediately';
    assert v_order.status_preparo = 'na_fila' and v_order.payment_expires_at is null, 'Cashier must enter kitchen without expiry';
    assert v_order.payment_method = v_method and v_order.notes = E'Sem cebola\nMolho separado', 'Payment method and notes must be preserved';
    assert v_order.total_amount = v_item.price, 'Price must come from catalog';
    assert exists (select 1 from public.inventory_reservations where order_id = v_order.id and committed_at is not null), 'Stock must be committed';
    assert not exists (select 1 from public.payments where order_id = v_order.id), 'Cashier must not create a provider payment';
    assert not public.expire_order_if_due(v_order.id), 'Cashier cannot expire';
  end loop;
  select stock_quantity into v_stock from public.items where id = v_item.id;
  assert v_stock = v_item.stock_quantity - 3, 'Stock must decrease exactly once per order';

  select row_to_json(p) into v_result from public.create_pending_order(
    jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'quantity', 1)), 'Teste totem', 'pix', null
  ) p;
  select * into strict v_order from public.orders where id = (v_result->>'id')::uuid;
  assert v_order.status = 'pending_payment' and v_order.payment_status = 'pending', 'Totem must still require payment';

  select count(*) into v_orders from public.orders;
  begin
    perform public.create_cashier_order(jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'quantity', v_item.stock_quantity + 1)), 'Sem estoque', 'dinheiro', null);
    raise exception 'Insufficient stock was accepted';
  exception when raise_exception then
    if sqlerrm = 'Insufficient stock was accepted' then raise; end if;
  end;
  assert (select count(*) from public.orders) = v_orders, 'Failed checkout must not leave an order';
  assert not has_function_privilege('anon', 'public.create_cashier_order(jsonb,text,text,text)', 'execute'), 'Anonymous checkout forbidden';
  assert not has_function_privilege('authenticated', 'public.create_cashier_order(jsonb,text,text,text)', 'execute'), 'Direct browser checkout forbidden';
  assert has_function_privilege('service_role', 'public.create_cashier_order(jsonb,text,text,text)', 'execute'), 'Server checkout allowed';
end;
$$;
rollback;
