-- IDSPay RC Advance Verification cache (SUPABASE-004).
-- Exact IDSPay `data.*` column names; separate from public.rto_cache (Ocean / AutoDoc).

CREATE TABLE IF NOT EXISTS public.rto_idspay (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_no text NOT NULL,
    provider_response jsonb,
    verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    cached_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
    cache_ttl_hours integer DEFAULT 24,
    source text DEFAULT 'idspay'::text,
    last_accessed_at timestamp with time zone DEFAULT now(),
    access_count integer DEFAULT 1,
    last_api_call_duration_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reg_no text,
    class text,
    chassis text,
    engine text,
    vehicle_manufacturer_name text,
    model text,
    vehicle_colour text,
    type text,
    norms_type text,
    body_type text,
    owner_count text,
    owner_name text,
    owner_father_name text,
    mobile_number text,
    status text,
    status_as_on text,
    reg_authority text,
    reg_date text,
    vehicle_manufacturing_month_year text,
    rc_expiry_date text,
    vehicle_tax_upto text,
    vehicle_insurance_company_name text,
    vehicle_insurance_upto text,
    vehicle_insurance_policy_number text,
    rc_financer text,
    present_address text,
    split_present_address jsonb,
    permanent_address text,
    split_permanent_address jsonb,
    vehicle_cubic_capacity text,
    gross_vehicle_weight text,
    unladen_weight text,
    vehicle_category text,
    rc_standard_cap text,
    vehicle_cylinders_no text,
    vehicle_seat_capacity text,
    vehicle_sleeper_capacity text,
    vehicle_standing_capacity text,
    wheelbase text,
    pucc_number text,
    pucc_upto text,
    blacklist_status text,
    blacklist_details jsonb,
    challan_details jsonb,
    permit_issue_date text,
    permit_number text,
    permit_type text,
    permit_valid_from text,
    permit_valid_upto text,
    non_use_status text,
    non_use_from text,
    non_use_to text,
    national_permit_number text,
    national_permit_upto text,
    national_permit_issued_by text,
    is_commercial boolean,
    noc_details text,
    rto_code text,
    financed boolean,
    CONSTRAINT rto_idspay_pkey PRIMARY KEY (id),
    CONSTRAINT rto_idspay_reg_no_not_empty CHECK ((length(btrim(registration_no)) > 0)),
    CONSTRAINT rto_idspay_ttl_valid CHECK (((cache_ttl_hours > 0) AND (cache_ttl_hours <= 2160)))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rto_idspay_reg_no
    ON public.rto_idspay USING btree (lower(btrim(registration_no)));

CREATE INDEX IF NOT EXISTS idx_rto_idspay_expires_at
    ON public.rto_idspay USING btree (expires_at);

CREATE INDEX IF NOT EXISTS idx_rto_idspay_cached_at
    ON public.rto_idspay USING btree (cached_at DESC);

DROP TRIGGER IF EXISTS trg_rto_idspay_updated_at ON public.rto_idspay;
CREATE TRIGGER trg_rto_idspay_updated_at
    BEFORE UPDATE ON public.rto_idspay
    FOR EACH ROW
    EXECUTE FUNCTION public.set_rto_cache_updated_at();

ALTER TABLE public.rto_idspay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rto_idspay_select ON public.rto_idspay;
CREATE POLICY rto_idspay_select ON public.rto_idspay
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rto_idspay_insert ON public.rto_idspay;
CREATE POLICY rto_idspay_insert ON public.rto_idspay
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS rto_idspay_update ON public.rto_idspay;
CREATE POLICY rto_idspay_update ON public.rto_idspay
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_unrestricted_all_ops_rto_idspay_v1 ON public.rto_idspay;
CREATE POLICY admin_unrestricted_all_ops_rto_idspay_v1 ON public.rto_idspay
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.rto_idspay IS 'IDSPay RC Advance Verification cache; provider data keys match IDSPay JSON data object.';
