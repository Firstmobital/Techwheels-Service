-- Prefer employee_master.location for reception branch mapping.
-- Fallback to legacy SA-code pattern mapping only when employee location is blank.

CREATE OR REPLACE FUNCTION public.apply_sa_business_mapping_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code_upper text;
  employee_location text;
BEGIN
  code_upper := upper(btrim(coalesce(NEW.sa_employee_code, '')));

  IF code_upper = '' THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(em.location), '')
  INTO employee_location
  FROM public.employee_master em
  WHERE upper(btrim(coalesce(em.employee_code, ''))) = code_upper
  LIMIT 1;

  -- Keep dealer_code mapping from SA code as before.
  IF code_upper LIKE '%500A840%' THEN
    NEW.dealer_code := '500A840';
  ELSIF code_upper LIKE '%3001440%' THEN
    NEW.dealer_code := '3001440';
  ELSIF code_upper LIKE '%3000840%' THEN
    NEW.dealer_code := '3000840';
  END IF;

  -- Forced/explicit employee master location wins.
  -- Only fallback to legacy branch mapping when location is empty.
  IF employee_location IS NOT NULL THEN
    NEW.branch := employee_location;
  ELSIF code_upper LIKE '%500A840%' THEN
    NEW.branch := 'Sitapura';
  ELSIF code_upper LIKE '%3001440%' THEN
    NEW.branch := 'Ajmer Road';
  ELSIF code_upper LIKE '%3000840%' THEN
    NEW.branch := 'Sitapura';
  END IF;

  RETURN NEW;
END;
$$;
