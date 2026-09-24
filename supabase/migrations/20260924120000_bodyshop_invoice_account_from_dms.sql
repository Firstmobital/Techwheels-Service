-- DBL-0084 / BODYSHOP-SETTLEMENT-001
-- Copy the latest live psf_revenue_dms.account into
-- bodyshop_settlements.invoice_account when that column is empty.
--
-- Two writers, both set-based:
--   1. _bodyshop_ensure_settlement (billing save, payment post, any header touch)
--   2. AFTER STATEMENT trigger on psf_revenue_dms (one fire per import statement)
--
-- Does not write insurance_company. Does not use first_name / last_name.
-- Does not overwrite a non-null invoice_account. Does not add a per-row trigger.

CREATE OR REPLACE FUNCTION public.sync_bodyshop_invoice_account_from_dms(
  p_job_card_nos text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (upper(btrim(p.job_card_number)))
      upper(btrim(p.job_card_number)) AS jc,
      NULLIF(btrim(p.account), '') AS account
    FROM public.psf_revenue_dms p
    WHERE COALESCE(p.invoice_status, '') <> 'Cancelled'
      AND (
        p_job_card_nos IS NULL
        OR upper(btrim(p.job_card_number)) IN (
          SELECT upper(btrim(x))
          FROM unnest(p_job_card_nos) AS u(x)
          WHERE NULLIF(btrim(x), '') IS NOT NULL
        )
      )
    ORDER BY
      upper(btrim(p.job_card_number)),
      p.invoice_date DESC NULLS LAST,
      p.updated_at DESC NULLS LAST
  ),
  upd AS (
    UPDATE public.bodyshop_settlements s
       SET invoice_account = latest.account,
           invoice_source = COALESCE(s.invoice_source, 'psf_revenue_dms'),
           updated_at = now()
      FROM latest
     WHERE upper(btrim(s.job_card_no)) = latest.jc
       AND NULLIF(btrim(s.invoice_account), '') IS NULL
       AND latest.account IS NOT NULL
    RETURNING s.id
  )
  SELECT count(*)::integer INTO v_updated FROM upd;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.sync_bodyshop_invoice_account_from_dms(text[]) IS
  'Fill empty bodyshop_settlements.invoice_account from the latest live psf_revenue_dms.account. Does not touch insurance_company or a non-null bill-to.';

REVOKE ALL ON FUNCTION public.sync_bodyshop_invoice_account_from_dms(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_bodyshop_invoice_account_from_dms(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.sync_bodyshop_invoice_account_from_dms(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_bodyshop_invoice_account_from_dms(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public._bodyshop_ensure_settlement(p_repair_card_id integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_id bigint;
  v_jc text;
  v_actor text;
BEGIN
  SELECT id, job_card_no INTO v_id, v_jc
    FROM public.bodyshop_settlements
   WHERE repair_card_id = p_repair_card_id;

  IF v_id IS NULL THEN
    SELECT job_card_no INTO v_jc FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id;
    IF v_jc IS NULL THEN
      RAISE EXCEPTION 'repair card % not found', p_repair_card_id USING ERRCODE = 'P0002';
    END IF;

    SELECT a.actor_email INTO v_actor FROM public._bodyshop_settlement_actor() a;

    INSERT INTO public.bodyshop_settlements (repair_card_id, job_card_no, created_by, updated_by)
    VALUES (p_repair_card_id, v_jc, v_actor, v_actor)
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.sync_bodyshop_invoice_account_from_dms(ARRAY[v_jc]);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_jcs text[];
BEGIN
  SELECT array_agg(DISTINCT upper(btrim(n.job_card_number)))
    INTO v_jcs
    FROM new_rows n
   WHERE NULLIF(btrim(n.job_card_number), '') IS NOT NULL;

  IF v_jcs IS NOT NULL THEN
    PERFORM public.sync_bodyshop_invoice_account_from_dms(v_jcs);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bodyshop_invoice_account ON public.psf_revenue_dms;
DROP TRIGGER IF EXISTS trg_sync_bodyshop_invoice_account_ins ON public.psf_revenue_dms;
DROP TRIGGER IF EXISTS trg_sync_bodyshop_invoice_account_upd ON public.psf_revenue_dms;

-- Transition tables cannot be declared on a trigger with more than one event.
CREATE TRIGGER trg_sync_bodyshop_invoice_account_ins
AFTER INSERT ON public.psf_revenue_dms
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms();

-- Column lists are also incompatible with transition tables.
-- One statement still copies only the job cards in that statement.
CREATE TRIGGER trg_sync_bodyshop_invoice_account_upd
AFTER UPDATE ON public.psf_revenue_dms
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms();

COMMENT ON FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms() IS
  'One set-based bill-to copy per psf_revenue_dms statement. Not a per-row trigger.';

REVOKE ALL ON FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms() FROM anon;
REVOKE ALL ON FUNCTION public.trg_sync_bodyshop_invoice_account_from_dms() FROM authenticated;

-- Existing empty invoice_account rows whose latest live DMS invoice has account.
SELECT public.sync_bodyshop_invoice_account_from_dms(NULL);
