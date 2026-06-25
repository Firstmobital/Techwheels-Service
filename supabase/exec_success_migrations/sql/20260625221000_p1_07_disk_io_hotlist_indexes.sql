-- P1-07: Disk IO hotlist index pack (query-shape aligned)
-- Source evidence: 2026-06-25 full SQL check pack in SUPABASE-001 Section 14.6
-- Notes:
-- 1) Idempotent via IF NOT EXISTS.
-- 2) Targets Seq Scan + Sort plans on reception/technician/vas list paths.

CREATE INDEX IF NOT EXISTS idx_sre_created_at_id_desc
ON public.service_reception_entries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sre_service_type_created_at_id_desc
ON public.service_reception_entries (service_type, created_at DESC, id DESC)
WHERE jc_number IS NOT NULL AND jc_number <> '';

CREATE INDEX IF NOT EXISTS idx_ta_updated_assigned_desc
ON public.technician_assignments (updated_at DESC, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_vas_jc_closed_branch
ON public.service_vas_jc_data (jc_closed_date_time DESC, branch);
