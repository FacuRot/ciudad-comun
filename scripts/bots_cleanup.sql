-- =====================================================================
--  Borra los bots de scripts/bots.sql y deja la ciudad como recién sembrada.
--  Se corre antes de invitar a la cohorte (docs/08, semana 5 y semana 6).
--
--    npx supabase db query --linked -f scripts/bots_cleanup.sql
--
--  La otra forma de volver al punto de partida es `supabase db reset`, que
--  además reaplica las migraciones. Esto sirve cuando no se quiere tocar la
--  historia de la base, solo sacar a los bots.
--
--  Corta si hay algún jugador que no sea bot: no borra datos de gente real.
-- =====================================================================
do $limpieza$
declare n_real int; n_bots int; cid uuid;
begin
  select count(*) into n_real from players p
    left join auth.users u on u.id = p.id
   where coalesce(u.email, '') not like '%@bots.local';
  if n_real > 0 then
    raise exception 'Hay % jugadores que no son bots: esto borraría sus datos.', n_real;
  end if;

  select count(*) into n_bots from players;
  select id into cid from cities order by opened_at limit 1;

  -- Todo lo que hicieron. El orden respeta las claves foráneas.
  delete from events;
  delete from notifications_outbox;
  delete from lot_visits;
  delete from lot_cares;
  delete from gifts;
  delete from public_work_contributions;
  delete from construction_helps;
  delete from constructions;
  delete from invitations;

  -- Los lotes vuelven a estar libres (o cerrados, si su barrio no abrió en el seed).
  update lots l set
    status = (case when b.ordinal = 1 then 'libre' else 'cerrado' end)::lot_status_t,
    owner_id = null, name = null, color = null, building_type = null, level = 0,
    state = 'activo', production_collected_at = null, care_days = 0, care_count = 0, claimed_at = null
   from barrios b where b.id = l.barrio_id;

  update barrios set status = (case when ordinal = 1 then 'abierto' else 'cerrado' end)::barrio_status_t,
                     opened_at = case when ordinal = 1 then now() else null end;

  update public_works set progress = '{"ladrillo":0,"madera":0,"energia":0,"jornadas":0}'::jsonb,
                          status = 'en_curso', completed_at = null;

  update cities set opened_at = now();

  -- inventories cae con players, y players con auth.users.
  delete from auth.users where email like '%@bots.local';

  -- Las invitaciones iniciales del equipo, como en el seed.
  insert into invitations(city_id) select cid from generate_series(1, 5);

  raise notice 'Borrados % bots. La ciudad quedó como en el seed.', n_bots;
end $limpieza$;
