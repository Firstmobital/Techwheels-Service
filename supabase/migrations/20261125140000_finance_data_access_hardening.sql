-- ACCOUNTS-002 (PD-15 / PD-17 / PD-19): finance and warranty data access hardening.
-- Ledger: DBL-0101. Verified only on an isolated scratch database restored from the metadata snapshot.
-- NOT applied to production. Apply only after the release prerequisites in DB_CHANGE_LEDGER DBL-0101 are met.
--
-- What changes
-- 1. Revenue, invoice and warranty tables (psf_revenue_dms, job_card_closed_data, service_invoice_data,
--    warranty_*): the open `USING (true)` policies for authenticated users are replaced.
--      read   = a module that legitimately reads these tables (list in finance_data_read_allowed()) AND the row's
--               branch is in the caller's scope (dealer codes from my_effective_dealer_codes(), mapped with the
--               existing psf_fallback_location()), or the caller has the explicit all-branch right.
--      write  = the import gate (module job_cards) AND the same branch scope.
--      delete = admin / job_cards delete / reports delete AND the same branch scope.
--    The existing platform admin bypass policy (admin_unrestricted_all_ops_v1) is NOT changed.
-- 2. New explicit right: module `finance_all_branches` (no one holds it until granted).
-- 3. employee_master bank_name, account_number, ifsc are no longer selectable by authenticated or anon.
--    get_employee_bank_details() returns them to payroll, employees (Settings) and sa_tracker users and to admin.
--    Service role (edge functions) is unaffected. Future employee_master columns need an explicit
--    GRANT SELECT (column) TO authenticated (see the paired checks).
--
-- Release prerequisites (production): users must have active user_employee_links with dealer_code (or JWT
-- dealer_codes) for their branches; head-office Finance users need finance_all_branches; importers need the
-- all-branch right or matching links. Without them, those users see no rows.
--
-- ROLLBACK (policies and grants only; no data changed):
--   For each table below: DROP the finance_* policies and recreate the previous policy names with `USING (true)`
--   (SELECT/UPDATE/DELETE) and `WITH CHECK (true)` (INSERT), delete policy for service_invoice_data and warranty_*
--   as `is_admin() OR has_module_delete('reports')`; GRANT SELECT ON public.employee_master TO authenticated;
--   DROP FUNCTION public.get_employee_bank_details(text[]); DROP the finance_* helper functions;
--   DELETE FROM public.modules WHERE name = 'finance_all_branches' (only if nobody was granted it).

INSERT INTO public.modules (name, label, description, is_active)
SELECT 'finance_all_branches', 'Finance: all branches', 'Explicit all-branch read/write scope for finance and warranty data', true
WHERE NOT EXISTS (SELECT 1 FROM public.modules WHERE name = 'finance_all_branches');

CREATE OR REPLACE FUNCTION public.finance_location_key(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR btrim(p_value) = '' THEN NULL
    WHEN lower(btrim(p_value)) LIKE 'sitapura%' THEN 'sitapura'
    WHEN lower(btrim(p_value)) LIKE 'ajmer road%' THEN 'ajmer road'
    ELSE lower(btrim(p_value))
  END
$$;

CREATE OR REPLACE FUNCTION public.finance_all_branches_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$ SELECT public.has_module_view('finance_all_branches'::text) $$;
COMMENT ON FUNCTION public.finance_all_branches_access() IS 'ACCOUNTS-002 PD-17: explicit all-branch finance scope (module finance_all_branches). Platform admin is covered by has_module_view().';

CREATE OR REPLACE FUNCTION public.finance_my_location_keys() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT public.finance_location_key(public.psf_fallback_location(c))) FILTER (WHERE public.psf_fallback_location(c) IS NOT NULL), '{}'::text[])
  FROM unnest(public.my_effective_dealer_codes()) AS t(c)
$$;
COMMENT ON FUNCTION public.finance_my_location_keys() IS 'ACCOUNTS-002 PD-17: branch keys of the caller, from existing dealer-code scope mapped by psf_fallback_location().';

CREATE OR REPLACE FUNCTION public.finance_data_read_allowed() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM unnest(ARRAY['reports','accounts','busy','payroll','job_cards','reception','service_advisor','floor_incharge','sa_tracker','bodyshop_tracker','bodyshop_repair','bodyshop_recovery','bodyshop_floor','technician','wa_agent','cre_incentive','post_service_feedback_cre']::text[]) AS m(name) WHERE public.has_module_view(m.name)
  )
$$;
COMMENT ON FUNCTION public.finance_data_read_allowed() IS 'ACCOUNTS-002 PD-15: modules that legitimately read revenue/warranty tables (caller inventory, task 3.1).';

CREATE OR REPLACE FUNCTION public.finance_data_can_import() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$ SELECT public.is_admin() OR public.has_module_view('job_cards'::text) OR public.has_module_modify('job_cards'::text) $$;

CREATE OR REPLACE FUNCTION public.finance_data_can_delete() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$ SELECT public.is_admin() OR public.has_module_delete('job_cards'::text) OR public.has_module_delete('reports'::text) $$;

REVOKE ALL ON FUNCTION public.finance_all_branches_access(), public.finance_my_location_keys(), public.finance_data_read_allowed(),
  public.finance_data_can_import(), public.finance_data_can_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_all_branches_access(), public.finance_my_location_keys(), public.finance_data_read_allowed(),
  public.finance_data_can_import(), public.finance_data_can_delete() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_location_key(text) TO authenticated, service_role;

-- psf_revenue_dms
DROP POLICY IF EXISTS psf_revenue_dms_select_authenticated ON public.psf_revenue_dms;
DROP POLICY IF EXISTS psf_revenue_dms_insert_authenticated ON public.psf_revenue_dms;
DROP POLICY IF EXISTS psf_revenue_dms_update_authenticated ON public.psf_revenue_dms;
DROP POLICY IF EXISTS psf_revenue_dms_delete_authenticated ON public.psf_revenue_dms;
DROP POLICY IF EXISTS finance_read ON public.psf_revenue_dms;
CREATE POLICY finance_read ON public.psf_revenue_dms FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.psf_revenue_dms;
CREATE POLICY finance_insert ON public.psf_revenue_dms FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.psf_revenue_dms;
CREATE POLICY finance_update ON public.psf_revenue_dms FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.psf_revenue_dms;
CREATE POLICY finance_delete ON public.psf_revenue_dms FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- job_card_closed_data
DROP POLICY IF EXISTS job_card_closed_data_select_authenticated ON public.job_card_closed_data;
DROP POLICY IF EXISTS job_card_closed_data_insert_authenticated ON public.job_card_closed_data;
DROP POLICY IF EXISTS job_card_closed_data_update_authenticated ON public.job_card_closed_data;
DROP POLICY IF EXISTS job_card_closed_data_delete_authenticated ON public.job_card_closed_data;
DROP POLICY IF EXISTS finance_read ON public.job_card_closed_data;
CREATE POLICY finance_read ON public.job_card_closed_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.job_card_closed_data;
CREATE POLICY finance_insert ON public.job_card_closed_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.job_card_closed_data;
CREATE POLICY finance_update ON public.job_card_closed_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.job_card_closed_data;
CREATE POLICY finance_delete ON public.job_card_closed_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- service_invoice_data
DROP POLICY IF EXISTS p0_auth_select ON public.service_invoice_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.service_invoice_data;
DROP POLICY IF EXISTS p0_auth_update ON public.service_invoice_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.service_invoice_data;
DROP POLICY IF EXISTS finance_read ON public.service_invoice_data;
CREATE POLICY finance_read ON public.service_invoice_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(branch) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.service_invoice_data;
CREATE POLICY finance_insert ON public.service_invoice_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(branch) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.service_invoice_data;
CREATE POLICY finance_update ON public.service_invoice_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(branch) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(branch) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.service_invoice_data;
CREATE POLICY finance_delete ON public.service_invoice_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(branch) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_amc_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_amc_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_amc_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_amc_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_amc_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_amc_data;
CREATE POLICY finance_read ON public.warranty_amc_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_amc_data;
CREATE POLICY finance_insert ON public.warranty_amc_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_amc_data;
CREATE POLICY finance_update ON public.warranty_amc_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_amc_data;
CREATE POLICY finance_delete ON public.warranty_amc_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_claim_settlement_report_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_claim_settlement_report_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_claim_settlement_report_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_claim_settlement_report_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_claim_settlement_report_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_claim_settlement_report_data;
CREATE POLICY finance_read ON public.warranty_claim_settlement_report_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_claim_settlement_report_data;
CREATE POLICY finance_insert ON public.warranty_claim_settlement_report_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_claim_settlement_report_data;
CREATE POLICY finance_update ON public.warranty_claim_settlement_report_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_claim_settlement_report_data;
CREATE POLICY finance_delete ON public.warranty_claim_settlement_report_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_fsb_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_fsb_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_fsb_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_fsb_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_fsb_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_fsb_data;
CREATE POLICY finance_read ON public.warranty_fsb_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_fsb_data;
CREATE POLICY finance_insert ON public.warranty_fsb_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_fsb_data;
CREATE POLICY finance_update ON public.warranty_fsb_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_fsb_data;
CREATE POLICY finance_delete ON public.warranty_fsb_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_goodwill_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_goodwill_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_goodwill_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_goodwill_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_goodwill_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_goodwill_data;
CREATE POLICY finance_read ON public.warranty_goodwill_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_goodwill_data;
CREATE POLICY finance_insert ON public.warranty_goodwill_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_goodwill_data;
CREATE POLICY finance_update ON public.warranty_goodwill_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_goodwill_data;
CREATE POLICY finance_delete ON public.warranty_goodwill_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_part_wc_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_part_wc_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_part_wc_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_part_wc_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_part_wc_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_part_wc_data;
CREATE POLICY finance_read ON public.warranty_part_wc_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_part_wc_data;
CREATE POLICY finance_insert ON public.warranty_part_wc_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_part_wc_data;
CREATE POLICY finance_update ON public.warranty_part_wc_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_part_wc_data;
CREATE POLICY finance_delete ON public.warranty_part_wc_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_updation_claim_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_updation_claim_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_updation_claim_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_updation_claim_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_updation_claim_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_updation_claim_data;
CREATE POLICY finance_read ON public.warranty_updation_claim_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_updation_claim_data;
CREATE POLICY finance_insert ON public.warranty_updation_claim_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_updation_claim_data;
CREATE POLICY finance_update ON public.warranty_updation_claim_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_updation_claim_data;
CREATE POLICY finance_delete ON public.warranty_updation_claim_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_wc_data
DROP POLICY IF EXISTS p0_auth_select ON public.warranty_wc_data;
DROP POLICY IF EXISTS p0_auth_insert ON public.warranty_wc_data;
DROP POLICY IF EXISTS p0_auth_update ON public.warranty_wc_data;
DROP POLICY IF EXISTS p0_auth_delete ON public.warranty_wc_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_wc_data;
CREATE POLICY finance_read ON public.warranty_wc_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_insert ON public.warranty_wc_data;
CREATE POLICY finance_insert ON public.warranty_wc_data FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_update ON public.warranty_wc_data;
CREATE POLICY finance_update ON public.warranty_wc_data FOR UPDATE TO authenticated
  USING ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))))
  WITH CHECK ((SELECT public.finance_data_can_import()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
DROP POLICY IF EXISTS finance_delete ON public.warranty_wc_data;
CREATE POLICY finance_delete ON public.warranty_wc_data FOR DELETE TO authenticated
  USING ((SELECT public.finance_data_can_delete()) AND ((SELECT public.finance_all_branches_access()) OR public.finance_location_key(coalesce(location, branch)) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));

-- warranty_labour_data (read-only for users; written by the warranty sync edge function with the service role)
DROP POLICY IF EXISTS allow_read_labour ON public.warranty_labour_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_labour_data;
CREATE POLICY finance_read ON public.warranty_labour_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR upper(btrim(dealer_code)) = ANY (COALESCE((SELECT public.my_effective_dealer_codes()), '{}'::text[]))));

-- warranty_spl_codes_data (read-only for users; written by the warranty sync edge function with the service role)
DROP POLICY IF EXISTS allow_read_spl ON public.warranty_spl_codes_data;
DROP POLICY IF EXISTS finance_read ON public.warranty_spl_codes_data;
CREATE POLICY finance_read ON public.warranty_spl_codes_data FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed()) AND ((SELECT public.finance_all_branches_access()) OR upper(btrim(dealer_code)) = ANY (COALESCE((SELECT public.my_effective_dealer_codes()), '{}'::text[]))));

-- Employee bank fields (PD-19)
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'employee_master'
     AND column_name NOT IN ('bank_name', 'account_number', 'ifsc');
  EXECUTE 'REVOKE SELECT ON TABLE public.employee_master FROM authenticated, anon';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.employee_master TO authenticated', v_cols);
END
$$;

CREATE OR REPLACE FUNCTION public.get_employee_bank_details(p_employee_codes text[] DEFAULT NULL)
RETURNS TABLE(employee_code text, bank_name text, account_number text, ifsc text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin()
          OR public.has_module_view('payroll'::text)
          OR public.has_module_view('employees'::text)
          OR public.has_module_view('sa_tracker'::text)) THEN
    RAISE EXCEPTION 'permission denied: requires payroll, employees or sa_tracker view' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT em.employee_code, em.bank_name, em.account_number, em.ifsc
      FROM public.employee_master em
     WHERE p_employee_codes IS NULL OR em.employee_code = ANY (p_employee_codes);
END;
$$;
COMMENT ON FUNCTION public.get_employee_bank_details(text[]) IS 'ACCOUNTS-002 PD-19: only way for app users to read employee bank fields; payroll, employees (Settings), sa_tracker or admin.';
REVOKE ALL ON FUNCTION public.get_employee_bank_details(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_bank_details(text[]) TO authenticated, service_role;

-- Admin-only batch writer for the bank fields, used by the Settings employee CSV import: an upsert that sets
-- bank columns reads EXCLUDED.bank_name, which now needs a column privilege the application role no longer has.
CREATE OR REPLACE FUNCTION public.set_employee_bank_details(p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin required' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;
  WITH src AS (
    SELECT upper(btrim(r.employee_code)) AS code,
           nullif(btrim(r.bank_name), '') AS bn,
           nullif(btrim(r.account_number), '') AS an,
           nullif(btrim(r.ifsc), '') AS ifsc
      FROM jsonb_to_recordset(p_rows) AS r(employee_code text, bank_name text, account_number text, ifsc text)
  )
  UPDATE public.employee_master em
     SET bank_name = src.bn, account_number = src.an, ifsc = src.ifsc
    FROM src
   WHERE upper(btrim(em.employee_code)) = src.code;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
COMMENT ON FUNCTION public.set_employee_bank_details(jsonb) IS 'ACCOUNTS-002 PD-19: admin-only batch update of employee bank fields (Settings CSV import).';
REVOKE ALL ON FUNCTION public.set_employee_bank_details(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_bank_details(jsonb) TO authenticated, service_role;
