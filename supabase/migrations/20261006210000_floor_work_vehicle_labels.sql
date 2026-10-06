-- Floor workers can see registration and customer on their job, but vehicle model
-- lives on reception, which they cannot read. Return model (and customer) only for
-- keys they are assigned to, or for a full bodyshop-floor editor.

CREATE OR REPLACE FUNCTION public.list_floor_work_vehicle_labels(p_keys text[])
RETURNS TABLE(lookup_key text, model text, customer_name text, reg_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH keys AS (
    SELECT DISTINCT upper(btrim(k)) AS k
    FROM unnest(coalesce(p_keys, ARRAY[]::text[])) AS k
    WHERE nullif(btrim(k), '') IS NOT NULL
  ),
  codes AS (
    SELECT upper(btrim(uel.employee_code)) AS code
    FROM public.user_employee_links uel
    WHERE uel.user_id = auth.uid()
      AND uel.is_active
      AND nullif(btrim(uel.employee_code), '') IS NOT NULL
  ),
  allowed AS (
    SELECT k.k
    FROM keys k
    WHERE auth.uid() IS NOT NULL
      AND (
        public.bodyshop_floor_full_editor()
        OR EXISTS (
          SELECT 1
          FROM public.bodyshop_assignments a
          WHERE a.is_active
            AND upper(btrim(a.job_card_number)) = k.k
            AND (
              upper(btrim(coalesce(a.dentor_employee_code, ''))) IN (SELECT code FROM codes)
              OR upper(btrim(coalesce(a.dentor_helper_employee_code, ''))) IN (SELECT code FROM codes)
              OR upper(btrim(coalesce(a.painter_employee_code, ''))) IN (SELECT code FROM codes)
              OR upper(btrim(coalesce(a.painter_helper_employee_code, ''))) IN (SELECT code FROM codes)
              OR upper(btrim(coalesce(a.technician_employee_code, ''))) IN (SELECT code FROM codes)
              OR upper(btrim(coalesce(a.rubbing_employee_code, ''))) IN (SELECT code FROM codes)
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.bodyshop_floor_support_assignments s
          WHERE s.is_active
            AND upper(btrim(s.job_card_number)) = k.k
            AND upper(btrim(s.employee_code)) IN (SELECT code FROM codes)
        )
      )
  )
  SELECT DISTINCT ON (a.k)
    a.k AS lookup_key,
    nullif(btrim(r.model), '') AS model,
    nullif(btrim(r.owner_name), '') AS customer_name,
    nullif(btrim(r.reg_number), '') AS reg_number
  FROM allowed a
  JOIN public.service_reception_entries r
    ON upper(btrim(coalesce(r.reg_number, ''))) = a.k
    OR upper(btrim(coalesce(r.jc_number, ''))) = a.k
  ORDER BY a.k, r.created_at DESC, r.id DESC;
$$;

REVOKE ALL ON FUNCTION public.list_floor_work_vehicle_labels(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_floor_work_vehicle_labels(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_floor_work_vehicle_labels(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_floor_work_vehicle_labels(text[]) TO service_role;

COMMENT ON FUNCTION public.list_floor_work_vehicle_labels(text[]) IS
  'Model and customer for floor-work cards. Assigned workers and bodyshop floor editors only.';
