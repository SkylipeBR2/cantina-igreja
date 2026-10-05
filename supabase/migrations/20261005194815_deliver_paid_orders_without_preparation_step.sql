-- Paid orders can be handed off directly. Keep each item handoff atomic and
-- mark the order delivered only when all units have actually been handed over.
create or replace function public.register_order_item_delivery(
  p_order_id uuid,
  p_order_item_id uuid,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_delivered integer;
  v_next jsonb;
  v_all_delivered boolean;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.payment_status <> 'approved'
    or v_order.status not in ('paid', 'preparando', 'pronto') then
    raise exception 'Pedido não está liberado para entrega';
  end if;

  select * into v_item
  from public.order_items
  where id = p_order_item_id and order_id = v_order.id
  for update;

  if not found then
    raise exception 'Item não pertence ao pedido';
  end if;

  v_delivered := coalesce((v_order.status_entrega ->> p_order_item_id::text)::integer, 0);
  if v_delivered >= v_item.quantity then
    return jsonb_build_object('status', v_order.status, 'entrega', v_order.status_entrega, 'completo', false);
  end if;

  v_next := jsonb_set(
    v_order.status_entrega,
    array[p_order_item_id::text],
    to_jsonb(v_delivered + 1),
    true
  );

  select coalesce(bool_and(coalesce((v_next ->> oi.id::text)::integer, 0) >= oi.quantity), false)
  into v_all_delivered
  from public.order_items oi
  where oi.order_id = v_order.id;

  if v_all_delivered then
    update public.orders
    set status = 'entregue', status_preparo = 'entregue', status_entrega = v_next
    where id = v_order.id;

    insert into public.order_status_events(order_id, previous_status, next_status, actor_id)
    values (v_order.id, v_order.status, 'entregue', p_actor_id);
  else
    update public.orders set status_entrega = v_next where id = v_order.id;
  end if;

  return jsonb_build_object(
    'status', case when v_all_delivered then 'entregue' else v_order.status end,
    'entrega', v_next,
    'completo', v_all_delivered
  );
end;
$$;

-- One button can record every remaining unit in a single transaction.
create or replace function public.complete_order_delivery(
  p_order_id uuid,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_next jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.payment_status <> 'approved'
    or v_order.status not in ('paid', 'preparando', 'pronto') then
    raise exception 'Pedido não está liberado para entrega';
  end if;

  select jsonb_object_agg(oi.id::text, oi.quantity)
  into v_next
  from public.order_items oi
  where oi.order_id = v_order.id;

  if v_next is null then
    raise exception 'Pedido sem itens';
  end if;

  update public.orders
  set status = 'entregue', status_preparo = 'entregue', status_entrega = v_next
  where id = v_order.id;

  insert into public.order_status_events(order_id, previous_status, next_status, actor_id)
  values (v_order.id, v_order.status, 'entregue', p_actor_id);

  return jsonb_build_object('status', 'entregue', 'entrega', v_next, 'completo', true);
end;
$$;

revoke all on function public.register_order_item_delivery(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_order_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_order_item_delivery(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_order_delivery(uuid, uuid) to service_role;
