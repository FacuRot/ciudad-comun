# Después

Ideas que aparecieron mientras se construía el prototipo y que **no** entran en
`02-alcance-prototipo.md`. Se anotan acá para no discutirlas dos veces.

- **Crear invitaciones de a muchas desde `/admin`.** El panel lista las que hay sin usar,
  pero las crea de a una el botón "Invitar" de la ciudad. Para la semana 6 hacen falta ~60:
  por ahora se hace con una línea de SQL
  (`insert into invitations(city_id) select id from cities, generate_series(1, 60);`).
  Si la cohorte 2 existe, el botón vale la pena.
