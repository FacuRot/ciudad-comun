-- =====================================================================
--  RLS: lectura para autenticados dentro de su ciudad; sin escritura.
--  Toda mutación pasa por funciones SECURITY DEFINER (ver migraciones rpc y admin_y_jobs).
-- =====================================================================

alter table cities                    enable row level security;
alter table barrios                   enable row level security;
alter table players                   enable row level security;
alter table inventories               enable row level security;
alter table lots                      enable row level security;
alter table constructions             enable row level security;
alter table construction_helps        enable row level security;
alter table public_works              enable row level security;
alter table public_work_contributions enable row level security;
alter table gifts                     enable row level security;
alter table lot_cares                 enable row level security;
alter table lot_visits                enable row level security;
alter table invitations               enable row level security;
alter table events                    enable row level security;
alter table notifications_outbox      enable row level security;

create or replace function my_city_id() returns uuid
language sql stable security definer set search_path = public as
$$ select city_id from players where id = auth.uid() $$;

-- (select my_city_id()) se evalúa una vez por consulta en lugar de una vez por fila.
create policy "read city"    on cities   for select to authenticated using (id = (select my_city_id()));
create policy "read barrios" on barrios  for select to authenticated using (city_id = (select my_city_id()));
create policy "read players" on players  for select to authenticated using (city_id = (select my_city_id()));
create policy "read own inventory" on inventories for select to authenticated using (player_id = (select auth.uid()));
create policy "read lots"    on lots     for select to authenticated using (city_id = (select my_city_id()));
create policy "read constructions" on constructions for select to authenticated
  using (exists (select 1 from lots l where l.id = lot_id and l.city_id = (select my_city_id())));
create policy "read helps"   on construction_helps for select to authenticated using (true);
create policy "read works"   on public_works for select to authenticated using (city_id = (select my_city_id()));
create policy "read contributions" on public_work_contributions for select to authenticated using (true);
create policy "read gifts"   on gifts    for select to authenticated using (city_id = (select my_city_id()));
create policy "read cares"   on lot_cares for select to authenticated using (true);
create policy "read events"  on events   for select to authenticated using (city_id = (select my_city_id()));
-- invitations, lot_visits y notifications_outbox: sin política de lectura para authenticated.

-- Realtime
alter publication supabase_realtime add table lots, constructions, public_works, barrios, events;
