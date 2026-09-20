-- =====================================================================
--  Las funciones nuevas del panel de admin quedaron ejecutables por PUBLIC
--  (y por lo tanto por anon), contra lo que dice la migración de permisos.
--  Pasó porque el "alter default privileges" de entonces se registró para
--  otro rol que el que crea las funciones por el MCP, así que las nuevas
--  nacen con el EXECUTE que Postgres le da a PUBLIC por defecto.
--
--  Ninguna filtraba nada: sin sesión, fx_require_admin corta con NO_PLAYER.
--  Aun así se cierra, y se vuelve a declarar la regla para el rol que crea
--  las funciones de ahora en adelante.
-- =====================================================================

revoke all on function
  admin_pending_notifications(int), admin_mark_notified(bigint[]), admin_invitations()
from public, anon, authenticated;

grant execute on function
  admin_pending_notifications(int), admin_mark_notified(bigint[]), admin_invitations()
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
