BEGIN;

-- Canonicalize existing BODYSHOP variants in Employee Master.
UPDATE public.employee_master
SET department = 'BODY SHOP'
WHERE UPPER(REPLACE(BTRIM(COALESCE(department, '')), ' ', '')) = 'BODYSHOP'
  AND BTRIM(COALESCE(department, '')) <> 'BODY SHOP';

-- Normalize incoming Employee Master department values at write time.
CREATE OR REPLACE FUNCTION public.normalize_employee_master_department()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_no_space text;
BEGIN
  NEW.department := NULLIF(BTRIM(COALESCE(NEW.department, '')), '');

  IF NEW.department IS NULL THEN
    RETURN NEW;
  END IF;

  normalized_no_space := UPPER(REPLACE(NEW.department, ' ', ''));
  IF normalized_no_space = 'BODYSHOP' THEN
    NEW.department := 'BODY SHOP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_employee_master_department ON public.employee_master;

CREATE TRIGGER trg_normalize_employee_master_department
BEFORE INSERT OR UPDATE OF department
ON public.employee_master
FOR EACH ROW
EXECUTE FUNCTION public.normalize_employee_master_department();

-- Hard guard: BODYSHOP variants must be stored in canonical form BODY SHOP.
ALTER TABLE public.employee_master
DROP CONSTRAINT IF EXISTS employee_master_department_bodyshop_canonical_chk;

ALTER TABLE public.employee_master
ADD CONSTRAINT employee_master_department_bodyshop_canonical_chk
CHECK (
  department IS NULL
  OR UPPER(REPLACE(BTRIM(department), ' ', '')) <> 'BODYSHOP'
  OR BTRIM(department) = 'BODY SHOP'
);

COMMIT;
