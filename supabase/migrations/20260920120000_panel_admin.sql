-- =====================================================================
--  Lo que le falta al panel de administración (docs/07-pantallas-y-flujos.md §3):
--  leer el outbox pendiente, marcarlo enviado a mano y repartir invitaciones.
--  notifications_outbox e invitations no tienen política de lectura para
--  authenticated (docs/04, "Seguridad"), así que el admin las ve por función.
-- =====================================================================

-- Avisos sin enviar, del más viejo al más nuevo. Es la lista que el equipo
-- lee para avisar por WhatsApp cuando scripts/notify.ts no está corriendo.
create or replace function admin_pending_notifications(p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := fx_require_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.created_at)
      from (
        select n.id, n.type, n.payload, n.created_at, n.player_id, p.display_name
          from notifications_outbox n
          join players p on p.id = n.player_id
         where n.sent_at is null and p.city_id = me.city_id
         order by n.created_at
         limit least(greatest(coalesce(p_limit, 100), 1), 500)
      ) r
  ), '[]'::jsonb);
end $$;

-- Marca avisos como enviados (modo manual). Devuelve cuántos marcó.
-- No emite evento: no cambia el estado del juego, solo el registro de envíos.
create or replace function admin_mark_notified(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare me players; n int;
begin
  me := fx_require_admin();
  update notifications_outbox o
     set sent_at = now()
   where o.id = any(coalesce(p_ids, '{}'::bigint[]))
     and o.sent_at is null
     and exists (select 1 from players p where p.id = o.player_id and p.city_id = me.city_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Invitaciones sin usar, para repartir. Las vencidas vienen marcadas.
create or replace function admin_invitations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := fx_require_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.created_at)
      from (
        select i.token, i.created_at, i.expires_at, i.expires_at <= now() as expired,
               p.display_name as inviter, l.name as lot_hint_name
          from invitations i
          left join players p on p.id = i.inviter_id
          left join lots l    on l.id = i.lot_hint
         where i.city_id = me.city_id and i.used_by is null
         order by i.created_at
      ) r
  ), '[]'::jsonb);
end $$;

grant execute on function
  admin_pending_notifications(int), admin_mark_notified(bigint[]), admin_invitations()
to authenticated;
