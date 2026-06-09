-- SUPABASE-001 P0-03 Step 4
-- Domain: operational and staging tables
-- Goal: tighten only DELETE baseline policies while preserving
-- SELECT/INSERT/UPDATE continuity for active flows.

begin;

do $$
begin
  -- reception-side operational table; align delete with reception ownership.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cancel_job_card'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.cancel_job_card';
  end if;

  execute '
    create policy p0_auth_delete
    on public.cancel_job_card
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''reception'')
      or public.has_module_delete(''job_cards'')
    )
  ';

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closed_but_not_invoiced'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.closed_but_not_invoiced';
  end if;

  execute '
    create policy p0_auth_delete
    on public.closed_but_not_invoiced
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''reports'')
      or public.has_module_delete(''job_cards'')
    )
  ';

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'open_job_cards'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.open_job_cards';
  end if;

  execute '
    create policy p0_auth_delete
    on public.open_job_cards
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''reception'')
      or public.has_module_delete(''job_cards'')
    )
  ';

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_card_closed_data_duplicates_backup'
      and policyname = 'p0_auth_delete'
  ) then
    execute 'drop policy p0_auth_delete on public.job_card_closed_data_duplicates_backup';
  end if;

  execute '
    create policy p0_auth_delete
    on public.job_card_closed_data_duplicates_backup
    for delete
    to authenticated
    using (
      public.is_admin()
      or public.has_module_delete(''reports'')
      or public.has_module_delete(''job_cards'')
    )
  ';
end
$$;

commit;
