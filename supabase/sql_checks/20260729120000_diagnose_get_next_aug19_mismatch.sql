-- Diagnose: Get Next returns Aug 19 while earlier expiry dates still pending
-- Replace campaign_id / assignee UUID as needed.

-- ─── A) How many callable pending leads expire BEFORE Aug 19? ───────────────
-- If this > 0 but UI keeps showing Aug 19, ordering or callback path is wrong.
SELECT
  COUNT(*) AS pending_before_aug19,
  MIN(l.effective_due_date) AS earliest_pending_due
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
WHERE ra.campaign_id = 1
  AND ra.status = 'pending'
  AND (ra.retry_after IS NULL OR ra.retry_after <= CURRENT_DATE)
  AND l.effective_due_date < DATE '2026-08-19';

-- ─── B) Exact front of queue (what RPC should pick next) ────────────────────
SELECT
  ra.id AS assignment_id,
  l.effective_due_date,
  l.last_insurance_expiry_date,
  l.vehicle_sale_date,
  l.due_date_is_estimated,
  l.chassis_no,
  CASE
    WHEN ra.retry_after IS NOT NULL AND ra.retry_after <= CURRENT_DATE THEN 'retry'
    ELSE 'fresh'
  END AS bucket,
  ra.retry_after,
  ra.no_answer_count
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
WHERE ra.campaign_id = 1
  AND ra.status = 'pending'
  AND (ra.retry_after IS NULL OR ra.retry_after <= CURRENT_DATE)
ORDER BY
  CASE WHEN ra.retry_after IS NOT NULL AND ra.retry_after <= CURRENT_DATE THEN 0 ELSE 1 END,
  ra.retry_after ASC NULLS LAST,
  l.effective_due_date ASC NULLS LAST,
  ra.id ASC
LIMIT 15;

-- ─── C) Pending count BY expiry date (Aug 10–22) ────────────────────────────
SELECT
  l.effective_due_date,
  COUNT(*) FILTER (WHERE ra.retry_after IS NOT NULL AND ra.retry_after <= CURRENT_DATE) AS retry_due,
  COUNT(*) FILTER (WHERE ra.retry_after IS NULL) AS fresh,
  COUNT(*) AS total_pending
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
WHERE ra.campaign_id = 1
  AND ra.status = 'pending'
  AND l.effective_due_date BETWEEN DATE '2026-08-10' AND DATE '2026-08-22'
GROUP BY l.effective_due_date
ORDER BY l.effective_due_date;

-- ─── D) Callback trap — due today, blocks pool until disposition ────────────
-- Replace UUID with telecaller auth id (e.g. Kalpana)
SELECT
  ra.id,
  ra.status,
  ra.callback_date,
  l.effective_due_date,
  l.chassis_no,
  ra.assigned_to_name
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
WHERE ra.campaign_id = 1
  AND ra.status IN ('callback_later', 'in_progress')
  AND ra.callback_date IS NOT NULL
  AND ra.callback_date <= CURRENT_DATE
  AND ra.assigned_to = '60dc921e-e6d6-4897-bcc8-603afc72015a'
ORDER BY ra.callback_date, l.effective_due_date;

-- ─── E) Stuck in_progress (orphaned cards — Get Next can still pull pending) ─
SELECT
  ra.id,
  l.effective_due_date,
  l.chassis_no,
  ra.assigned_to_name,
  ra.assigned_at
FROM insurance_renewal_assignments ra
JOIN insurance_renewal_leads l ON l.id = ra.customer_id
WHERE ra.campaign_id = 1
  AND ra.status = 'in_progress'
ORDER BY ra.assigned_at DESC
LIMIT 20;

-- ─── F) Verify last pick vs queue head ──────────────────────────────────────
-- After one Get Next: assignment.id on call card should match row #1 in section B
-- (unless section D returned a callback first).
