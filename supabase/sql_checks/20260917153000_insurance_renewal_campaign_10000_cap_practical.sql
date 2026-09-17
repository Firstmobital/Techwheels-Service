-- Insurance Renewal — is UI Total 10000 the DB truth, or still a 10k fetch cap?
-- Read-only. Run in Supabase SQL Editor (postgres / service role).
--
-- Database truth (schema): supabase/backups/full_metadata.sql
--   - public.insurance_renewal_campaigns
--   - public.insurance_renewal_assignments  UNIQUE (campaign_id, customer_id)
--   - public.insurance_renewal_leads view   (effective_due_date)
--   - public.insurance_renewal_rc_fetch_diagnostics(campaign_id)  uses count(*)
--
-- How to read the last result set (`verdict`):
--   stored_eq_true_count = true  AND true_assignment_count = 10000
--     → campaign.total_leads is honest; there really are 10k assignment rows.
--   stored_eq_true_count = false
--     → UI/counter still truncated; deployed recount did not land.
--   missing_in_window > 0
--     → 60-day eligible customers with phones are NOT in this campaign (refresh still dropping).
--   missing_in_window = 0 AND true_assignment_count = 10000
--     → this campaign is full for the current window; 10k is the assignment table size
--       (most rows are out_of_window history, not live work).
--   all_service_data_rows is much larger than in_window_eligible
--     → expected: campaigns are a rolling window, not the whole table.

-- ─── 0) Active campaigns: stored counters (what the UI reads) ──────────────
SELECT
  c.id,
  c.campaign_name,
  c.status,
  c.window_days,
  c.date_from,
  c.date_to,
  c.sold_dealer_filter,
  c.last_service_dealer_filter,
  c.total_leads,
  c.pending_count,
  c.in_progress_count,
  c.callback_later_count,
  c.quote_needed_count,
  c.policy_requested_count,
  c.quote_sent_count,
  c.renewed_count,
  c.policy_done_count,
  c.completed_count,
  c.out_of_window_count
FROM public.insurance_renewal_campaigns c
WHERE c.status = 'active'
ORDER BY c.id;

-- ─── 1) True assignment counts vs stored counters ──────────────────────────
-- count(*) is not PostgREST-capped. This is the assignment-table truth.
WITH camp AS (
  SELECT id
  FROM public.insurance_renewal_campaigns
  WHERE status = 'active'
    AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id
  LIMIT 1
),
true_counts AS (
  SELECT
    a.campaign_id,
    count(*)::bigint AS true_total,
    count(*) FILTER (WHERE a.status = 'pending')::bigint AS true_pending,
    count(*) FILTER (WHERE a.status = 'in_progress')::bigint AS true_in_progress,
    count(*) FILTER (WHERE a.status = 'callback_later')::bigint AS true_callback,
    count(*) FILTER (WHERE a.status = 'quote_needed')::bigint AS true_quote_needed,
    count(*) FILTER (WHERE a.status = 'policy_requested')::bigint AS true_policy_requested,
    count(*) FILTER (WHERE a.status = 'quote_sent')::bigint AS true_quote_sent,
    count(*) FILTER (WHERE a.status = 'renewed_via_us')::bigint AS true_renewed,
    count(*) FILTER (WHERE a.status IN ('policy_done', 'already_renewed_unknown'))::bigint AS true_policy_done,
    count(*) FILTER (WHERE a.status IN (
      'renewed_via_us', 'renewed_elsewhere', 'not_interested', 'wrong_number',
      'not_reachable', 'policy_done', 'already_renewed_unknown'
    ))::bigint AS true_completed,
    count(*) FILTER (WHERE a.status = 'out_of_window')::bigint AS true_oow
  FROM public.insurance_renewal_assignments a
  JOIN camp ON camp.id = a.campaign_id
  GROUP BY a.campaign_id
)
SELECT
  c.id AS campaign_id,
  c.campaign_name,
  c.total_leads AS stored_total_leads,
  t.true_total,
  (c.total_leads = t.true_total) AS stored_eq_true_count,
  (t.true_total = 10000) AS true_total_is_exactly_10000,
  jsonb_build_object(
    'pending', jsonb_build_object('stored', c.pending_count, 'true', t.true_pending, 'match', c.pending_count = t.true_pending),
    'in_progress', jsonb_build_object('stored', c.in_progress_count, 'true', t.true_in_progress, 'match', c.in_progress_count = t.true_in_progress),
    'callback', jsonb_build_object('stored', c.callback_later_count, 'true', t.true_callback, 'match', c.callback_later_count = t.true_callback),
    'quote_needed', jsonb_build_object('stored', c.quote_needed_count, 'true', t.true_quote_needed, 'match', c.quote_needed_count = t.true_quote_needed),
    'policy_requested', jsonb_build_object('stored', c.policy_requested_count, 'true', t.true_policy_requested, 'match', c.policy_requested_count = t.true_policy_requested),
    'quote_sent', jsonb_build_object('stored', c.quote_sent_count, 'true', t.true_quote_sent, 'match', c.quote_sent_count = t.true_quote_sent),
    'renewed', jsonb_build_object('stored', c.renewed_count, 'true', t.true_renewed, 'match', c.renewed_count = t.true_renewed),
    'policy_done', jsonb_build_object('stored', c.policy_done_count, 'true', t.true_policy_done, 'match', c.policy_done_count = t.true_policy_done),
    'completed', jsonb_build_object('stored', c.completed_count, 'true', t.true_completed, 'match', c.completed_count = t.true_completed),
    'out_of_window', jsonb_build_object('stored', c.out_of_window_count, 'true', t.true_oow, 'match', c.out_of_window_count = t.true_oow)
  ) AS bucket_compare,
  d.assignment_total AS diagnostics_rpc_assignment_total
FROM camp
JOIN public.insurance_renewal_campaigns c ON c.id = camp.id
JOIN true_counts t ON t.campaign_id = camp.id
CROSS JOIN LATERAL public.insurance_renewal_rc_fetch_diagnostics(camp.id) d;

-- ─── 2) Universe vs rolling window (campaign is NOT the whole table) ───────
WITH camp AS (
  SELECT id, date_from, date_to, window_days, sold_dealer_filter, last_service_dealer_filter
  FROM public.insurance_renewal_campaigns
  WHERE status = 'active'
    AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id
  LIMIT 1
)
SELECT
  (SELECT count(*) FROM public.all_service_data) AS all_service_data_rows,
  (SELECT count(*) FROM public.insurance_renewal_leads l
    WHERE l.contact_phones IS NOT NULL AND l.contact_phones <> '') AS leads_with_phone,
  (SELECT count(*) FROM public.insurance_renewal_leads l
    WHERE l.contact_phones IS NOT NULL AND l.contact_phones <> ''
      AND l.effective_due_date IS NOT NULL) AS leads_with_phone_and_due,
  (
    SELECT count(*)
    FROM public.insurance_renewal_leads l
    CROSS JOIN camp
    WHERE l.contact_phones IS NOT NULL AND l.contact_phones <> ''
      AND l.effective_due_date IS NOT NULL
      AND l.effective_due_date BETWEEN camp.date_from AND camp.date_to
  ) AS in_window_raw,
  camp.date_from,
  camp.date_to,
  camp.window_days
FROM camp;

-- ─── 3) In-window eligible NOT already in this campaign (refresh miss) ─────
-- Mirrors edge fetchEligibleVehiclesInWindow + chassis dedupe (lowest id wins).
WITH camp AS (
  SELECT *
  FROM public.insurance_renewal_campaigns
  WHERE status = 'active'
    AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id
  LIMIT 1
),
in_window AS (
  SELECT l.id, l.chassis_no, l.effective_due_date
  FROM public.insurance_renewal_leads l
  JOIN public.all_service_data s ON s.id = l.id
  CROSS JOIN camp
  WHERE l.contact_phones IS NOT NULL
    AND l.contact_phones <> ''
    AND l.effective_due_date IS NOT NULL
    AND l.effective_due_date BETWEEN camp.date_from AND camp.date_to
    AND (
      camp.sold_dealer_filter IS NULL
      OR cardinality(camp.sold_dealer_filter) = 0
      OR s.sold_dealer = ANY (camp.sold_dealer_filter)
    )
    AND (
      camp.last_service_dealer_filter IS NULL
      OR cardinality(camp.last_service_dealer_filter) = 0
      OR s.last_service_dealer = ANY (camp.last_service_dealer_filter)
    )
),
deduped AS (
  SELECT DISTINCT ON (COALESCE(NULLIF(btrim(chassis_no), ''), 'id:' || id::text))
    id, chassis_no, effective_due_date
  FROM in_window
  ORDER BY COALESCE(NULLIF(btrim(chassis_no), ''), 'id:' || id::text), id
),
already AS (
  SELECT DISTINCT a.customer_id
  FROM public.insurance_renewal_assignments a
  CROSS JOIN camp
  WHERE a.campaign_id = camp.id
)
SELECT
  (SELECT count(*) FROM in_window) AS in_window_raw,
  (SELECT count(*) FROM deduped) AS in_window_after_chassis_dedupe,
  (SELECT count(*) FROM already) AS already_in_campaign,
  (SELECT count(*) FROM deduped d WHERE NOT EXISTS (
    SELECT 1 FROM already x WHERE x.customer_id = d.id
  )) AS missing_in_window,
  (SELECT count(*) FROM deduped d WHERE EXISTS (
    SELECT 1 FROM already x WHERE x.customer_id = d.id
  )) AS in_window_already_assigned;

-- ─── 4) Verdict ────────────────────────────────────────────────────────────
WITH camp AS (
  SELECT *
  FROM public.insurance_renewal_campaigns
  WHERE status = 'active'
    AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id
  LIMIT 1
),
true_total AS (
  SELECT count(*)::bigint AS n
  FROM public.insurance_renewal_assignments a
  JOIN camp ON camp.id = a.campaign_id
),
in_window AS (
  SELECT l.id, l.chassis_no
  FROM public.insurance_renewal_leads l
  JOIN public.all_service_data s ON s.id = l.id
  CROSS JOIN camp
  WHERE l.contact_phones IS NOT NULL
    AND l.contact_phones <> ''
    AND l.effective_due_date IS NOT NULL
    AND l.effective_due_date BETWEEN camp.date_from AND camp.date_to
    AND (
      camp.sold_dealer_filter IS NULL
      OR cardinality(camp.sold_dealer_filter) = 0
      OR s.sold_dealer = ANY (camp.sold_dealer_filter)
    )
    AND (
      camp.last_service_dealer_filter IS NULL
      OR cardinality(camp.last_service_dealer_filter) = 0
      OR s.last_service_dealer = ANY (camp.last_service_dealer_filter)
    )
),
deduped AS (
  SELECT DISTINCT ON (COALESCE(NULLIF(btrim(chassis_no), ''), 'id:' || id::text)) id
  FROM in_window
  ORDER BY COALESCE(NULLIF(btrim(chassis_no), ''), 'id:' || id::text), id
),
missing AS (
  SELECT count(*)::bigint AS n
  FROM deduped d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.insurance_renewal_assignments a
    CROSS JOIN camp
    WHERE a.campaign_id = camp.id
      AND a.customer_id = d.id
  )
)
SELECT
  camp.id AS campaign_id,
  camp.total_leads AS stored_total_leads,
  true_total.n AS true_assignment_count,
  (camp.total_leads = true_total.n) AS stored_eq_true_count,
  (true_total.n = 10000) AS true_total_is_exactly_10000,
  missing.n AS missing_in_window,
  CASE
    WHEN camp.total_leads IS DISTINCT FROM true_total.n THEN
      'COUNTER_STALE: UI total_leads is not count(*) of assignments — deployed recount did not update the campaign row.'
    WHEN missing.n > 0 THEN
      'REFRESH_MISS: count(*) matches the UI, but ' || missing.n::text ||
      ' in-window eligible customers (phone + due date in campaign window) are not in this campaign.'
    WHEN true_total.n = 10000 THEN
      'WINDOW_FULL_AT_10K: assignment table really has 10000 rows for this campaign and no in-window customer is missing. Most are out_of_window history. This is not the whole all_service_data table.'
    ELSE
      'OK: stored counters match count(*) and every in-window eligible customer is already assigned.'
  END AS verdict
FROM camp
CROSS JOIN true_total
CROSS JOIN missing;
