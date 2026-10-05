-- Tracks the handoff of each unit after an order is ready.
-- Kept on the order because kitchen screens always load the whole ticket.
alter table public.orders
  add column if not exists status_entrega jsonb not null default '{}'::jsonb;

create or replace function public.register_order_item_delivery(
  p_order_id uuid,
  p_order_item_id uuid,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
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

  if v_order.status <> 'pronto' or v_order.payment_status <> 'approved' then
    raise exception 'Pedido não está pronto para entrega';
  end if;

  select id, quantity into v_item
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

  select coalesce(bool_and(coalesce((v_next ->> id::text)::integer, 0) >= quantity), false)
  into v_all_delivered
  from public.order_items
  where order_id = v_order.id;

  if v_all_delivered then
    update public.orders
    set status = 'entregue', status_preparo = 'entregue', status_entrega = v_next
    where id = v_order.id;

    insert into public.order_status_events(order_id, previous_status, next_status, actor_id)
    values (v_order.id, v_order.status, 'entregue', p_actor_id);
  else
    update public.orders set status_entrega = v_next where id = v_order.id;
  end if;

  return jsonb_build_object('status', case when v_all_delivered then 'entregue' else 'pronto' end, 'entrega', v_next, 'completo', v_all_delivered);
end;
$$;

revoke all on function public.register_order_item_delivery(uuid, uuid, uuid) from public;
grant execute on function public.register_order_item_delivery(uuid, uuid, uuid) to service_role;
