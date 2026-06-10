-- ============================================================
-- Bodyshop Under-Repair Tracker — Schema Migration
-- Created: 2026-06-10
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Master repair card — one row per accidental vehicle intake
CREATE TABLE IF NOT EXISTS bodyshop_repair_cards (
  id                  SERIAL PRIMARY KEY,
  job_card_no         TEXT NOT NULL,
  reg_number          TEXT,
  customer_name       TEXT,
  customer_phone      TEXT,
  customer_type       TEXT CHECK (customer_type IN ('individual','firm','foc','cash')),
  branch              TEXT,
  sa_employee_code    TEXT,
  sa_name             TEXT,
  current_stage       INT  NOT NULL DEFAULT 1,
  current_stage_name  TEXT NOT NULL DEFAULT 'vehicle_receiving',
  overall_status      TEXT NOT NULL DEFAULT 'active'
                           CHECK (overall_status IN ('active','delivered','cancelled')),
  received_at         TIMESTAMPTZ DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Stage audit log — every stage transition recorded
CREATE TABLE IF NOT EXISTS bodyshop_stage_logs (
  id              SERIAL PRIMARY KEY,
  repair_card_id  INT  NOT NULL REFERENCES bodyshop_repair_cards(id) ON DELETE CASCADE,
  stage_no        INT  NOT NULL,
  stage_name      TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','in_progress','done','hold','failed')),
  done_by_role    TEXT,
  done_by_name    TEXT,
  done_by_user    TEXT,
  notes           TEXT,
  hold_reason     TEXT,
  logged_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Document checklist — per car
CREATE TABLE IF NOT EXISTS bodyshop_repair_docs (
  id              SERIAL PRIMARY KEY,
  repair_card_id  INT  NOT NULL REFERENCES bodyshop_repair_cards(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL,
  is_mandatory    BOOLEAN DEFAULT FALSE,
  is_uploaded     BOOLEAN DEFAULT FALSE,
  file_url        TEXT,
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ
);

-- 4. Photos — pre_repair (SA), under_repair (BS Floor), post_repair (BS Floor)
CREATE TABLE IF NOT EXISTS bodyshop_repair_photos (
  id              SERIAL PRIMARY KEY,
  repair_card_id  INT  NOT NULL REFERENCES bodyshop_repair_cards(id) ON DELETE CASCADE,
  photo_stage     TEXT NOT NULL CHECK (photo_stage IN ('pre_repair','under_repair','post_repair')),
  file_url        TEXT NOT NULL,
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Survey & estimation details
CREATE TABLE IF NOT EXISTS bodyshop_survey (
  id                     SERIAL PRIMARY KEY,
  repair_card_id         INT  NOT NULL REFERENCES bodyshop_repair_cards(id) ON DELETE CASCADE,
  survey_status          TEXT NOT NULL DEFAULT 'pending'
                              CHECK (survey_status IN ('pending','hold','approved')),
  hold_reason            TEXT,
  surveyor_name          TEXT,
  surveyor_contact       TEXT,
  surveyor_email         TEXT,
  approved_parts         TEXT,
  customer_approved      BOOLEAN DEFAULT FALSE,
  claim_intimation_no    TEXT,
  estimation_by          TEXT,
  estimation_at          TIMESTAMPTZ,
  estimation_approved_by TEXT,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Billing & delivery (EDP fills this)
CREATE TABLE IF NOT EXISTS bodyshop_billing (
  id                   SERIAL PRIMARY KEY,
  repair_card_id       INT  NOT NULL REFERENCES bodyshop_repair_cards(id) ON DELETE CASCADE,
  parts_entry_status   TEXT CHECK (parts_entry_status IN ('pending','entered','billed')),
  billed_amount        NUMERIC(12,2),
  do_status            TEXT CHECK (do_status IN ('pending','received','not_received')),
  do_amount            NUMERIC(12,2),
  customer_diff_amount NUMERIC(12,2),
  payment_slip_url     TEXT,
  payment_status       TEXT CHECK (payment_status IN ('pending','received','not_received')),
  additional_approval  TEXT,
  edp_user             TEXT,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 7. QC & Re-inspection (Floor Incharge fills this)
CREATE TABLE IF NOT EXISTS bodyshop_qc (
  id                  SERIAL PRIMARY KEY,
  repair_card_id      INT  NOT NULL REFERENCES bodyshop_repair_cards(id) ON DELETE CASCADE,
  qc_status           TEXT CHECK (qc_status IN ('pending','pass','fail')),
  qc_checked_by       TEXT,
  qc_checked_at       TIMESTAMPTZ,
  qc_fail_reason      TEXT,
  reinspection_type   TEXT CHECK (reinspection_type IN ('team_member','surveyor')),
  reinspection_by     TEXT,
  reinspection_at     TIMESTAMPTZ,
  delivery_status     TEXT CHECK (delivery_status IN ('pending','done')),
  delivery_marked_by  TEXT,
  delivery_marked_at  TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_brc_job_card   ON bodyshop_repair_cards(job_card_no);
CREATE INDEX IF NOT EXISTS idx_brc_branch     ON bodyshop_repair_cards(branch);
CREATE INDEX IF NOT EXISTS idx_brc_status     ON bodyshop_repair_cards(overall_status);
CREATE INDEX IF NOT EXISTS idx_bsl_card       ON bodyshop_stage_logs(repair_card_id);
CREATE INDEX IF NOT EXISTS idx_bsl_stage      ON bodyshop_stage_logs(stage_no);
CREATE INDEX IF NOT EXISTS idx_brp_card_stage ON bodyshop_repair_photos(repair_card_id, photo_stage);

-- ── Module registration ───────────────────────────────────────────────────────
INSERT INTO modules (module_name, display_name, description, is_active)
VALUES ('bodyshop_repair', 'Bodyshop Repair', 'Track accidental vehicles through the full repair lifecycle', true)
ON CONFLICT (module_name) DO NOTHING;

-- ── Grant access to all existing users ───────────────────────────────────────
INSERT INTO user_module_permissions (user_id, module_name, can_access)
SELECT id, 'bodyshop_repair', true
FROM users
ON CONFLICT (user_id, module_name) DO NOTHING;
