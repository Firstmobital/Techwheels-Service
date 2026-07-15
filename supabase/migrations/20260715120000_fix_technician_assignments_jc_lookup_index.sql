-- SUPERSEDED: this migration was based on an incorrect hypothesis.
-- uq_technician_assignments_job_card_key already covers upper(btrim(job_card_number)).
-- The real fix is in 20260715120500_fix_jc_sync_trigger_loop.sql.
-- This file is intentionally a no-op so migration history stays intact.
SELECT 1;
