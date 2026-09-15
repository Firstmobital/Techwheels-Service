-- Migration: 20260915150000_grant_anon_select_reception_and_portal_sync.sql
-- Grant select access on service_reception_entries to anon and authenticated roles
-- so that customer mobile app and customer portal can fetch live KM reading, Job Card No, and SA Name.

GRANT SELECT ON public.service_reception_entries TO anon, authenticated;

-- Ensure RLS policy allows public read access for customer vehicle lookups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'service_reception_entries' 
        AND policyname = 'Allow public select service_reception_entries'
    ) THEN
        CREATE POLICY "Allow public select service_reception_entries" 
        ON public.service_reception_entries 
        FOR SELECT 
        USING (true);
    END IF;
END $$;

-- Also create a dedicated security definer RPC for rock-solid customer portal intake lookups
CREATE OR REPLACE FUNCTION public.get_customer_live_intake(p_search text)
RETURNS TABLE (
    id bigint,
    reg_number text,
    model text,
    service_type text,
    sa_name text,
    sa_display_name text,
    jc_number text,
    owner_name text,
    owner_phone text,
    branch text,
    km_reading numeric,
    remark text,
    created_at timestamptz,
    invoice_done_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT 
        s.id,
        s.reg_number,
        s.model,
        s.service_type,
        s.sa_name,
        s.sa_display_name,
        s.jc_number,
        s.owner_name,
        s.owner_phone,
        s.branch,
        s.km_reading,
        s.remark,
        s.created_at,
        s.invoice_done_at
    FROM public.service_reception_entries s
    WHERE 
        s.reg_number ILIKE '%' || TRIM(p_search) || '%'
        OR (s.owner_phone IS NOT NULL AND s.owner_phone ILIKE '%' || TRIM(p_search) || '%')
        OR (s.jc_number IS NOT NULL AND s.jc_number ILIKE '%' || TRIM(p_search) || '%')
    ORDER BY s.created_at DESC
    LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_live_intake(text) TO anon, authenticated;
