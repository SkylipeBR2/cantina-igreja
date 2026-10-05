-- Keep direct browser access disabled, including for objects created by earlier migrations.
do $$
declare
  table_record record;
begin
  for table_record in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_record.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Return an existing pending attempt or create exactly one while holding a lock
-- on the order. Retries (including concurrent requests) reuse its provider key.
create or replace function public.begin_payment_attempt(
  p_order_id uuid,
  p_tracking_token uuid,
  p_payment_method text
) returns table (
  payment_id uuid,
  idempotency_key uuid,
  amount numeric(12,2),
  provider_order_id text,
  provider_payment_id text
)
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  select * into v_order
  from public.orders
  where id = p_order_id and tracking_token = p_tracking_token
  for update;

  if not found
    or v_order.status <> 'pending_payment'
    or v_order.payment_status <> 'pending'
    or v_order.payment_method <> p_payment_method
    or v_order.payment_expires_at <= now() then
    raise exception 'Pedido indisponível para pagamento';
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.payments (order_id, idempotency_key, amount)
    values (p_order_id, gen_random_uuid(), v_order.total_amount)
    returning * into v_payment;
  end if;

  return query select v_payment.id, v_payment.idempotency_key,
    v_payment.amount, v_payment.provider_order_id, v_payment.provider_payment_id;
end;
$$;

revoke all on function public.begin_payment_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_payment_attempt(uuid, uuid, text) to service_role;

-- Repeated QR requests must not silently extend the stock reservation/payment window.
create or replace function public.begin_pix_payment_window(p_order_id uuid)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_payment_expires_at timestamptz;
begin
  select payment_expires_at into v_payment_expires_at
  from public.orders
  where id = p_order_id
    and status = 'pending_payment'
    and payment_status = 'pending'
    and payment_method = 'pix'
    and payment_expires_at > now()
  for update;

  if not found then
    raise exception 'Pedido indisponível para pagamento Pix';
  end if;

  return v_payment_expires_at;
end;
$$;

revoke all on function public.begin_pix_payment_window(uuid) from public, anon, authenticated;
grant execute on function public.begin_pix_payment_window(uuid) to service_role;
