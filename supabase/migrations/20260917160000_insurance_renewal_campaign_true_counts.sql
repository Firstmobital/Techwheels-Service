-- Insurance renewal campaign counters must follow COUNT(*) of assignments.
-- PostgREST max_rows (prod 10000) made the edge function write total_leads=10000
-- even when insurance_renewal_assignments had more rows (diagnostics 11020).
-- Refresh Now then overwrote a manual SQL fix.
--
-- BEFORE UPDATE on insurance_renewal_campaigns replaces count columns from
-- COUNT(*) so a truncated edge UPDATE cannot persist.
--
-- Timestamp 20260917160000. Ledger: DBL-0077.
--
-- Rollback:
-- DROP TRIGGER IF EXISTS trg_insurance_renewal_campaigns_force_true_counts ON public.insurance_renewal_campaigns;
-- DROP FUNCTION IF EXISTS public.trg_insurance_renewal_campaigns_force_true_counts();
-- DROP FUNCTION IF EXISTS public.insurance_renewal_recount_campaign(bigint);
-- DROP FUNCTION IF EXISTS public.insurance_renewal_campaign_count_snapshot(bigint);

CREATE OR REPLACE FUNCTION public.insurance_renewal_campaign_count_snapshot(p_campaign_id bigint)
RETURNS TABLE (
  total_leads integer,
  pending_count integer,
  in_progress_count integer,
  callback_later_count integer,
  quote_needed_count integer,
  policy_requested_count integer,
  quote_sent_count integer,
  renewed_count integer,
  policy_done_count integer,
  completed_count integer,
  out_of_window_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE a.status = 'pending')::integer,
    count(*) FILTER (WHERE a.status = 'in_progress')::integer,
    count(*) FILTER (WHERE a.status = 'callback_later')::integer,
    count(*) FILTER (WHERE a.status = 'quote_needed')::integer,
    count(*) FILTER (WHERE a.status = 'policy_requested')::integer,
    count(*) FILTER (WHERE a.status = 'quote_sent')::integer,
    count(*) FILTER (WHERE a.status = 'renewed_via_us')::integer,
    count(*) FILTER (WHERE a.status IN ('policy_done', 'already_renewed_unknown'))::integer,
    count(*) FILTER (WHERE a.status IN (
      'renewed_via_us', 'renewed_elsewhere', 'not_interested', 'wrong_number',
      'not_reachable', 'policy_done', 'already_renewed_unknown'
    ))::integer,
    count(*) FILTER (WHERE a.status = 'out_of_window')::integer
  FROM public.insurance_renewal_assignments a
  WHERE a.campaign_id = p_campaign_id;
$$;

COMMENT ON FUNCTION public.insurance_renewal_campaign_count_snapshot(bigint) IS
  'True assignment-status counts for one insurance renewal campaign. Not subject to PostgREST max_rows.';

CREATE OR REPLACE FUNCTION public.trg_insurance_renewal_campaigns_force_true_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_total integer;
  v_pending integer;
  v_in_progress integer;
  v_callback integer;
  v_quote_needed integer;
  v_policy_requested integer;
  v_quote_sent integer;
  v_renewed integer;
  v_policy_done integer;
  v_completed integer;
  v_oow integer;
BEGIN
  SELECT
    s.total_leads,
    s.pending_count,
    s.in_progress_count,
    s.callback_later_count,
    s.quote_needed_count,
    s.policy_requested_count,
    s.quote_sent_count,
    s.renewed_count,
    s.policy_done_count,
    s.completed_count,
    s.out_of_window_count
  INTO
    v_total,
    v_pending,
    v_in_progress,
    v_callback,
    v_quote_needed,
    v_policy_requested,
    v_quote_sent,
    v_renewed,
    v_policy_done,
    v_completed,
    v_oow
  FROM public.insurance_renewal_campaign_count_snapshot(NEW.id) s;

  NEW.total_leads := COALESCE(v_total, 0);
  NEW.pending_count := COALESCE(v_pending, 0);
  NEW.in_progress_count := COALESCE(v_in_progress, 0);
  NEW.callback_later_count := COALESCE(v_callback, 0);
  NEW.quote_needed_count := COALESCE(v_quote_needed, 0);
  NEW.policy_requested_count := COALESCE(v_policy_requested, 0);
  NEW.quote_sent_count := COALESCE(v_quote_sent, 0);
  NEW.renewed_count := COALESCE(v_renewed, 0);
  NEW.policy_done_count := COALESCE(v_policy_done, 0);
  NEW.completed_count := COALESCE(v_completed, 0);
  NEW.out_of_window_count := COALESCE(v_oow, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insurance_renewal_campaigns_force_true_counts
  ON public.insurance_renewal_campaigns;

CREATE TRIGGER trg_insurance_renewal_campaigns_force_true_counts
  BEFORE UPDATE ON public.insurance_renewal_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_insurance_renewal_campaigns_force_true_counts();

CREATE OR REPLACE FUNCTION public.insurance_renewal_recount_campaign(p_campaign_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id bigint;
  v_total integer;
BEGIN
  UPDATE public.insurance_renewal_campaigns
  SET updated_at = now()
  WHERE id = p_campaign_id
  RETURNING id, total_leads INTO v_id, v_total;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'insurance renewal campaign % not found', p_campaign_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', v_id,
    'total_leads', v_total
  );
END;
$$;

COMMENT ON FUNCTION public.insurance_renewal_recount_campaign(bigint) IS
  'Touches a campaign row so trg_insurance_renewal_campaigns_force_true_counts writes COUNT(*) counters.';

GRANT EXECUTE ON FUNCTION public.insurance_renewal_campaign_count_snapshot(bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insurance_renewal_recount_campaign(bigint)
  TO authenticated, service_role;

-- Rewrite stored counters now (fires the trigger).
UPDATE public.insurance_renewal_campaigns
SET updated_at = now();
