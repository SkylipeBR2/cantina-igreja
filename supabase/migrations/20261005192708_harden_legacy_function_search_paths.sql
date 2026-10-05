-- Keep legacy RPC and auth-trigger name resolution deterministic.
alter function public.process_order(jsonb, text, text, numeric)
  set search_path = pg_catalog, public;

alter function public.handle_new_user()
  set search_path = pg_catalog, public;
