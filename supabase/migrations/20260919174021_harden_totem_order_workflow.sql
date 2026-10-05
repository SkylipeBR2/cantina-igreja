
-- Totem workflow hardening. Apply after secure_mercado_pago_checkout.sql.
-- Payment approval remains exclusive to finalize_mercado_pago_payment, called by
-- the server after a Mercado Pago webhook/reconciliation.

alter table public.orders add column if not exists tracking_token uuid;
update public.orders set tracking_token = gen_random_uuid() where tracking_token is null;
alter table public.orders alter column tracking_token set default gen_random_uuid();
alter table public.orders alter column tracking_token set not null;
create unique index if not exists orders_tracking_token_key on public.orders(tracking_token);

create table if not exists public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text not null,
  next_status text not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_status_events_order_created_idx
  on public.order_status_events(order_id, created_at desc);
alter table public.order_status_events enable row level security;
revoke all on public.order_status_events from anon, authenticated;

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_next_status text,
  p_actor_id uuid default null
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_preparation text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if (v_order.status = 'paid' and p_next_status = 'preparando') then
    v_preparation := 'preparando';
  elsif (v_order.status = 'preparando' and p_next_status = 'pronto') then
    v_preparation := 'pronto';
  elsif (v_order.status = 'pronto' and p_next_status = 'entregue') then
    v_preparation := 'entregue';
  else
    raise exception 'Transição de pedido inválida: % para %', v_order.status, p_next_status;
  end if;

  update public.orders set status = p_next_status, status_preparo = v_preparation where id = v_order.id;
  insert into public.order_status_events(order_id, previous_status, next_status, actor_id)
    values (v_order.id, v_order.status, p_next_status, p_actor_id);
  return p_next_status;
end;
$$;

create or replace function public.cancel_unpaid_order(
  p_order_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reservation record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status = 'paid' or v_order.payment_status = 'approved' then
    raise exception 'Pedido pago exige estorno antes do cancelamento';
  end if;
  if v_order.status = 'cancelado' then raise exception 'Pedido já está cancelado'; end if;

  for v_reservation in
    select * from public.inventory_reservations
    where order_id = v_order.id and released_at is null and committed_at is null
    for update
  loop
    update public.items set stock_quantity = stock_quantity + v_reservation.quantity where id = v_reservation.item_id;
    update public.inventory_reservations set released_at = now()
      where order_id = v_order.id and item_id = v_reservation.item_id;
  end loop;

  update public.orders set status = 'cancelado', status_preparo = 'cancelado', stock_released_at = now()
    where id = v_order.id;
  insert into public.order_status_events(order_id, previous_status, next_status, actor_id)
    values (v_order.id, v_order.status, 'cancelado', p_actor_id);
end;
$$;

revoke all on function public.transition_order_status(uuid, text, uuid) from public;
revoke all on function public.cancel_unpaid_order(uuid, uuid) from public;
grant execute on function public.transition_order_status(uuid, text, uuid) to service_role;
grant execute on function public.cancel_unpaid_order(uuid, uuid) to service_role;
