-- =====================================================================
--  Aportes a obras públicas sin jornadas de más (docs/05-reglas-y-parametros.md §5).
--  El contador de jornadas de la obra no pasa del objetivo. Con las jornadas
--  completas, un aporte que no lleva ningún material que falte se rechaza con
--  WORK_NEEDS_MATERIALS y no cuesta la jornada. El evento dice cuántas jornadas
--  sumó a la obra (1, o 0 si ya estaban completas), para que el resumen
--  reconstruya el progreso anterior.
--  Misma firma que en 20260913195329_rpc.sql: conserva el EXECUTE solo para authenticated.
-- =====================================================================

create or replace function contribute(p_public_work_id uuid, p_l int default 0, p_m int default 0, p_e int default 0)
returns public_works
language plpgsql security definer set search_path = public as $$
declare me players; w public_works; give_l int; give_m int; give_e int; give_j int; done boolean;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into w from public_works where id = p_public_work_id and city_id = me.city_id and status = 'en_curso' for update;
  if not found then raise exception 'NO_WORK'; end if;
  p_l := coalesce(p_l, 0); p_m := coalesce(p_m, 0); p_e := coalesce(p_e, 0);
  if p_l < 0 or p_m < 0 or p_e < 0 then raise exception 'BAD_AMOUNT'; end if;

  -- No entregar más de lo que falta, tampoco de jornadas.
  give_l := least(p_l, (w.cost->>'ladrillo')::int - (w.progress->>'ladrillo')::int);
  give_m := least(p_m, (w.cost->>'madera')::int   - (w.progress->>'madera')::int);
  give_e := least(p_e, (w.cost->>'energia')::int  - (w.progress->>'energia')::int);
  give_j := greatest(0, least(1, (w.cost->>'jornadas')::int - (w.progress->>'jornadas')::int));

  -- Con las jornadas completas, la jornada sola ya no suma: el aporte tiene que llevar algo que falte.
  if give_j = 0 and give_l + give_m + give_e = 0 then raise exception 'WORK_NEEDS_MATERIALS'; end if;

  perform fx_spend_jornada(me.id);
  perform fx_spend_materials(me.id, give_l, give_m, give_e);

  insert into public_work_contributions(public_work_id, player_id, ladrillo, madera, energia)
  values (w.id, me.id, give_l, give_m, give_e);

  update public_works set progress = jsonb_build_object(
      'ladrillo', (progress->>'ladrillo')::int + give_l,
      'madera',   (progress->>'madera')::int   + give_m,
      'energia',  (progress->>'energia')::int  + give_e,
      'jornadas', (progress->>'jornadas')::int + give_j)
   where id = w.id returning * into w;

  perform fx_log_event(me.city_id, 'public_work.contributed', me.id, null, null,
    jsonb_build_object('public_work_id', w.id, 'ladrillo', give_l, 'madera', give_m, 'energia', give_e, 'jornadas', give_j));

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
