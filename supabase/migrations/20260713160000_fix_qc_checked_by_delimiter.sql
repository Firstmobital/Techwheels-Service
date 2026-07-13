-- ============================================================
-- Fix: bodyshop_repair_cards.qc_checked_by values that were
-- stored with ', ' (comma-space) as the name separator.
--
-- Employee names in this system follow "LASTNAME, FIRSTNAME"
-- format (e.g. "SHARMA, KEDAR"), which means a stored value
-- of "SHARMA, KEDAR, BHARAT MALI" is ambiguous — it could be
-- one person ("SHARMA, KEDAR") + one person ("BHARAT MALI"),
-- or three tokens.
--
-- The frontend now uses '|' as the delimiter going forward.
-- For existing rows that have never been saved with '|', the
-- only safe automatic fix is for single-name entries where the
-- value itself IS a "LASTNAME, FIRSTNAME" name (contains
-- exactly one comma and no '|'). Those are re-written as-is
-- (no change needed — the new parser handles them correctly
-- via the pipe-check branch).
--
-- For multi-name values already containing '|': already correct,
-- skip them.
--
-- For multi-name values using the old ', ' separator: these are
-- inherently ambiguous and must be reviewed manually. This
-- migration logs them but does NOT auto-modify them to avoid
-- data loss.
--
-- WHAT THIS MIGRATION DOES:
--   1. Leaves rows with '|' in qc_checked_by unchanged (already new format).
--   2. Leaves rows where qc_checked_by has 0 or 1 comma unchanged
--      (either empty, a plain name like "BHARAT MALI", or a
--      single "LASTNAME, FIRSTNAME" — all parsed correctly).
--   3. Flags rows with 2+ commas in qc_checked_by for manual review
--      by raising a NOTICE with the repair card id and value.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_flagged integer := 0;
BEGIN
  FOR r IN
    SELECT id, job_card_no, qc_checked_by
    FROM public.bodyshop_repair_cards
    WHERE qc_checked_by IS NOT NULL
      AND trim(qc_checked_by) <> ''
      AND qc_checked_by NOT LIKE '%|%'
      AND (length(qc_checked_by) - length(replace(qc_checked_by, ',', ''))) >= 2
  LOOP
    RAISE NOTICE 'REVIEW NEEDED — repair_card id=% jc=% qc_checked_by=%',
      r.id, r.job_card_no, r.qc_checked_by;
    v_flagged := v_flagged + 1;
  END LOOP;

  IF v_flagged = 0 THEN
    RAISE NOTICE 'No ambiguous qc_checked_by values found. All existing data is safe.';
  ELSE
    RAISE NOTICE '% row(s) need manual review (see NOTICEs above).', v_flagged;
  END IF;
END $$;
