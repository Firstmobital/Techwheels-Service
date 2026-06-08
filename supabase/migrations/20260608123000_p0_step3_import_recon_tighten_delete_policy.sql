-- SUPABASE-001 P0-03 Step 3
-- Domain: import and reconciliation tables
-- Goal: tighten only DELETE baseline policies while preserving existing
-- SELECT/INSERT/UPDATE continuity for active web/mobile flows.

begin;

do $$
begin
  -- import_employee_mapping_issues is used by settings pendency flows,
  -- so delete is limited to admin or employees module delete rights.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'import_employee_mapping_issues'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.import_employee_mapping_issues';
  end if;

  execute '
    create policy p0_auth_delete
    on public.import_employee_mapping_issues
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''employees'')
    )
  ';

  -- import staging tables align with import/job-card operational ownership.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pending_drive_uploads'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.pending_drive_uploads';
  end if;

  execute '
    create policy p0_auth_delete
    on public.pending_drive_uploads
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''job_cards'')
    )
  ';

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'open_job_cards_import_staging'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.open_job_cards_import_staging';
  end if;

  execute '
    create policy p0_auth_delete
    on public.open_job_cards_import_staging
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''job_cards'')
    )
  ';
end
$$;

commit;
