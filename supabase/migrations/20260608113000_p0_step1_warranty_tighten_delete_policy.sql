-- SUPABASE-001 P0-03 Step 1 (Warranty Domain Tightening)
-- Goal: non-breaking first tightening pass.
-- Scope: warranty tables only.
-- Change: tighten existing p0_auth_delete policy from broad authenticated
-- to admin or reports-delete permission.
--
-- Important:
-- - Uses existing policy name `p0_auth_delete` (no new policy family invented).
-- - Leaves SELECT/INSERT/UPDATE unchanged in this step to avoid import/report breakage.

begin;

do $$
declare
  tbl text;
  warranty_tables text[] := array[
    'warranty_claim_settlement_report_data',
    'warranty_part_wc_data',
    'warranty_updation_claim_data',
    'warranty_goodwill_data',
    'warranty_amc_data',
    'warranty_fsb_data',
    'warranty_wc_data'
  ];
begin
  foreach tbl in array warranty_tables loop
    execute format('drop policy if exists p0_auth_delete on public.%I', tbl);

    execute format(
      'create policy p0_auth_delete on public.%I for delete to authenticated using (public.is_admin() or public.has_module_delete(''reports''))',
      tbl
    );
  end loop;
end
$$;

commit;
