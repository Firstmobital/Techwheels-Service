-- ACCOUNTS-001 / DBL-0080
-- Persist RApp/JApp on Bodyshop customer receipt lines.
-- Reuses accounts_mechanical_next_voucher_no and the existing FY 26-27 sequences.
-- Does not create a second RApp/JApp sequence. Does not restart or rewind sequences.
-- Does not clear, rewrite, or renumber Mechanical voucher_no. Do not re-run DBL-0059.
-- Cash → RApp. UPI+card share JApp. NULL / cheque / bank / other stay NULL.
-- Eligibility: same Accounts cutoff — settlement invoice_date, else unique DMS
-- labour invoice_date for the JC, >= 2026-09-02.
-- Assign at customer-receipt insert. NULL-only late assign for eligible leftovers.
-- Late assign is a voucher_no fill only: the append-only trigger still blocks
-- every other UPDATE/DELETE (reverse via RPC). Do not disable that trigger.
-- Safe to re-run. Requires DBL-0079 (payment_mode) + DBL-0060 (allocator + DMS date).
-- Timestamp 20260919140000.

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Column + uniqueness + format + immutability
-- ---------------------------------------------------------------------------
ALTER TABLE public.bodyshop_settlement_lines
  ADD COLUMN IF NOT EXISTS voucher_no text;

COMMENT ON COLUMN public.bodyshop_settlement_lines.voucher_no IS
  'DBL-0080: Stable Accounts receipt voucher on customer receipts. Cash RApp/26-27/nnnn; UPI+card share JApp/26-27/nnnn via the Mechanical sequences. Null for unsupported/NULL mode, pre-cutoff, refunds, and insurance lines. Immutable once set.';

CREATE UNIQUE INDEX IF NOT EXISTS bodyshop_settlement_lines_voucher_uid
  ON public.bodyshop_settlement_lines (voucher_no)
  WHERE voucher_no IS NOT NULL;

ALTER TABLE public.bodyshop_settlement_lines
  DROP CONSTRAINT IF EXISTS bodyshop_settlement_lines_voucher_check;

ALTER TABLE public.bodyshop_settlement_lines
  ADD CONSTRAINT bodyshop_settlement_lines_voucher_check CHECK (
    voucher_no IS NULL
    OR voucher_no ~ '^RApp/26-27/[0-9]{4}$'
    OR voucher_no ~ '^JApp/26-27/[0-9]{4}$'
  );

CREATE OR REPLACE FUNCTION public.bodyshop_settlement_lines_protect_voucher()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.voucher_no IS NOT NULL AND NEW.voucher_no IS DISTINCT FROM OLD.voucher_no THEN
    RAISE EXCEPTION 'voucher_no is immutable once assigned'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bodyshop_settlement_lines_protect_voucher
  ON public.bodyshop_settlement_lines;

CREATE TRIGGER trg_bodyshop_settlement_lines_protect_voucher
  BEFORE UPDATE ON public.bodyshop_settlement_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.bodyshop_settlement_lines_protect_voucher();

-- Append-only stays in force. The only allowed UPDATE is filling voucher_no
-- when it is still NULL and every other column is unchanged.
CREATE OR REPLACE FUNCTION public.prevent_bodyshop_settlement_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bodyshop_settlement_lines are append-only; reverse via RPC'
      USING ERRCODE = '25006';
  END IF;

  IF OLD.voucher_no IS NULL
     AND NEW.voucher_no IS NOT NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.settlement_id IS NOT DISTINCT FROM OLD.settlement_id
     AND NEW.repair_card_id IS NOT DISTINCT FROM OLD.repair_card_id
     AND NEW.party IS NOT DISTINCT FROM OLD.party
     AND NEW.line_type IS NOT DISTINCT FROM OLD.line_type
     AND NEW.component IS NOT DISTINCT FROM OLD.component
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.txn_date IS NOT DISTINCT FROM OLD.txn_date
     AND NEW.reference IS NOT DISTINCT FROM OLD.reference
     AND NEW.remarks IS NOT DISTINCT FROM OLD.remarks
     AND NEW.reverses_line_id IS NOT DISTINCT FROM OLD.reverses_line_id
     AND NEW.is_reversed IS NOT DISTINCT FROM OLD.is_reversed
     AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     AND NEW.actor_email IS NOT DISTINCT FROM OLD.actor_email
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.import_row_token IS NOT DISTINCT FROM OLD.import_row_token
     AND NEW.payment_mode IS NOT DISTINCT FROM OLD.payment_mode
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'bodyshop_settlement_lines are append-only; reverse via RPC'
    USING ERRCODE = '25006';
END;
$$;

COMMENT ON FUNCTION public.prevent_bodyshop_settlement_line_mutation() IS
  'Append-only settlement lines. DELETE and general UPDATE remain blocked. DBL-0080 allows voucher_no NULL→value when no other column changes. Reverse still uses _bodyshop_settlement_mark_line_reversed.';

-- ---------------------------------------------------------------------------
-- B. Effective invoice date: settlement first, else unique DMS labour (DBL-0060)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_bodyshop_effective_invoice_date(p_repair_card_id integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_date date;
  v_jc text;
BEGIN
  IF p_repair_card_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.invoice_date, NULLIF(btrim(COALESCE(s.job_card_no, '')), '')
    INTO v_date, v_jc
    FROM public.bodyshop_settlements s
   WHERE s.repair_card_id = p_repair_card_id;

  IF v_date IS NOT NULL THEN
    RETURN v_date;
  END IF;

  IF v_jc IS NULL THEN
    SELECT NULLIF(btrim(COALESCE(c.job_card_no, '')), '')
      INTO v_jc
      FROM public.bodyshop_repair_cards c
     WHERE c.id = p_repair_card_id;
  END IF;

  RETURN public.accounts_mechanical_unique_dms_invoice_date(v_jc);
END;
$$;

COMMENT ON FUNCTION public.accounts_bodyshop_effective_invoice_date(integer) IS
  'ACCOUNTS-001 / DBL-0080: Bodyshop voucher eligibility date. Settlement invoice_date when present, else unique DMS labour invoice_date for the JC. Reuses DBL-0060 uniqueness. Cutoff remains 2026-09-02 via accounts_mechanical_next_voucher_no.';

REVOKE ALL ON FUNCTION public.accounts_bodyshop_effective_invoice_date(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_bodyshop_effective_invoice_date(integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- C. NULL-only late assign. Never SET of a non-null voucher. Never rewind seq.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_bodyshop_assign_eligible_null_vouchers(
  p_repair_card_id integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  r record;
  v_assigned text;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT
      l.id,
      l.payment_mode,
      public.accounts_bodyshop_effective_invoice_date(l.repair_card_id) AS eff_date
      FROM public.bodyshop_settlement_lines l
     WHERE l.voucher_no IS NULL
       AND l.is_reversed = false
       AND l.party = 'customer'
       AND l.line_type = 'receipt'
       AND l.component = 'CUSTOMER'
       AND l.payment_mode IN ('cash', 'upi', 'card')
       AND (p_repair_card_id IS NULL OR l.repair_card_id = p_repair_card_id)
       AND public.accounts_bodyshop_effective_invoice_date(l.repair_card_id) >= DATE '2026-09-02'
     ORDER BY
       public.accounts_bodyshop_effective_invoice_date(l.repair_card_id) ASC,
       l.txn_date ASC,
       l.id ASC
  LOOP
    UPDATE public.bodyshop_settlement_lines
       SET voucher_no = public.accounts_mechanical_next_voucher_no(r.payment_mode, r.eff_date)
     WHERE id = r.id
       AND voucher_no IS NULL
    RETURNING voucher_no INTO v_assigned;

    IF v_assigned IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.accounts_bodyshop_assign_eligible_null_vouchers(integer) IS
  'ACCOUNTS-001 / DBL-0080: Assign RApp/JApp to voucher_no IS NULL Bodyshop customer cash/upi/card receipts now eligible via accounts_bodyshop_effective_invoice_date >= 2026-09-02. Reuses Mechanical nextval. Never updates a non-null voucher_no. Does not assign NULL/unsupported modes.';

REVOKE ALL ON FUNCTION public.accounts_bodyshop_assign_eligible_null_vouchers(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounts_bodyshop_assign_eligible_null_vouchers(integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- D. Assign at customer-receipt insert (authoritative lifecycle point)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_bodyshop_settlement_line(
  p_repair_card_id integer,
  p_party text DEFAULT NULL,
  p_line_type text DEFAULT NULL,
  p_component text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_txn_date date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_main_amount numeric DEFAULT NULL,
  p_gst_amount numeric DEFAULT NULL,
  p_tds_amount numeric DEFAULT NULL,
  p_import_row_token text DEFAULT NULL,
  p_payment_mode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_id bigint;
  v_h public.bodyshop_settlements%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
  v_date date;
  v_main numeric;
  v_gst numeric;
  v_tds numeric;
  v_token text;
  v_mode text;
  v_voucher text;
  v_eff date;
BEGIN
  v_token := NULLIF(btrim(p_import_row_token), '');
  v_main := CASE WHEN COALESCE(p_main_amount, 0) > 0 THEN round(p_main_amount, 2) ELSE 0 END;
  v_gst := CASE WHEN COALESCE(p_gst_amount, 0) > 0 THEN round(p_gst_amount, 2) ELSE 0 END;
  v_tds := CASE WHEN COALESCE(p_tds_amount, 0) > 0 THEN round(p_tds_amount, 2) ELSE 0 END;

  IF v_main > 0 OR v_gst > 0 OR v_tds > 0 THEN
    IF NOT public.bodyshop_settlement_can_post_do(p_repair_card_id) THEN
      RAISE EXCEPTION 'permission denied: requires bodyshop_recovery view or bodyshop_repair modify'
        USING ERRCODE = '42501';
    END IF;

    v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
    SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
    SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
      FROM public._bodyshop_settlement_actor() a;
    v_date := COALESCE(p_txn_date, CURRENT_DATE);

    IF v_h.do_amount IS NULL THEN
      RAISE EXCEPTION 'DO amount must be captured before posting DO payment'
        USING ERRCODE = '23514';
    END IF;

    IF v_main > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'MAIN', v_main,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
      );
    END IF;
    IF v_gst > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'GST', v_gst,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
      );
    END IF;
    IF v_tds > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'TDS', v_tds,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token
      );
    END IF;
    UPDATE public.bodyshop_settlements SET do_not_received = false, updated_by = v_actor_email WHERE id = v_id;
    PERFORM public.recalc_bodyshop_settlement(v_id);
    RETURN public.get_bodyshop_settlement(p_repair_card_id);
  END IF;

  v_mode := lower(btrim(COALESCE(p_payment_mode, '')));
  IF v_mode = '' THEN
    v_mode := NULL;
  ELSIF v_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'bank', 'other') THEN
    RAISE EXCEPTION 'invalid payment_mode'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.bodyshop_settlement_can_post_customer(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires accounts view or bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;
  v_date := COALESCE(p_txn_date, CURRENT_DATE);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than 0' USING ERRCODE = '23514';
  END IF;

  IF upper(btrim(COALESCE(p_component, ''))) IN ('CUSTOMER', 'CUSTOMER_REFUND')
     OR lower(btrim(COALESCE(p_party, ''))) = 'customer' THEN
    PERFORM public.recalc_bodyshop_settlement(v_id);
    SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
    IF v_h.customer_settlement_kind IS NULL OR v_h.customer_settlement_kind = 'none' THEN
      RAISE EXCEPTION 'no customer due or refund to post against'
        USING ERRCODE = '23514';
    END IF;
    IF v_h.customer_settlement_kind = 'due' THEN
      IF upper(btrim(COALESCE(p_component, 'CUSTOMER'))) = 'CUSTOMER_REFUND'
         OR lower(btrim(COALESCE(p_line_type, 'receipt'))) = 'refund' THEN
        RAISE EXCEPTION 'refunds are not allowed when customer diff is recoverable'
          USING ERRCODE = '23514';
      END IF;
      IF round(p_amount, 2) > round(COALESCE(v_h.customer_remaining_amount, 0), 2) THEN
        RAISE EXCEPTION 'customer receipt cannot exceed remaining recoverable'
          USING ERRCODE = '23514';
      END IF;
      v_eff := public.accounts_bodyshop_effective_invoice_date(p_repair_card_id);
      v_voucher := public.accounts_mechanical_next_voucher_no(v_mode, v_eff);
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token, payment_mode, voucher_no
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'receipt', 'CUSTOMER', round(p_amount, 2),
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token, v_mode, v_voucher
      );
    ELSE
      IF upper(btrim(COALESCE(p_component, 'CUSTOMER_REFUND'))) = 'CUSTOMER'
         OR lower(btrim(COALESCE(p_line_type, 'refund'))) = 'receipt' THEN
        RAISE EXCEPTION 'receipts are not allowed when customer diff is a refund'
          USING ERRCODE = '23514';
      END IF;
      IF round(p_amount, 2) > round(COALESCE(v_h.customer_remaining_amount, 0), 2) THEN
        RAISE EXCEPTION 'customer refund cannot exceed remaining refund'
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email, import_row_token, payment_mode
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'refund', 'CUSTOMER_REFUND', round(p_amount, 2),
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email, v_token, v_mode
      );
    END IF;
    UPDATE public.bodyshop_settlements SET customer_not_received = false, updated_by = v_actor_email WHERE id = v_id;
    PERFORM public.recalc_bodyshop_settlement(v_id);
    RETURN public.get_bodyshop_settlement(p_repair_card_id);
  END IF;

  RAISE EXCEPTION 'unsupported settlement line; use Main/GST/TDS batch or customer amount'
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric, text, text) IS
  'Post DO Main/GST/TDS or customer receipt/refund. Customer receipts assign RApp/JApp via accounts_mechanical_next_voucher_no when eligible. Optional p_payment_mode applies only to customer receipt/refund. DBL-0080.';

GRANT EXECUTE ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- E. Repair currently eligible NULL cash/upi/card customer receipts only.
-- Mechanical voucher_no rows are not touched. Sequences are not restarted.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rapp_before bigint;
  v_japp_before bigint;
  v_assigned integer;
  v_mech_rapp int;
  v_mech_japp int;
BEGIN
  SELECT last_value INTO v_rapp_before
    FROM public.accounts_mechanical_voucher_rapp_2627_seq;
  SELECT last_value INTO v_japp_before
    FROM public.accounts_mechanical_voucher_japp_2627_seq;
  SELECT count(*) FILTER (WHERE voucher_no LIKE 'RApp/26-27/%'),
         count(*) FILTER (WHERE voucher_no LIKE 'JApp/26-27/%')
    INTO v_mech_rapp, v_mech_japp
    FROM public.accounts_mechanical_payment_lines;

  v_assigned := public.accounts_bodyshop_assign_eligible_null_vouchers(NULL);

  RAISE NOTICE 'DBL-0080: rapp_seq_before=% japp_seq_before=% assigned=% mechanical_rapp=% mechanical_japp=%',
    v_rapp_before, v_japp_before, v_assigned, v_mech_rapp, v_mech_japp;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
