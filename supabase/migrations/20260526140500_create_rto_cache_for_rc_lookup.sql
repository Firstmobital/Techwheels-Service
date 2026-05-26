-- Create rto_cache for RC lookup edge function portability.
-- Source schema: authoritative full dump chunk mirror from this repo.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.rto_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_no text NOT NULL,
    api_rc_verified boolean DEFAULT false,
    api_rc_response jsonb,
    api_rc_verified_at timestamp with time zone,
    api_rc_blacklist_status text,
    api_rc_insurance_status text,
    api_rc_permit_type text,
    api_rc_engine_number text,
    api_rc_chassis_number text,
    api_rc_police_complaint boolean,
    api_rc_theft_record boolean,
    cached_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
    cache_ttl_hours integer DEFAULT 24,
    source text DEFAULT 'all_rto_data'::text,
    last_accessed_at timestamp with time zone DEFAULT now(),
    access_count integer DEFAULT 1,
    last_api_call_duration_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    api_rc_reg_no text,
    api_rc_chassis text,
    api_rc_engine text,
    api_rc_vehicle_manufacturer_name text,
    api_rc_model text,
    api_rc_vehicle_colour text,
    api_rc_type text,
    api_rc_norms_type text,
    api_rc_body_type text,
    api_rc_owner_count integer,
    api_rc_owner text,
    api_rc_owner_father_name text,
    api_rc_mobile_number text,
    api_rc_status text,
    api_rc_status_as_on text,
    api_rc_reg_authority text,
    api_rc_reg_date text,
    api_rc_vehicle_manufacturing_month_year text,
    api_rc_rc_expiry_date text,
    api_rc_vehicle_tax_upto text,
    api_rc_vehicle_insurance_company_name text,
    api_rc_vehicle_insurance_upto text,
    api_rc_vehicle_insurance_policy_number text,
    api_rc_rc_financer text,
    api_rc_present_address text,
    api_rc_permanent_address text,
    api_rc_vehicle_cubic_capacity text,
    api_rc_gross_vehicle_weight text,
    api_rc_unladen_weight text,
    api_rc_vehicle_category text,
    api_rc_rc_standard_cap text,
    api_rc_vehicle_cylinders_no text,
    api_rc_vehicle_seat_capacity text,
    api_rc_vehicle_sleeper_capacity text,
    api_rc_vehicle_standing_capacity text,
    api_rc_wheelbase text,
    api_rc_vehicle_number text,
    api_rc_pucc_number text,
    api_rc_pucc_upto text,
    api_rc_blacklist_status_bool boolean,
    api_rc_blacklist_details jsonb,
    api_rc_permit_issue_date text,
    api_rc_permit_number text,
    api_rc_permit_type_full text,
    api_rc_permit_valid_from text,
    api_rc_permit_valid_upto text,
    api_rc_non_use_status text,
    api_rc_non_use_from text,
    api_rc_non_use_to text,
    api_rc_national_permit_number text,
    api_rc_national_permit_upto text,
    api_rc_national_permit_issued_by text,
    api_rc_is_commercial boolean,
    api_rc_noc_details text,
    api_rc_db_result boolean,
    api_rc_partial_data boolean,
    api_rc_mmv_response text,
    api_rc_financed boolean,
    api_rc_vehicle_class text,
    CONSTRAINT rto_cache_pkey PRIMARY KEY (id),
    CONSTRAINT rto_cache_reg_no_not_empty CHECK ((length(btrim(registration_no)) > 0)),
    CONSTRAINT rto_cache_ttl_valid CHECK (((cache_ttl_hours > 0) AND (cache_ttl_hours <= 2160)))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rto_cache_reg_no
    ON public.rto_cache USING btree (lower(btrim(registration_no)));

CREATE INDEX IF NOT EXISTS idx_rto_cache_expires_at
    ON public.rto_cache USING btree (expires_at);

CREATE INDEX IF NOT EXISTS idx_rto_cache_access_count
    ON public.rto_cache USING btree (access_count DESC, last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_rto_cache_rc_verified_at
    ON public.rto_cache USING btree (api_rc_verified_at DESC) WHERE (api_rc_verified = true);

CREATE INDEX IF NOT EXISTS idx_rto_cache_source
    ON public.rto_cache USING btree (source, cached_at DESC);

CREATE OR REPLACE FUNCTION public.set_rto_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rto_cache_updated_at ON public.rto_cache;
CREATE TRIGGER trg_rto_cache_updated_at
BEFORE UPDATE ON public.rto_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_rto_cache_updated_at();

ALTER TABLE public.rto_cache ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    has_is_super_admin boolean;
    has_has_rbac_right boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
    ) INTO has_is_super_admin;

    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'has_rbac_right'
    ) INTO has_has_rbac_right;

    DROP POLICY IF EXISTS rto_cache_select ON public.rto_cache;
    DROP POLICY IF EXISTS rto_cache_insert ON public.rto_cache;
    DROP POLICY IF EXISTS rto_cache_update ON public.rto_cache;
    DROP POLICY IF EXISTS rto_cache_delete ON public.rto_cache;

    IF has_is_super_admin AND has_has_rbac_right THEN
        CREATE POLICY rto_cache_select
            ON public.rto_cache
            FOR SELECT
            TO authenticated
            USING ((public.is_super_admin() OR public.has_rbac_right('admin.used-car-evaluations'::text, 'view'::text)));

        CREATE POLICY rto_cache_insert
            ON public.rto_cache
            FOR INSERT
            TO authenticated
            WITH CHECK ((public.is_super_admin() OR public.has_rbac_right('admin.used-car-evaluations'::text, 'create'::text)));

        CREATE POLICY rto_cache_update
            ON public.rto_cache
            FOR UPDATE
            TO authenticated
            USING ((public.is_super_admin() OR public.has_rbac_right('admin.used-car-evaluations'::text, 'edit'::text)))
            WITH CHECK ((public.is_super_admin() OR public.has_rbac_right('admin.used-car-evaluations'::text, 'edit'::text)));

        CREATE POLICY rto_cache_delete
            ON public.rto_cache
            FOR DELETE
            TO authenticated
            USING ((public.is_super_admin() OR public.has_rbac_right('admin.used-car-evaluations'::text, 'delete'::text)));
    ELSE
        CREATE POLICY rto_cache_select
            ON public.rto_cache
            FOR SELECT
            TO authenticated
            USING (true);

        CREATE POLICY rto_cache_insert
            ON public.rto_cache
            FOR INSERT
            TO authenticated
            WITH CHECK (true);

        CREATE POLICY rto_cache_update
            ON public.rto_cache
            FOR UPDATE
            TO authenticated
            USING (true)
            WITH CHECK (true);

        CREATE POLICY rto_cache_delete
            ON public.rto_cache
            FOR DELETE
            TO authenticated
            USING (true);
    END IF;
END;
$$;

GRANT ALL ON TABLE public.rto_cache TO anon;
GRANT ALL ON TABLE public.rto_cache TO authenticated;
GRANT ALL ON TABLE public.rto_cache TO service_role;

COMMIT;
