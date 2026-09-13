-- =====================================================================
--  Ciudad Común · esquema base: extensiones, tipos, tablas e índices.
--  Origen: docs/schema.sql (v0.2). Modelo explicado en docs/04-modelo-de-datos.md.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type material_t      as enum ('ladrillo','madera','energia');
create type building_t      as enum ('ladrilleria','aserradero','generador','plaza');
create type lot_status_t    as enum ('cerrado','libre','ocupado');
create type lot_state_t     as enum ('activo','descuidado','abandonado');
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
  token       text primary key default encode(extensions.gen_random_bytes(12), 'hex'),
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
