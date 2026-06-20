-- BODYSHOP-QUEUE-001 follow-up
-- Keep stage-worklist projection in sync when bodyshop_assignments changes,
-- especially bs_floor_completed_at updates that control S11 done/pending.
--
-- Run manually in Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.trg_bodyshop_stage_worklist_projection_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card_id integer;
  v_job_card text;
BEGIN
  v_card_id := COALESCE(NEW.repair_card_id, OLD.repair_card_id);
  v_job_card := upper(trim(COALESCE(NEW.job_card_number, OLD.job_card_number, '')));

  IF v_card_id IS NULL AND v_job_card <> '' THEN
    SELECT brc.id
    INTO v_card_id
    FROM public.bodyshop_repair_cards brc
    WHERE upper(trim(COALESCE(brc.job_card_no, ''))) = v_job_card
    ORDER BY brc.updated_at DESC, brc.created_at DESC
    LIMIT 1;
  END IF;

  IF v_card_id IS NOT NULL THEN
    PERFORM public.recompute_bodyshop_stage_worklist_projection_for_card(v_card_id, 11, 12, 'assignment_change');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bodyshop_stage_worklist_projection_assignment_change ON public.bodyshop_assignments;

CREATE TRIGGER trg_bodyshop_stage_worklist_projection_assignment_change
AFTER INSERT OR UPDATE OF repair_card_id, job_card_number, bs_floor_completed_at, bs_floor_completed_by
ON public.bodyshop_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_bodyshop_stage_worklist_projection_assignment_change();

-- One-time backfill recompute so already-completed floor rows immediately reflect in projection.
SELECT public.recompute_bodyshop_stage_worklist_projection_for_all_cards();
