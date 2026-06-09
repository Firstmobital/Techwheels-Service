-- SUPABASE-001 P0-03 Step 2 (Service Domain Tightening)
-- Goal: non-breaking second tightening pass.
-- Scope: service reporting tables only.
-- Change: tighten existing p0_auth_delete policy from broad authenticated
-- to admin or reports-delete permission.
--
-- Important:
-- - Uses existing policy name `p0_auth_delete` (no new policy family invented).
-- - Leaves SELECT/INSERT/UPDATE unchanged in this step to avoid report/import breakage.

begin;

do $$
declare
  tbl text;
  service_tables text[] := array[
    'service_vas_jc_data',
    'service_jc_parts_data',
    'service_invoice_data',
    'service_invoice_order_data'
  ];
begin
  foreach tbl in array service_tables loop
    execute format('drop policy if exists p0_auth_delete on public.%I', tbl);

    execute format(
      'create policy p0_auth_delete on public.%I for delete to authenticated using (public.is_admin() or public.has_module_delete(''reports''))',
      tbl
    );
  end loop;
end
$$;

commit;
