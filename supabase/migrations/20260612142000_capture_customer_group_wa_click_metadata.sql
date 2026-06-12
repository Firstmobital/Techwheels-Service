-- Capture who completed Customer Group (Send WA) and when.
-- Authoritative source audited from local_folder/backups/full_database.sql mirror chunks.

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS customer_group_wa_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_group_wa_sent_by text;

COMMENT ON COLUMN public.bodyshop_repair_cards.customer_group_wa_sent_at IS
  'Timestamp when Customer Group was completed via Send WA action (stage 4 -> 5).';

COMMENT ON COLUMN public.bodyshop_repair_cards.customer_group_wa_sent_by IS
  'Auth user id (as text) who completed Customer Group via Send WA action.';

CREATE OR REPLACE FUNCTION public.capture_bodyshop_customer_group_wa_click()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- First transition from stage <=4 to stage >=5 marks Customer Group completion.
  IF COALESCE(OLD.current_stage, 0) <= 4 AND COALESCE(NEW.current_stage, 0) >= 5 THEN
    IF NEW.customer_group_wa_sent_at IS NULL THEN
      NEW.customer_group_wa_sent_at := COALESCE(NEW.updated_at, now());
    END IF;

    IF COALESCE(BTRIM(NEW.customer_group_wa_sent_by), '') = '' THEN
      NEW.customer_group_wa_sent_by := COALESCE(auth.uid()::text, NEW.customer_group_wa_sent_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_bodyshop_customer_group_wa_click ON public.bodyshop_repair_cards;

CREATE TRIGGER trg_capture_bodyshop_customer_group_wa_click
BEFORE UPDATE OF current_stage ON public.bodyshop_repair_cards
FOR EACH ROW
EXECUTE FUNCTION public.capture_bodyshop_customer_group_wa_click();
