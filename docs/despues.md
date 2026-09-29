# Después

Ideas que aparecieron mientras se construía el prototipo y que **no** entran en
`02-alcance-prototipo.md`. Se anotan acá para no discutirlas dos veces.

- **Crear invitaciones de a muchas desde `/admin`.** El panel lista las que hay sin usar,
  pero las crea de a una el botón "Invitar" de la ciudad. Para la semana 6 hacen falta ~60:
  por ahora se hace con una línea de SQL
  (`insert into invitations(city_id) select id from cities, generate_series(1, 60);`).
  Si la cohorte 2 existe, el botón vale la pena.
- **Luminarias.** Segunda estructura con mantenimiento, después de las calles: entraría como
  un factor nuevo del atractivo sin cambiar cómo se mueve la población (`05` §18).
- **Mantenimiento de la Escuela y el Hospital.** Lo mismo: una obra terminada que se gasta y
  que los vecinos sostienen, como factor del atractivo.
- **Un segundo efecto de los ciudadanos.** Después de abrir el Barrio 2 solo se ven. Si hace
  falta que den algo más, que no toque la producción individual ni las jornadas (`05` §16 y §19).
