-- S9 pointer guard was clamping current_stage to 9 when reconcile advanced waived
-- import cards to billing/payment (no floor 2/3 on NEW row). Bypass during reconcile
-- and for pre-billing waived + billed cards.

CREATE OR REPLACE FUNCTION public.enforce_bodyshop_stage_pointer_s9_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_survey_status text;
  v_survey_hold_reason text;
  v_floor_assigned boolean;
  v_stage9_done boolean;
BEGIN
  IF COALESCE(NEW.overall_status, 'active') <> 'active' THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('bodyshop.stage_reconcile_active', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.pre_billing_stages_waived_at IS NOT NULL
     AND COALESCE(NEW.billed_amount, 0) > 0 THEN
    RETURN NEW;
  END IF;

  v_survey_status := lower(btrim(COALESCE(NEW.survey_status, '')));
  v_survey_hold_reason := btrim(COALESCE(NEW.survey_hold_reason, ''));
  v_floor_assigned := lower(btrim(COALESCE(NEW.bodyshop_floor, ''))) IN ('floor 2', 'floor 3');

  v_stage9_done := (
    NEW.survey_date IS NOT NULL
    AND (v_survey_status IN ('hold', 'approved'))
    AND (v_survey_status <> 'hold' OR v_survey_hold_reason <> '')
    AND v_floor_assigned
  );

  IF COALESCE(NEW.current_stage, 1) > 9 AND NOT v_stage9_done THEN
    NEW.current_stage := 9;
    NEW.current_stage_name := 'Survey';
  END IF;

  RETURN NEW;
END;
$$;