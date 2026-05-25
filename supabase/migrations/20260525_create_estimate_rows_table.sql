-- Create estimate_rows table for AutoDoc estimate persistence
-- This table stores line-item cost breakdowns for repair estimates

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

-- Create index for job_card_id lookups
CREATE INDEX IF NOT EXISTS idx_estimate_rows_job_card_id ON estimate_rows(job_card_id);

-- Enable RLS
ALTER TABLE estimate_rows ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access estimate rows from their dealership's job cards
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
