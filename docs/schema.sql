-- =====================================================================
--  Ciudad Común · esquema del prototipo (Supabase / Postgres 15+)
--  Versión 0.2 · 2026-09-13
--
--  Orden: extensiones → tipos → tablas → índices → RLS → funciones
--  internas → funciones RPC → funciones admin → jobs cron → seed.
--
--  Convenciones
--   - Toda mutación pasa por funciones SECURITY DEFINER que validan auth.uid().
--   - Toda acción relevante escribe en events.
--   - Los parámetros de balance viven en cities.config (JSONB).
--   - "Hora del juego" = cities.timezone.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type material_t   as enum ('ladrillo','madera','energia');
create type building_t   as enum ('ladrilleria','aserradero','generador','plaza');
create type lot_status_t as enum ('cerrado','libre','ocupado');
create type lot_state_t  as enum ('activo','descuidado','abandonado');
create type barrio_status_t as enum ('cerrado','abierto');
create type work_status_t   as enum ('en_curso','completada');

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'America/Argentina/Buenos_Aires',
  opened_at   timestamptz not null default now(),
  config      jsonb not null
);

create table barrios (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references cities(id),
  name        text not null,
  ordinal     int  not null,
  status      barrio_status_t not null default 'cerrado',
  opened_at   timestamptz,
  unique (city_id, ordinal)
);

create table players (
  id            uuid primary key references auth.users(id) on delete cascade,
  city_id       uuid not null references cities(id),
  display_name  text not null check (char_length(display_name) between 2 and 24),
  jornadas      int  not null default 3 check (jornadas >= 0),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  invited_by    uuid references players(id),
  is_admin      boolean not null default false,
  unique (city_id, display_name)
);

create table inventories (
  player_id  uuid primary key references players(id) on delete cascade,
  ladrillo   int not null default 0 check (ladrillo >= 0),
  madera     int not null default 0 check (madera   >= 0),
  energia    int not null default 0 check (energia  >= 0)
);

create table lots (
  id            uuid primary key default gen_random_uuid(),
  city_id       uuid not null references cities(id),
  barrio_id     uuid not null references barrios(id),
  x             int not null,
  y             int not null,
  status        lot_status_t not null default 'cerrado',
  owner_id      uuid references players(id),
  name          text check (name is null or char_length(name) between 2 and 24),
  color         text,
  building_type building_t,
  level         int not null default 0 check (level between 0 and 3),
  state         lot_state_t not null default 'activo',
  production_collected_at timestamptz,
  care_days     int not null default 0,
  care_count    int not null default 0,
  claimed_at    timestamptz,
  unique (city_id, x, y),
  unique (owner_id),
  unique (city_id, name)
);

create table constructions (
  id            uuid primary key default gen_random_uuid(),
  lot_id        uuid not null references lots(id),
  building_type building_t not null,
  target_level  int not null check (target_level between 1 and 3),
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null,
  completed_at  timestamptz
);
create unique index constructions_one_active_per_lot
  on constructions(lot_id) where completed_at is null;

create table construction_helps (
  construction_id uuid not null references constructions(id),
  helper_id       uuid not null references players(id),
  created_at      timestamptz not null default now(),
  primary key (construction_id, helper_id)
);

create table public_works (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references cities(id),
  barrio_id    uuid not null references barrios(id),
  name         text not null,
  x            int not null,
  y            int not null,
  cost         jsonb not null,   -- {ladrillo, madera, energia, jornadas}
  progress     jsonb not null default '{"ladrillo":0,"madera":0,"energia":0,"jornadas":0}',
  status       work_status_t not null default 'en_curso',
  completed_at timestamptz
);

create table public_work_contributions (
  id             uuid primary key default gen_random_uuid(),
  public_work_id uuid not null references public_works(id),
  player_id      uuid not null references players(id),
  ladrillo       int not null default 0 check (ladrillo >= 0),
  madera         int not null default 0 check (madera   >= 0),
  energia        int not null default 0 check (energia  >= 0),
  created_at     timestamptz not null default now()
);

create table gifts (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references cities(id),
  from_player uuid not null references players(id),
  to_player   uuid not null references players(id),
  material    material_t not null,
  amount      int not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create table lot_cares (
  id         uuid primary key default gen_random_uuid(),
  lot_id     uuid not null references lots(id),
  carer_id   uuid not null references players(id),
  created_at timestamptz not null default now()
);

create table lot_visits (
  visitor_id uuid not null references players(id),
  lot_id     uuid not null references lots(id),
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (visitor_id, lot_id, day)
);

create table invitations (
  token       text primary key default encode(gen_random_bytes(12),'hex'),
  city_id     uuid not null references cities(id),
  inviter_id  uuid references players(id),
  lot_hint    uuid references lots(id),
  used_by     uuid references players(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days'
);

create table events (
  id                bigserial primary key,
  city_id           uuid not null references cities(id),
  type              text not null,
  actor_id          uuid references players(id),
  lot_id            uuid references lots(id),
  target_player_id  uuid references players(id),
  payload           jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create index events_city_time   on events(city_id, created_at);
create index events_target_time on events(target_player_id, created_at);
create index events_actor_time  on events(actor_id, created_at);
create index events_type_time   on events(type, created_at);

create table notifications_outbox (
  id         bigserial primary key,
  player_id  uuid not null references players(id),
  type       text not null,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- ---------------------------------------------------------------------
-- RLS: lectura para autenticados dentro de su ciudad; sin escritura.
-- ---------------------------------------------------------------------
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

create policy "read city"    on cities   for select to authenticated using (id = my_city_id());
create policy "read barrios" on barrios  for select to authenticated using (city_id = my_city_id());
create policy "read players" on players  for select to authenticated using (city_id = my_city_id());
create policy "read own inventory" on inventories for select to authenticated using (player_id = auth.uid());
create policy "read lots"    on lots     for select to authenticated using (city_id = my_city_id());
create policy "read constructions" on constructions for select to authenticated
  using (exists (select 1 from lots l where l.id = lot_id and l.city_id = my_city_id()));
create policy "read helps"   on construction_helps for select to authenticated using (true);
create policy "read works"   on public_works for select to authenticated using (city_id = my_city_id());
create policy "read contributions" on public_work_contributions for select to authenticated using (true);
create policy "read gifts"   on gifts    for select to authenticated using (city_id = my_city_id());
create policy "read cares"   on lot_cares for select to authenticated using (true);
create policy "read events"  on events   for select to authenticated using (city_id = my_city_id());
-- invitations, lot_visits y notifications_outbox: sin política de lectura para authenticated.

-- Realtime
alter publication supabase_realtime add table lots, constructions, public_works, barrios, events;

-- ---------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------

-- Config de la ciudad del jugador actual (o de una ciudad dada).
create or replace function fx_config(p_city uuid) returns jsonb
language sql stable as $$ select config from cities where id = p_city $$;

create or replace function fx_now_local(p_city uuid) returns timestamp
language sql stable as
$$ select (now() at time zone (select timezone from cities where id = p_city)) $$;

create or replace function fx_log_event(
  p_city uuid, p_type text, p_actor uuid, p_lot uuid, p_target uuid, p_payload jsonb default '{}'
) returns void language sql as $$
  insert into events(city_id, type, actor_id, lot_id, target_player_id, payload)
  values (p_city, p_type, p_actor, p_lot, p_target, coalesce(p_payload,'{}'));
$$;

create or replace function fx_notify(p_player uuid, p_type text, p_payload jsonb default '{}')
returns void language sql as $$
  insert into notifications_outbox(player_id, type, payload) values (p_player, p_type, coalesce(p_payload,'{}'));
$$;

-- Jugador actual, con bloqueo de fila. Falla si no existe.
create or replace function fx_me() returns players
language plpgsql as $$
declare me players;
begin
  select * into me from players where id = auth.uid() for update;
  if not found then raise exception 'NO_PLAYER'; end if;
  return me;
end $$;

-- Consume una jornada o falla.
create or replace function fx_spend_jornada(p_player uuid) returns void
language plpgsql as $$
begin
  update players set jornadas = jornadas - 1 where id = p_player and jornadas > 0;
  if not found then raise exception 'NO_JORNADAS'; end if;
end $$;

-- Descuenta materiales o falla.
create or replace function fx_spend_materials(p_player uuid, p_l int, p_m int, p_e int) returns void
language plpgsql as $$
begin
  update inventories
     set ladrillo = ladrillo - p_l, madera = madera - p_m, energia = energia - p_e
   where player_id = p_player and ladrillo >= p_l and madera >= p_m and energia >= p_e;
  if not found then raise exception 'NO_MATERIALS'; end if;
end $$;

-- Estado del lote según días efectivos sin entrar del dueño.
create or replace function fx_lot_state(p_lot lots) returns lot_state_t
language plpgsql stable as $$
declare cfg jsonb; days_away numeric; eff numeric; seen timestamptz;
begin
  if p_lot.owner_id is null then return 'activo'; end if;
  cfg := fx_config(p_lot.city_id);
  select last_seen_at into seen from players where id = p_lot.owner_id;
  days_away := extract(epoch from (now() - seen)) / 86400.0;
  eff := days_away - p_lot.care_days;
  if eff >= (cfg #>> '{decay,abandonado_after_days}')::numeric then return 'abandonado';
  elsif eff >= (cfg #>> '{decay,descuidado_after_days}')::numeric then return 'descuidado';
  else return 'activo'; end if;
end $$;

-- Tasa efectiva de producción (unidades/hora) de un lote.
create or replace function fx_effective_rate(p_lot lots) returns numeric
language plpgsql stable as $$
declare cfg jsonb; base numeric; plazas int; bonus numeric; work_bonus numeric := 1.0; st_factor numeric;
begin
  if p_lot.level = 0 or p_lot.building_type is null or p_lot.building_type = 'plaza' then return 0; end if;
  cfg := fx_config(p_lot.city_id);
  base := (cfg #>> ('{production,rate_by_level,' || p_lot.level || '}')::text[])::numeric;

  select count(*) into plazas from lots n
   where n.city_id = p_lot.city_id and n.building_type = 'plaza' and n.level > 0 and n.state = 'activo'
     and abs(n.x - p_lot.x) + abs(n.y - p_lot.y) = 1;
  bonus := least(plazas * (cfg #>> '{production,plaza_bonus}')::numeric, (cfg #>> '{production,plaza_bonus_cap}')::numeric);

  if exists (select 1 from public_works w where w.barrio_id = p_lot.barrio_id and w.status = 'completada') then
    work_bonus := 1 + (cfg #>> '{production,public_work_bonus}')::numeric;
  end if;

  st_factor := (cfg #>> ('{production,state_factor,' || p_lot.state || '}')::text[])::numeric;
  return base * (1 + bonus) * work_bonus * st_factor;
end $$;

-- Recoge la producción pendiente del lote del jugador (perezosa, con tope).
create or replace function fx_collect_production(p_player uuid) returns jsonb
language plpgsql as $$
declare l lots; cfg jsonb; hours numeric; rate numeric; amount int; mat text;
begin
  select * into l from lots where owner_id = p_player for update;
  if not found or l.level = 0 or l.building_type = 'plaza' then return '{}'::jsonb; end if;
  cfg := fx_config(l.city_id);
  hours := least(extract(epoch from (now() - coalesce(l.production_collected_at, now()))) / 3600.0,
                 (cfg #>> '{production,accrual_cap_hours}')::numeric);
  rate := fx_effective_rate(l);
  amount := floor(hours * rate);
  update lots set production_collected_at = now() where id = l.id;
  if amount <= 0 then return '{}'::jsonb; end if;
  mat := cfg #>> ('{buildings,produces,' || l.building_type || '}')::text[];
  execute format('update inventories set %I = %I + $1 where player_id = $2', mat, mat) using amount, p_player;
  perform fx_log_event(l.city_id, 'production.collected', p_player, l.id, null, jsonb_build_object('material', mat, 'amount', amount));
  return jsonb_build_object('material', mat, 'amount', amount);
end $$;

-- ---------------------------------------------------------------------
-- Funciones RPC (cliente)
-- ---------------------------------------------------------------------

-- Registro: usa una invitación, crea jugador, inventario y toma un lote.
create or replace function claim_lot(
  p_token text, p_display_name text, p_lot_id uuid, p_lot_name text, p_color text
) returns lots
language plpgsql security definer set search_path = public as $$
declare inv invitations; cfg jsonb; l lots; ok boolean; occupied int;
begin
  if auth.uid() is null then raise exception 'NO_AUTH'; end if;
  if exists (select 1 from players where id = auth.uid()) then raise exception 'ALREADY_PLAYER'; end if;

  select * into inv from invitations where token = p_token and used_by is null and expires_at > now() for update;
  if not found then raise exception 'BAD_INVITE'; end if;
  cfg := fx_config(inv.city_id);

  select * into l from lots where id = p_lot_id and city_id = inv.city_id and status = 'libre' for update;
  if not found then raise exception 'LOT_NOT_FREE'; end if;

  -- Nunca un lote aislado: distancia <= max_claim_distance a un lote ocupado no abandonado, salvo ciudad vacía.
  select count(*) into occupied from lots where city_id = inv.city_id and status = 'ocupado';
  if occupied > 0 then
    select exists (
      select 1 from lots o where o.city_id = inv.city_id and o.status = 'ocupado' and o.state <> 'abandonado'
        and abs(o.x - l.x) + abs(o.y - l.y) <= (cfg #>> '{lots,max_claim_distance}')::int
    ) into ok;
    if not ok then raise exception 'LOT_ISOLATED'; end if;
  end if;

  if p_color is null or not (cfg -> 'palette') ? p_color then raise exception 'BAD_COLOR'; end if;

  insert into players(id, city_id, display_name, jornadas, invited_by)
  values (auth.uid(), inv.city_id, p_display_name, (cfg #>> '{jornadas,initial}')::int, inv.inviter_id);

  insert into inventories(player_id, ladrillo, madera, energia)
  values (auth.uid(), (cfg #>> '{materials,starter,ladrillo}')::int, (cfg #>> '{materials,starter,madera}')::int, (cfg #>> '{materials,starter,energia}')::int);

  update lots set status = 'ocupado', owner_id = auth.uid(), name = p_lot_name, color = p_color,
                  state = 'activo', claimed_at = now(), production_collected_at = now()
   where id = l.id returning * into l;

  update invitations set used_by = auth.uid() where token = p_token;

  perform fx_log_event(inv.city_id, 'player.joined', auth.uid(), l.id, inv.inviter_id, jsonb_build_object('display_name', p_display_name));
  perform fx_log_event(inv.city_id, 'lot.claimed',   auth.uid(), l.id, null, jsonb_build_object('name', p_lot_name, 'color', p_color));

  -- Aviso a vecinos cercanos (para el padrino) y al invitador.
  insert into notifications_outbox(player_id, type, payload)
  select distinct o.owner_id, 'neighbor.new', jsonb_build_object('lot_id', l.id, 'display_name', p_display_name)
    from lots o where o.city_id = inv.city_id and o.owner_id is not null and o.owner_id <> auth.uid()
     and abs(o.x - l.x) + abs(o.y - l.y) <= 2;
  return l;
end $$;

create or replace function rename_lot(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare me players; l lots;
begin
  me := fx_me();
  update lots set name = p_name where owner_id = me.id returning * into l;
  if not found then raise exception 'NO_LOT'; end if;
  perform fx_log_event(me.city_id, 'lot.renamed', me.id, l.id, null, jsonb_build_object('name', p_name));
end $$;

create or replace function recolor_lot(p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare me players; l lots;
begin
  me := fx_me();
  if not (fx_config(me.city_id) -> 'palette') ? p_color then raise exception 'BAD_COLOR'; end if;
  update lots set color = p_color where owner_id = me.id returning * into l;
  if not found then raise exception 'NO_LOT'; end if;
  perform fx_log_event(me.city_id, 'lot.recolored', me.id, l.id, null, jsonb_build_object('color', p_color));
end $$;

-- Construir nivel 1 (elige tipo) o mejorar al siguiente nivel.
create or replace function build(p_building_type building_t) returns constructions
language plpgsql security definer set search_path = public as $$
declare me players; l lots; cfg jsonb; target int; cost jsonb; hrs numeric; c constructions;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into l from lots where owner_id = me.id for update;
  if not found then raise exception 'NO_LOT'; end if;
  if exists (select 1 from constructions where lot_id = l.id and completed_at is null) then raise exception 'ALREADY_BUILDING'; end if;
  if l.level >= 3 then raise exception 'MAX_LEVEL'; end if;
  if l.level > 0 and l.building_type <> p_building_type then raise exception 'TYPE_LOCKED'; end if;

  cfg := fx_config(me.city_id);
  target := l.level + 1;
  cost := cfg #> ('{buildings,levels,' || target || ',cost}')::text[];
  hrs  := (cfg #>> ('{buildings,levels,' || target || ',hours}')::text[])::numeric;

  perform fx_spend_jornada(me.id);
  perform fx_spend_materials(me.id, (cost->>'ladrillo')::int, (cost->>'madera')::int, (cost->>'energia')::int);

  insert into constructions(lot_id, building_type, target_level, ends_at)
  values (l.id, p_building_type, target, now() + (hrs * interval '1 hour')) returning * into c;

  perform fx_log_event(me.city_id, 'construction.started', me.id, l.id, null,
    jsonb_build_object('building_type', p_building_type, 'target_level', target, 'ends_at', c.ends_at));
  return c;
end $$;

-- Ayudar la construcción de otro.
create or replace function help_construction(p_construction_id uuid) returns constructions
language plpgsql security definer set search_path = public as $$
declare me players; c constructions; l lots; cfg jsonb; new_end timestamptz;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into c from constructions where id = p_construction_id and completed_at is null for update;
  if not found then raise exception 'NO_CONSTRUCTION'; end if;
  select * into l from lots where id = c.lot_id;
  if l.owner_id = me.id then raise exception 'OWN_CONSTRUCTION'; end if;
  if l.city_id <> me.city_id then raise exception 'OTHER_CITY'; end if;
  cfg := fx_config(me.city_id);

  perform fx_spend_jornada(me.id);
  insert into construction_helps(construction_id, helper_id) values (c.id, me.id); -- PK impide ayudar dos veces

  new_end := c.ends_at - ((cfg #>> '{help,hours_reduced}')::numeric * interval '1 hour');
  update constructions set ends_at = new_end where id = c.id returning * into c;

  perform fx_log_event(me.city_id, 'construction.helped', me.id, l.id, l.owner_id,
    jsonb_build_object('construction_id', c.id, 'new_ends_at', new_end));
  perform fx_notify(l.owner_id, 'construction.helped', jsonb_build_object('helper', me.display_name));

  if new_end <= now() then perform job_complete_constructions(); select * into c from constructions where id = c.id; end if;
  return c;
end $$;

-- Aportar a una obra pública (1 jornada + materiales opcionales).
create or replace function contribute(p_public_work_id uuid, p_l int default 0, p_m int default 0, p_e int default 0)
returns public_works
language plpgsql security definer set search_path = public as $$
declare me players; w public_works; give_l int; give_m int; give_e int; done boolean;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into w from public_works where id = p_public_work_id and city_id = me.city_id and status = 'en_curso' for update;
  if not found then raise exception 'NO_WORK'; end if;
  if p_l < 0 or p_m < 0 or p_e < 0 then raise exception 'BAD_AMOUNT'; end if;

  -- No entregar más de lo que falta.
  give_l := least(p_l, (w.cost->>'ladrillo')::int - (w.progress->>'ladrillo')::int);
  give_m := least(p_m, (w.cost->>'madera')::int   - (w.progress->>'madera')::int);
  give_e := least(p_e, (w.cost->>'energia')::int  - (w.progress->>'energia')::int);

  perform fx_spend_jornada(me.id);
  perform fx_spend_materials(me.id, give_l, give_m, give_e);

  insert into public_work_contributions(public_work_id, player_id, ladrillo, madera, energia)
  values (w.id, me.id, give_l, give_m, give_e);

  update public_works set progress = jsonb_build_object(
      'ladrillo', (progress->>'ladrillo')::int + give_l,
      'madera',   (progress->>'madera')::int   + give_m,
      'energia',  (progress->>'energia')::int  + give_e,
      'jornadas', (progress->>'jornadas')::int + 1)
   where id = w.id returning * into w;

  perform fx_log_event(me.city_id, 'public_work.contributed', me.id, null, null,
    jsonb_build_object('public_work_id', w.id, 'ladrillo', give_l, 'madera', give_m, 'energia', give_e));

  done := (w.progress->>'ladrillo')::int >= (w.cost->>'ladrillo')::int
      and (w.progress->>'madera')::int   >= (w.cost->>'madera')::int
      and (w.progress->>'energia')::int  >= (w.cost->>'energia')::int
      and (w.progress->>'jornadas')::int >= (w.cost->>'jornadas')::int;
  if done then
    update public_works set status = 'completada', completed_at = now() where id = w.id returning * into w;
    perform fx_log_event(me.city_id, 'public_work.completed', null, null, null, jsonb_build_object('public_work_id', w.id, 'name', w.name));
    insert into notifications_outbox(player_id, type, payload)
    select id, 'public_work.completed', jsonb_build_object('name', w.name) from players where city_id = me.city_id;
  end if;
  return w;
end $$;

-- Cuidar el lote de un vecino ausente.
create or replace function care_lot(p_lot_id uuid) returns lots
language plpgsql security definer set search_path = public as $$
declare me players; l lots; cfg jsonb;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into l from lots where id = p_lot_id and city_id = me.city_id and status = 'ocupado' for update;
  if not found then raise exception 'NO_LOT'; end if;
  if l.owner_id = me.id then raise exception 'OWN_LOT'; end if;
  cfg := fx_config(me.city_id);
  if l.state = 'activo' then raise exception 'LOT_NOT_NEGLECTED'; end if;
  if l.care_count >= (cfg #>> '{care,max_per_absence}')::int then raise exception 'CARE_LIMIT'; end if;

  perform fx_spend_jornada(me.id);
  update lots set care_days = care_days + (cfg #>> '{care,days_added}')::int, care_count = care_count + 1
   where id = l.id returning * into l;
  update lots set state = fx_lot_state(l) where id = l.id returning * into l;

  insert into lot_cares(lot_id, carer_id) values (l.id, me.id);
  perform fx_log_event(me.city_id, 'lot.cared', me.id, l.id, l.owner_id, jsonb_build_object('care_count', l.care_count));
  perform fx_notify(l.owner_id, 'lot.cared', jsonb_build_object('carer', me.display_name));
  return l;
end $$;

-- Regalar materiales (sin jornada).
create or replace function gift(p_to_player uuid, p_material material_t, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare me players; cfg jsonb; to_name text;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  cfg := fx_config(me.city_id);
  if p_to_player = me.id then raise exception 'SELF_GIFT'; end if;
  if p_amount < (cfg #>> '{gift,min_amount}')::int then raise exception 'GIFT_TOO_SMALL'; end if;
  select display_name into to_name from players where id = p_to_player and city_id = me.city_id;
  if not found then raise exception 'NO_PLAYER'; end if;

  execute format('update inventories set %I = %I - $1 where player_id = $2 and %I >= $1', p_material, p_material, p_material) using p_amount, me.id;
  if not found then raise exception 'NO_MATERIALS'; end if;
  execute format('update inventories set %I = %I + $1 where player_id = $2', p_material, p_material) using p_amount, p_to_player;

  insert into gifts(city_id, from_player, to_player, material, amount) values (me.city_id, me.id, p_to_player, p_material, p_amount);
  perform fx_log_event(me.city_id, 'gift.sent', me.id, null, p_to_player, jsonb_build_object('material', p_material, 'amount', p_amount));
  perform fx_notify(p_to_player, 'gift.received', jsonb_build_object('from', me.display_name, 'material', p_material, 'amount', p_amount));
end $$;

-- Registrar visita a un lote ajeno (máx. una por día).
create or replace function visit_lot(p_lot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players; l lots; inserted boolean;
begin
  me := fx_me();
  select * into l from lots where id = p_lot_id and city_id = me.city_id and owner_id is not null and owner_id <> me.id;
  if not found then return; end if;
  insert into lot_visits(visitor_id, lot_id, day) values (me.id, l.id, (fx_now_local(me.city_id))::date)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted then perform fx_log_event(me.city_id, 'lot.visited', me.id, l.id, l.owner_id, '{}'); end if;
end $$;

-- Latido de sesión: recoge producción, actualiza last_seen, devuelve horas fuera y si corresponde resumen.
create or replace function heartbeat() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; hours_away numeric; collected jsonb; cfg jsonb; l lots; prev_seen timestamptz;
begin
  me := fx_me();
  cfg := fx_config(me.city_id);
  prev_seen := me.last_seen_at;
  hours_away := extract(epoch from (now() - prev_seen)) / 3600.0;

  -- Recogemos ANTES de resetear estado para que la ausencia se refleje en lo producido.
  collected := fx_collect_production(me.id);

  update players set last_seen_at = now() where id = me.id;
  select * into l from lots where owner_id = me.id for update;
  if found and (l.state <> 'activo' or l.care_count > 0) then
    update lots set state = 'activo', care_days = 0, care_count = 0 where id = l.id;
    if l.state <> 'activo' then
      perform fx_log_event(me.city_id, 'lot.state_changed', null, l.id, me.id, jsonb_build_object('from', l.state, 'to', 'activo'));
    end if;
  end if;

  if hours_away >= (cfg #>> '{summary,min_hours_away}')::numeric then
    perform fx_log_event(me.city_id, 'session.started', me.id, null, null, jsonb_build_object('hours_away', round(hours_away, 1)));
  end if;

  return jsonb_build_object('hours_away', round(hours_away, 1), 'since', prev_seen, 'collected', collected,
                            'show_summary', hours_away >= (cfg #>> '{summary,min_hours_away}')::numeric);
end $$;

-- Eventos para el resumen "mientras no estabas" desde una fecha.
create or replace function get_summary(p_since timestamptz) returns setof events
language sql security definer set search_path = public stable as $$
  select e.* from events e, players me
   where me.id = auth.uid() and e.city_id = me.city_id and e.created_at > p_since
     and (
       e.target_player_id = me.id
       or e.type in ('public_work.contributed','public_work.completed','barrio.opened')
       or (e.type = 'player.joined' and exists (
            select 1 from lots a, lots b where a.owner_id = me.id and b.id = e.lot_id and abs(a.x-b.x)+abs(a.y-b.y) <= 2))
     )
   order by e.created_at;
$$;

-- Crear link de invitación (cualquier jugador puede invitar).
create or replace function create_invitation() returns text
language plpgsql security definer set search_path = public as $$
declare me players; l lots; t text;
begin
  me := fx_me();
  select * into l from lots where owner_id = me.id;
  insert into invitations(city_id, inviter_id, lot_hint) values (me.city_id, me.id, l.id) returning token into t;
  return t;
end $$;

-- Datos públicos de una invitación (para la pantalla de entrada, sin auth de jugador).
create or replace function invitation_info(p_token text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object('valid', (i.used_by is null and i.expires_at > now()),
                            'city_id', i.city_id, 'inviter', p.display_name, 'lot_hint', i.lot_hint)
    from invitations i left join players p on p.id = i.inviter_id where i.token = p_token;
$$;

-- ---------------------------------------------------------------------
-- Funciones de administración
-- ---------------------------------------------------------------------
create or replace function fx_require_admin() returns players
language plpgsql as $$
declare me players;
begin
  me := fx_me();
  if not me.is_admin then raise exception 'NOT_ADMIN'; end if;
  return me;
end $$;

create or replace function admin_open_barrio(p_barrio_id uuid, p_reason text default 'admin') returns void
language plpgsql security definer set search_path = public as $$
declare b barrios;
begin
  select * into b from barrios where id = p_barrio_id and status = 'cerrado' for update;
  if not found then return; end if;
  update barrios set status = 'abierto', opened_at = now() where id = b.id;
  update lots set status = 'libre' where barrio_id = b.id and status = 'cerrado';
  perform fx_log_event(b.city_id, 'barrio.opened', null, null, null, jsonb_build_object('barrio_id', b.id, 'name', b.name, 'reason', p_reason));
  insert into notifications_outbox(player_id, type, payload)
  select id, 'barrio.opened', jsonb_build_object('name', b.name) from players where city_id = b.city_id;
end $$;

create or replace function admin_force_open_barrio(p_barrio_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform fx_require_admin(); perform admin_open_barrio(p_barrio_id, 'admin'); end $$;

create or replace function admin_city_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := fx_require_admin();
  return (select jsonb_build_object(
    'players', (select count(*) from players where city_id = me.city_id),
    'active_today', (select count(*) from players where city_id = me.city_id and last_seen_at > now() - interval '1 day'),
    'lots_free', (select count(*) from lots where city_id = me.city_id and status = 'libre'),
    'lots_by_state', (select jsonb_object_agg(state, n) from (select state, count(*) n from lots where city_id = me.city_id and status = 'ocupado' group by state) s),
    'constructions_active', (select count(*) from constructions c join lots l on l.id = c.lot_id where l.city_id = me.city_id and c.completed_at is null),
    'works', (select jsonb_agg(jsonb_build_object('name', name, 'status', status, 'progress', progress, 'cost', cost)) from public_works where city_id = me.city_id),
    'pending_notifications', (select count(*) from notifications_outbox where sent_at is null),
    'new_players_24h', (select jsonb_agg(display_name) from players where city_id = me.city_id and created_at > now() - interval '1 day')
  ));
end $$;

-- ---------------------------------------------------------------------
-- Jobs (idempotentes)
-- ---------------------------------------------------------------------
create or replace function job_refill_jornadas() returns void
language plpgsql security definer set search_path = public as $$
begin
  update players p set jornadas = least(p.jornadas + (c.config #>> '{jornadas,per_day}')::int, (c.config #>> '{jornadas,cap}')::int)
    from cities c where c.id = p.city_id;
end $$;

create or replace function job_update_lot_states() returns void
language plpgsql security definer set search_path = public as $$
declare r lots; ns lot_state_t;
begin
  for r in select * from lots where status = 'ocupado' loop
    ns := fx_lot_state(r);
    if ns <> r.state then
      -- Recoger con la tasa vieja antes de cambiar el estado no aplica: la producción es del dueño y se recoge al entrar.
      update lots set state = ns where id = r.id;
      perform fx_log_event(r.city_id, 'lot.state_changed', null, r.id, r.owner_id, jsonb_build_object('from', r.state, 'to', ns));
      if ns = 'descuidado' then perform fx_notify(r.owner_id, 'lot.neglected', '{}'); end if;
    end if;
  end loop;
end $$;

create or replace function job_complete_constructions() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select c.*, l.city_id, l.owner_id from constructions c join lots l on l.id = c.lot_id
            where c.completed_at is null and c.ends_at <= now() for update of c loop
    -- Recoger producción al nivel viejo antes de subir.
    perform fx_collect_production(r.owner_id);
    update lots set building_type = r.building_type, level = r.target_level, production_collected_at = now() where id = r.lot_id;
    update constructions set completed_at = now() where id = r.id;
    perform fx_log_event(r.city_id, 'construction.completed', null, r.lot_id, r.owner_id, jsonb_build_object('building_type', r.building_type, 'level', r.target_level));
    perform fx_notify(r.owner_id, 'construction.completed', jsonb_build_object('building_type', r.building_type, 'level', r.target_level));
  end loop;
end $$;

create or replace function job_check_barrio_opening() returns void
language plpgsql security definer set search_path = public as $$
declare c cities; b barrios; total int; taken int; ratio numeric;
begin
  for c in select * from cities loop
    select * into b from barrios where city_id = c.id and status = 'cerrado' order by ordinal limit 1;
    if not found then continue; end if;
    select count(*), count(*) filter (where status = 'ocupado') into total, taken
      from lots where city_id = c.id and barrio_id in (select id from barrios where city_id = c.id and status = 'abierto');
    ratio := case when total = 0 then 0 else taken::numeric / total end;
    if ratio >= (c.config #>> '{barrio,open_threshold}')::numeric then
      perform admin_open_barrio(b.id, 'threshold');
    elsif now() >= c.opened_at + make_interval(days => (c.config #>> '{barrio,open_after_days}')::int) then
      perform admin_open_barrio(b.id, 'time');
    end if;
  end loop;
end $$;

-- Cron (UTC). 00:00 y 00:10 hora Argentina = 03:00 y 03:10 UTC.
select cron.schedule('refill_jornadas',        '0 3 * * *',   $$select job_refill_jornadas()$$);
select cron.schedule('update_lot_states',      '10 3 * * *',  $$select job_update_lot_states()$$);
select cron.schedule('complete_constructions', '*/5 * * * *', $$select job_complete_constructions()$$);
select cron.schedule('check_barrio_opening',   '0 * * * *',   $$select job_check_barrio_opening()$$);

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;  -- RLS filtra; las tablas sin política no devuelven filas
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function invitation_info(text) to anon, authenticated;
grant execute on function claim_lot(text,text,uuid,text,text), rename_lot(text), recolor_lot(text),
  build(building_t), help_construction(uuid), contribute(uuid,int,int,int), care_lot(uuid),
  gift(uuid,material_t,int), visit_lot(uuid), heartbeat(), get_summary(timestamptz), create_invitation(),
  admin_force_open_barrio(uuid), admin_city_stats(), my_city_id() to authenticated;
-- Para que anon pueda ver el mapa antes de registrarse (pantalla de entrada), agregar políticas
-- de lectura para anon sobre lots/barrios/public_works filtradas por city_id cuando se implemente.

-- =====================================================================
-- SEED (correr una vez). Grilla 12x8; calle en fila 4 y columna 6.
-- Barrio 1 = columnas 0-5 (41 lotes + Escuela en (2,3)).
-- Barrio 2 = columnas 7-11 (34 lotes + Hospital en (9,3)).
-- =====================================================================
do $$
declare cid uuid; b1 uuid; b2 uuid; cfg jsonb; xx int; yy int;
begin
  cfg := $j${
    "jornadas": { "per_day": 3, "cap": 6, "initial": 3, "refill_hour": 0 },
    "materials": { "types": ["ladrillo","madera","energia"], "starter": { "ladrillo": 20, "madera": 20, "energia": 10 } },
    "production": { "rate_by_level": { "1": 2, "2": 3, "3": 5 }, "accrual_cap_hours": 48,
                    "state_factor": { "activo": 1.0, "descuidado": 0.5, "abandonado": 0.0 },
                    "plaza_bonus": 0.10, "plaza_bonus_cap": 0.20, "public_work_bonus": 0.15 },
    "buildings": { "types": ["ladrilleria","aserradero","generador","plaza"],
                   "produces": { "ladrilleria": "ladrillo", "aserradero": "madera", "generador": "energia", "plaza": null },
                   "levels": { "1": { "cost": { "ladrillo": 15, "madera": 10, "energia": 0 },  "hours": 4 },
                               "2": { "cost": { "ladrillo": 30, "madera": 25, "energia": 15 }, "hours": 6 },
                               "3": { "cost": { "ladrillo": 60, "madera": 50, "energia": 40 }, "hours": 12 } } },
    "help": { "hours_reduced": 2, "max_per_helper": 1 },
    "care": { "days_added": 2, "max_per_absence": 3, "min_state": "descuidado" },
    "decay": { "descuidado_after_days": 4, "abandonado_after_days": 8 },
    "gift": { "min_amount": 5 },
    "lots": { "max_claim_distance": 2 },
    "barrio": { "open_threshold": 0.85, "open_after_days": 10 },
    "summary": { "min_hours_away": 4 },
    "palette": ["terracota","ocre","oliva","teal","azul","lila","rosa","gris"]
  }$j$::jsonb;

  insert into cities(name, config) values ('Ciudad Común · Cohorte 1', cfg) returning id into cid;
  insert into barrios(city_id, name, ordinal, status, opened_at) values (cid, 'Barrio Fundadores', 1, 'abierto', now()) returning id into b1;
  insert into barrios(city_id, name, ordinal, status) values (cid, 'Barrio del Río', 2, 'cerrado') returning id into b2;

  for yy in 0..7 loop
    for xx in 0..11 loop
      continue when yy = 4 or xx = 6;                       -- calles
      continue when (xx = 2 and yy = 3) or (xx = 9 and yy = 3); -- obras públicas
      if xx < 6 then
        insert into lots(city_id, barrio_id, x, y, status) values (cid, b1, xx, yy, 'libre');
      else
        insert into lots(city_id, barrio_id, x, y, status) values (cid, b2, xx, yy, 'cerrado');
      end if;
    end loop;
  end loop;

  insert into public_works(city_id, barrio_id, name, x, y, cost) values
    (cid, b1, 'Escuela',  2, 3, '{"ladrillo":500,"madera":400,"energia":300,"jornadas":90}'),
    (cid, b2, 'Hospital', 9, 3, '{"ladrillo":400,"madera":300,"energia":300,"jornadas":60}');

  -- Invitaciones iniciales para el equipo (sin invitador).
  insert into invitations(city_id) select cid from generate_series(1, 5);
end $$;

-- Después del seed: registrar al admin por magic link, usar una invitación con claim_lot,
-- y luego:  update players set is_admin = true where display_name = '<apodo>';
