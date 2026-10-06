-- One optional kiosk-experience rating per paid order. The orders table remains
-- inaccessible to anon/authenticated; only server-side service_role writes it.
alter table public.orders
  add column if not exists totem_rating smallint,
  add column if not exists totem_rated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_totem_rating_valid'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_totem_rating_valid
      check (
        (totem_rating is null and totem_rated_at is null)
        or (totem_rating is not null and totem_rating between 1 and 5 and totem_rated_at is not null)
      );
  end if;
end $$;

comment on column public.orders.totem_rating is 'Nota de 1 a 5 para a experiência no totem, enviada após o pagamento.';
