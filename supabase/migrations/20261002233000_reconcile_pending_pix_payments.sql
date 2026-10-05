-- A browser-visible order may reconcile a pending Pix when a provider webhook
-- is delayed or unavailable. Claiming the attempt in the database prevents a
-- status poll every few seconds from repeatedly calling the provider.
alter table public.payments
  add column if not exists last_reconciled_at timestamptz;

create or replace function public.claim_pending_payment_reconciliation(p_order_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where order_id = p_order_id
    and status = 'pending'
    and provider_payment_id is not null
  order by created_at desc
  limit 1
  for update;

  if not found
    or (v_payment.last_reconciled_at is not null and v_payment.last_reconciled_at > now() - interval '15 seconds') then
    return null;
  end if;

  update public.payments
  set last_reconciled_at = now(), updated_at = now()
  where id = v_payment.id;

  return v_payment.provider_payment_id;
end;
$$;

revoke all on function public.claim_pending_payment_reconciliation(uuid) from public;
grant execute on function public.claim_pending_payment_reconciliation(uuid) to service_role;
