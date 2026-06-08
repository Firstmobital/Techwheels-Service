-- SUPABASE-001 P0 Fix 1
-- Purpose: enforce RLS on public.job_card_closed_data and ensure baseline
-- authenticated policies exist so existing app flows do not break.
-- Notes:
-- 1) Upsert requires both INSERT and UPDATE policies (no separate UPSERT policy).
-- 2) Policy creation is conditional to avoid duplicate-object failures.

begin;

alter table if exists public.job_card_closed_data
  enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_card_closed_data'
      and policyname = 'job_card_closed_data_select_authenticated'
  ) then
    execute $sql$
      create policy job_card_closed_data_select_authenticated
      on public.job_card_closed_data
      for select
      to authenticated
      using (true)
    $sql$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_card_closed_data'
      and policyname = 'job_card_closed_data_insert_authenticated'
  ) then
    execute $sql$
      create policy job_card_closed_data_insert_authenticated
      on public.job_card_closed_data
      for insert
      to authenticated
      with check (true)
    $sql$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_card_closed_data'
      and policyname = 'job_card_closed_data_update_authenticated'
  ) then
    execute $sql$
      create policy job_card_closed_data_update_authenticated
      on public.job_card_closed_data
      for update
      to authenticated
      using (true)
      with check (true)
    $sql$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_card_closed_data'
      and policyname = 'job_card_closed_data_delete_authenticated'
  ) then
    execute $sql$
      create policy job_card_closed_data_delete_authenticated
      on public.job_card_closed_data
      for delete
      to authenticated
      using (true)
    $sql$;
  end if;
end
$$;

commit;
