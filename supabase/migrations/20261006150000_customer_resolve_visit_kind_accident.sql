-- Reception Accident (and related types) are always bodyshop visits for the customer portal.
CREATE OR REPLACE FUNCTION public.customer_resolve_visit_kind(p_job jsonb) RETURNS text
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_job IS NULL THEN 'other'
    WHEN COALESCE(p_job->>'source', '') = 'bodyshop' THEN 'bodyshop'
    WHEN COALESCE(p_job->>'service_type', '') IN ('Accident', 'Accidental', 'Rusting', 'Body & Paint') THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%accident%' THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%bodyshop%' THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%body paint%' THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%claim%' THEN 'bodyshop'
    WHEN lower(COALESCE(p_job->>'service_type', '')) LIKE '%rusting%' THEN 'bodyshop'
    WHEN public.is_floor_incharge_service_type(p_job->>'service_type') THEN 'mechanical'
    ELSE 'other'
  END;
$$;

COMMENT ON FUNCTION public.customer_resolve_visit_kind(p_job jsonb) IS
  'Customer mobile visit classification. Accident/reception bodyshop types win before mechanical floor service types.';
