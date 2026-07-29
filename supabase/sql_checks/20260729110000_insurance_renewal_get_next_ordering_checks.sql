-- Insurance Renewal Telecalling — Get Next Customer ordering audit
-- Run in Supabase SQL Editor against production/staging.
--
-- Database truth (schema/functions): supabase/backups/full_metadata.sql
--   - insurance_renewal_leads view        (~line 16552)
--   - insurance_next_due_date()           (~line 4049)
--   - insurance_renewal_get_next_assignment() (~line 4075)
--
-- Purpose:
--   1. Show INTENDED order (insurance_renewal_get_next_assignment RPC logic)
--   2. Show what the live edge get_next effectively does (50-row sample + JS score)
--   3. Highlight gaps causing non-chronological expiry (Aug 17 → Aug 11 → Aug 21 …)
--
-- Set campaign filter (adjust name or use id directly):
--   WHERE c.campaign_name ILIKE '%Expiring 30 Days%'

-- ─── 0) Campaign priority_mode (edge uses this for scoring) ─────────────────
SELECT
  c.id,
  c.campaign_name,
  c.status,
  c.window_days,
  COALESCE(c.priority_mode, 'urgency') AS priority_mode,
  c.pending_count
FROM insurance_renewal_campaigns c
WHERE c.status = 'active'
ORDER BY c.id;

-- ─── 1) INTENDED order — matches insurance_renewal_get_next_assignment RPC ─
-- Bucket A: pending + retry_after due today, soonest retry then soonest effective_due_date
-- Bucket B: fresh pending (retry_after IS NULL), soonest effective_due_date
WITH active_campaign AS (
  SELECT id, COALESCE(priority_mode, 'urgency') AS priority_mode
  FROM insurance_renewal_campaigns
  WHERE status = 'active'
    AND campaign_name ILIKE '%Expiring 30 Days%'  -- adjust or replace with: id = 123
  ORDER BY id
  LIMIT 1
),
pending AS (
  SELECT
    ra.id AS assignment_id,
    ra.customer_id,
    ra.status,
    ra.retry_after,
    l.effective_due_date,
    l.due_date_is_estimated,
    l.last_insurance_expiry_date,
    l.vehicle_sale_date,
    l.chassis_no,
    CASE
      WHEN ra.retry_after IS NOT NULL AND ra.retry_after <= CURRENT_DATE THEN 'A_retry_due'
      WHEN ra.retry_after IS NULL THEN 'B_fresh_pending'
      ELSE 'C_retry_not_due'
    END AS rpc_bucket
  FROM insurance_renewal_assignments ra
  JOIN insurance_renewal_leads l ON l.id = ra.customer_id
  CROSS JOIN active_campaign ac
  WHERE ra.campaign_id = ac.id
    AND ra.status = 'pending'
)
SELECT
  assignment_id,
  customer_id,
  chassis_no,
  rpc_bucket,
  retry_after,
  effective_due_date,
  due_date_is_estimated,
  last_insurance_expiry_date,
  vehicle_sale_date
FROM pending
WHERE rpc_bucket IN ('A_retry_due', 'B_fresh_pending')
ORDER BY
  CASE rpc_bucket WHEN 'A_retry_due' THEN 0 ELSE 1 END,
  CASE WHEN rpc_bucket = 'A_retry_due' THEN retry_after END ASC NULLS LAST,
  effective_due_date ASC NULLS LAST,
  assignment_id ASC
LIMIT 30;

-- ─── 2) Edge get_next after fix — matches section 1 (RPC-backed) ───────────
-- After deploying insurance-renewal-telecalling edge fix, section 1 row #1
-- should equal the lead returned by Get Next Customer in the UI.

-- ─── 3) Global pending pool — true earliest-first list (what you EXPECT) ───
WITH active_campaign AS (
  SELECT id FROM insurance_renewal_campaigns
  WHERE status = 'active' AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id LIMIT 1
)
SELECT
  ra.id AS assignment_id,
  l.chassis_no,
  l.effective_due_date,
  l.due_date_is_estimated,
  l.last_insurance_expiry_date,
  l.vehicle_sale_date,
  ra.retry_after
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
CROSS JOIN active_campaign ac
WHERE ra.campaign_id = ac.id
  AND ra.status = 'pending'
  AND (ra.retry_after IS NULL OR ra.retry_after <= CURRENT_DATE)
ORDER BY l.effective_due_date ASC NULLS LAST, ra.id ASC
LIMIT 20;

-- ─── 4) Duplicate expiry dates (explains seeing "11 Aug" multiple times) ────
WITH active_campaign AS (
  SELECT id FROM insurance_renewal_campaigns
  WHERE status = 'active' AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id LIMIT 1
)
SELECT
  l.effective_due_date,
  COUNT(*) AS pending_leads,
  MIN(ra.id) AS min_assignment_id,
  MAX(ra.id) AS max_assignment_id
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
CROSS JOIN active_campaign ac
WHERE ra.campaign_id = ac.id
  AND ra.status = 'pending'
GROUP BY l.effective_due_date
HAVING COUNT(*) > 1
ORDER BY l.effective_due_date ASC
LIMIT 20;

-- ─── 5) priority_mode = idv_value would NOT sort by expiry ─────────────────
-- If campaign priority_mode is 'idv_value', edge sorts by IDV, not expiry date.
WITH active_campaign AS (
  SELECT id, COALESCE(priority_mode, 'urgency') AS priority_mode
  FROM insurance_renewal_campaigns
  WHERE status = 'active' AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id LIMIT 1
),
sample AS (
  SELECT ra.id, ra.customer_id
  FROM insurance_renewal_assignments ra
  CROSS JOIN active_campaign ac
  WHERE ra.campaign_id = ac.id AND ra.status = 'pending'
  ORDER BY ra.id ASC
  LIMIT 50
)
SELECT
  s.id AS assignment_id,
  l.effective_due_date,
  COALESCE(a.idv, 0) AS idv,
  ac.priority_mode
FROM sample s
JOIN all_service_data a ON a.id = s.customer_id
JOIN insurance_renewal_leads l ON l.id = s.customer_id
CROSS JOIN active_campaign ac
ORDER BY
  CASE ac.priority_mode
    WHEN 'idv_value' THEN COALESCE(a.idv, 0)
    WHEN 'loyalty' THEN 0  -- simplified; see edge calculatePriorityScore
    ELSE GREATEST(0, 365 - (l.effective_due_date - CURRENT_DATE))
  END DESC,
  s.id ASC
LIMIT 10;

-- ─── 6) Rows the edge NEVER considers (pending beyond first 50 by id) ───────
WITH active_campaign AS (
  SELECT id FROM insurance_renewal_campaigns
  WHERE status = 'active' AND campaign_name ILIKE '%Expiring 30 Days%'
  ORDER BY id LIMIT 1
),
ranked AS (
  SELECT
    ra.id,
    l.effective_due_date,
    ROW_NUMBER() OVER (ORDER BY ra.id ASC) AS rn
  FROM insurance_renewal_assignments ra
  JOIN insurance_renewal_leads l ON l.id = ra.customer_id
  CROSS JOIN active_campaign ac
  WHERE ra.campaign_id = ac.id AND ra.status = 'pending'
)
SELECT
  COUNT(*) FILTER (WHERE rn <= 50) AS in_edge_sample,
  COUNT(*) FILTER (WHERE rn > 50) AS excluded_from_edge_sample,
  MIN(effective_due_date) FILTER (WHERE rn <= 50) AS earliest_in_sample,
  MIN(effective_due_date) FILTER (WHERE rn > 50) AS earliest_excluded,
  MIN(effective_due_date) AS global_earliest_pending
FROM ranked;
