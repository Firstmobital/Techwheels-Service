-- P1-05/P1-06: Add index to support all_service_data_dynamic pagination pattern
--
-- Context: queryid=4251000708073776526 in snapshot 14.32 shows 26,074 calls,
-- delta_total_ms=5,489,359 ms. The query pattern is:
--   SELECT chassis_no, fuel_tp, priority_bucket, priority_score, updated_by_robot
--   FROM all_service_data_dynamic
--   WHERE fuel_tp = $1 AND updated_by_robot IS NULL
--   ORDER BY priority_bucket ASC, priority_score ASC
--   LIMIT $2 OFFSET $3
--
-- The existing index (priority_bucket, priority_score DESC, id) does not match
-- the ASC order on priority_score used by this query.
-- Adding a partial index for the unprocessed (updated_by_robot IS NULL) subset
-- ordered by priority_bucket ASC, priority_score ASC allows the DB to use an
-- index scan instead of a full seq scan + sort for each OFFSET page.
--
-- The caller is external (anon role, not found in app/edge function source).
-- This index reduces cost per call until the caller migrates to keyset pagination.

CREATE INDEX IF NOT EXISTS idx_asd_dynamic_unprocessed_priority
  ON public.all_service_data_dynamic (fuel_tp, priority_bucket ASC, priority_score ASC, id ASC)
  WHERE updated_by_robot IS NULL;

COMMENT ON INDEX idx_asd_dynamic_unprocessed_priority IS
  'Supports fuel_tp + updated_by_robot IS NULL filter ordered by priority_bucket ASC, '
  'priority_score ASC. Targets high-call-count OFFSET pagination by external robot caller '
  '(queryid=4251000708073776526, delta_total_ms=5.5B ms in snapshot 14.32).';
