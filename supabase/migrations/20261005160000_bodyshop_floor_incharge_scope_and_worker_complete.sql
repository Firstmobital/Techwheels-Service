-- Bodyshop floor incharge: only see repair cards on their physical floor (Employee Master fuel_type / location).
-- Worker pipeline roles: completed only via complete_bodyshop_floor_work_role (Floor Work app).

CREATE OR REPLACE FUNCTION public.normalize_bodyshop_physical_floor(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_raw, ''))) IN ('FLOOR 2', 'FLOOR2', 'F2') THEN 'Floor 2'
    WHEN upper(btrim(coalesce(p_raw, ''))) IN ('FLOOR 3', 'FLOOR3', 'F3') THEN 'Floor 3'
    WHEN btrim(coalesce(p_raw, '')) IN ('Floor 2', 'Floor 3') THEN btrim(p_raw)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.my_bodyshop_physical_floor()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_bodyshop_physical_floor(
    coalesce(
      nullif(btrim(em.fuel_type), ''),
      nullif(btrim(em.location), '')
    )
  )
  FROM public.user_employee_links uel
  JOIN public.employee_master em ON em.employee_code = uel.employee_code
  WHERE uel.user_id = auth.uid()
    AND uel.is_active = true
    AND public.employee_has_business_role(em.role, 'FLOOR_INCHARGE')
    AND upper(replace(btrim(coalesce(em.department, '')), ' ', '')) LIKE '%BODY%'
  ORDER BY uel.is_primary DESC, uel.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_is_bodyshop_physical_floor_incharge()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.my_bodyshop_physical_floor() IS NOT NULL
    AND (
      public.has_module_view('bodyshop_floor')
      OR public.has_module_modify('bodyshop_floor')
    )
    AND NOT public.is_admin()
    AND NOT public.has_module_view('admin')
    AND NOT public.has_module_modify('admin');
$$;

GRANT EXECUTE ON FUNCTION public.normalize_bodyshop_physical_floor(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_bodyshop_physical_floor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_bodyshop_physical_floor_incharge() TO authenticated;

DROP POLICY IF EXISTS bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards;

CREATE POLICY bodyshop_repair_cards_select_rbac_v2 ON public.bodyshop_repair_cards
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_view('admin')
    OR public.has_module_modify('admin')
    OR (
      (
        public.has_module_view('service_advisor')
        OR public.has_module_view('reception')
        OR public.has_module_view('bodyshop_floor')
        OR public.has_module_view('bodyshop_repair')
        OR public.has_module_view('bodyshop_tracker')
        OR public.has_module_view('bodyshop_floor_work')
        OR public.has_module_modify('bodyshop_floor_work')
      )
      AND (
        (
          reception_entry_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.service_reception_entries sre
            WHERE sre.id = bodyshop_repair_cards.reception_entry_id
              AND public.dealer_code_in_scope(sre.dealer_code)
          )
        )
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_', 1))
        OR public.dealer_code_in_scope(split_part(COALESCE(sa_employee_code, ''), '_', 2))
      )
      AND (
        NOT public.user_is_bodyshop_physical_floor_incharge()
        OR btrim(coalesce(bodyshop_floor, '')) = public.my_bodyshop_physical_floor()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.bodyshop_assignments_block_manual_worker_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_admin() OR public.has_module_modify('bodyshop_floor_work') THEN
    RETURN NEW;
  END IF;

  IF lower(btrim(coalesce(NEW.dentor_work_status, ''))) = 'completed'
     AND lower(btrim(coalesce(OLD.dentor_work_status, ''))) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Worker step must be completed from Floor Work app (photo + Done), not Bodyshop Floor status.';
  END IF;
  IF lower(btrim(coalesce(NEW.dentor_helper_work_status, ''))) = 'completed'
     AND lower(btrim(coalesce(OLD.dentor_helper_work_status, ''))) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Worker step must be completed from Floor Work app (photo + Done), not Bodyshop Floor status.';
  END IF;
  IF lower(btrim(coalesce(NEW.painter_work_status, ''))) = 'completed'
     AND lower(btrim(coalesce(OLD.painter_work_status, ''))) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Worker step must be completed from Floor Work app (photo + Done), not Bodyshop Floor status.';
  END IF;
  IF lower(btrim(coalesce(NEW.painter_helper_work_status, ''))) = 'completed'
     AND lower(btrim(coalesce(OLD.painter_helper_work_status, ''))) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Worker step must be completed from Floor Work app (photo + Done), not Bodyshop Floor status.';
  END IF;
  IF lower(btrim(coalesce(NEW.technician_work_status, ''))) = 'completed'
     AND lower(btrim(coalesce(OLD.technician_work_status, ''))) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Worker step must be completed from Floor Work app (photo + Done), not Bodyshop Floor status.';
  END IF;
  IF lower(btrim(coalesce(NEW.rubbing_work_status, ''))) = 'completed'
     AND lower(btrim(coalesce(OLD.rubbing_work_status, ''))) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Worker step must be completed from Floor Work app (photo + Done), not Bodyshop Floor status.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_assignments_block_manual_worker_complete ON public.bodyshop_assignments;
CREATE TRIGGER bodyshop_assignments_block_manual_worker_complete
  BEFORE UPDATE ON public.bodyshop_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.bodyshop_assignments_block_manual_worker_complete();
