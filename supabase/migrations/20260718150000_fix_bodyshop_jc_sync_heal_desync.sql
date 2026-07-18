-- Heal bodyshop_repair_cards.job_card_no when reception already has a real jc_number
-- but the card still holds the reg-number placeholder (RJxx…).
--
-- Also tighten sync_bodyshop_repair_card_from_reception: do not early-exit on
-- km-only updates when the linked card is out of sync with reception.jc_number.

CREATE OR REPLACE FUNCTION public.sync_bodyshop_repair_card_from_reception()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_accident boolean;
  v_job_card_no text;
  v_sa_name text;
  v_card_job_card_no text;
BEGIN
  v_is_accident := upper(trim(coalesce(NEW.service_type, ''))) = 'ACCIDENT';
  IF NOT v_is_accident THEN
    RETURN NEW;
  END IF;

  v_job_card_no := upper(trim(coalesce(nullif(NEW.jc_number, ''), nullif(NEW.reg_number, ''))));
  IF v_job_card_no IS NULL OR v_job_card_no = '' THEN
    RETURN NEW;
  END IF;

  SELECT upper(trim(coalesce(brc.job_card_no, '')))
    INTO v_card_job_card_no
    FROM public.bodyshop_repair_cards brc
   WHERE brc.reception_entry_id = NEW.id
   ORDER BY brc.updated_at DESC NULLS LAST, brc.id DESC
   LIMIT 1;

  -- Early-exit only when synced fields are unchanged AND card already matches.
  IF TG_OP = 'UPDATE'
    AND upper(trim(coalesce(NEW.jc_number,     ''))) = upper(trim(coalesce(OLD.jc_number,     '')))
    AND upper(trim(coalesce(NEW.reg_number,    ''))) = upper(trim(coalesce(OLD.reg_number,    '')))
    AND upper(trim(coalesce(NEW.owner_name,    ''))) = upper(trim(coalesce(OLD.owner_name,    '')))
    AND upper(trim(coalesce(NEW.owner_phone,   ''))) = upper(trim(coalesce(OLD.owner_phone,   '')))
    AND upper(trim(coalesce(NEW.branch,        ''))) = upper(trim(coalesce(OLD.branch,        '')))
    AND upper(trim(coalesce(NEW.sa_employee_code, ''))) = upper(trim(coalesce(OLD.sa_employee_code, '')))
    AND upper(trim(coalesce(NEW.sa_name,       ''))) = upper(trim(coalesce(OLD.sa_name,       '')))
    AND upper(trim(coalesce(NEW.sa_display_name, ''))) = upper(trim(coalesce(OLD.sa_display_name, '')))
    AND coalesce(v_card_job_card_no, '') = v_job_card_no
  THEN
    RETURN NEW;
  END IF;

  v_sa_name := coalesce(nullif(trim(NEW.sa_display_name), ''), nullif(trim(NEW.sa_name), ''), NULL);

  UPDATE public.bodyshop_repair_cards brc
  SET
    job_card_no      = v_job_card_no,
    reg_number       = NEW.reg_number,
    customer_name    = NEW.owner_name,
    customer_phone   = NEW.owner_phone,
    branch           = NEW.branch,
    sa_employee_code = NEW.sa_employee_code,
    sa_name          = coalesce(v_sa_name, brc.sa_name),
    received_at      = coalesce(brc.received_at, NEW.created_at),
    updated_at       = now()
  WHERE brc.reception_entry_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.bodyshop_repair_cards (
      reception_entry_id,
      job_card_no,
      reg_number,
      customer_name,
      customer_phone,
      branch,
      sa_employee_code,
      sa_name,
      current_stage,
      current_stage_name,
      overall_status,
      received_at,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      v_job_card_no,
      NEW.reg_number,
      NEW.owner_name,
      NEW.owner_phone,
      NEW.branch,
      NEW.sa_employee_code,
      v_sa_name,
      1,
      'Vehicle Receiving',
      'active',
      coalesce(NEW.created_at, now()),
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- One-time heal for cards already desynced (reception has real JC, card still has reg).
UPDATE public.bodyshop_repair_cards brc
   SET job_card_no = upper(trim(sre.jc_number)),
       updated_at  = now()
  FROM public.service_reception_entries sre
 WHERE sre.id = brc.reception_entry_id
   AND upper(trim(coalesce(sre.service_type, ''))) = 'ACCIDENT'
   AND length(upper(trim(coalesce(sre.jc_number, '')))) >= 25
   AND upper(trim(coalesce(brc.job_card_no, ''))) IS DISTINCT FROM upper(trim(sre.jc_number));
