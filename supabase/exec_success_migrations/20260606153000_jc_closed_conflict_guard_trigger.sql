-- Safety guard: prevent duplicate-key insert failures on job_card_closed_data
-- by converting duplicate inserts into in-place updates.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_jc_closed_conflict_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id bigint;
BEGIN
  NEW.branch := btrim(coalesce(NEW.branch, ''));
  NEW.job_card_number := upper(btrim(coalesce(NEW.job_card_number, '')));

  IF NEW.branch = '' OR NEW.job_card_number = '' THEN
    RETURN NEW;
  END IF;

  SELECT id
    INTO v_existing_id
  FROM public.job_card_closed_data
  WHERE branch = NEW.branch
    AND job_card_number = NEW.job_card_number
  ORDER BY id
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.job_card_closed_data t
  SET
    invoice_date = COALESCE(NEW.invoice_date, t.invoice_date),
    employee_code = COALESCE(NULLIF(NEW.employee_code, ''), t.employee_code),
    sr_assigned_to = COALESCE(NULLIF(NEW.sr_assigned_to, ''), t.sr_assigned_to),
    chassis_number = COALESCE(NULLIF(NEW.chassis_number, ''), t.chassis_number),
    final_labour_amount = COALESCE(NEW.final_labour_amount, t.final_labour_amount),
    final_spares_amount = COALESCE(NEW.final_spares_amount, t.final_spares_amount),
    total_invoice_amount = COALESCE(NEW.total_invoice_amount, t.total_invoice_amount),
    closed_date_time = COALESCE(NEW.closed_date_time, t.closed_date_time),
    created_date_time = COALESCE(NEW.created_date_time, t.created_date_time),
    updated_at = now()
  WHERE t.id = v_existing_id;

  -- Skip insert because duplicate key already exists and was merged above.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_jc_closed_conflict_guard ON public.job_card_closed_data;
CREATE TRIGGER trg_jc_closed_conflict_guard
BEFORE INSERT ON public.job_card_closed_data
FOR EACH ROW
EXECUTE FUNCTION public.fn_jc_closed_conflict_guard();

COMMIT;
