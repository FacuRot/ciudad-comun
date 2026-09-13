-- La producción perezosa ya no pierde la fracción que falta para completar una unidad.
-- Antes, cada recogida llevaba production_collected_at a now() aunque recogiera 0: a 2/h,
-- volver antes de 30 minutos no daba nada y reiniciaba la cuenta.
create or replace function fx_collect_production(p_player uuid) returns jsonb
language plpgsql set search_path = public as $$
declare l lots; cfg jsonb; since timestamptz; hours numeric; rate numeric; amount int; mat text;
begin
  select * into l from lots where owner_id = p_player for update;
  if not found or l.level = 0 or l.building_type = 'plaza' then return '{}'::jsonb; end if;
  cfg := fx_config(l.city_id);
  rate := fx_effective_rate(l);

  -- Sin reloj o sin producción (abandonado): no hay fracción que guardar y la cuenta arranca de nuevo.
  if l.production_collected_at is null or rate <= 0 then
    update lots set production_collected_at = now() where id = l.id;
    return '{}'::jsonb;
  end if;

  -- Lo acumulado más allá del tope se pierde.
  since := greatest(l.production_collected_at,
                    now() - (cfg #>> '{production,accrual_cap_hours}')::numeric * interval '1 hour');
  hours := extract(epoch from (now() - since)) / 3600.0;
  amount := floor(hours * rate);
  if amount <= 0 then return '{}'::jsonb; end if;

  -- El reloj avanza solo por las unidades entregadas: la fracción sigue acumulando.
  update lots set production_collected_at = since + (amount / rate) * interval '1 hour' where id = l.id;
  mat := cfg #>> ('{buildings,produces,' || l.building_type || '}')::text[];
  execute format('update inventories set %I = %I + $1 where player_id = $2', mat, mat) using amount, p_player;
  perform fx_log_event(l.city_id, 'production.collected', p_player, l.id, null, jsonb_build_object('material', mat, 'amount', amount));
  return jsonb_build_object('material', mat, 'amount', amount);
end $$;
