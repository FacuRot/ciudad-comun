-- =====================================================================
--  Rangos de las calles (docs/05-reglas-y-parametros.md §18) en la config:
--  buenas de 70 para arriba, gastadas de 40 a 69, rotas debajo de 40. Solo
--  nombran y dibujan el estado, pero como todo número del juego viven en
--  cities.config y no en el cliente.
-- =====================================================================

update cities set config = jsonb_set(config, '{streets}',
  (config -> 'streets') || '{"worn_below": 70, "broken_below": 40}'::jsonb)
 where not (config -> 'streets') ? 'worn_below';

-- Mapa de la invitación: suma los rangos, para que /join dibuje las calles como /city.
create or replace function invitation_map(p_token text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'timezone', c.timezone,
    'palette', c.config -> 'palette',
    'max_claim_distance', (c.config #>> '{lots,max_claim_distance}')::int,
    'streets', jsonb_build_object('worn_below', (c.config #>> '{streets,worn_below}')::numeric,
                                  'broken_below', (c.config #>> '{streets,broken_below}')::numeric),
    'lots', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', l.id, 'barrio_id', l.barrio_id, 'x', l.x, 'y', l.y, 'status', l.status,
               'name', l.name, 'color', l.color, 'building_type', l.building_type,
               'level', l.level, 'state', l.state)), '[]'::jsonb)
             from lots l where l.city_id = c.id),
    'barrios', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', b.id, 'name', b.name, 'ordinal', b.ordinal, 'status', b.status,
                  'population', b.population, 'streets', round(fx_streets_state(b.id), 2))), '[]'::jsonb)
                from barrios b where b.city_id = c.id),
    'works', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', w.id, 'barrio_id', w.barrio_id, 'name', w.name, 'x', w.x, 'y', w.y,
                'cost', w.cost, 'progress', w.progress, 'status', w.status)), '[]'::jsonb)
              from public_works w where w.city_id = c.id)
  )
  from invitations i join cities c on c.id = i.city_id
  where i.token = p_token and i.used_by is null and i.expires_at > now();
$$;
