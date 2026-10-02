-- =====================================================================
--  Pedidos de materiales y lo que le falta a cada lote
--  (docs/05-reglas-y-parametros.md §7.1). Ampliación aprobada el 01/10/2026.
--
--  Un pedido activo por lote, sin tabla nueva: cuatro columnas en lots. Llega a
--  todos por el Realtime de lots y se dibuja como una burbuja sobre el edificio.
--  Se borra solo cuando los regalos de ese material lo cubren, o lo quita el dueño.
--
--  lot_needs deja ver qué le falta a un vecino para su próximo nivel sin abrir
--  la lectura de inventories: devuelve el faltante, nunca el inventario.
-- =====================================================================

-- Clave nueva de la config (§14).
update cities set config = config || '{"request": {"min_amount": 5, "max_amount": 100}}'::jsonb
 where not config ? 'request';

alter table lots add column request_material material_t,
                 add column request_amount   int check (request_amount > 0),
                 add column request_received int not null default 0 check (request_received >= 0),
                 add column requested_at     timestamptz,
                 add constraint lots_request_check
                   check ((request_material is null) = (request_amount is null)
                      and (request_material is null) = (requested_at is null));

-- ---------------------------------------------------------------------
-- request_materials: pide una cantidad de un material. Reemplaza el pedido anterior.
-- ---------------------------------------------------------------------
create or replace function request_materials(p_material material_t, p_amount int) returns lots
language plpgsql security definer set search_path = public as $$
declare me players; cfg jsonb; l lots;
begin
  me := fx_me();
  cfg := fx_config(me.city_id);
  if p_material is null or p_amount is null
     or p_amount < (cfg #>> '{request,min_amount}')::int
     or p_amount > (cfg #>> '{request,max_amount}')::int then
    raise exception 'REQUEST_AMOUNT';
  end if;
  update lots set request_material = p_material, request_amount = p_amount,
                  request_received = 0, requested_at = now()
   where owner_id = me.id returning * into l;
  if not found then raise exception 'NO_LOT'; end if;
  perform fx_log_event(me.city_id, 'request.created', me.id, l.id, null,
    jsonb_build_object('material', p_material, 'amount', p_amount));
  return l;
end $$;

-- ---------------------------------------------------------------------
-- cancel_request: el dueño quita su pedido.
-- ---------------------------------------------------------------------
create or replace function cancel_request() returns lots
language plpgsql security definer set search_path = public as $$
declare me players; l lots;
begin
  me := fx_me();
  select * into l from lots where owner_id = me.id for update;
  if not found then raise exception 'NO_LOT'; end if;
  if l.request_material is null then raise exception 'NO_REQUEST'; end if;
  perform fx_log_event(me.city_id, 'request.cancelled', me.id, l.id, null,
    jsonb_build_object('material', l.request_material, 'amount', l.request_amount, 'received', l.request_received));
  update lots set request_material = null, request_amount = null, request_received = 0, requested_at = null
   where id = l.id returning * into l;
  return l;
end $$;

-- ---------------------------------------------------------------------
-- lot_needs: lo que le falta a un lote de la ciudad para su próximo nivel.
-- Si está en obra, el nivel después del que se está construyendo. Cuenta la
-- producción sin recoger del dueño, sin recogerla. Es solo lectura: no emite evento.
-- {target_level, cost, missing} · target_level null si ya no tiene a qué subir.
-- ---------------------------------------------------------------------
create or replace function lot_needs(p_lot_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; l lots; cfg jsonb; target int; cost jsonb; inv inventories;
        rate numeric; since timestamptz; pending int := 0; mat text; have jsonb;
begin
  select * into me from players where id = auth.uid();
  if not found then raise exception 'NO_PLAYER'; end if;
  select * into l from lots where id = p_lot_id and city_id = me.city_id and owner_id is not null;
  if not found then raise exception 'NO_LOT'; end if;

  select coalesce(max(c.target_level), l.level) + 1 into target
    from constructions c where c.lot_id = l.id and c.completed_at is null;
  if target > 3 then
    return jsonb_build_object('target_level', null, 'cost', null, 'missing', null);
  end if;

  cfg := fx_config(l.city_id);
  cost := cfg #> ('{buildings,levels,' || target || ',cost}')::text[];
  select * into inv from inventories where player_id = l.owner_id;

  -- Lo mismo que entregaría fx_collect_production ahora.
  if l.level > 0 and l.building_type <> 'plaza' and l.production_collected_at is not null then
    rate := fx_effective_rate(l);
    if rate > 0 then
      since := greatest(l.production_collected_at,
                        now() - (cfg #>> '{production,accrual_cap_hours}')::numeric * interval '1 hour');
      pending := floor(extract(epoch from (now() - since)) / 3600.0 * rate);
      mat := case when l.building_type = 'residencial' then l.rent_material::text
                  else cfg #>> ('{buildings,produces,' || l.building_type || '}')::text[] end;
    end if;
  end if;

  have := jsonb_build_object('ladrillo', inv.ladrillo, 'madera', inv.madera, 'energia', inv.energia);
  if mat is not null then have := jsonb_set(have, array[mat], to_jsonb((have->>mat)::int + pending)); end if;

  return jsonb_build_object(
    'target_level', target,
    'cost', cost,
    'missing', jsonb_build_object(
      'ladrillo', greatest(0, (cost->>'ladrillo')::int - (have->>'ladrillo')::int),
      'madera',   greatest(0, (cost->>'madera')::int   - (have->>'madera')::int),
      'energia',  greatest(0, (cost->>'energia')::int  - (have->>'energia')::int)));
end $$;

-- ---------------------------------------------------------------------
-- gift: además, descuenta del pedido del receptor si es de ese material y lo
-- borra cuando queda cubierto. Misma firma que en 20260913195329_rpc.sql:
-- conserva el EXECUTE solo para authenticated.
-- ---------------------------------------------------------------------
create or replace function gift(p_to_player uuid, p_material material_t, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare me players; cfg jsonb; to_name text; n int; l lots;
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

  -- El pedido del receptor, si es de este material.
  update lots set request_received = request_received + p_amount
   where owner_id = p_to_player and request_material = p_material returning * into l;
  if found and l.request_received >= l.request_amount then
    perform fx_log_event(me.city_id, 'request.fulfilled', me.id, l.id, null,
      jsonb_build_object('material', l.request_material, 'amount', l.request_amount, 'received', l.request_received));
    update lots set request_material = null, request_amount = null, request_received = 0, requested_at = null
     where id = l.id;
  end if;
end $$;

revoke all on function request_materials(material_t, int), cancel_request(), lot_needs(uuid) from public, anon;
grant execute on function request_materials(material_t, int), cancel_request(), lot_needs(uuid) to authenticated;
