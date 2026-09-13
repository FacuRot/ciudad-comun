-- =====================================================================
--  Permisos. Lectura bajo RLS; escritura solo vía funciones.
--  Solo las RPC del contrato (docs/06-acciones-y-api.md) son ejecutables por el cliente.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- Tablas: solo lectura (RLS filtra; las tablas sin política no devuelven filas).
grant select on all tables in schema public to authenticated;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Funciones: nada ejecutable por defecto, ni las existentes ni las que se creen en migraciones futuras.
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function invitation_info(text) to anon, authenticated;
grant execute on function
  claim_lot(text,text,uuid,text,text), rename_lot(text), recolor_lot(text),
  build(building_t), help_construction(uuid), contribute(uuid,int,int,int), care_lot(uuid),
  gift(uuid,material_t,int), visit_lot(uuid), heartbeat(), get_summary(timestamptz), create_invitation(),
  admin_force_open_barrio(uuid), admin_city_stats(), my_city_id()
to authenticated;
