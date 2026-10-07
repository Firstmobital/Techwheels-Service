-- Vehicles marked on a bodyshop physical floor should have an active assignment row
-- so Floor Work / Bodyshop Floor share the same pipeline record (roles may still be empty).

INSERT INTO bodyshop_assignments (
  job_card_number,
  repair_card_id,
  dealer_code,
  is_active,
  assigned_at
)
SELECT
  upper(btrim(rc.job_card_no)),
  rc.id,
  coalesce(
    nullif(btrim(split_part(coalesce(rc.sa_employee_code, ''), '_', 1)), ''),
    '3000840'
  ),
  true,
  coalesce(rc.bodyshop_floor_since_at, now())
FROM bodyshop_repair_cards rc
WHERE rc.bodyshop_floor IS NOT NULL
  AND btrim(rc.bodyshop_floor) <> ''
  AND btrim(coalesce(rc.job_card_no, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM bodyshop_assignments ba
    WHERE ba.is_active = true
      AND (
        ba.repair_card_id = rc.id
        OR upper(btrim(ba.job_card_number)) = upper(btrim(rc.job_card_no))
      )
  );
