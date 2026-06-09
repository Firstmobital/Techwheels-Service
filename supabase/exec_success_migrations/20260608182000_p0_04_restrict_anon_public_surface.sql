-- SUPABASE-001 P0-04
-- Purpose: effectively reduce anon exposure surface on public schema objects.
-- Strategy:
--   1) Re-scope known {public} policies used by app tables to authenticated only.
--   2) Revoke anon grants on public schema tables/views and public functions.

begin;

-- 1) Re-scope policy role targets from public/anon to authenticated.
do $$
begin
  -- documents
  alter policy "documents: own dealership insert" on public.documents to authenticated;
  alter policy "documents: own dealership select" on public.documents to authenticated;

  -- email_logs
  alter policy "Users can view email logs for their dealer's job cards" on public.email_logs to authenticated;

  -- estimate_rows
  alter policy "estimate_rows: own dealership insert" on public.estimate_rows to authenticated;
  alter policy "estimate_rows: own dealership select" on public.estimate_rows to authenticated;
  alter policy "estimate_rows: own dealership update" on public.estimate_rows to authenticated;

  -- job_cards
  alter policy "job_cards: own dealership insert" on public.job_cards to authenticated;
  alter policy "job_cards: own dealership select" on public.job_cards to authenticated;
  alter policy "job_cards: own dealership update" on public.job_cards to authenticated;

  -- modules
  alter policy "modules_admin_write" on public.modules to authenticated;
  alter policy "modules_read_all" on public.modules to authenticated;

  -- panel_photos
  alter policy "panel_photos: own dealership insert" on public.panel_photos to authenticated;
  alter policy "panel_photos: own dealership select" on public.panel_photos to authenticated;

  -- panels
  alter policy "panels: own dealership delete" on public.panels to authenticated;
  alter policy "panels: own dealership insert" on public.panels to authenticated;
  alter policy "panels: own dealership select" on public.panels to authenticated;
  alter policy "panels: own dealership update" on public.panels to authenticated;

  -- user_module_permissions
  alter policy "perms_admin_all" on public.user_module_permissions to authenticated;
  alter policy "perms_self_read" on public.user_module_permissions to authenticated;

  -- users
  alter policy "users_admin_all" on public.users to authenticated;
  alter policy "users_admin_write" on public.users to authenticated;
  alter policy "users_self_read" on public.users to authenticated;

  -- vehicles
  alter policy "vehicles: own dealership insert" on public.vehicles to authenticated;
  alter policy "vehicles: own dealership select" on public.vehicles to authenticated;
  alter policy "vehicles: own dealership update" on public.vehicles to authenticated;
end
$$;

-- 2) Revoke broad anon object privileges on public schema.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

commit;
