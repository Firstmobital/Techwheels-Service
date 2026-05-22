-- Migration: AutoDoc warranty repair management schema
-- File: supabase/migrations/001_autodoc_schema.sql
--
-- Tables:  vehicles, job_cards, panels, panel_photos, estimate_rows, documents
-- Extras:  enums, indexes, updated_at trigger, RLS policies, job_card_summary view
--
-- RLS strategy:
--   Each authenticated user carries dealer_code in their JWT user_metadata.
--   public.my_dealer_code() surfaces it; every policy uses that helper so the
--   check is written once and cached per query.
--
-- Computed columns:
--   row_total          → GENERATED ALWAYS AS STORED (pure arithmetic, immutable)
--   warranty_age_days  → computed in view (depends on CURRENT_DATE, not storable)
--   tml_share_percent  → computed in view (depends on warranty_age_days)
--
-- TML share bands (Tata Motors body-paint warranty schedule):
--   0 – 365 days   → 100 %
--   366 – 730 days  →  50 %
--   731 – 1095 days →  25 %
--   > 1095 days     →   0 %
-- Adjust the CASE thresholds to match the current TML policy if it changes.

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE job_card_status AS ENUM (
    'draft', 'submitted', 'approved', 'in_work', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE panel_action AS ENUM ('repaint', 'replace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_type AS ENUM ('defect', 'primer', 'paint');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doc_type AS ENUM (
    'service_history',
    'video_job_card',
    'video_delivery',
    'ppt_pre',
    'ppt_post',
    'excel_estimate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- TABLE 1: vehicles
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles (
    reg_number        TEXT        PRIMARY KEY,
    vin               TEXT,
    model             TEXT,
    year              SMALLINT    CHECK (year BETWEEN 1900 AND 2100),
    colour            TEXT,
    paint_type        TEXT,
    dealer_code       TEXT        NOT NULL,
    dealer_name       TEXT,
    dealer_city       TEXT,
    bp_city_category  TEXT,
    owner_name        TEXT,
    owner_phone       TEXT,
    date_of_sale      DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  vehicles                  IS 'Master vehicle registry — one row per registration number.';
COMMENT ON COLUMN vehicles.bp_city_category IS 'Body & Paint city tier assigned by TML (e.g. Metro, Tier-1, Tier-2).';
COMMENT ON COLUMN vehicles.paint_type       IS 'Solid / Metallic / Pearl / Matte etc.';


-- ============================================================
-- TABLE 2: job_cards
-- ============================================================

CREATE TABLE IF NOT EXISTS job_cards (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    reg_number      TEXT            NOT NULL REFERENCES vehicles(reg_number) ON DELETE RESTRICT,
    jc_number       TEXT            NOT NULL UNIQUE,
    complaint_date  DATE            NOT NULL,
    km_reading      INTEGER         CHECK (km_reading >= 0),
    claim_type      TEXT,
    complaint_text  TEXT,
    -- warranty_age_days and tml_share_percent are intentionally NOT stored here;
    -- they depend on CURRENT_DATE and are computed fresh in job_card_summary.
    status          job_card_status NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  job_cards             IS 'One row per warranty repair job card raised by the dealership.';
COMMENT ON COLUMN job_cards.claim_type  IS 'E.g. Goodwill, Warranty, Body & Paint, etc.';
COMMENT ON COLUMN job_cards.jc_number   IS 'Human-readable job card reference from the DMS.';


-- ============================================================
-- TABLE 3: panels
-- ============================================================

CREATE TABLE IF NOT EXISTS panels (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_card_id         UUID        NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    panel_name          TEXT        NOT NULL,
    action              panel_action NOT NULL,
    technician_remarks  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE panels IS 'Vehicle body panels listed under a job card, each with a repair action.';


-- ============================================================
-- TABLE 4: panel_photos
-- ============================================================

CREATE TABLE IF NOT EXISTS panel_photos (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    panel_id      UUID        NOT NULL REFERENCES panels(id)    ON DELETE CASCADE,
    job_card_id   UUID        NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    photo_type    photo_type  NOT NULL,
    storage_path  TEXT        NOT NULL,
    gps_lat       DOUBLE PRECISION CHECK (gps_lat  BETWEEN -90  AND 90),
    gps_lng       DOUBLE PRECISION CHECK (gps_lng  BETWEEN -180 AND 180),
    gps_city      TEXT,
    captured_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  panel_photos              IS 'Before/during/after photos for each panel, captured with GPS metadata.';
COMMENT ON COLUMN panel_photos.storage_path IS 'Supabase Storage object path, e.g. autodoc/photos/<uuid>.jpg';
COMMENT ON COLUMN panel_photos.job_card_id  IS 'Denormalised FK for efficient job-level photo queries without joining panels.';


-- ============================================================
-- TABLE 5: estimate_rows
-- ============================================================

CREATE TABLE IF NOT EXISTS estimate_rows (
    id                    UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_card_id           UUID           NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    sr_no                 INTEGER        NOT NULL CHECK (sr_no > 0),
    panel_name            TEXT,
    part_number           TEXT,
    part_description      TEXT,
    defect                TEXT,
    action                TEXT,
    qty                   NUMERIC(10,2)  NOT NULL DEFAULT 1   CHECK (qty   >= 0),
    ndp_value             NUMERIC(12,2)  NOT NULL DEFAULT 0   CHECK (ndp_value          >= 0),
    cut_weld_charges      NUMERIC(12,2)  NOT NULL DEFAULT 0   CHECK (cut_weld_charges   >= 0),
    paint_charges         NUMERIC(12,2)  NOT NULL DEFAULT 0   CHECK (paint_charges      >= 0),
    total_special_charges NUMERIC(12,2)  NOT NULL DEFAULT 0   CHECK (total_special_charges >= 0),
    job_code              TEXT,
    job_code_desc         TEXT,
    no_off                NUMERIC(10,2)  NOT NULL DEFAULT 1   CHECK (no_off >= 0),
    labour_charges        NUMERIC(12,2)  NOT NULL DEFAULT 0   CHECK (labour_charges     >= 0),
    -- row_total = parts cost + special charges + labour cost
    row_total             NUMERIC(14,2)  GENERATED ALWAYS AS (
                              (qty * ndp_value)
                              + cut_weld_charges
                              + paint_charges
                              + total_special_charges
                              + (no_off * labour_charges)
                          ) STORED,
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (job_card_id, sr_no)
);

COMMENT ON TABLE  estimate_rows           IS 'Line-item cost estimate rows for a job card (parts + labour).';
COMMENT ON COLUMN estimate_rows.ndp_value IS 'Net Dealer Price per unit for the part.';
COMMENT ON COLUMN estimate_rows.no_off    IS 'Number of operations (labour multiplier).';
COMMENT ON COLUMN estimate_rows.row_total IS 'Auto-computed: (qty×NDP) + cut_weld + paint + special + (no_off×labour).';


-- ============================================================
-- TABLE 6: documents
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_card_id   UUID        NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    doc_type      doc_type    NOT NULL,
    storage_path  TEXT        NOT NULL,
    file_size_mb  NUMERIC(8,3) CHECK (file_size_mb >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  documents              IS 'Supporting documents attached to a job card (PPTs, videos, Excel estimates).';
COMMENT ON COLUMN documents.storage_path IS 'Supabase Storage object path, e.g. autodoc/docs/<uuid>.pdf';


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_cards_updated_at ON job_cards;
CREATE TRIGGER trg_job_cards_updated_at
    BEFORE UPDATE ON job_cards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- INDEXES
-- ============================================================

-- vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_dealer_code  ON vehicles(dealer_code);
CREATE INDEX IF NOT EXISTS idx_vehicles_date_of_sale ON vehicles(date_of_sale);

-- job_cards
CREATE INDEX IF NOT EXISTS idx_job_cards_reg_number      ON job_cards(reg_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_jc_number        ON job_cards(jc_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_status           ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_job_cards_complaint_date   ON job_cards(complaint_date);

-- panels
CREATE INDEX IF NOT EXISTS idx_panels_job_card_id ON panels(job_card_id);

-- panel_photos
CREATE INDEX IF NOT EXISTS idx_panel_photos_panel_id    ON panel_photos(panel_id);
CREATE INDEX IF NOT EXISTS idx_panel_photos_job_card_id ON panel_photos(job_card_id);
CREATE INDEX IF NOT EXISTS idx_panel_photos_photo_type  ON panel_photos(job_card_id, photo_type);

-- estimate_rows
CREATE INDEX IF NOT EXISTS idx_estimate_rows_job_card_id ON estimate_rows(job_card_id);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_job_card_id ON documents(job_card_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type    ON documents(job_card_id, doc_type);


-- ============================================================
-- RLS HELPER — surfaces dealer_code from JWT user_metadata
-- ============================================================

-- Create helper in public schema so it can be created from SQL editor
-- without elevated permissions on auth schema.
CREATE OR REPLACE FUNCTION public.my_dealer_code()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
    SELECT COALESCE(
        auth.jwt() -> 'user_metadata'  ->> 'dealer_code',
        auth.jwt() -> 'app_metadata'   ->> 'dealer_code'
    )
$$;

COMMENT ON FUNCTION public.my_dealer_code IS
    'Returns the dealer_code embedded in the current user''s JWT. '
    'Set user_metadata.dealer_code when provisioning dealership staff.';


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE vehicles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE panels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_photos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;

-- ── vehicles ────────────────────────────────────────────────

DROP POLICY IF EXISTS "vehicles: own dealership select" ON vehicles;
CREATE POLICY "vehicles: own dealership select" ON vehicles
    FOR SELECT USING (dealer_code = public.my_dealer_code());

DROP POLICY IF EXISTS "vehicles: own dealership insert" ON vehicles;
CREATE POLICY "vehicles: own dealership insert" ON vehicles
    FOR INSERT WITH CHECK (dealer_code = public.my_dealer_code());

DROP POLICY IF EXISTS "vehicles: own dealership update" ON vehicles;
CREATE POLICY "vehicles: own dealership update" ON vehicles
    FOR UPDATE
    USING     (dealer_code = public.my_dealer_code())
    WITH CHECK (dealer_code = public.my_dealer_code());

-- ── job_cards ────────────────────────────────────────────────
-- Ownership is derived through vehicles.dealer_code.

DROP POLICY IF EXISTS "job_cards: own dealership select" ON job_cards;
CREATE POLICY "job_cards: own dealership select" ON job_cards
    FOR SELECT USING (
        reg_number IN (
            SELECT reg_number FROM vehicles
            WHERE dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "job_cards: own dealership insert" ON job_cards;
CREATE POLICY "job_cards: own dealership insert" ON job_cards
    FOR INSERT WITH CHECK (
        reg_number IN (
            SELECT reg_number FROM vehicles
            WHERE dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "job_cards: own dealership update" ON job_cards;
CREATE POLICY "job_cards: own dealership update" ON job_cards
    FOR UPDATE
    USING (
        reg_number IN (
            SELECT reg_number FROM vehicles
            WHERE dealer_code = public.my_dealer_code()
        )
    );

-- ── panels ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "panels: own dealership select" ON panels;
CREATE POLICY "panels: own dealership select" ON panels
    FOR SELECT USING (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "panels: own dealership insert" ON panels;
CREATE POLICY "panels: own dealership insert" ON panels
    FOR INSERT WITH CHECK (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "panels: own dealership update" ON panels;
CREATE POLICY "panels: own dealership update" ON panels
    FOR UPDATE
    USING (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

-- ── panel_photos ─────────────────────────────────────────────

DROP POLICY IF EXISTS "panel_photos: own dealership select" ON panel_photos;
CREATE POLICY "panel_photos: own dealership select" ON panel_photos
    FOR SELECT USING (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "panel_photos: own dealership insert" ON panel_photos;
CREATE POLICY "panel_photos: own dealership insert" ON panel_photos
    FOR INSERT WITH CHECK (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

-- ── estimate_rows ────────────────────────────────────────────

DROP POLICY IF EXISTS "estimate_rows: own dealership select" ON estimate_rows;
CREATE POLICY "estimate_rows: own dealership select" ON estimate_rows
    FOR SELECT USING (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "estimate_rows: own dealership insert" ON estimate_rows;
CREATE POLICY "estimate_rows: own dealership insert" ON estimate_rows
    FOR INSERT WITH CHECK (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "estimate_rows: own dealership update" ON estimate_rows;
CREATE POLICY "estimate_rows: own dealership update" ON estimate_rows
    FOR UPDATE
    USING (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

-- ── documents ────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents: own dealership select" ON documents;
CREATE POLICY "documents: own dealership select" ON documents
    FOR SELECT USING (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );

DROP POLICY IF EXISTS "documents: own dealership insert" ON documents;
CREATE POLICY "documents: own dealership insert" ON documents
    FOR INSERT WITH CHECK (
        job_card_id IN (
            SELECT jc.id FROM job_cards jc
            JOIN vehicles v ON v.reg_number = jc.reg_number
            WHERE v.dealer_code = public.my_dealer_code()
        )
    );


-- ============================================================
-- VIEW: job_card_summary
--
-- security_invoker = true  →  the view runs under the calling
-- user's identity, so all RLS policies on the underlying tables
-- are fully enforced.  No data from another dealership can leak
-- through this view even if queried directly.
-- ============================================================

DROP VIEW IF EXISTS job_card_summary;

CREATE VIEW job_card_summary
WITH (security_invoker = true)
AS
SELECT
    -- ── job card core ──────────────────────────────────────
    jc.id                                           AS job_card_id,
    jc.jc_number,
    jc.complaint_date,
    jc.km_reading,
    jc.claim_type,
    jc.complaint_text,
    jc.status,
    jc.created_at                                   AS jc_created_at,
    jc.updated_at                                   AS jc_updated_at,

    -- ── vehicle details ────────────────────────────────────
    v.reg_number,
    v.vin,
    v.model,
    v.year                                          AS vehicle_year,
    v.colour,
    v.paint_type,
    v.dealer_code,
    v.dealer_name,
    v.dealer_city,
    v.bp_city_category,
    v.owner_name,
    v.owner_phone,
    v.date_of_sale,

    -- ── warranty age (days since sale) ─────────────────────
    CASE
        WHEN v.date_of_sale IS NOT NULL
        THEN (CURRENT_DATE - v.date_of_sale)::INTEGER
        ELSE NULL
    END                                             AS warranty_age_days,

    -- ── TML share % based on warranty age ─────────────────
    -- Band thresholds follow Tata Motors body-paint warranty policy.
    -- Year 1 → 100%, Year 2 → 50%, Year 3 → 25%, expired → 0%.
    CASE
        WHEN v.date_of_sale IS NULL                            THEN NULL
        WHEN (CURRENT_DATE - v.date_of_sale) <=  365          THEN 100
        WHEN (CURRENT_DATE - v.date_of_sale) <=  730          THEN  50
        WHEN (CURRENT_DATE - v.date_of_sale) <= 1095          THEN  25
        ELSE                                                        0
    END                                             AS tml_share_percent,

    -- ── aggregate counts & totals ──────────────────────────
    COUNT(DISTINCT p.id)                            AS panel_count,
    COUNT(DISTINCT ph.id)                           AS photo_count,
    COUNT(DISTINCT d.id)                            AS document_count,
    COUNT(DISTINCT er.id)                           AS estimate_row_count,
    COALESCE(SUM(er.row_total), 0)                  AS total_estimate_amount,

    -- ── TML amount = total_estimate × (tml_share_percent/100) ──
    CASE
        WHEN v.date_of_sale IS NULL THEN NULL
        ELSE ROUND(
            COALESCE(SUM(er.row_total), 0)
            * CASE
                WHEN (CURRENT_DATE - v.date_of_sale) <=  365 THEN 1.00
                WHEN (CURRENT_DATE - v.date_of_sale) <=  730 THEN 0.50
                WHEN (CURRENT_DATE - v.date_of_sale) <= 1095 THEN 0.25
                ELSE                                              0.00
              END,
            2
        )
    END                                             AS tml_share_amount,

    -- ── photo readiness flags ──────────────────────────────
    BOOL_OR(ph.photo_type = 'defect')               AS has_defect_photos,
    BOOL_OR(ph.photo_type = 'primer')               AS has_primer_photos,
    BOOL_OR(ph.photo_type = 'paint')                AS has_paint_photos,

    -- ── document readiness flags ───────────────────────────
    BOOL_OR(d.doc_type = 'service_history')         AS has_service_history,
    BOOL_OR(d.doc_type = 'video_job_card')          AS has_video_job_card,
    BOOL_OR(d.doc_type = 'video_delivery')          AS has_video_delivery,
    BOOL_OR(d.doc_type = 'ppt_pre')                 AS has_ppt_pre,
    BOOL_OR(d.doc_type = 'ppt_post')                AS has_ppt_post,
    BOOL_OR(d.doc_type = 'excel_estimate')          AS has_excel_estimate

FROM job_cards jc
JOIN  vehicles      v  ON v.reg_number  = jc.reg_number
LEFT JOIN panels    p  ON p.job_card_id = jc.id
LEFT JOIN panel_photos ph ON ph.job_card_id = jc.id
LEFT JOIN estimate_rows er ON er.job_card_id = jc.id
LEFT JOIN documents d  ON d.job_card_id = jc.id

GROUP BY
    jc.id, jc.jc_number, jc.complaint_date, jc.km_reading,
    jc.claim_type, jc.complaint_text, jc.status, jc.created_at, jc.updated_at,
    v.reg_number, v.vin, v.model, v.year, v.colour, v.paint_type,
    v.dealer_code, v.dealer_name, v.dealer_city, v.bp_city_category,
    v.owner_name, v.owner_phone, v.date_of_sale;

COMMENT ON VIEW job_card_summary IS
    'Denormalised read view for job card listings. '
    'Computes warranty_age_days, tml_share_percent/amount, photo & document readiness flags. '
    'Uses security_invoker so caller RLS policies are enforced — never bypasses dealer isolation.';
