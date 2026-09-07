-- Body Shop Customer App: Phase 1 additive schema extensions.
--
-- Confirmed gaps from repository audit (no existing authority covers these):
--   1. service_reception_entries has no customer email column.
--   2. employee_master has no mobile/contact column (needed to resolve Floor
--      Incharge contact via bodyshop_floor_support_assignments -> employee_master).
--   3. bodyshop_repair_cards has approved_parts but no non_approved_parts
--      (manually entered, never derived from Estimate - Approved).
--   4. bodyshop_repair_cards has claim_intimation_no but no claim_intimation_date.
--   5. Proforma Invoice (PI) has no existing workflow anywhere in this codebase;
--      minimal status fields added here, NOT mapped to parts_incharge_* fields.
--   6. complaint_tickets.category is an unrelated topic-classification enum and
--      cannot distinguish Query / Complaint / Chat; ticket_type is a new,
--      separate column for that purpose.
--
-- All changes are additive/nullable (except ticket_type, which is NOT NULL with
-- a safe backfill default so existing complaint rows are unaffected).

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS owner_email text;

COMMENT ON COLUMN public.service_reception_entries.owner_email IS
  'Optional customer email, entered via the Body Shop Customer App. No existing canonical authority found during repository audit.';

ALTER TABLE public.employee_master
  ADD COLUMN IF NOT EXISTS mobile_number text;

COMMENT ON COLUMN public.employee_master.mobile_number IS
  'Optional employee mobile/contact number. Added to resolve Floor Incharge contact for the Body Shop Customer App: active bodyshop_floor_support_assignments (support_role = FLOOR_INCHARGE) -> employee_code -> employee_master.mobile_number. Not duplicated onto individual repair cards.';

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS non_approved_parts text,
  ADD COLUMN IF NOT EXISTS claim_intimation_date date,
  ADD COLUMN IF NOT EXISTS pi_status text,
  ADD COLUMN IF NOT EXISTS pi_generated_at timestamp with time zone;

COMMENT ON COLUMN public.bodyshop_repair_cards.non_approved_parts IS
  'Manually maintained list of parts not approved by insurance. Must NOT be auto-derived as Estimate Parts minus Approved Parts.';

COMMENT ON COLUMN public.bodyshop_repair_cards.claim_intimation_date IS
  'Date the insurance claim was intimated. Exact semantics (intimation vs. insurer acknowledgment vs. entry date) pending business confirmation; population left to normal reception/survey workflow.';

COMMENT ON COLUMN public.bodyshop_repair_cards.pi_status IS
  'Proforma Invoice status for the Body Shop Customer App. Greenfield addition -- no existing PI workflow/table found during repository audit. Must not be confused with Parts Incharge (parts_incharge_* columns on bodyshop_assignments), which is a different concept.';

ALTER TABLE public.bodyshop_repair_cards
  ADD CONSTRAINT bodyshop_repair_cards_pi_status_check
  CHECK (pi_status IS NULL OR pi_status = ANY (ARRAY['not_started', 'in_progress', 'completed']));

ALTER TABLE public.complaint_tickets
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'complaint';

ALTER TABLE public.complaint_tickets
  ADD CONSTRAINT complaint_tickets_ticket_type_check
  CHECK (ticket_type = ANY (ARRAY['query', 'complaint', 'chat']));

COMMENT ON COLUMN public.complaint_tickets.ticket_type IS
  'Distinguishes Query / Complaint / Chat for the Body Shop Customer App unified communication backend. Separate from category (topic classification). Existing rows default to complaint since the table previously only modeled complaints.';
