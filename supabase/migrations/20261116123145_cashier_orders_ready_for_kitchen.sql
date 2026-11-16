-- Manual cashier orders are already paid outside the kiosk. Reuse the locked
-- catalog/stock validation and commit the payment state and notes atomically.
create or replace function public.create_cashier_order(
  p_items jsonb,
  p_customer_name text,
  p_payment_method text,
  p_notes text default null
) returns json
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_order record;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' or length(p_customer_name) > 120 then
    raise exception 'Nome do cliente invalido';
  end if;
  if p_payment_method is null or p_payment_method not in ('dinheiro', 'pix', 'cartao') then
    raise exception 'Forma de pagamento invalida';
  end if;
  if length(p_notes) > 500 then
    raise exception 'Observacao deve ter no maximo 500 caracteres';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Itens invalidos';
  end if;
  if jsonb_array_length(p_items) not between 1 and 25 then
    raise exception 'Quantidade de itens invalida';
  end if;

  select * into strict v_order
  from public.create_pending_order(p_items, btrim(p_customer_name), p_payment_method, p_notes);

  update public.orders
  set status = 'paid', payment_status = 'approved', status_pagamento = 'pago',
      status_preparo = 'na_fila', payment_expires_at = null
  where id = v_order.id;

  update public.inventory_reservations
  set committed_at = now()
  where order_id = v_order.id and committed_at is null;

  return json_build_object('order_id', v_order.id, 'order_number', v_order.order_number);
end;
$$;

revoke all on function public.create_cashier_order(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_cashier_order(jsonb, text, text, text) to service_role;
