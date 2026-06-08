-- SUPABASE-001 P0 Fix 3
-- Purpose: enable RLS on sensitive linkage/audit tables with non-breaking,
-- least-privilege baseline policies.
-- Scope: public.user_employee_links, public.audit_logs

begin;

alter table if exists public.user_employee_links
  enable row level security;

alter table if exists public.audit_logs
  enable row level security;

do $$
begin
  -- user_employee_links: authenticated users can view own active mappings;
  -- admins can view all mappings.
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_employee_links'
      and policyname = 'user_employee_links_select_scope'
  ) then
    execute $sql$
      create policy user_employee_links_select_scope
      on public.user_employee_links
      for select
      to authenticated
      using (
        public.is_admin()
        or user_id = auth.uid()
      )
    $sql$;
  end if;

  -- user_employee_links writes: admin-only to preserve governance integrity.
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_employee_links'
      and policyname = 'user_employee_links_insert_admin'
  ) then
    execute $sql$
      create policy user_employee_links_insert_admin
      on public.user_employee_links
      for insert
      to authenticated
      with check (public.is_admin())
    $sql$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_employee_links'
      and policyname = 'user_employee_links_update_admin'
  ) then
    execute $sql$
      create policy user_employee_links_update_admin
      on public.user_employee_links
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin())
    $sql$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_employee_links'
      and policyname = 'user_employee_links_delete_admin'
  ) then
    execute $sql$
      create policy user_employee_links_delete_admin
      on public.user_employee_links
      for delete
      to authenticated
      using (public.is_admin())
    $sql$;
  end if;

  -- audit_logs: admin can read; writes are allowed for authenticated actors
  -- only when actor_id matches their auth user id.
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_select_admin'
  ) then
    execute $sql$
      create policy audit_logs_select_admin
      on public.audit_logs
      for select
      to authenticated
      using (public.is_admin())
    $sql$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_insert_actor_or_admin'
  ) then
    execute $sql$
      create policy audit_logs_insert_actor_or_admin
      on public.audit_logs
      for insert
      to authenticated
      with check (
        public.is_admin()
        or actor_id = auth.uid()
      )
    $sql$;
  end if;
end
$$;

commit;
