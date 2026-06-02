-- Migration: Fix Service Advisor update guard to use employee-code ownership
-- Purpose:
-- 1) Remove legacy name-based ownership check (my_sa_name / sa_name).
-- 2) Enforce update ownership via sa_employee_code mapping (user_has_employee_code).
-- 3) Keep SA edit restrictions to allowed fields only.
-- Date: 2026-06-01

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_service_reception_sa_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF public.is_admin() OR public.has_module_view('reception') THEN
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
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
