-- Fix: drop all overloads of create_pending_order that may have been created
-- with a different parameter order, then recreate with the canonical signature.

-- Drop any existing overloads (Postgres allows overloading by param types/order)
drop function if exists public.create_pending_order(text, jsonb, text, text);
drop function if exists public.create_pending_order(text, text, jsonb, text);
drop function if exists public.create_pending_order(jsonb, text, text, text);

-- Recreate with the canonical signature matching the application call in route.ts
create or replace function public.create_pending_order(
  p_items jsonb,
  p_customer_name text,
  p_payment_method text,
  p_notes text default null
) returns table (id uuid, order_number bigint, total_amount numeric)
language plpgsql
set search_path = public
as `$`$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_total numeric(12,2) := 0;
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O carrinho deve conter ao menos um item';
  end if;

  for v_item in
    select i.id, i.price, i.stock_quantity, requested.quantity
    from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer)
    join public.items i on i.id = requested.item_id
    order by i.id
    for update of i
  loop
    if v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Quantidade invalida';
    end if;
    if v_item.stock_quantity < v_item.quantity then
      raise exception 'Estoque insuficiente';
    end if;
    v_total := v_total + (v_item.price * v_item.quantity);
  end loop;

  select count(*) into v_count from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer);
  if v_count <> (select count(*) from (select distinct (entry->>'item_id') from jsonb_array_elements(p_items) entry) ids) then
    raise exception 'Um produto nao pode aparecer duas vezes no carrinho';
  end if;
  if v_count = 0 or v_count <> (select count(*) from public.items where id in (select (entry->>'item_id')::uuid from jsonb_array_elements(p_items) entry)) then
    raise exception 'Produto invalido';
  end if;

  insert into public.orders (customer_name, status, status_pagamento, status_preparo, payment_status, payment_method, total_amount, notes)
  values (nullif(trim(p_customer_name), ''), 'pending_payment', 'aguardando', null, 'pending', p_payment_method, v_total, nullif(trim(p_notes), ''))
  returning * into v_order;

  for v_item in
    select i.id, i.price, requested.quantity
    from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer)
    join public.items i on i.id = requested.item_id
  loop
    insert into public.order_items (order_id, item_id, quantity, price_at_time)
      values (v_order.id, v_item.id, v_item.quantity, v_item.price);
    insert into public.inventory_reservations (order_id, item_id, quantity)
      values (v_order.id, v_item.id, v_item.quantity);
    update public.items set stock_quantity = stock_quantity - v_item.quantity where id = v_item.id;
  end loop;

  return query select v_order.id, v_order.order_number, v_total;
end;
`$`$;

revoke all on function public.create_pending_order(jsonb, text, text, text) from public;
grant execute on function public.create_pending_order(jsonb, text, text, text) to service_role;
