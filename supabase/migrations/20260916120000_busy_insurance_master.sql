-- BUSY-001 / DBL-0067
-- Persist Bodyshop insurance company → BUSY Group of Account + GSTIN.
-- This is the live authority previously hardcoded as BUSY_INSURANCE_MASTER.
-- Not BODYSHOP-INSURER-001 / DBL-0042 (SA policy-name catalog).
-- Reversible: DROP TRIGGER trg_busy_insurance_master_normalize_v1;
--   DROP TRIGGER trg_busy_insurance_master_updated_at;
--   DROP FUNCTION public.busy_insurance_master_normalize_v1();
--   DROP TABLE public.busy_insurance_master;

CREATE TABLE IF NOT EXISTS public.busy_insurance_master (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_name text NOT NULL,
  gstin text NOT NULL,
  busy_group text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT busy_insurance_master_company_name_not_blank
    CHECK (length(btrim(company_name)) > 0),
  CONSTRAINT busy_insurance_master_busy_group_not_blank
    CHECK (length(btrim(busy_group)) > 0),
  CONSTRAINT busy_insurance_master_gstin_format
    CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$')
);

COMMENT ON TABLE public.busy_insurance_master IS
  'BUSY Bodyshop Group of Account mapping. company_name matches Labour account text before C/O; busy_group is the Party Account Group; gstin is the Party GSTIN. Maintained on /busy by admin. Not the SA insurance-company Settings catalog.';

COMMENT ON COLUMN public.busy_insurance_master.company_name IS
  'Insurance company spelling used to match psf_revenue_dms.account before C/O.';
COMMENT ON COLUMN public.busy_insurance_master.gstin IS
  'Authoritative insurer GSTIN written to Party Accounts.';
COMMENT ON COLUMN public.busy_insurance_master.busy_group IS
  'Exact BUSY Group of Account spelling, including known source typos.';

CREATE UNIQUE INDEX IF NOT EXISTS busy_insurance_master_company_name_unique
  ON public.busy_insurance_master (lower(btrim(company_name)));

CREATE OR REPLACE FUNCTION public.busy_insurance_master_normalize_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.company_name := btrim(regexp_replace(coalesce(NEW.company_name, ''), '\s+', ' ', 'g'));
  NEW.busy_group := btrim(regexp_replace(coalesce(NEW.busy_group, ''), '\s+', ' ', 'g'));
  NEW.gstin := upper(regexp_replace(coalesce(NEW.gstin, ''), '[\s-]', '', 'g'));

  IF length(NEW.company_name) = 0 THEN
    RAISE EXCEPTION 'Insurance company name cannot be empty';
  END IF;
  IF length(NEW.busy_group) = 0 THEN
    RAISE EXCEPTION 'BUSY Group of Account cannot be empty';
  END IF;
  IF NEW.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$' THEN
    RAISE EXCEPTION 'GSTIN is missing or invalid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_busy_insurance_master_normalize_v1 ON public.busy_insurance_master;
CREATE TRIGGER trg_busy_insurance_master_normalize_v1
  BEFORE INSERT OR UPDATE OF company_name, gstin, busy_group
  ON public.busy_insurance_master
  FOR EACH ROW
  EXECUTE FUNCTION public.busy_insurance_master_normalize_v1();

DROP TRIGGER IF EXISTS trg_busy_insurance_master_updated_at ON public.busy_insurance_master;
CREATE TRIGGER trg_busy_insurance_master_updated_at
  BEFORE UPDATE ON public.busy_insurance_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.busy_insurance_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_unrestricted_all_ops_v1 ON public.busy_insurance_master;
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.busy_insurance_master
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS busy_insurance_master_select_rbac_v1 ON public.busy_insurance_master;
CREATE POLICY busy_insurance_master_select_rbac_v1 ON public.busy_insurance_master
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('busy'));

DROP POLICY IF EXISTS busy_insurance_master_insert_admin_v1 ON public.busy_insurance_master;
CREATE POLICY busy_insurance_master_insert_admin_v1 ON public.busy_insurance_master
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS busy_insurance_master_update_admin_v1 ON public.busy_insurance_master;
CREATE POLICY busy_insurance_master_update_admin_v1 ON public.busy_insurance_master
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON TABLE public.busy_insurance_master TO authenticated;
GRANT ALL ON TABLE public.busy_insurance_master TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.busy_insurance_master_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.busy_insurance_master_id_seq TO service_role;

INSERT INTO public.busy_insurance_master (company_name, gstin, busy_group)
SELECT v.company_name, v.gstin, v.busy_group
FROM (
  VALUES
    ('BAJAJ GENERAL INSURANCE LIMITED', '08AABCB5730G1ZX', 'BAJAJ ALLIANZ'),
    ('CHOLAMANDALAM MS GENERAL INSURANCE COMPANY LIMITED', '08AABCC6633K7ZD', 'CHOLA MS GENERALI'),
    ('GENERALI CENTRAL INSURANCE COMPANY', '08AABCF0191R1Z9', 'FUTURE GENERALI'),
    ('GO DIGIT GENERAL INSURANCE', '08AACCO4128Q1Z0', 'GO DIGIT'),
    ('HDFC ERGO GENERAL INSURANCE', '08AABCL5045N1Z8', 'HDFC ERGO GIC LTD'),
    ('ICICI LOMBARD GENERAL INSURANCE', '08AAACI7904G1ZN', 'ICICI LOMBARD'),
    ('M/S IFFCO TOKIO GIC LTD', '08AAACI7573H2ZB', 'IFFCO TOKIO'),
    ('LIBERTY GENERAL INSURANCE LIMITED', '08AABCL9950A1ZL', 'LIBERTY GENERAL'),
    ('NATIONAL INSURANCE COMPANY LIMITED', '36AAACN9967E6ZZ', 'NATIONAL INSURANCE'),
    ('ROYAL SUNDARAM GENERAL INSURANCE COMPANY LIMITED', '08AABCR7106G1ZJ', 'ROYAL SUNDARAM GEN INS'),
    ('SBI GENERAL INSURANCE COMPANY LIMITED', '08AAMCS8857L1ZC', 'SBI GENERAL INSURANCE'),
    ('SHRI RAM GENERAL INSURANCE CO.LTD', '08AAKCS2509K1Z3', 'SHRI RAM GENRAL INSURANCE'),
    ('TATA AIG GENERAL INSURANCE COMPANY LIMITED', '08AABCT3518Q1ZW', 'TATA AIG'),
    ('THE NEW INDIA ASSURANCE COMPANY LIMITED', '08AAACN4165C2ZQ', 'NEW INDIA INSURANCE'),
    ('THE ORIENTAL INSURANCE COMPANY LIMITED', '08AAACT0627R3ZX', 'ORIENTAL INSURANCE COMPANY'),
    ('UNITED INDIA INSURANCE COMPANY LIMITED', '08AAACU5552C1ZJ', 'UNITED INDIA'),
    ('UNIVERSAL SOMPO GENERAL INSURANCE COPMANY', '08AAACU8917F1Z6', 'UNIVERSAL SOMPO GEN INSURANCE CO LTD'),
    ('ZUNO GENERAL INSURANCE LIMITED', '24AAECE2328J1ZU', 'ZUNO GEN INSURANCE'),
    ('ZURICH KOTAK GENERAL INSURANCE COMPANY', '08AAFCK7016C1ZT', 'kotak mahindra general insurance')
) AS v(company_name, gstin, busy_group)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.busy_insurance_master m
  WHERE lower(btrim(m.company_name)) = lower(btrim(v.company_name))
);
