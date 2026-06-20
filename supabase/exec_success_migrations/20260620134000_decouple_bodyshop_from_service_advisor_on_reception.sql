-- Decouple bodyshop modules from service_advisor dependency on service_reception_entries.
--
-- Why:
-- 1) Bodyshop Floor and Bodyshop Repair pages read from service_reception_entries.
-- 2) Existing reception policies only grant that table to reception/service_advisor modules.
-- 3) Bodyshop Repair updates KM/JC on reception rows and failed without service_advisor/reception rights.
--
-- Long-term contract introduced here:
-- - bodyshop_floor/bodyshop_repair/bodyshop_tracker can SELECT only Accident rows in their scope.
-- - bodyshop_repair can UPDATE only Accident rows in their scope.
-- - Trigger guard restricts bodyshop_repair updates to km_reading + jc_number only.

BEGIN;

DROP POLICY IF EXISTS service_reception_select_bodyshop_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_select_bodyshop_v1
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    coalesce(service_type, '') = 'Accident'
    AND (
      public.has_module_view('bodyshop_floor')
      OR public.has_module_modify('bodyshop_floor')
      OR public.has_module_view('bodyshop_repair')
      OR public.has_module_modify('bodyshop_repair')
      OR public.has_module_view('bodyshop_tracker')
    )
    AND (
      (
        sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sa_employee_code)
        )
      )
      OR (
        sa_employee_code IS NULL
        AND public.dealer_code_in_scope(dealer_code)
      )
    )
  )
);

DROP POLICY IF EXISTS service_reception_update_bodyshop_repair_v1 ON public.service_reception_entries;
CREATE POLICY service_reception_update_bodyshop_repair_v1
ON public.service_reception_entries
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    coalesce(service_type, '') = 'Accident'
    AND public.has_module_modify('bodyshop_repair')
    AND (
      (
        sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sa_employee_code)
        )
      )
      OR (
        sa_employee_code IS NULL
        AND public.dealer_code_in_scope(dealer_code)
      )
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    coalesce(service_type, '') = 'Accident'
    AND public.has_module_modify('bodyshop_repair')
    AND (
      (
        sa_employee_code IS NOT NULL
        AND (
          public.user_has_employee_code(sa_employee_code)
          OR public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
          OR public.user_is_crm_for_dealer_sa(sa_employee_code)
        )
      )
      OR (
        sa_employee_code IS NULL
        AND public.dealer_code_in_scope(dealer_code)
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.enforce_service_reception_sa_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF public.is_admin() OR public.has_module_modify('reception') THEN
    RETURN NEW;
  END IF;

  IF public.has_module_modify('service_advisor') THEN
    -- Ownership gate: SA can only update rows mapped to their employee code(s).
    IF OLD.sa_employee_code IS NULL OR NOT public.user_has_employee_code(OLD.sa_employee_code) THEN
      RAISE EXCEPTION 'You can update only your own assigned rows | code: P0001';
    END IF;

    -- SA may edit only these fields: service_type, jc_number, remark, estimate_* and updated_at.
    IF NEW.dealer_code IS DISTINCT FROM OLD.dealer_code
      OR NEW.reg_number IS DISTINCT FROM OLD.reg_number
      OR NEW.model IS DISTINCT FROM OLD.model
      OR NEW.sa_name IS DISTINCT FROM OLD.sa_name
      OR NEW.sa_employee_code IS DISTINCT FROM OLD.sa_employee_code
      OR NEW.sa_display_name IS DISTINCT FROM OLD.sa_display_name
      OR NEW.owner_name IS DISTINCT FROM OLD.owner_name
      OR NEW.owner_phone IS DISTINCT FROM OLD.owner_phone
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Service Advisor can edit only Service Type, Job Card Number, Remark, and Estimate fields';
    END IF;

    RETURN NEW;
  END IF;

  IF public.has_module_modify('bodyshop_repair') THEN
    -- Bodyshop module can only touch accident workflow reception rows in scope.
    IF coalesce(OLD.service_type, '') <> 'Accident' THEN
      RAISE EXCEPTION 'Bodyshop Repair can update only Accident reception rows';
    END IF;

    IF OLD.sa_employee_code IS NOT NULL THEN
      IF NOT (
        public.user_has_employee_code(OLD.sa_employee_code)
        OR public.user_has_floor_incharge_scope_for_sa_code(OLD.sa_employee_code)
        OR public.user_is_crm_for_dealer_sa(OLD.sa_employee_code)
      ) THEN
        RAISE EXCEPTION 'Bodyshop Repair can update only in-scope Accident reception rows';
      END IF;
    ELSIF NOT public.dealer_code_in_scope(OLD.dealer_code) THEN
      RAISE EXCEPTION 'Bodyshop Repair can update only dealer-scope Accident reception rows';
    END IF;

    -- Only KM/JC edits are allowed from bodyshop intake flow.
    IF (to_jsonb(NEW) - ARRAY['km_reading', 'jc_number', 'updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['km_reading', 'jc_number', 'updated_at']) THEN
      RAISE EXCEPTION 'Bodyshop Repair can edit only KM Reading and Job Card Number';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;