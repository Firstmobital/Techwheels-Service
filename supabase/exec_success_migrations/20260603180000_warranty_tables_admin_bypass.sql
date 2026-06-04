-- 2026-06-03
-- Purpose: Add admin RLS bypass to warranty tables (warranty_wc_data, warranty_claim_settlement_report_data, etc.)
-- Previously these tables had no policies, causing admin to see scoped data despite global bypass.
-- This migration grants active admin users unrestricted access to all warranty tables.

-- Contract: Admin with role='admin' and is_active=true bypasses all dealer-code filtering on warranty tables.

-- Set strict timeout to fail fast on lock contention
SET lock_timeout = '30s';
SET statement_timeout = '0';

-- WARRANTY_WC_DATA
ALTER TABLE public.warranty_wc_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_wc_data_select ON public.warranty_wc_data;
CREATE POLICY warranty_wc_data_select
ON public.warranty_wc_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- WARRANTY_CLAIM_SETTLEMENT_REPORT_DATA
ALTER TABLE public.warranty_claim_settlement_report_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_claim_settlement_select ON public.warranty_claim_settlement_report_data;
CREATE POLICY warranty_claim_settlement_select
ON public.warranty_claim_settlement_report_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- WARRANTY_PART_WC_DATA
ALTER TABLE public.warranty_part_wc_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_part_wc_select ON public.warranty_part_wc_data;
CREATE POLICY warranty_part_wc_select
ON public.warranty_part_wc_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- WARRANTY_UPDATION_CLAIM_DATA
ALTER TABLE public.warranty_updation_claim_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_updation_claim_select ON public.warranty_updation_claim_data;
CREATE POLICY warranty_updation_claim_select
ON public.warranty_updation_claim_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- WARRANTY_GOODWILL_DATA
ALTER TABLE public.warranty_goodwill_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_goodwill_select ON public.warranty_goodwill_data;
CREATE POLICY warranty_goodwill_select
ON public.warranty_goodwill_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- WARRANTY_AMC_DATA
ALTER TABLE public.warranty_amc_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_amc_select ON public.warranty_amc_data;
CREATE POLICY warranty_amc_select
ON public.warranty_amc_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- WARRANTY_FSB_DATA
ALTER TABLE public.warranty_fsb_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warranty_fsb_select ON public.warranty_fsb_data;
CREATE POLICY warranty_fsb_select
ON public.warranty_fsb_data
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- Verification: All warranty tables now have RLS enabled with admin bypass
-- Expected result: 8 warranty tables × 1 SELECT policy = 8 policies
-- Run query to verify:
-- SELECT tablename, COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'warranty%' GROUP BY tablename;
