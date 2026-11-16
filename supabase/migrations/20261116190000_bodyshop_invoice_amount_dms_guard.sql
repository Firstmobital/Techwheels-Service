-- BODYSHOP-BILLING-GUARD-001: typed Invoice / Billed Amount must match the DMS invoice, or carry a reason.
-- * DMS amount = latest non-cancelled psf_revenue_dms.total_invoice_amount for the card's job card.
-- * Tolerance 0.50 rupees (typed amounts are whole-rupee roundings of DMS paise).
-- * Enforced only when the amount CHANGES from the stored header amount, so day-to-day saves on the
--   few legacy mismatched cards are not blocked; those are listed by
--   scripts/bodyshop_invoice_amount_mismatch_report.sql.
-- * No DMS row / DMS amount empty -> no check (nothing to compare with).
-- * New signature adds p_invoice_amount_reason; the old 12-arg function is dropped to avoid an
--   ambiguous overload for named-argument RPC calls (web + mobile). Old clients keep working while amounts match.
-- * Grants tightened to authenticated + service_role (function already requires bodyshop modify).
-- Apply per DB_CHANGE_PROTOCOL. Ledger: DBL-0096.
--
-- ROLLBACK:
--   DROP FUNCTION public.upsert_bodyshop_settlement_header(integer,text,text,date,numeric,numeric,numeric,text,text,numeric,text,text,text);
--   re-create the previous 12-argument function from supabase/backups/full_metadata.sql history
--   (see 20260924120000 / earlier settlement migrations) and GRANT EXECUTE to anon, authenticated, service_role.
--   ALTER TABLE public.bodyshop_settlements DROP COLUMN invoice_amount_variance_reason, DROP COLUMN invoice_dms_amount_at_save;

ALTER TABLE public.bodyshop_settlements
  ADD COLUMN IF NOT EXISTS invoice_amount_variance_reason text,
  ADD COLUMN IF NOT EXISTS invoice_dms_amount_at_save numeric(14,2);

DROP FUNCTION IF EXISTS public.upsert_bodyshop_settlement_header(
  integer, text, text, date, numeric, numeric, numeric, text, text, numeric, text, text
);

CREATE FUNCTION public.upsert_bodyshop_settlement_header(
  p_repair_card_id integer,
  p_parts_entry_status text DEFAULT NULL::text,
  p_invoice_number text DEFAULT NULL::text,
  p_invoice_date date DEFAULT NULL::date,
  p_invoice_amount numeric DEFAULT NULL::numeric,
  p_invoice_labour_amount numeric DEFAULT NULL::numeric,
  p_invoice_spares_amount numeric DEFAULT NULL::numeric,
  p_invoice_account text DEFAULT NULL::text,
  p_invoice_source text DEFAULT NULL::text,
  p_do_amount numeric DEFAULT NULL::numeric,
  p_do_status text DEFAULT NULL::text,
  p_do_reference text DEFAULT NULL::text,
  p_invoice_amount_reason text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
AS $$
DECLARE
  v_id bigint;
  v_actor text;
  v_job text;
  v_stored numeric;
  v_dms numeric;
  v_reason text := nullif(btrim(COALESCE(p_invoice_amount_reason, '')), '');
  v_check boolean := false;
  v_differs boolean := false;
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

  -- DMS amount guard
  IF p_invoice_amount IS NOT NULL THEN
    SELECT s.invoice_amount INTO v_stored FROM public.bodyshop_settlements s WHERE s.id = v_id;
    v_check := (v_stored IS DISTINCT FROM p_invoice_amount);
    IF v_check THEN
      SELECT c.job_card_no INTO v_job FROM public.bodyshop_repair_cards c WHERE c.id = p_repair_card_id;
      SELECT d.total_invoice_amount INTO v_dms
        FROM public.psf_revenue_dms d
       WHERE upper(btrim(d.job_card_number)) = upper(btrim(v_job))
         AND COALESCE(d.invoice_status, '') <> 'Cancelled'
       ORDER BY d.invoice_date DESC NULLS LAST, d.updated_at DESC NULLS LAST
       LIMIT 1;
      v_differs := (v_dms IS NOT NULL AND abs(p_invoice_amount - v_dms) > 0.5);
      IF v_differs AND v_reason IS NULL THEN
        RAISE EXCEPTION 'Invoice amount % differs from the DMS invoice amount %. Enter the reason for the difference to save.',
          to_char(p_invoice_amount, 'FM999G999G990D00'), to_char(v_dms, 'FM999G999G990D00')
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  UPDATE public.bodyshop_settlements
     SET invoice_number = COALESCE(p_invoice_number, invoice_number),
         invoice_date = COALESCE(p_invoice_date, invoice_date),
         invoice_amount = COALESCE(p_invoice_amount, invoice_amount),
         invoice_labour_amount = COALESCE(p_invoice_labour_amount, invoice_labour_amount),
         invoice_spares_amount = COALESCE(p_invoice_spares_amount, invoice_spares_amount),
         invoice_account = COALESCE(p_invoice_account, invoice_account),
         invoice_source = COALESCE(p_invoice_source, invoice_source),
         invoice_amount_variance_reason = CASE
           WHEN v_check AND v_differs THEN v_reason
           WHEN v_check THEN NULL
           ELSE invoice_amount_variance_reason END,
         invoice_dms_amount_at_save = CASE
           WHEN v_check THEN v_dms
           ELSE invoice_dms_amount_at_save END,
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

REVOKE ALL ON FUNCTION public.upsert_bodyshop_settlement_header(
  integer, text, text, date, numeric, numeric, numeric, text, text, numeric, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_bodyshop_settlement_header(
  integer, text, text, date, numeric, numeric, numeric, text, text, numeric, text, text, text
) TO authenticated, service_role;
