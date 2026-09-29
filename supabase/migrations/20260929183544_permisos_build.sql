-- La migración del residencial recreó build con otra firma, y Supabase le dio EXECUTE a
-- PUBLIC (y con eso a anon). Como en permisos.sql: solo la ejecuta authenticated.
revoke all on function build(building_t, material_t) from public, anon;
grant execute on function build(building_t, material_t) to authenticated;
