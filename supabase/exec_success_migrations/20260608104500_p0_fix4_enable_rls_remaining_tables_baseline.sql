-- SUPABASE-001 P0 Fix 4
-- Purpose: clear remaining RLS-disabled-in-public errors without breaking
-- existing authenticated flows.
-- Strategy: enable RLS and add baseline authenticated CRUD policies per table.
-- Follow-up: tighten least-privilege policies in P0/P1 after error baseline is cleared.

begin;

do $$
declare
  tbl text;
  tables text[] := array[
    'service_vas_jc_data',
    'service_jc_parts_data',
    'service_invoice_data',
    'import_employee_mapping_issues',
    'service_invoice_order_data',
    'warranty_claim_settlement_report_data',
    'warranty_part_wc_data',
    'warranty_updation_claim_data',
    'warranty_goodwill_data',
    'warranty_amc_data',
    'warranty_fsb_data',
    'warranty_wc_data',
    'cancel_job_card',
    'closed_but_not_invoiced',
    'open_job_cards',
    'pending_drive_uploads',
    'open_job_cards_import_staging',
    'job_card_closed_data_duplicates_backup'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table if exists public.%I enable row level security', tbl);

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'p0_auth_select'
    ) then
      execute format(
        'create policy p0_auth_select on public.%I for select to authenticated using (true)',
        tbl
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'p0_auth_insert'
    ) then
      execute format(
        'create policy p0_auth_insert on public.%I for insert to authenticated with check (true)',
        tbl
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'p0_auth_update'
    ) then
      execute format(
        'create policy p0_auth_update on public.%I for update to authenticated using (true) with check (true)',
        tbl
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'p0_auth_delete'
    ) then
      execute format(
        'create policy p0_auth_delete on public.%I for delete to authenticated using (true)',
        tbl
      );
    end if;
  end loop;
end
$$;

commit;
