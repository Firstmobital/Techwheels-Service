-- BODYSHOP-QUEUE-001 critical fix
-- Root cause audit:
--   In projection recompute function, v_floor_completed is derived from
--   bodyshop_repair_cards.floor_status only, while actual floor completion
--   is persisted in bodyshop_assignments.bs_floor_completed_at.
-- Effect:
--   Stage 11 can remain pending with reason floor_not_completed even when
--   Bodyshop Floor shows completed.
--
-- This script patches the projection function text safely and recomputes all cards.
-- Run manually in Supabase SQL editor.

DO $$
DECLARE
  v_fn_def text;
  v_fn_def_before text;
  v_old_floor_line text := 'v_floor_completed := lower(btrim(COALESCE(v_card.floor_status, ''''))) = ''completed'';';
  v_new_floor_line text := 'v_floor_completed := (lower(btrim(COALESCE(v_card.floor_status, ''''))) = ''completed'' OR EXISTS (SELECT 1 FROM public.bodyshop_assignments ba WHERE ba.is_active = true AND ba.bs_floor_completed_at IS NOT NULL AND (ba.repair_card_id = v_card.id OR upper(trim(COALESCE(ba.job_card_number, ''''))) = upper(trim(COALESCE(v_card.job_card_no, ''''))))));';
  v_old_stage11_line text := 'v_stage11_done := (v_floor_completed AND v_stage10_done AND (NOT v_additional_requested OR v_stage12_done));';
  v_new_stage11_line text := 'v_stage11_done := (v_floor_completed AND (NOT v_additional_requested OR v_stage12_done));';
BEGIN
  SELECT pg_get_functiondef('public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)'::regprocedure)
  INTO v_fn_def;

  IF v_fn_def IS NULL THEN
    RAISE EXCEPTION 'Projection function not found: public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)';
  END IF;

  v_fn_def_before := v_fn_def;

  -- Patch floor completed source.
  IF position(v_old_floor_line IN v_fn_def) > 0 THEN
    v_fn_def := replace(v_fn_def, v_old_floor_line, v_new_floor_line);
  ELSIF position(v_new_floor_line IN v_fn_def) = 0 THEN
    -- Fallback for whitespace/format drift in function body.
    v_fn_def := regexp_replace(
      v_fn_def,
      'v_floor_completed\s*:=\s*lower\(btrim\(COALESCE\(v_card\.floor_status,\s*''''\)\)\)\s*=\s*''completed''\s*;',
      v_new_floor_line,
      'g'
    );

    IF position(v_new_floor_line IN v_fn_def) = 0 THEN
      RAISE EXCEPTION 'Expected v_floor_completed line not found. Aborting to avoid unsafe rewrite.';
    END IF;
  END IF;

  -- Patch Stage 11 done rule (idempotent).
  IF position(v_old_stage11_line IN v_fn_def) > 0 THEN
    v_fn_def := replace(v_fn_def, v_old_stage11_line, v_new_stage11_line);
  ELSIF position(v_new_stage11_line IN v_fn_def) = 0 THEN
    RAISE EXCEPTION 'Expected Stage11 done line not found. Aborting to avoid unsafe rewrite.';
  END IF;

  IF v_fn_def = v_fn_def_before THEN
    RAISE NOTICE 'No function text change required (already patched).';
  END IF;

  EXECUTE v_fn_def;
  RAISE NOTICE 'Patched floor_completed source and Stage11 done rule in projection recompute function.';
END $$;

-- Keep recompute trigger on bodyshop_assignments changes in place (script 24).
-- Recompute all cards so queue/projection reflects patched logic immediately.
SELECT public.recompute_bodyshop_stage_worklist_projection_for_all_cards();

-- Verification: confirm floor source patch is active.
SELECT
  position(
    'v_floor_completed := (lower(btrim(COALESCE(v_card.floor_status, ''''))) = ''completed'' OR EXISTS (SELECT 1 FROM public.bodyshop_assignments ba WHERE ba.is_active = true AND ba.bs_floor_completed_at IS NOT NULL AND (ba.repair_card_id = v_card.id OR upper(trim(COALESCE(ba.job_card_number, ''''))) = upper(trim(COALESCE(v_card.job_card_no, ''''))))));'
    IN pg_get_functiondef('public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)'::regprocedure)
  ) > 0 AS floor_source_patch_applied;
