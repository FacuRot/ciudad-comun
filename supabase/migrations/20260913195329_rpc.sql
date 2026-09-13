-- =====================================================================
--  Funciones RPC (cliente). Contrato en docs/06-acciones-y-api.md.
--  Todas SECURITY DEFINER, validan auth.uid(), nunca reciben player_id y escriben en events.
-- =====================================================================

-- Registro: usa una invitación, crea jugador, inventario y toma un lote.
create or replace function claim_lot(
  p_token text, p_display_name text, p_lot_id uuid, p_lot_name text, p_color text
) returns lots
language plpgsql security definer set search_path = public as $$
declare inv invitations; cfg jsonb; l lots; ok boolean; occupied int; dist int;
begin
  if auth.uid() is null then raise exception 'NO_AUTH'; end if;
  if exists (select 1 from players where id = auth.uid()) then raise exception 'ALREADY_PLAYER'; end if;

  select * into inv from invitations where token = p_token and used_by is null and expires_at > now() for update;
  if not found then raise exception 'BAD_INVITE'; end if;
  cfg := fx_config(inv.city_id);
  dist := (cfg #>> '{lots,max_claim_distance}')::int;

  select * into l from lots where id = p_lot_id and city_id = inv.city_id and status = 'libre' for update;
  if not found then raise exception 'LOT_NOT_FREE'; end if;

  -- Nunca un lote aislado: distancia <= max_claim_distance a un lote ocupado no abandonado, salvo ciudad vacía.
  select count(*) into occupied from lots where city_id = inv.city_id and status = 'ocupado';
  if occupied > 0 then
    select exists (
      select 1 from lots o where o.city_id = inv.city_id and o.status = 'ocupado' and o.state <> 'abandonado'
        and abs(o.x - l.x) + abs(o.y - l.y) <= dist
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

  -- Aviso a vecinos cercanos (para el padrino).
  insert into notifications_outbox(player_id, type, payload)
  select distinct o.owner_id, 'neighbor.new', jsonb_build_object('lot_id', l.id, 'display_name', p_display_name)
    from lots o where o.city_id = inv.city_id and o.owner_id is not null and o.owner_id <> auth.uid()
     and abs(o.x - l.x) + abs(o.y - l.y) <= dist;
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
  if p_color is null or not (fx_config(me.city_id) -> 'palette') ? p_color then raise exception 'BAD_COLOR'; end if;
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
  insert into construction_helps(construction_id, helper_id) values (c.id, me.id); -- la PK impide ayudar dos veces

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
  p_l := coalesce(p_l, 0); p_m := coalesce(p_m, 0); p_e := coalesce(p_e, 0);
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
declare me players; cfg jsonb; to_name text; n int;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  cfg := fx_config(me.city_id);
  if p_to_player = me.id then raise exception 'SELF_GIFT'; end if;
  if p_amount is null or p_amount < (cfg #>> '{gift,min_amount}')::int then raise exception 'GIFT_TOO_SMALL'; end if;
  select display_name into to_name from players where id = p_to_player and city_id = me.city_id;
  if not found then raise exception 'NO_PLAYER'; end if;

  -- EXECUTE no actualiza FOUND: se verifica con ROW_COUNT.
  execute format('update inventories set %I = %I - $1 where player_id = $2 and %I >= $1', p_material, p_material, p_material) using p_amount, me.id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NO_MATERIALS'; end if;
  execute format('update inventories set %I = %I + $1 where player_id = $2', p_material, p_material) using p_amount, p_to_player;

  insert into gifts(city_id, from_player, to_player, material, amount) values (me.city_id, me.id, p_to_player, p_material, p_amount);
  perform fx_log_event(me.city_id, 'gift.sent', me.id, null, p_to_player, jsonb_build_object('material', p_material, 'amount', p_amount));
  perform fx_notify(p_to_player, 'gift.received', jsonb_build_object('from', me.display_name, 'material', p_material, 'amount', p_amount));
end $$;

-- Registrar visita a un lote ajeno (máx. una por visitante por lote por día del juego).
create or replace function visit_lot(p_lot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players; l lots; n int;
begin
  me := fx_me();
  select * into l from lots where id = p_lot_id and city_id = me.city_id and owner_id is not null and owner_id <> me.id;
  if not found then return; end if;
  insert into lot_visits(visitor_id, lot_id, day) values (me.id, l.id, (fx_now_local(me.city_id))::date)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform fx_log_event(me.city_id, 'lot.visited', me.id, l.id, l.owner_id, '{}'); end if;
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
  select e.* from events e, players me, cities c
   where me.id = auth.uid() and c.id = me.city_id and e.city_id = me.city_id and e.created_at > p_since
     and (
       e.target_player_id = me.id
       or e.type in ('public_work.contributed','public_work.completed','barrio.opened')
       or (e.type = 'player.joined' and e.actor_id <> me.id and exists (
            select 1 from lots a, lots b where a.owner_id = me.id and b.id = e.lot_id
               and abs(a.x-b.x)+abs(a.y-b.y) <= (c.config #>> '{lots,max_claim_distance}')::int))
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
