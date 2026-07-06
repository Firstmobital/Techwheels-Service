-- BODYSHOP-QUEUE-001 follow-up
-- Align backend projection "pending" rule for Stage 11 with the updated business
-- rule: Stage 11 (Floor Assignment) should be considered pending/active for every
-- vehicle as soon as it appears on Bodyshop Repair, not only after Stage 9/10
-- readiness gates clear. This mirrors the frontend change already shipped in
-- src/pages/BodyshopRepairPage.tsx (stage11Active = !stage11Done).
--
-- Scope: only the Stage 11 "is_pending" boolean is touched. Stage 11 "is_done",
-- Stage 12 logic, and all other stages are untouched.
--
-- NOTE:
-- 1) This script is safe to run multiple times (idempotent).
-- 2) It rewrites the existing function definition by replacing the exact old line.
-- 3) Run manually in Supabase SQL editor.

DO $$
DECLARE
  v_fn_def text;
  v_old_line text := 'v_pending := v_stage11_ready AND NOT v_stage11_done;';
  v_new_line text := 'v_pending := NOT v_stage11_done;';
BEGIN
  SELECT pg_get_functiondef('public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)'::regprocedure)
  INTO v_fn_def;

  IF v_fn_def IS NULL THEN
    RAISE EXCEPTION 'Projection function not found: public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)';
  END IF;

  IF position(v_old_line IN v_fn_def) = 0 THEN
    IF position(v_new_line IN v_fn_def) > 0 THEN
      RAISE NOTICE 'Stage11 pending rule already patched.';
      RETURN;
    END IF;

    RAISE EXCEPTION 'Expected old Stage11 pending rule line not found. Aborting to avoid unsafe rewrite.';
  END IF;

  v_fn_def := replace(v_fn_def, v_old_line, v_new_line);
  EXECUTE v_fn_def;

  RAISE NOTICE 'Patched Stage11 pending rule in recompute_bodyshop_stage_worklist_projection_for_card.';
END $$;

-- Recompute all cards so the "Stage 11" quick-filter chip count reflects the new rule immediately.
SELECT public.recompute_bodyshop_stage_worklist_projection_for_all_cards();
