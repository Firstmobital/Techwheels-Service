-- BODYSHOP-SETTLEMENT-001 / DBL-0026
-- Append-only settlement ledger + derived Stage 18 payment statuses.
-- Status is computed from posted lines. Clients must not write payment_status.

-- ── A. Card cache columns ───────────────────────────────────────────────────

ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_payment_status_check;

ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_payment_status_check
  CHECK (payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'received'::text, 'not_received'::text]));

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS do_payment_status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS customer_payment_status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS customer_settlement_kind text;

ALTER TABLE public.bodyshop_repair_cards
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_do_payment_status_check,
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_customer_payment_status_check,
  DROP CONSTRAINT IF EXISTS bodyshop_repair_cards_customer_settlement_kind_check;

ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_do_payment_status_check
    CHECK ((do_payment_status IS NULL) OR (do_payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'received'::text, 'not_received'::text]))),
  ADD CONSTRAINT bodyshop_repair_cards_customer_payment_status_check
    CHECK ((customer_payment_status IS NULL) OR (customer_payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'received'::text, 'not_received'::text]))),
  ADD CONSTRAINT bodyshop_repair_cards_customer_settlement_kind_check
    CHECK ((customer_settlement_kind IS NULL) OR (customer_settlement_kind = ANY (ARRAY['due'::text, 'refund'::text, 'none'::text])));

-- ── B. Header ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bodyshop_settlements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  repair_card_id integer NOT NULL UNIQUE
    REFERENCES public.bodyshop_repair_cards(id) ON DELETE CASCADE,
  job_card_no text NOT NULL,
  invoice_number text,
  invoice_date date,
  invoice_amount numeric(14,2),
  invoice_labour_amount numeric(14,2),
  invoice_spares_amount numeric(14,2),
  invoice_account text,
  do_amount numeric(14,2),
  do_status text DEFAULT 'pending'::text,
  do_reference text,
  customer_diff_amount numeric(14,2),
  customer_settlement_kind text,
  do_released_amount numeric(14,2) NOT NULL DEFAULT 0,
  insurance_due_amount numeric(14,2),
  customer_posted_amount numeric(14,2) NOT NULL DEFAULT 0,
  customer_remaining_amount numeric(14,2),
  outstanding_amount numeric(14,2),
  do_payment_status text NOT NULL DEFAULT 'pending'::text,
  customer_payment_status text NOT NULL DEFAULT 'pending'::text,
  derived_payment_status text NOT NULL DEFAULT 'pending'::text,
  do_not_received boolean NOT NULL DEFAULT false,
  customer_not_received boolean NOT NULL DEFAULT false,
  invoice_source text,
  needs_accounts_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text,
  CONSTRAINT bodyshop_settlements_do_status_check
    CHECK ((do_status IS NULL) OR (do_status = ANY (ARRAY['pending'::text, 'received'::text, 'not_received'::text]))),
  CONSTRAINT bodyshop_settlements_kind_check
    CHECK ((customer_settlement_kind IS NULL) OR (customer_settlement_kind = ANY (ARRAY['due'::text, 'refund'::text, 'none'::text]))),
  CONSTRAINT bodyshop_settlements_do_pay_check
    CHECK (do_payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'received'::text, 'not_received'::text])),
  CONSTRAINT bodyshop_settlements_cust_pay_check
    CHECK (customer_payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'received'::text, 'not_received'::text])),
  CONSTRAINT bodyshop_settlements_overall_pay_check
    CHECK (derived_payment_status = ANY (ARRAY['pending'::text, 'partial'::text, 'received'::text, 'not_received'::text])),
  CONSTRAINT bodyshop_settlements_invoice_source_check
    CHECK ((invoice_source IS NULL) OR (invoice_source = ANY (ARRAY['psf_revenue_dms'::text, 'manual'::text])))
);

CREATE INDEX IF NOT EXISTS idx_bodyshop_settlements_job_card_no
  ON public.bodyshop_settlements (upper(btrim(job_card_no)));
CREATE INDEX IF NOT EXISTS idx_bodyshop_settlements_do_pay
  ON public.bodyshop_settlements (do_payment_status);
CREATE INDEX IF NOT EXISTS idx_bodyshop_settlements_cust_pay
  ON public.bodyshop_settlements (customer_payment_status);
CREATE INDEX IF NOT EXISTS idx_bodyshop_settlements_ins_due
  ON public.bodyshop_settlements (insurance_due_amount);
CREATE INDEX IF NOT EXISTS idx_bodyshop_settlements_cust_rem
  ON public.bodyshop_settlements (customer_remaining_amount);

COMMENT ON TABLE public.bodyshop_settlements IS
  'BODYSHOP-SETTLEMENT-001 header: invoice/DO plus derived insurance due and customer remaining.';

-- ── C. Lines ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bodyshop_settlement_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settlement_id bigint NOT NULL
    REFERENCES public.bodyshop_settlements(id) ON DELETE CASCADE,
  repair_card_id integer NOT NULL
    REFERENCES public.bodyshop_repair_cards(id) ON DELETE CASCADE,
  party text NOT NULL,
  line_type text NOT NULL,
  component text NOT NULL,
  amount numeric(14,2) NOT NULL,
  txn_date date NOT NULL,
  reference text,
  remarks text,
  reverses_line_id bigint REFERENCES public.bodyshop_settlement_lines(id),
  is_reversed boolean NOT NULL DEFAULT false,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bodyshop_settlement_lines_amount_check CHECK (amount > 0),
  CONSTRAINT bodyshop_settlement_lines_party_check
    CHECK (party = ANY (ARRAY['insurance'::text, 'customer'::text])),
  CONSTRAINT bodyshop_settlement_lines_type_check
    CHECK (line_type = ANY (ARRAY['do_component'::text, 'receipt'::text, 'refund'::text, 'waiver'::text, 'reversal'::text])),
  CONSTRAINT bodyshop_settlement_lines_component_check
    CHECK (component = ANY (ARRAY['MAIN'::text, 'GST'::text, 'TDS'::text, 'CUSTOMER'::text, 'CUSTOMER_REFUND'::text, 'WAIVER'::text]))
);

CREATE INDEX IF NOT EXISTS idx_bodyshop_settlement_lines_settlement
  ON public.bodyshop_settlement_lines (settlement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bodyshop_settlement_lines_card
  ON public.bodyshop_settlement_lines (repair_card_id);

COMMENT ON TABLE public.bodyshop_settlement_lines IS
  'Append-only Stage 18 posts: Main/GST/TDS and customer receipt/refund. No updates or deletes.';

-- ── Immutability ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_bodyshop_settlement_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'bodyshop_settlement_lines are append-only; reverse via RPC'
    USING ERRCODE = '25006';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_bodyshop_settlement_line_mutation ON public.bodyshop_settlement_lines;
CREATE TRIGGER trg_prevent_bodyshop_settlement_line_mutation
  BEFORE UPDATE OR DELETE ON public.bodyshop_settlement_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_bodyshop_settlement_line_mutation();

-- Allow SECURITY DEFINER RPCs to flip is_reversed by briefly disabling the trigger
-- (RPCs use a dedicated internal updater below instead).

CREATE OR REPLACE FUNCTION public._bodyshop_settlement_mark_line_reversed(p_line_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  ALTER TABLE public.bodyshop_settlement_lines DISABLE TRIGGER trg_prevent_bodyshop_settlement_line_mutation;
  UPDATE public.bodyshop_settlement_lines
     SET is_reversed = true
   WHERE id = p_line_id;
  ALTER TABLE public.bodyshop_settlement_lines ENABLE TRIGGER trg_prevent_bodyshop_settlement_line_mutation;
END;
$$;

-- ── Auth helpers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bodyshop_settlement_can_view(p_repair_card_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer text;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  IF NOT (
    public.has_module_view('bodyshop_repair')
    OR public.has_module_modify('bodyshop_repair')
    OR public.has_module_view('bodyshop_tracker')
    OR public.has_module_view('bodyshop_floor')
  ) THEN
    RETURN false;
  END IF;

  SELECT sre.dealer_code
    INTO v_dealer
    FROM public.bodyshop_repair_cards brc
    LEFT JOIN public.service_reception_entries sre ON sre.id = brc.reception_entry_id
   WHERE brc.id = p_repair_card_id;

  IF v_dealer IS NULL THEN
    RETURN public.is_admin();
  END IF;
  RETURN public.dealer_code_in_scope(v_dealer);
END;
$$;

CREATE OR REPLACE FUNCTION public.bodyshop_settlement_can_modify(p_repair_card_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer text;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  IF NOT public.has_module_modify('bodyshop_repair') THEN
    RETURN false;
  END IF;

  SELECT sre.dealer_code
    INTO v_dealer
    FROM public.bodyshop_repair_cards brc
    LEFT JOIN public.service_reception_entries sre ON sre.id = brc.reception_entry_id
   WHERE brc.id = p_repair_card_id;

  IF v_dealer IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.dealer_code_in_scope(v_dealer);
END;
$$;

-- ── Recalc + card cache ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalc_bodyshop_settlement(p_settlement_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_h public.bodyshop_settlements%ROWTYPE;
  v_released numeric(14,2);
  v_posted numeric(14,2);
  v_diff numeric(14,2);
  v_kind text;
  v_ins_due numeric(14,2);
  v_cust_rem numeric(14,2);
  v_do_pay text;
  v_cust_pay text;
  v_overall text;
  v_actor text;
BEGIN
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement % not found', p_settlement_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_released
    FROM public.bodyshop_settlement_lines
   WHERE settlement_id = p_settlement_id
     AND is_reversed = false
     AND party = 'insurance'
     AND line_type = 'do_component'
     AND component IN ('MAIN', 'GST', 'TDS');

  v_diff := CASE
    WHEN v_h.invoice_amount IS NOT NULL AND v_h.do_amount IS NOT NULL
      THEN v_h.invoice_amount - v_h.do_amount
    ELSE v_h.customer_diff_amount
  END;

  v_kind := CASE
    WHEN v_diff IS NULL THEN NULL
    WHEN v_diff > 0 THEN 'due'
    WHEN v_diff < 0 THEN 'refund'
    ELSE 'none'
  END;

  IF v_kind = 'due' THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_posted
      FROM public.bodyshop_settlement_lines
     WHERE settlement_id = p_settlement_id
       AND is_reversed = false
       AND party = 'customer'
       AND line_type = 'receipt'
       AND component = 'CUSTOMER';
  ELSIF v_kind = 'refund' THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO v_posted
      FROM public.bodyshop_settlement_lines
     WHERE settlement_id = p_settlement_id
       AND is_reversed = false
       AND party = 'customer'
       AND line_type = 'refund'
       AND component = 'CUSTOMER_REFUND';
  ELSE
    v_posted := 0;
  END IF;

  v_ins_due := CASE WHEN v_h.do_amount IS NULL THEN NULL ELSE v_h.do_amount - v_released END;
  v_cust_rem := CASE
    WHEN v_diff IS NULL THEN NULL
    WHEN v_kind = 'none' THEN 0
    ELSE abs(v_diff) - v_posted
  END;

  IF v_h.do_amount IS NULL THEN
    v_do_pay := 'pending';
  ELSIF v_h.do_not_received AND v_released = 0 THEN
    v_do_pay := 'not_received';
  ELSIF v_ins_due = v_h.do_amount THEN
    v_do_pay := 'pending';
  ELSIF v_ins_due > 0 THEN
    v_do_pay := 'partial';
  ELSE
    v_do_pay := 'received';
  END IF;

  IF v_kind IS NULL THEN
    v_cust_pay := 'pending';
  ELSIF v_kind = 'none' THEN
    v_cust_pay := 'received';
  ELSIF v_h.customer_not_received AND v_posted = 0 THEN
    v_cust_pay := 'not_received';
  ELSIF v_cust_rem = abs(v_diff) THEN
    v_cust_pay := 'pending';
  ELSIF v_cust_rem > 0 THEN
    v_cust_pay := 'partial';
  ELSE
    v_cust_pay := 'received';
  END IF;

  IF v_do_pay = 'not_received' AND v_cust_pay = 'not_received' THEN
    v_overall := 'not_received';
  ELSIF v_do_pay = 'received' AND v_cust_pay = 'received' THEN
    v_overall := 'received';
  ELSIF v_do_pay IN ('partial', 'received', 'not_received')
     OR v_cust_pay IN ('partial', 'received', 'not_received') THEN
    IF (v_do_pay IN ('partial', 'received') OR v_cust_pay IN ('partial', 'received'))
       AND NOT (v_do_pay = 'received' AND v_cust_pay = 'received') THEN
      v_overall := 'partial';
    ELSIF v_do_pay = 'pending' AND v_cust_pay = 'pending' THEN
      v_overall := 'pending';
    ELSE
      v_overall := 'partial';
    END IF;
  ELSE
    v_overall := 'pending';
  END IF;

  v_actor := COALESCE(v_h.updated_by, v_h.created_by);

  UPDATE public.bodyshop_settlements
     SET customer_diff_amount = v_diff,
         customer_settlement_kind = v_kind,
         do_released_amount = v_released,
         insurance_due_amount = v_ins_due,
         customer_posted_amount = v_posted,
         customer_remaining_amount = v_cust_rem,
         outstanding_amount = COALESCE(v_ins_due, 0) + COALESCE(v_cust_rem, 0),
         do_payment_status = v_do_pay,
         customer_payment_status = v_cust_pay,
         derived_payment_status = v_overall,
         updated_at = now()
   WHERE id = p_settlement_id;

  UPDATE public.bodyshop_repair_cards
     SET billed_amount = v_h.invoice_amount,
         do_amount = v_h.do_amount,
         do_status = COALESCE(v_h.do_status, do_status),
         customer_diff_amount = v_diff,
         do_payment_status = v_do_pay,
         customer_payment_status = v_cust_pay,
         customer_settlement_kind = v_kind,
         payment_status = v_overall,
         updated_at = now()
   WHERE id = v_h.repair_card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._bodyshop_settlement_actor()
RETURNS TABLE (actor_id uuid, actor_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  RETURN QUERY
  SELECT auth.uid(),
         COALESCE((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), auth.uid()::text);
END;
$$;

CREATE OR REPLACE FUNCTION public._bodyshop_ensure_settlement(p_repair_card_id integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id bigint;
  v_jc text;
  v_actor text;
BEGIN
  SELECT id INTO v_id FROM public.bodyshop_settlements WHERE repair_card_id = p_repair_card_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT job_card_no INTO v_jc FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
  IF v_jc IS NULL THEN
    RAISE EXCEPTION 'repair card % not found', p_repair_card_id USING ERRCODE = 'P0002';
  END IF;

  SELECT a.actor_email INTO v_actor FROM public._bodyshop_settlement_actor() a;

  INSERT INTO public.bodyshop_settlements (repair_card_id, job_card_no, created_by, updated_by)
  VALUES (p_repair_card_id, v_jc, v_actor, v_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── RPCs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_bodyshop_settlement_header(
  p_repair_card_id integer,
  p_parts_entry_status text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_invoice_date date DEFAULT NULL,
  p_invoice_amount numeric DEFAULT NULL,
  p_invoice_labour_amount numeric DEFAULT NULL,
  p_invoice_spares_amount numeric DEFAULT NULL,
  p_invoice_account text DEFAULT NULL,
  p_invoice_source text DEFAULT NULL,
  p_do_amount numeric DEFAULT NULL,
  p_do_status text DEFAULT NULL,
  p_do_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id bigint;
  v_actor text;
BEGIN
  IF NOT public.bodyshop_settlement_can_modify(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;

  IF p_do_status IS NOT NULL AND lower(btrim(p_do_status)) = 'received'
     AND p_do_amount IS NULL THEN
    -- allow existing do_amount on header/card
    IF NOT EXISTS (
      SELECT 1 FROM public.bodyshop_settlements s
      WHERE s.repair_card_id = p_repair_card_id AND s.do_amount IS NOT NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM public.bodyshop_repair_cards c
      WHERE c.id = p_repair_card_id AND c.do_amount IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'DO Amount is required when DO Status is Received'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT a.actor_email INTO v_actor FROM public._bodyshop_settlement_actor() a;
  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);

  UPDATE public.bodyshop_settlements
     SET invoice_number = COALESCE(p_invoice_number, invoice_number),
         invoice_date = COALESCE(p_invoice_date, invoice_date),
         invoice_amount = COALESCE(p_invoice_amount, invoice_amount),
         invoice_labour_amount = COALESCE(p_invoice_labour_amount, invoice_labour_amount),
         invoice_spares_amount = COALESCE(p_invoice_spares_amount, invoice_spares_amount),
         invoice_account = COALESCE(p_invoice_account, invoice_account),
         invoice_source = COALESCE(p_invoice_source, invoice_source),
         do_amount = COALESCE(p_do_amount, do_amount),
         do_status = COALESCE(p_do_status, do_status),
         do_reference = COALESCE(p_do_reference, do_reference),
         updated_by = v_actor,
         updated_at = now()
   WHERE id = v_id;

  IF p_parts_entry_status IS NOT NULL THEN
    UPDATE public.bodyshop_repair_cards
       SET parts_entry_status = p_parts_entry_status,
           updated_at = now()
     WHERE id = p_repair_card_id;
  END IF;

  PERFORM public.recalc_bodyshop_settlement(v_id);
  RETURN public.get_bodyshop_settlement(p_repair_card_id);
END;
$$;

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
  p_tds_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id bigint;
  v_h public.bodyshop_settlements%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
  v_date date;
  v_new_release numeric;
BEGIN
  IF NOT public.bodyshop_settlement_can_modify(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  SELECT * INTO v_h FROM public.bodyshop_settlements WHERE id = v_id;
  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;
  v_date := COALESCE(p_txn_date, CURRENT_DATE);

  -- Batch Main/GST/TDS
  IF COALESCE(p_main_amount, 0) > 0 OR COALESCE(p_gst_amount, 0) > 0 OR COALESCE(p_tds_amount, 0) > 0 THEN
    IF v_h.do_amount IS NULL THEN
      RAISE EXCEPTION 'DO amount must be captured before posting DO payment'
        USING ERRCODE = '23514';
    END IF;
    v_new_release := v_h.do_released_amount
      + COALESCE(p_main_amount, 0) + COALESCE(p_gst_amount, 0) + COALESCE(p_tds_amount, 0);
    IF v_new_release > v_h.do_amount THEN
      RAISE EXCEPTION 'Main + GST + TDS cannot exceed DO amount'
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(p_main_amount, 0) > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'MAIN', p_main_amount,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    IF COALESCE(p_gst_amount, 0) > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'GST', p_gst_amount,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    IF COALESCE(p_tds_amount, 0) > 0 THEN
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'insurance', 'do_component', 'TDS', p_tds_amount,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    END IF;
    UPDATE public.bodyshop_settlements SET do_not_received = false, updated_by = v_actor_email WHERE id = v_id;
    PERFORM public.recalc_bodyshop_settlement(v_id);
    RETURN public.get_bodyshop_settlement(p_repair_card_id);
  END IF;

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
      IF p_amount > COALESCE(v_h.customer_remaining_amount, 0) THEN
        RAISE EXCEPTION 'customer receipt cannot exceed remaining recoverable'
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'receipt', 'CUSTOMER', p_amount,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
      );
    ELSE
      IF upper(btrim(COALESCE(p_component, 'CUSTOMER_REFUND'))) = 'CUSTOMER'
         OR lower(btrim(COALESCE(p_line_type, 'refund'))) = 'receipt' THEN
        RAISE EXCEPTION 'receipts are not allowed when customer diff is a refund'
          USING ERRCODE = '23514';
      END IF;
      IF p_amount > COALESCE(v_h.customer_remaining_amount, 0) THEN
        RAISE EXCEPTION 'customer refund cannot exceed remaining refund'
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.bodyshop_settlement_lines (
        settlement_id, repair_card_id, party, line_type, component, amount,
        txn_date, reference, remarks, actor_id, actor_email
      ) VALUES (
        v_id, p_repair_card_id, 'customer', 'refund', 'CUSTOMER_REFUND', p_amount,
        v_date, p_reference, p_remarks, v_actor_id, v_actor_email
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

CREATE OR REPLACE FUNCTION public.reverse_bodyshop_settlement_line(
  p_line_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line public.bodyshop_settlement_lines%ROWTYPE;
  v_actor_id uuid;
  v_actor_email text;
BEGIN
  SELECT * INTO v_line FROM public.bodyshop_settlement_lines WHERE id = p_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line % not found', p_line_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.bodyshop_settlement_can_modify(v_line.repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;
  IF v_line.is_reversed OR v_line.line_type = 'reversal' THEN
    RAISE EXCEPTION 'line is already reversed' USING ERRCODE = '23514';
  END IF;

  SELECT a.actor_id, a.actor_email INTO v_actor_id, v_actor_email
    FROM public._bodyshop_settlement_actor() a;

  INSERT INTO public.bodyshop_settlement_lines (
    settlement_id, repair_card_id, party, line_type, component, amount,
    txn_date, reference, remarks, reverses_line_id, actor_id, actor_email
  ) VALUES (
    v_line.settlement_id, v_line.repair_card_id, v_line.party, 'reversal', v_line.component, v_line.amount,
    CURRENT_DATE, v_line.reference, COALESCE(p_reason, 'reversed'), p_line_id, v_actor_id, v_actor_email
  );

  PERFORM public._bodyshop_settlement_mark_line_reversed(p_line_id);
  PERFORM public.recalc_bodyshop_settlement(v_line.settlement_id);
  RETURN public.get_bodyshop_settlement(v_line.repair_card_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bodyshop_settlement_not_received(
  p_repair_card_id integer,
  p_party text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id bigint;
  v_actor text;
BEGIN
  IF NOT public.bodyshop_settlement_can_modify(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_repair modify'
      USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '23514';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  SELECT a.actor_email INTO v_actor FROM public._bodyshop_settlement_actor() a;

  IF lower(btrim(p_party)) = 'insurance' THEN
    UPDATE public.bodyshop_settlements
       SET do_not_received = true, updated_by = v_actor, updated_at = now()
     WHERE id = v_id;
  ELSIF lower(btrim(p_party)) = 'customer' THEN
    UPDATE public.bodyshop_settlements
       SET customer_not_received = true, updated_by = v_actor, updated_at = now()
     WHERE id = v_id;
  ELSE
    RAISE EXCEPTION 'party must be insurance or customer' USING ERRCODE = '23514';
  END IF;

  PERFORM public.recalc_bodyshop_settlement(v_id);
  RETURN public.get_bodyshop_settlement(p_repair_card_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bodyshop_settlement(p_repair_card_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card public.bodyshop_repair_cards%ROWTYPE;
  v_header jsonb;
  v_lines jsonb;
  v_suggested jsonb;
  v_mismatch boolean := false;
BEGIN
  IF NOT public.bodyshop_settlement_can_view(p_repair_card_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_card FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repair card % not found', p_repair_card_id USING ERRCODE = 'P0002';
  END IF;

  SELECT to_jsonb(s) INTO v_header
    FROM public.bodyshop_settlements s
   WHERE s.repair_card_id = p_repair_card_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb)
    INTO v_lines
    FROM public.bodyshop_settlement_lines l
   WHERE l.repair_card_id = p_repair_card_id;

  SELECT to_jsonb(x) INTO v_suggested
    FROM (
      SELECT invoice_number, invoice_date, total_invoice_amount,
             final_labour_amount, final_spares_amount, account,
             tax_parts, invoice_status
        FROM public.psf_revenue_dms
       WHERE upper(btrim(job_card_number)) = upper(btrim(v_card.job_card_no))
         AND COALESCE(invoice_status, '') <> 'Cancelled'
       ORDER BY invoice_date DESC NULLS LAST, updated_at DESC NULLS LAST
       LIMIT 1
    ) x;

  IF v_suggested IS NOT NULL AND v_card.insurance_company IS NOT NULL THEN
    v_mismatch := position(
      lower(split_part(v_card.insurance_company, ' ', 1))
      IN lower(COALESCE(v_suggested ->> 'account', ''))
    ) = 0
    AND position(
      lower(split_part(COALESCE(v_suggested ->> 'account', ''), ' ', 1))
      IN lower(v_card.insurance_company)
    ) = 0;
  END IF;

  RETURN jsonb_build_object(
    'header', v_header,
    'lines', v_lines,
    'suggested_invoice', v_suggested,
    'payer_mismatch', v_mismatch,
    'card', jsonb_build_object(
      'id', v_card.id,
      'job_card_no', v_card.job_card_no,
      'insurance_company', v_card.insurance_company,
      'parts_entry_status', v_card.parts_entry_status,
      'billed_amount', v_card.billed_amount,
      'do_status', v_card.do_status,
      'do_amount', v_card.do_amount,
      'customer_diff_amount', v_card.customer_diff_amount,
      'payment_status', v_card.payment_status,
      'do_payment_status', v_card.do_payment_status,
      'customer_payment_status', v_card.customer_payment_status,
      'customer_settlement_kind', v_card.customer_settlement_kind
    )
  );
END;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.bodyshop_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodyshop_settlement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bodyshop_settlements_select ON public.bodyshop_settlements;
CREATE POLICY bodyshop_settlements_select ON public.bodyshop_settlements
  FOR SELECT TO authenticated
  USING (public.bodyshop_settlement_can_view(repair_card_id));

DROP POLICY IF EXISTS bodyshop_settlements_service ON public.bodyshop_settlements;
CREATE POLICY bodyshop_settlements_service ON public.bodyshop_settlements
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bodyshop_settlement_lines_select ON public.bodyshop_settlement_lines;
CREATE POLICY bodyshop_settlement_lines_select ON public.bodyshop_settlement_lines
  FOR SELECT TO authenticated
  USING (public.bodyshop_settlement_can_view(repair_card_id));

DROP POLICY IF EXISTS bodyshop_settlement_lines_service ON public.bodyshop_settlement_lines;
CREATE POLICY bodyshop_settlement_lines_service ON public.bodyshop_settlement_lines
  TO service_role USING (true) WITH CHECK (true);

-- authenticated cannot insert/update/delete lines or headers directly
REVOKE INSERT, UPDATE, DELETE ON public.bodyshop_settlements FROM authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.bodyshop_settlement_lines FROM authenticated, PUBLIC;
GRANT SELECT ON public.bodyshop_settlements TO authenticated;
GRANT SELECT ON public.bodyshop_settlement_lines TO authenticated;

REVOKE ALL ON FUNCTION public.prevent_bodyshop_settlement_line_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._bodyshop_settlement_mark_line_reversed(bigint) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public._bodyshop_settlement_actor() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public._bodyshop_ensure_settlement(integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.recalc_bodyshop_settlement(bigint) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.bodyshop_settlement_can_view(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bodyshop_settlement_can_modify(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_bodyshop_settlement(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_bodyshop_settlement_header(integer, text, text, date, numeric, numeric, numeric, text, text, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_bodyshop_settlement_line(integer, text, text, text, numeric, date, text, text, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_bodyshop_settlement_line(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_bodyshop_settlement_not_received(integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bodyshop_settlement(integer) TO authenticated, service_role;

-- ── F. Backfill headers ─────────────────────────────────────────────────────

INSERT INTO public.bodyshop_settlements (
  repair_card_id, job_card_no, invoice_number, invoice_date, invoice_amount,
  invoice_labour_amount, invoice_spares_amount, invoice_account, invoice_source,
  do_amount, do_status, customer_diff_amount, needs_accounts_review, created_by, updated_by
)
SELECT
  c.id,
  c.job_card_no,
  dms.invoice_number,
  dms.invoice_date,
  COALESCE(dms.total_invoice_amount, c.billed_amount),
  dms.final_labour_amount,
  dms.final_spares_amount,
  dms.account,
  CASE WHEN dms.invoice_number IS NOT NULL THEN 'psf_revenue_dms' ELSE NULL END,
  c.do_amount,
  c.do_status,
  CASE
    WHEN COALESCE(dms.total_invoice_amount, c.billed_amount) IS NOT NULL AND c.do_amount IS NOT NULL
      THEN COALESCE(dms.total_invoice_amount, c.billed_amount) - c.do_amount
    ELSE c.customer_diff_amount
  END,
  (lower(btrim(COALESCE(c.payment_status, ''))) = 'received'),
  'dbl-0026-backfill',
  'dbl-0026-backfill'
FROM public.bodyshop_repair_cards c
LEFT JOIN LATERAL (
  SELECT invoice_number, invoice_date, total_invoice_amount,
         final_labour_amount, final_spares_amount, account
    FROM public.psf_revenue_dms p
   WHERE upper(btrim(p.job_card_number)) = upper(btrim(c.job_card_no))
     AND COALESCE(p.invoice_status, '') <> 'Cancelled'
   ORDER BY p.invoice_date DESC NULLS LAST, p.updated_at DESC NULLS LAST
   LIMIT 1
) dms ON true
WHERE c.billed_amount IS NOT NULL OR c.do_amount IS NOT NULL
ON CONFLICT (repair_card_id) DO NOTHING;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.bodyshop_settlements
  LOOP
    PERFORM public.recalc_bodyshop_settlement(r.id);
  END LOOP;
END $$;
