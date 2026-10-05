-- A payment reservation must never depend on a browser staying open. The
-- database is the source of truth for the five-minute deadline.

alter table public.orders
  add column if not exists payment_expires_at timestamptz;

update public.orders
set payment_expires_at = created_at + interval '5 minutes'
where payment_expires_at is null
  and status = 'pending_payment'
  and payment_status = 'pending';

create index if not exists orders_pending_payment_expiry_idx
  on public.orders (payment_expires_at)
  where status = 'pending_payment' and payment_status = 'pending';

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired'));

create or replace function public.expire_order_if_due(p_order_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reservation record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found
    or v_order.status <> 'pending_payment'
    or v_order.payment_status <> 'pending'
    or v_order.payment_expires_at is null
    or v_order.payment_expires_at > now() then
    return false;
  end if;

  for v_reservation in
    select * from public.inventory_reservations
    where order_id = v_order.id and released_at is null and committed_at is null
    for update
  loop
    update public.items set stock_quantity = stock_quantity + v_reservation.quantity where id = v_reservation.item_id;
    update public.inventory_reservations set released_at = now() where order_id = v_order.id and item_id = v_reservation.item_id;
  end loop;

  update public.payments set status = 'expired', status_detail = 'payment_timeout', updated_at = now()
  where order_id = v_order.id and status = 'pending';
  update public.orders
  set status = 'cancelado', status_pagamento = 'expirado', status_preparo = 'cancelado',
      payment_status = 'expired', stock_released_at = now()
  where id = v_order.id;
  insert into public.order_status_events(order_id, previous_status, next_status)
  values (v_order.id, v_order.status, 'cancelado');
  return true;
end;
$$;

create or replace function public.expire_due_unpaid_orders()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_expired_count integer := 0;
begin
  for v_order_id in
    select id from public.orders
    where status = 'pending_payment' and payment_status = 'pending' and payment_expires_at <= now()
    order by payment_expires_at
    for update skip locked
  loop
    if public.expire_order_if_due(v_order_id) then v_expired_count := v_expired_count + 1; end if;
  end loop;
  return v_expired_count;
end;
$$;

-- Recreate the order-creation function so every new payment receives its
-- deadline atomically with its stock reservation.
create or replace function public.create_pending_order(
  p_items jsonb, p_customer_name text, p_payment_method text, p_notes text default null
) returns table (id uuid, order_number bigint, total_amount numeric)
language plpgsql
set search_path = public
as $$
declare
  v_item record;
  v_total numeric(12,2) := 0;
  v_count integer;
  v_id uuid;
  v_order_number bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'O carrinho deve conter ao menos um item'; end if;
  for v_item in
    select i.id, i.price, i.stock_quantity, requested.quantity
    from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer)
    join public.items i on i.id = requested.item_id order by i.id for update of i
  loop
    if v_item.quantity is null or v_item.quantity < 1 then raise exception 'Quantidade invalida'; end if;
    if v_item.stock_quantity < v_item.quantity then raise exception 'Estoque insuficiente'; end if;
    v_total := v_total + (v_item.price * v_item.quantity);
  end loop;
  select count(*) into v_count from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer);
  if v_count <> (select count(distinct entry->>'item_id') from jsonb_array_elements(p_items) entry) then
    raise exception 'Um produto nao pode aparecer duas vezes no carrinho';
  end if;
  if v_count <> (select count(*) from public.items where id in (select (entry->>'item_id')::uuid from jsonb_array_elements(p_items) entry)) then
    raise exception 'Produto invalido';
  end if;
  insert into public.orders (customer_name, status, status_pagamento, status_preparo, payment_status, payment_method, total_amount, notes, payment_expires_at)
  values (nullif(trim(p_customer_name), ''), 'pending_payment', 'aguardando', null, 'pending', p_payment_method, v_total, nullif(trim(p_notes), ''), now() + interval '5 minutes')
  returning public.orders.id, public.orders.order_number into v_id, v_order_number;
  for v_item in
    select i.id, i.price, requested.quantity from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer)
    join public.items i on i.id = requested.item_id
  loop
    insert into public.order_items (order_id, item_id, quantity, price_at_time) values (v_id, v_item.id, v_item.quantity, v_item.price);
    insert into public.inventory_reservations (order_id, item_id, quantity) values (v_id, v_item.id, v_item.quantity);
    update public.items set stock_quantity = stock_quantity - v_item.quantity where id = v_item.id;
  end loop;
  return query select v_id, v_order_number, v_total;
end;
$$;

-- Do not accept a late provider notification. The Pix request receives this
-- same deadline, so Mercado Pago also rejects payment after the five minutes.
create or replace function public.finalize_mercado_pago_payment(
  p_event_id text, p_provider_order_id text, p_provider_payment_id text,
  p_external_reference uuid, p_status text, p_status_detail text, p_amount numeric
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reservation record;
begin
  insert into public.payment_webhook_events (provider_event_id, provider_payment_id) values (p_event_id, p_provider_payment_id) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  select * into v_order from public.orders where id = p_external_reference for update;
  if not found then raise exception 'Pedido do pagamento nao encontrado'; end if;
  if v_order.total_amount <> p_amount then raise exception 'Valor do pagamento nao confere'; end if;
  if public.expire_order_if_due(v_order.id) then return 'expired'; end if;
  select * into v_payment from public.payments
  where order_id = v_order.id and (provider_order_id = p_provider_order_id or provider_payment_id = p_provider_payment_id) for update;
  if not found then raise exception 'Tentativa de pagamento nao encontrada'; end if;
  update public.payments set provider_order_id = coalesce(p_provider_order_id, provider_order_id), provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    status = p_status, status_detail = p_status_detail, updated_at = now() where id = v_payment.id;
  if p_status = 'approved' and v_order.status <> 'paid' then
    update public.orders set status = 'paid', status_pagamento = 'pago', payment_status = 'approved', status_preparo = 'na_fila', mercado_pago_order_id = p_provider_order_id where id = v_order.id;
    update public.inventory_reservations set committed_at = now() where order_id = v_order.id and committed_at is null;
    return 'approved';
  end if;
  if p_status = 'rejected' and v_order.status <> 'paid' then
    for v_reservation in select * from public.inventory_reservations where order_id = v_order.id and released_at is null loop
      update public.items set stock_quantity = stock_quantity + v_reservation.quantity where id = v_reservation.item_id;
      update public.inventory_reservations set released_at = now() where order_id = v_order.id and item_id = v_reservation.item_id;
    end loop;
    update public.orders set payment_status = 'rejected', status_pagamento = 'recusado', stock_released_at = now() where id = v_order.id;
    return 'rejected';
  end if;
  return 'pending';
end;
$$;

revoke all on function public.expire_order_if_due(uuid) from public;
revoke all on function public.expire_due_unpaid_orders() from public;
revoke all on function public.create_pending_order(jsonb, text, text, text) from public;
revoke all on function public.finalize_mercado_pago_payment(text, text, text, uuid, text, text, numeric) from public;
grant execute on function public.expire_order_if_due(uuid) to service_role;
grant execute on function public.expire_due_unpaid_orders() to service_role, postgres;
grant execute on function public.create_pending_order(jsonb, text, text, text) to service_role;
grant execute on function public.finalize_mercado_pago_payment(text, text, text, uuid, text, text, numeric) to service_role;

create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'expire-unpaid-orders') then
    perform cron.schedule('expire-unpaid-orders', '* * * * *', 'select public.expire_due_unpaid_orders()');
  end if;
end;
$$;
