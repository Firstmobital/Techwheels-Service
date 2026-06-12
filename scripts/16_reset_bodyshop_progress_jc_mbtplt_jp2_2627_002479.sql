-- Reset Bodyshop progress for one specific card to start fresh.
-- Target: JC-MBTPLT-JP2-2627-002479 / RJ60CC1188
-- Scope: reset stage/workflow fields + delete intake photo metadata for linked reception entry.
-- Keeps/re-syncs: core card identity and base details from linked reception row
-- (job card, reg no, owner, phone, branch, SA, received_at).

BEGIN;

-- 1) Verify target row (read before update)
SELECT
  id,
  reception_entry_id,
  job_card_no,
  reg_number,
  current_stage,
  current_stage_name,
  overall_status,
  updated_at
FROM public.bodyshop_repair_cards
WHERE UPPER(TRIM(job_card_no)) = 'JC-MBTPLT-JP2-2627-002479'
  AND UPPER(TRIM(COALESCE(reg_number, ''))) = 'RJ60CC1188'
ORDER BY updated_at DESC NULLS LAST, id DESC;

-- 1b) Guard: require valid linked reception entry (abort if missing)
DO $$
DECLARE
  v_card_id bigint;
  v_reception_entry_id bigint;
BEGIN
  SELECT b.id, b.reception_entry_id
  INTO v_card_id, v_reception_entry_id
  FROM public.bodyshop_repair_cards b
  WHERE UPPER(TRIM(b.job_card_no)) = 'JC-MBTPLT-JP2-2627-002479'
    AND UPPER(TRIM(COALESCE(b.reg_number, ''))) = 'RJ60CC1188'
  ORDER BY b.updated_at DESC NULLS LAST, b.id DESC
  LIMIT 1;

  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'Reset aborted: bodyshop card not found for target JC/Reg';
  END IF;

  IF v_reception_entry_id IS NULL THEN
    RAISE EXCEPTION 'Reset aborted: target bodyshop card % has NULL reception_entry_id', v_card_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.service_reception_entries r
    WHERE r.id = v_reception_entry_id
  ) THEN
    RAISE EXCEPTION 'Reset aborted: linked reception entry % does not exist', v_reception_entry_id;
  END IF;
END $$;

-- 2) Reset stage/workflow fields for latest matching card
WITH target AS (
  SELECT
    b.id,
    b.reception_entry_id,
    r.jc_number,
    r.reg_number,
    r.owner_name,
    r.owner_phone,
    r.branch,
    r.sa_employee_code,
    r.sa_name,
    r.sa_display_name,
    r.created_at
  FROM public.bodyshop_repair_cards b
  JOIN public.service_reception_entries r ON r.id = b.reception_entry_id
  WHERE UPPER(TRIM(b.job_card_no)) = 'JC-MBTPLT-JP2-2627-002479'
    AND UPPER(TRIM(COALESCE(b.reg_number, ''))) = 'RJ60CC1188'
  ORDER BY b.updated_at DESC NULLS LAST, b.id DESC
  LIMIT 1
)
UPDATE public.bodyshop_repair_cards b
SET
  -- Re-sync base card details from reception for this entry.
  job_card_no = COALESCE(NULLIF(TRIM(t.jc_number), ''), b.job_card_no),
  reg_number = COALESCE(NULLIF(TRIM(t.reg_number), ''), b.reg_number),
  customer_name = COALESCE(NULLIF(TRIM(t.owner_name), ''), b.customer_name),
  customer_phone = COALESCE(NULLIF(TRIM(t.owner_phone), ''), b.customer_phone),
  branch = COALESCE(NULLIF(TRIM(t.branch), ''), b.branch),
  sa_employee_code = COALESCE(NULLIF(TRIM(t.sa_employee_code), ''), b.sa_employee_code),
  sa_name = COALESCE(NULLIF(TRIM(t.sa_display_name), ''), NULLIF(TRIM(t.sa_name), ''), b.sa_name),
  received_at = COALESCE(t.created_at, b.received_at),

  current_stage = 1,
  current_stage_name = 'Vehicle Receiving',
  overall_status = 'active',

  -- SA intake relative fields
  customer_type = NULL,
  customer_group_wa_sent_at = NULL,
  customer_group_wa_sent_by = NULL,

  -- docs
  insurance_policy_no = NULL,
  insurance_company = NULL,
  insurance_valid_date = NULL,
  doc_claim_form = FALSE,
  doc_rc = FALSE,
  doc_insurance = FALSE,
  doc_dl = FALSE,
  doc_aadhaar = FALSE,
  doc_pan = FALSE,
  doc_kyc = FALSE,
  doc_gst = FALSE,
  doc_company_pan = FALSE,
  doc_bank_detail = FALSE,

  -- survey / estimation
  survey_status = NULL,
  survey_hold_reason = NULL,
  claim_intimation_no = NULL,
  surveyor_name = NULL,
  surveyor_contact = NULL,
  approved_parts = NULL,
  customer_approved = FALSE,
  estimation_by = NULL,
  estimation_at = NULL,
  estimation_approved_by = NULL,

  -- floor
  denter_name = NULL,
  denter_code = NULL,
  painter_name = NULL,
  painter_code = NULL,
  technician_name = NULL,
  technician_code = NULL,
  floor_status = NULL,
  floor_hold_reason = NULL,
  additional_approval = NULL,

  -- qc
  qc_status = NULL,
  qc_checked_by = NULL,
  qc_checked_at = NULL,
  qc_fail_reason = NULL,
  reinspection_type = NULL,
  reinspection_by = NULL,
  reinspection_at = NULL,

  -- billing
  parts_entry_status = NULL,
  billed_amount = NULL,
  do_status = NULL,
  do_amount = NULL,
  customer_diff_amount = NULL,
  payment_slip_url = NULL,
  payment_status = NULL,

  -- delivery
  delivery_status = NULL,
  delivery_marked_by = NULL,
  delivery_marked_at = NULL,
  delivered_at = NULL,

  updated_at = NOW()
FROM target t
WHERE b.id = t.id
RETURNING b.id, b.reception_entry_id, b.current_stage, b.current_stage_name, b.overall_status, b.updated_at;

-- 3) Remove uploaded intake photo metadata for same linked reception entry
WITH target AS (
  SELECT b.reception_entry_id
  FROM public.bodyshop_repair_cards b
  JOIN public.service_reception_entries r ON r.id = b.reception_entry_id
  WHERE UPPER(TRIM(b.job_card_no)) = 'JC-MBTPLT-JP2-2627-002479'
    AND UPPER(TRIM(COALESCE(b.reg_number, ''))) = 'RJ60CC1188'
  ORDER BY b.updated_at DESC NULLS LAST, b.id DESC
  LIMIT 1
)
DELETE FROM public.bodyshop_intake_vehicle_photos p
USING target t
WHERE p.reception_entry_id = t.reception_entry_id
RETURNING p.id, p.reception_entry_id, p.storage_path, p.created_at;

COMMIT;

-- Optional hard reset (use instead of update path above if you want full delete + auto re-seed behavior):
-- DELETE FROM public.bodyshop_repair_cards
-- WHERE UPPER(TRIM(job_card_no)) = 'JC-MBTPLT-JP2-2627-002479'
--   AND UPPER(TRIM(COALESCE(reg_number, ''))) = 'RJ60CC1188';
