-- Secure Mercado Pago checkout. Apply through the Supabase migration workflow.
-- The functions are intentionally callable only by service_role; browser clients
-- never create orders, payment attempts, or change payment state directly.

alter table public.orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists mercado_pago_order_id text,
  add column if not exists stock_released_at timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'mercado_pago',
  provider_payment_id text unique,
  provider_order_id text unique,
  idempotency_key uuid not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  status_detail text,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_order_id_idx on public.payments(order_id);
create index if not exists payments_pending_idx on public.payments(status) where status = 'pending';

create table if not exists public.payment_webhook_events (
  provider text not null default 'mercado_pago',
  provider_event_id text not null,
  provider_payment_id text,
  received_at timestamptz not null default now(),
  primary key (provider, provider_event_id)
);

create table if not exists public.inventory_reservations (
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity integer not null check (quantity > 0),
  released_at timestamptz,
  committed_at timestamptz,
  primary key (order_id, item_id)
);

alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.inventory_reservations enable row level security;

-- Authenticated staff may continue to view orders through the existing policies,
-- but payment attempts and webhook audit data are server-only.
revoke all on public.payments, public.payment_webhook_events, public.inventory_reservations from anon, authenticated;

create or replace function public.create_pending_order(
  p_items jsonb,
  p_customer_name text,
  p_payment_method text,
  p_notes text default null
) returns table (id uuid, order_number bigint, total_amount numeric)
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_total numeric(12,2) := 0;
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O carrinho deve conter ao menos um item';
  end if;

  -- Lock products while validating and reserve the quantities. Prices always
  -- come from the database, never from a browser request.
  for v_item in
    select i.id, i.price, i.stock_quantity, requested.quantity
    from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer)
    join public.items i on i.id = requested.item_id
    order by i.id
    for update of i
  loop
    if v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Quantidade inválida';
    end if;
    if v_item.stock_quantity < v_item.quantity then
      raise exception 'Estoque insuficiente';
    end if;
    v_total := v_total + (v_item.price * v_item.quantity);
  end loop;

  select count(*) into v_count from jsonb_to_recordset(p_items) as requested(item_id uuid, quantity integer);
  if v_count <> (select count(*) from (select distinct (entry->>'item_id') from jsonb_array_elements(p_items) entry) ids) then
    raise exception 'Um produto não pode aparecer duas vezes no carrinho';
  end if;
  if v_count = 0 or v_count <> (select count(*) from public.items where id in (select (entry->>'item_id')::uuid from jsonb_array_elements(p_items) entry)) then
    raise exception 'Produto inválido';
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
$$;

create or replace function public.finalize_mercado_pago_payment(
  p_event_id text,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_external_reference uuid,
  p_status text,
  p_status_detail text,
  p_amount numeric
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reservation record;
begin
  insert into public.payment_webhook_events (provider_event_id, provider_payment_id)
  values (p_event_id, p_provider_payment_id)
  on conflict do nothing;
  if not found then return 'duplicate'; end if;

  select * into v_order from public.orders where id = p_external_reference for update;
  if not found then raise exception 'Pedido do pagamento não encontrado'; end if;
  if v_order.total_amount <> p_amount then raise exception 'Valor do pagamento não confere'; end if;

  select * into v_payment from public.payments
    where order_id = v_order.id and (provider_order_id = p_provider_order_id or provider_payment_id = p_provider_payment_id)
    for update;
  if not found then raise exception 'Tentativa de pagamento não encontrada'; end if;

  update public.payments set provider_order_id = coalesce(p_provider_order_id, provider_order_id),
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id), status = p_status,
    status_detail = p_status_detail, updated_at = now() where id = v_payment.id;

  if p_status = 'approved' and v_order.status <> 'paid' then
    update public.orders set status = 'paid', status_pagamento = 'pago', payment_status = 'approved',
      status_preparo = 'na_fila', mercado_pago_order_id = p_provider_order_id where id = v_order.id;
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

revoke all on function public.create_pending_order(jsonb, text, text, text) from public;
revoke all on function public.finalize_mercado_pago_payment(text, text, text, uuid, text, text, numeric) from public;
grant execute on function public.create_pending_order(jsonb, text, text, text) to service_role;
grant execute on function public.finalize_mercado_pago_payment(text, text, text, uuid, text, text, numeric) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
