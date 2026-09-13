-- =====================================================================
--  invitation_map: el mapa de la ciudad de una invitación vigente, para la pantalla
--  de entrada (docs/07-pantallas-y-flujos.md §1, estados A y B), antes de ser jugador.
--  Solo lectura y sin datos personales: no devuelve dueños ni apodos.
--  Se eligió una función por token en lugar de políticas de lectura para anon:
--  el mapa solo lo ve quien tiene un link vigente, y el RLS queda como estaba.
-- =====================================================================

create or replace function invitation_map(p_token text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'timezone', c.timezone,
    'palette', c.config -> 'palette',
    'max_claim_distance', (c.config #>> '{lots,max_claim_distance}')::int,
    'lots', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', l.id, 'barrio_id', l.barrio_id, 'x', l.x, 'y', l.y, 'status', l.status,
               'name', l.name, 'color', l.color, 'building_type', l.building_type,
               'level', l.level, 'state', l.state)), '[]'::jsonb)
             from lots l where l.city_id = c.id),
    'barrios', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', b.id, 'name', b.name, 'ordinal', b.ordinal, 'status', b.status)), '[]'::jsonb)
                from barrios b where b.city_id = c.id),
    'works', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', w.id, 'barrio_id', w.barrio_id, 'name', w.name, 'x', w.x, 'y', w.y,
                'cost', w.cost, 'progress', w.progress, 'status', w.status)), '[]'::jsonb)
              from public_works w where w.city_id = c.id)
  )
  from invitations i join cities c on c.id = i.city_id
  where i.token = p_token and i.used_by is null and i.expires_at > now();
$$;

revoke all on function invitation_map(text) from public, anon, authenticated;
grant execute on function invitation_map(text) to anon, authenticated;
