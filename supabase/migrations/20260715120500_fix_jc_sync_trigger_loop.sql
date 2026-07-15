-- Fix: statement timeout (PG error 57014) when saving jc_number on
-- service_reception_entries via the bodyshop repair page.
--
-- ROOT CAUSE — mutual trigger loop:
--
--   1. UPDATE service_reception_entries.jc_number
--      → trg_sync_bodyshop_card_from_reception (AFTER)
--        → UPDATE bodyshop_repair_cards.job_card_no
--          → trg_sync_reception_jc_from_bodyshop_job_card (AFTER)
--            → UPDATE service_reception_entries.jc_number  ← loop back to 1
--
-- sync_reception_jc_from_bodyshop_job_card has a value-equality guard so its
-- UPDATE on service_reception_entries touches 0 rows on the second pass.
-- However, that 0-row UPDATE still fires ALL BEFORE triggers on
-- service_reception_entries (including trg_service_reception_sa_update_guard
-- which calls is_admin / has_module_modify / user_has_employee_code), and then
-- trg_sync_bodyshop_card_from_reception fires again as an AFTER trigger — each
-- bounce accumulating enough DB work to trip the statement_timeout.
--
-- FIX: add an UPDATE-specific early-exit guard in
-- sync_bodyshop_repair_card_from_reception so that when it is the second leg of
-- the loop (jc_number unchanged between OLD and NEW), it returns immediately
-- without touching bodyshop_repair_cards, breaking the cycle after one pass.

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
BEGIN
  v_is_accident := upper(trim(coalesce(NEW.service_type, ''))) = 'ACCIDENT';
  IF NOT v_is_accident THEN
    RETURN NEW;
  END IF;

  -- Early-exit for UPDATE when only non-relevant fields changed and jc_number
  -- is identical to the previous value.  This is the second-leg guard that
  -- breaks the mutual sync loop with trg_sync_reception_jc_from_bodyshop_job_card.
  IF TG_OP = 'UPDATE'
    AND upper(trim(coalesce(NEW.jc_number,     ''))) = upper(trim(coalesce(OLD.jc_number,     '')))
    AND upper(trim(coalesce(NEW.reg_number,    ''))) = upper(trim(coalesce(OLD.reg_number,    '')))
    AND upper(trim(coalesce(NEW.owner_name,    ''))) = upper(trim(coalesce(OLD.owner_name,    '')))
    AND upper(trim(coalesce(NEW.owner_phone,   ''))) = upper(trim(coalesce(OLD.owner_phone,   '')))
    AND upper(trim(coalesce(NEW.branch,        ''))) = upper(trim(coalesce(OLD.branch,        '')))
    AND upper(trim(coalesce(NEW.sa_employee_code, ''))) = upper(trim(coalesce(OLD.sa_employee_code, '')))
    AND upper(trim(coalesce(NEW.sa_name,       ''))) = upper(trim(coalesce(OLD.sa_name,       '')))
    AND upper(trim(coalesce(NEW.sa_display_name, ''))) = upper(trim(coalesce(OLD.sa_display_name, '')))
  THEN
    RETURN NEW;
  END IF;

  v_job_card_no := upper(trim(coalesce(nullif(NEW.jc_number, ''), nullif(NEW.reg_number, ''))));
  IF v_job_card_no IS NULL OR v_job_card_no = '' THEN
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

COMMENT ON FUNCTION public.sync_bodyshop_repair_card_from_reception()
IS 'Syncs accident reception entries to bodyshop_repair_cards. '
   'Guard added: on UPDATE, exits early when all synced fields are unchanged '
   'to break the mutual trigger loop with sync_reception_jc_from_bodyshop_job_card.';
