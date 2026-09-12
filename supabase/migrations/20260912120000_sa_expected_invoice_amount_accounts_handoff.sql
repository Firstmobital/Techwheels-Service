-- DBL-0051
-- Service Advisor expected invoice amount + seed Accounts billed_amount.
--
-- Why reception owns expected_invoice_amount:
--   SA must persist an amount before Mark Done and before jc_number exists.
--   accounts_mechanical_invoices.jc_number is NOT NULL / not blank, so that
--   table cannot store the SA draft until a JC is present.
--   list_reception_entries_page returns SETOF service_reception_entries, so
--   the column is visible after reload without changing list RPCs.
--
-- Why billed_amount stays the Accounts authority:
--   After JC exists, SA save / Mark Done seeds accounts_mechanical_invoices.billed_amount
--   only when Accounts has not captured (no invoice_number, no payment lines).
--   Accounts upsert remains the only writer of invoice_number / invoice_date.
--   Opening the Accounts modal does not write invoice_date.
--
-- Do not add invoice_number / invoice_date / payment columns onto reception.

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS expected_invoice_amount numeric(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_reception_entries_expected_invoice_amount_check'
  ) THEN
    ALTER TABLE public.service_reception_entries
      ADD CONSTRAINT service_reception_entries_expected_invoice_amount_check
      CHECK (expected_invoice_amount IS NULL OR expected_invoice_amount >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.service_reception_entries.expected_invoice_amount IS
  'DBL-0051: Service Advisor expected/final invoice amount. Seeds accounts_mechanical_invoices.billed_amount when JC exists and Accounts has not captured. Not the Accounts billed authority.';

-- ---------------------------------------------------------------------------
-- Internal seed: write billed_amount only when Accounts has not captured.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_advisor_seed_mechanical_billed_amount(
  p_reception_entry_id bigint,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_entry public.service_reception_entries%ROWTYPE;
  v_existing public.accounts_mechanical_invoices%ROWTYPE;
  v_has_lines boolean := false;
  v_actor text;
  v_billed numeric;
  v_jc text;
BEGIN
  SELECT * INTO v_entry
    FROM public.service_reception_entries
   WHERE id = p_reception_entry_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_jc := NULLIF(btrim(v_entry.jc_number), '');
  IF v_jc IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_floor_incharge_service_type(v_entry.service_type) THEN
    RETURN;
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'expected_invoice_amount cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  v_billed := CASE WHEN p_amount IS NULL THEN NULL ELSE round(p_amount, 2) END;

  SELECT * INTO v_existing
    FROM public.accounts_mechanical_invoices
   WHERE reception_entry_id = p_reception_entry_id;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.accounts_mechanical_payment_lines l
      WHERE l.reception_entry_id = p_reception_entry_id
    ) INTO v_has_lines;

    IF v_has_lines OR NULLIF(btrim(v_existing.invoice_number), '') IS NOT NULL THEN
      RETURN;
    END IF;

    UPDATE public.accounts_mechanical_invoices
       SET jc_number = v_jc,
           billed_amount = v_billed,
           updated_at = now()
     WHERE reception_entry_id = p_reception_entry_id;
  ELSE
    v_actor := COALESCE(
      NULLIF(auth.jwt() ->> 'email', ''),
      NULLIF(auth.uid()::text, ''),
      'system'
    );

    INSERT INTO public.accounts_mechanical_invoices (
      reception_entry_id, jc_number, invoice_number, invoice_date, billed_amount,
      payment_status, amount_received, payment_notes, captured_by, captured_at, updated_at
    ) VALUES (
      p_reception_entry_id,
      v_jc,
      NULL,
      NULL,
      v_billed,
      'pending',
      NULL,
      NULL,
      v_actor,
      now(),
      now()
    );
  END IF;

  IF to_regprocedure('public.accounts_mechanical_recalc(bigint)') IS NOT NULL THEN
    PERFORM public.accounts_mechanical_recalc(p_reception_entry_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.service_advisor_seed_mechanical_billed_amount(bigint, numeric)
IS 'DBL-0051 internal: seed accounts_mechanical_invoices.billed_amount from SA expected amount. No-op without JC, non-floor types, or after Accounts capture (invoice_number or payment lines).';

REVOKE ALL ON FUNCTION public.service_advisor_seed_mechanical_billed_amount(bigint, numeric)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SA save: persist expected_invoice_amount and seed billed_amount.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.service_advisor_save_reception_entry(bigint, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.service_advisor_save_reception_entry(
  p_reception_entry_id bigint,
  p_service_type       text,
  p_jc_number          text    DEFAULT NULL,
  p_km_reading         integer DEFAULT NULL,
  p_remark             text    DEFAULT NULL,
  p_expected_invoice_amount numeric DEFAULT NULL,
  p_set_expected_invoice_amount boolean DEFAULT false
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
  v_service_type     text;
  v_amount           numeric;
BEGIN
  v_service_type := btrim(coalesce(p_service_type, ''));
  IF v_service_type = '' THEN
    RAISE EXCEPTION 'service_type is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_invoice_amount IS NOT NULL AND p_expected_invoice_amount < 0 THEN
    RAISE EXCEPTION 'expected_invoice_amount cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  v_is_admin      := public.is_admin();
  v_has_sa_modify := public.has_module_modify('service_advisor');

  IF NOT (v_is_admin OR v_has_sa_modify) THEN
    RAISE EXCEPTION 'permission denied: requires service_advisor modify or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT sre.sa_employee_code
    INTO v_sa_employee_code
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_admin THEN
    IF v_sa_employee_code IS NULL
       OR NOT public.user_has_employee_code(v_sa_employee_code)
    THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF lower(v_service_type) IN ('accident', 'rusting') THEN
    v_amount := NULL;
  ELSE
    v_amount := CASE
      WHEN p_expected_invoice_amount IS NULL THEN NULL
      ELSE round(p_expected_invoice_amount, 2)
    END;
  END IF;

  UPDATE public.service_reception_entries sre
     SET service_type = v_service_type,
         jc_number    = NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
         km_reading   = p_km_reading,
         remark       = NULLIF(btrim(coalesce(p_remark, '')), ''),
         expected_invoice_amount = CASE
           WHEN p_set_expected_invoice_amount THEN v_amount
           ELSE sre.expected_invoice_amount
         END,
         updated_at   = now()
   WHERE sre.id = p_reception_entry_id;

  IF p_set_expected_invoice_amount THEN
    PERFORM public.service_advisor_seed_mechanical_billed_amount(p_reception_entry_id, v_amount);
  END IF;

  RETURN QUERY
  SELECT sre.*
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;
END;
$$;

COMMENT ON FUNCTION public.service_advisor_save_reception_entry(
  bigint, text, text, integer, text, numeric, boolean
)
IS 'SECURITY DEFINER RPC: updates service_type, jc_number, km_reading, remark, and optionally expected_invoice_amount '
   'on a single service_reception_entries row. Seeds accounts_mechanical_invoices.billed_amount when JC exists '
   'and Accounts has not captured. p_set_expected_invoice_amount=false leaves the amount unchanged '
   '(Customer Remark and other callers). Same authorization as the previous 5-arg save.';

GRANT EXECUTE ON FUNCTION public.service_advisor_save_reception_entry(
  bigint, text, text, integer, text, numeric, boolean
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mark Done: persist current expected amount in the same transaction.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.service_advisor_mark_invoice_done(bigint);

CREATE OR REPLACE FUNCTION public.service_advisor_mark_invoice_done(
  p_reception_entry_id bigint,
  p_expected_invoice_amount numeric DEFAULT NULL
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
  v_done_by          text;
  v_service_type     text;
  v_amount           numeric;
BEGIN
  v_is_admin      := public.is_admin();
  v_has_sa_modify := public.has_module_modify('service_advisor');

  IF NOT (v_is_admin OR v_has_sa_modify) THEN
    RAISE EXCEPTION 'permission denied: requires service_advisor modify or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT sre.sa_employee_code, sre.service_type
    INTO v_sa_employee_code, v_service_type
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_admin THEN
    IF v_sa_employee_code IS NULL
       OR NOT public.user_has_employee_code(v_sa_employee_code)
    THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_expected_invoice_amount IS NOT NULL AND p_expected_invoice_amount < 0 THEN
    RAISE EXCEPTION 'expected_invoice_amount cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  IF lower(btrim(coalesce(v_service_type, ''))) IN ('accident', 'rusting') THEN
    v_amount := NULL;
  ELSE
    v_amount := CASE
      WHEN p_expected_invoice_amount IS NULL THEN NULL
      ELSE round(p_expected_invoice_amount, 2)
    END;
  END IF;

  v_done_by := coalesce(
    nullif(btrim(auth.jwt() ->> 'email'), ''),
    auth.uid()::text,
    'system'
  );

  -- Persist a typed amount in this same transaction so Mark Done cannot
  -- succeed while discarding an unsaved Invoice Amount. A NULL argument
  -- keeps the last saved expected_invoice_amount.
  UPDATE public.service_reception_entries sre
     SET invoice_done_at = now(),
         invoice_done_by = v_done_by,
         expected_invoice_amount = CASE
           WHEN p_expected_invoice_amount IS NOT NULL THEN v_amount
           ELSE sre.expected_invoice_amount
         END,
         updated_at = now()
   WHERE sre.id = p_reception_entry_id;

  PERFORM public.service_advisor_seed_mechanical_billed_amount(
    p_reception_entry_id,
    (SELECT sre.expected_invoice_amount FROM public.service_reception_entries sre WHERE sre.id = p_reception_entry_id)
  );

  RETURN QUERY
  SELECT sre.*
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;
END;
$$;

COMMENT ON FUNCTION public.service_advisor_mark_invoice_done(bigint, numeric)
IS 'SECURITY DEFINER: mark SA invoice done and persist expected_invoice_amount in the same transaction. Seeds Accounts billed_amount when unlocked.';

GRANT EXECUTE ON FUNCTION public.service_advisor_mark_invoice_done(bigint, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Accounts list/json: expose SA expected amount for modal fallback.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_mechanical_case_json(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_row jsonb;
BEGIN
  SELECT to_jsonb(x) INTO v_row
    FROM (
      SELECT
        e.id AS reception_entry_id,
        e.jc_number,
        e.reg_number,
        e.model,
        e.service_type,
        e.sa_name,
        e.sa_display_name,
        e.sa_employee_code,
        e.branch,
        e.owner_name,
        e.owner_phone,
        e.invoice_done_at,
        e.invoice_done_by,
        e.created_at,
        e.invoice_storage_path,
        e.invoice_file_name,
        e.invoice_drive_url,
        e.expected_invoice_amount,
        inv.invoice_number,
        inv.invoice_date,
        inv.billed_amount,
        inv.payment_status,
        inv.amount_received,
        CASE
          WHEN inv.billed_amount IS NULL THEN NULL
          ELSE GREATEST(0, round(inv.billed_amount - COALESCE(inv.amount_received, 0), 2))
        END AS remaining_amount,
        inv.payment_notes,
        inv.captured_by,
        inv.captured_at,
        inv.updated_at AS invoice_updated_at
      FROM public.service_reception_entries e
      LEFT JOIN public.accounts_mechanical_invoices inv
        ON inv.reception_entry_id = e.id
      WHERE e.id = p_reception_entry_id
    ) x;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_accounts_mechanical_cases()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.accounts_can_access() THEN
    RAISE EXCEPTION 'permission denied: requires accounts view'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.invoice_done_at DESC NULLS LAST, x.reception_entry_id DESC),
    '[]'::jsonb
  )
    INTO v_rows
    FROM (
      SELECT
        e.id AS reception_entry_id,
        e.jc_number,
        e.reg_number,
        e.model,
        e.service_type,
        e.sa_name,
        e.sa_display_name,
        e.sa_employee_code,
        e.branch,
        e.owner_name,
        e.owner_phone,
        e.invoice_done_at,
        e.invoice_done_by,
        e.created_at,
        e.invoice_storage_path,
        e.invoice_file_name,
        e.invoice_drive_url,
        e.expected_invoice_amount,
        inv.invoice_number,
        inv.invoice_date,
        inv.billed_amount,
        inv.payment_status,
        inv.amount_received,
        CASE
          WHEN inv.billed_amount IS NULL THEN NULL
          ELSE GREATEST(0, round(inv.billed_amount - COALESCE(inv.amount_received, 0), 2))
        END AS remaining_amount,
        inv.payment_notes,
        inv.captured_by,
        inv.captured_at,
        inv.updated_at AS invoice_updated_at
      FROM public.service_reception_entries e
      LEFT JOIN public.accounts_mechanical_invoices inv
        ON inv.reception_entry_id = e.id
      WHERE e.invoice_done_at IS NOT NULL
        AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
        AND public.is_floor_incharge_service_type(e.service_type)
    ) x;

  RETURN v_rows;
END;
$$;

NOTIFY pgrst, 'reload schema';
