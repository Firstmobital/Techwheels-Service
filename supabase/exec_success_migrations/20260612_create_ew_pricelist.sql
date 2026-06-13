-- Create EW Pricelist table
CREATE TABLE IF NOT EXISTS public.ew_pricelist (
    id                BIGSERIAL PRIMARY KEY,
    product_code      TEXT,
    emission          TEXT,
    product_name      TEXT,
    ew_type           TEXT,          -- 'Regular' or 'Top-up'
    model             TEXT,          -- Nexon, Tiago, Harrier...
    variant           TEXT,          -- Parts Product Line (matches pl in all_service_data)
    fuel_type         TEXT,          -- PETROL, DIESEL, CNG
    transmission      TEXT,          -- MT, AMT, AT, DCA
    ew_years          INTEGER,       -- 1, 2, or 3
    duration_months   INTEGER,
    kms               INTEGER,
    km_data           TEXT,
    price_0_90        NUMERIC(10,2), -- Vehicle age 0-90 days from sale
    price_91_180      NUMERIC(10,2), -- Vehicle age 91-180 days
    price_181_730     NUMERIC(10,2), -- Vehicle age 181-730 days
    price_above_730   NUMERIC(10,2), -- Vehicle age >730 days (NULL = NA)
    commission        NUMERIC(10,2),
    incentive         NUMERIC(10,2),
    dealer_margin     NUMERIC(10,2),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_ew_model ON public.ew_pricelist(model);
CREATE INDEX IF NOT EXISTS idx_ew_variant ON public.ew_pricelist(variant);
CREATE INDEX IF NOT EXISTS idx_ew_type ON public.ew_pricelist(ew_type);
CREATE INDEX IF NOT EXISTS idx_ew_years ON public.ew_pricelist(ew_years);

-- RLS: readable by all authenticated users
ALTER TABLE public.ew_pricelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ew_pricelist_read" ON public.ew_pricelist
    FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON public.ew_pricelist TO authenticated;
