-- =====================================================================
--  SEED. Ciudad, barrios, lotes, config y obras públicas.
--  Grilla 12x8; calle en fila 4 y columna 6.
--  Barrio 1 = columnas 0-5 (41 lotes + Escuela en (2,3)).
--  Barrio 2 = columnas 7-11 (34 lotes + Hospital en (9,3)).
--  Números iniciales: docs/05-reglas-y-parametros.md §14.
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
                   "levels": { "1": { "cost": { "ladrillo": 15, "madera": 10, "energia": 0 },  "hours": 2 },
                               "2": { "cost": { "ladrillo": 30, "madera": 25, "energia": 15 }, "hours": 3 },
                               "3": { "cost": { "ladrillo": 60, "madera": 50, "energia": 40 }, "hours": 6 } } },
    "help": { "hours_reduced": 1, "max_per_helper": 1 },
    "care": { "days_added": 2, "max_per_absence": 3, "min_state": "descuidado" },
    "decay": { "descuidado_after_days": 4, "abandonado_after_days": 8 },
    "gift": { "min_amount": 5 },
    "lots": { "max_claim_distance": 2 },
    "barrio": { "open_threshold": 0.85, "open_after_days": 10, "open_population": 300 },
    "summary": { "min_hours_away": 2 },
    "palette": ["terracota","ocre","oliva","teal","azul","lila","rosa","gris"],
    "citizens": { "capacity_per_lot": 10, "consumption_per_day": 2,
                  "weights": { "lotes": 0.3, "calles": 0.3, "abastecimiento": 0.3, "obra": 0.1 },
                  "arrival_rate": 0.30, "departure_rate": 0.15 }
  }$j$::jsonb;

  insert into cities(name, config) values ('Ciudad Común · Cohorte 1', cfg) returning id into cid;
  insert into barrios(city_id, name, ordinal, status, opened_at) values (cid, 'Barrio Fundadores', 1, 'abierto', now()) returning id into b1;
  insert into barrios(city_id, name, ordinal, status) values (cid, 'Barrio del Río', 2, 'cerrado') returning id into b2;

  for yy in 0..7 loop
    for xx in 0..11 loop
      continue when yy = 4 or xx = 6;                           -- calles
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

-- Después del seed: registrar al admin desde /join/<token> con email y contraseña, fundar su lote,
-- y luego:  update players set is_admin = true where display_name = '<apodo>';
