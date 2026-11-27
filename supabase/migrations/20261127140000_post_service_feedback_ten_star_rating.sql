-- DBL-0106: Post Service Feedback — Complete Migration from 5-Star to Genuine 10-Star Rating System.
--
-- Scope:
--   1. Add explicit scale-tracking columns to public.post_service_feedback_messages:
--      - request_rating_scale (5 for all pre-existing legacy WhatsApp requests; default 10 for new requests)
--      - rating_scale (5 while unrated on legacy request; 10 for migrated rated rows and new 10-star rows)
--      - rating_migrated_from_scale (5 for rows whose historical 1-5 rating/cre_rating was multiplied x2; NULL otherwise)
--      - rating_migrated_at (timestamptz when historical migration ran for that row; NULL otherwise)
--      And add nullable rating_scale to public.post_feedback_bot_data (populated for PSF-linked rows only).
--   2. Idempotently migrate confirmed historical 5-star ratings (WHERE rating_scale = 5 AND (rating IS NOT NULL OR cre_rating IS NOT NULL)):
--      1->2, 2->4, 3->6, 4->8, 5->10 on post_service_feedback_messages (rating, cre_rating; effective_rating auto-updates)
--      and linked post_feedback_bot_data rows (WHERE source_feedback_message_id IS NOT NULL).
--      Preserves NULL ratings, no-response rows, customer details, remarks, timestamps, follow-up dates, and resolution history.
--      Bot routing trigger is dropped BEFORE historical updates and recreated AFTER, so 0 unintended bot cases are created.
--      Safe against repeated execution: never infers scale from numeric value; re-running updates 0 rows.
--   3. Non-atomic cutover safety trigger (trg_psf_guard_legacy_scale_transition):
--      - BEFORE INSERT: forces request_rating_scale = 5 (and rating_scale = 5 while unrated) whenever
--        template_name = 'post_service_feedback_v1', protecting against an old wa-post-service-feedback
--        sender running after DB migration.
--      - BEFORE UPDATE OF rating: if an old wa-webhook writes a raw 1..5 rating onto a legacy unrated row
--        without setting rating_scale = 10 (OLD.rating IS NULL AND OLD.request_rating_scale = 5 AND
--        OLD.rating_scale = 5 AND NEW.rating_scale = 5 AND NEW.rating BETWEEN 1 AND 5), automatically
--        normalizes NEW.rating := NEW.rating * 2 and stamps rating_scale = 10, rating_migrated_from_scale = 5.
--   4. Enforce genuine 1-10 integer CHECK constraints (rejects 0, 11, etc.).
--   5. Update PSF workflow RPCs, views, and bot routing trigger to 10-star business rules:
--      - 1-4: Poor (Red) — Needs Follow-up
--      - 5-7: Average (Amber) — Needs Follow-up
--      - 8-10: Positive (Green) — Positive
--      - NULL: No Rating / No Response
--
-- MANDATORY PRE-APPLY DATA BACKUP (metadata-only backup is NOT sufficient for row recovery):
--   Before applying this migration to production, capture a row-level backup of the 3 affected tables:
--     pg_dump --data-only --format=plain --encoding=UTF8 \
--       -t public.post_service_feedback_messages \
--       -t public.post_feedback_bot_data \
--       -t public.post_service_feedback_remarks \
--       --file="local_folder/backups/psf_pre_dbl0106_$(date +%Y%m%d_%H%M%S).sql" ...
--   (or run `npm run db:backup:full` via scripts/backup-full-db.sh).
--
-- LOSSLESS RECOVERY & ROLLBACK STRATEGY (Two Distinct Regimes):
--
--   REGIME A — Clean Lossless Rollback (ONLY BEFORE any genuine native 10-star ratings have been received):
--     Runs an explicit guard that ABORTS if any native 10-star / odd rating exists; when guard passes,
--     every rated row is an exact even multiple (2,4,6,8,10) of its original 1..5 score, so / 2 is 100% lossless:
--
--     BEGIN;
--     DO $$
--     DECLARE v_native_cnt bigint;
--     BEGIN
--       SELECT COUNT(*) INTO v_native_cnt
--       FROM public.post_service_feedback_messages
--       WHERE (rating IS NOT NULL AND (rating_migrated_from_scale IS DISTINCT FROM 5 OR rating % 2 <> 0))
--          OR (cre_rating IS NOT NULL AND (rating_migrated_from_scale IS DISTINCT FROM 5 OR cre_rating % 2 <> 0));
--       IF v_native_cnt > 0 THEN
--         RAISE EXCEPTION 'ABORT LOSSLESS ROLLBACK: % row(s) contain native 10-star ratings. Use Regime B (forward fix or archive snapshot).', v_native_cnt;
--       END IF;
--     END;
--     $$;
--     DROP TRIGGER IF EXISTS trg_route_eligible_post_feedback_to_bot ON public.post_service_feedback_messages;
--     DROP TRIGGER IF EXISTS trg_psf_guard_legacy_scale_transition ON public.post_service_feedback_messages;
--     ALTER TABLE public.post_service_feedback_messages
--       DROP CONSTRAINT IF EXISTS psfm_rating_check,
--       DROP CONSTRAINT IF EXISTS psfm_cre_rating_check;
--     UPDATE public.post_feedback_bot_data b
--     SET rating = (b.rating / 2)::smallint,
--         rating_scale = 5
--     FROM public.post_service_feedback_messages m
--     WHERE b.source_feedback_message_id = m.id
--       AND b.rating IS NOT NULL
--       AND b.rating_scale = 10;
--     UPDATE public.post_service_feedback_messages
--     SET rating = CASE WHEN rating IS NOT NULL THEN (rating / 2)::smallint ELSE NULL END,
--         cre_rating = CASE WHEN cre_rating IS NOT NULL THEN (cre_rating / 2)::smallint ELSE NULL END,
--         rating_scale = 5,
--         rating_migrated_from_scale = NULL,
--         rating_migrated_at = NULL
--     WHERE rating_migrated_from_scale = 5;
--     -- Then restore 1-5 CHECK constraints, RPCs, views, and trigger from
--     -- supabase/migrations/20261127130000_revert_post_service_feedback_five_star_rating.sql (without its /2 UPDATEs).
--     COMMIT;
--
--   REGIME B — Recovery AFTER genuine 10-star ratings (including odd values 1,3,5,7,9) have been received:
--     1. PREFERRED: Apply a forward fix (UI / Edge Function / Meta template config) while keeping all
--        1-10 database ratings intact. Never run lossy CEIL(rating / 2.0) in-place over native odd ratings.
--     2. If an emergency temporary downgrade is ever mandated, FIRST create a lossless archive preserving
--        exact 10-star values (plus external pg_dump export) before any table mutation:
--          CREATE TABLE IF NOT EXISTS public.psf_ten_star_recovery_archive AS
--          SELECT id, rating, cre_rating, effective_rating, request_rating_scale, rating_scale,
--                 rating_migrated_from_scale, rating_migrated_at, now() AS archived_at
--          FROM public.post_service_feedback_messages
--          WHERE rating IS NOT NULL OR cre_rating IS NOT NULL;
--        This guarantees every genuine 1-10 rating remains 100% recoverable when restored.

BEGIN;

-- 1. Drop triggers & old 1-5 CHECK constraints before migrating ratings to 1-10
--    Dropping trg_route_eligible_post_feedback_to_bot guarantees historical UPDATEs never fire bot routing.
DROP TRIGGER IF EXISTS trg_route_eligible_post_feedback_to_bot ON public.post_service_feedback_messages;
DROP TRIGGER IF EXISTS trg_psf_guard_legacy_scale_transition ON public.post_service_feedback_messages;

ALTER TABLE public.post_service_feedback_messages
  DROP CONSTRAINT IF EXISTS psfm_rating_check,
  DROP CONSTRAINT IF EXISTS psfm_cre_rating_check,
  DROP CONSTRAINT IF EXISTS psfm_request_rating_scale_check,
  DROP CONSTRAINT IF EXISTS psfm_rating_scale_check,
  DROP CONSTRAINT IF EXISTS psfm_rating_migrated_from_scale_check;

ALTER TABLE public.post_feedback_bot_data
  DROP CONSTRAINT IF EXISTS post_feedback_bot_data_rating_scale_check;

-- 2. Add explicit scale-tracking columns (IF NOT EXISTS ensures re-runs never overwrite existing values).
--    On first run, all pre-existing rows receive request_rating_scale = 5 and rating_scale = 5.
ALTER TABLE public.post_service_feedback_messages
  ADD COLUMN IF NOT EXISTS request_rating_scale smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS rating_scale smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS rating_migrated_from_scale smallint,
  ADD COLUMN IF NOT EXISTS rating_migrated_at timestamp with time zone;

ALTER TABLE public.post_feedback_bot_data
  ADD COLUMN IF NOT EXISTS rating_scale smallint;

-- 3. Guard: fail loudly if any row marked rating_scale = 5 already has an out-of-range 5-star value
DO $$
DECLARE
  v_bad_psfm bigint;
  v_bad_bot  bigint;
BEGIN
  SELECT COUNT(*) INTO v_bad_psfm
  FROM public.post_service_feedback_messages
  WHERE rating_scale = 5
    AND (
      (rating IS NOT NULL AND (rating < 1 OR rating > 5))
      OR (cre_rating IS NOT NULL AND (cre_rating < 1 OR cre_rating > 5))
    );

  IF v_bad_psfm > 0 THEN
    RAISE EXCEPTION 'Aborting PSF 10-star migration: % post_service_feedback_messages row(s) with rating_scale=5 have ratings outside 1..5', v_bad_psfm;
  END IF;

  SELECT COUNT(*) INTO v_bad_bot
  FROM public.post_feedback_bot_data b
  JOIN public.post_service_feedback_messages m ON m.id = b.source_feedback_message_id
  WHERE m.rating_scale = 5
    AND COALESCE(b.rating_scale, 5) = 5
    AND b.rating IS NOT NULL
    AND (b.rating < 1 OR b.rating > 5);

  IF v_bad_bot > 0 THEN
    RAISE EXCEPTION 'Aborting PSF 10-star migration: % linked post_feedback_bot_data row(s) with rating_scale=5 have ratings outside 1..5', v_bad_bot;
  END IF;
END;
$$;

-- 4. Migrate linked PSF bot rows FIRST (while parent rows still have rating_scale = 5).
--    Unlinked post_feedback_bot_data rows (SA sync, technician sync, customer portal, etc.) are untouched.
UPDATE public.post_feedback_bot_data b
SET rating = CASE WHEN b.rating IS NOT NULL THEN (b.rating * 2)::smallint ELSE NULL END,
    rating_scale = 10
FROM public.post_service_feedback_messages m
WHERE b.source_feedback_message_id = m.id
  AND m.rating_scale = 5
  AND COALESCE(b.rating_scale, 5) = 5;

-- 5. Migrate historical 5-star rated rows in post_service_feedback_messages (1->2, 2->4, 3->6, 4->8, 5->10).
--    Only rows WITH an existing rating or cre_rating are updated; unrated legacy rows keep rating IS NULL,
--    request_rating_scale = 5, and rating_scale = 5 so the transition guard can distinguish old-webhook writes
--    from new-webhook writes during cutover.
--    Preserves remarks, timestamps (created_at/updated_at/responded_at/rating_at/resolved_at), follow-up dates,
--    review_link_sent, and CRE status. effective_rating (GENERATED ALWAYS) recomputes automatically.
UPDATE public.post_service_feedback_messages
SET rating = CASE WHEN rating IS NOT NULL THEN (rating * 2)::smallint ELSE NULL END,
    cre_rating = CASE WHEN cre_rating IS NOT NULL THEN (cre_rating * 2)::smallint ELSE NULL END,
    rating_scale = 10,
    rating_migrated_from_scale = 5::smallint,
    rating_migrated_at = now()
WHERE rating_scale = 5
  AND (rating IS NOT NULL OR cre_rating IS NOT NULL);

-- 6. Future inserts default to the 10-star scale (transition trigger below guards legacy template_name='post_service_feedback_v1')
ALTER TABLE public.post_service_feedback_messages
  ALTER COLUMN request_rating_scale SET DEFAULT 10,
  ALTER COLUMN rating_scale SET DEFAULT 10;

-- 7. Enforce 1-10 CHECK constraints and scale metadata constraints
ALTER TABLE public.post_service_feedback_messages
  ADD CONSTRAINT psfm_rating_check
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10)),
  ADD CONSTRAINT psfm_cre_rating_check
    CHECK (cre_rating IS NULL OR (cre_rating >= 1 AND cre_rating <= 10)),
  ADD CONSTRAINT psfm_request_rating_scale_check
    CHECK (request_rating_scale IN (5, 10)),
  ADD CONSTRAINT psfm_rating_scale_check
    CHECK (rating_scale IN (5, 10)),
  ADD CONSTRAINT psfm_rating_migrated_from_scale_check
    CHECK (rating_migrated_from_scale IS NULL OR rating_migrated_from_scale = 5);

ALTER TABLE public.post_feedback_bot_data
  ADD CONSTRAINT post_feedback_bot_data_rating_scale_check
    CHECK (rating_scale IS NULL OR rating_scale IN (5, 10));

-- 8. Cutover compatibility trigger: protects non-atomic transition window between DB apply and Edge Function deploy
CREATE OR REPLACE FUNCTION public.psf_guard_legacy_scale_transition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Old wa-post-service-feedback omits request_rating_scale when inserting post_service_feedback_v1 rows.
    -- Because Meta forbids replacing Flow buttons on an approved template in place, post_service_feedback_v1
    -- is permanently a 5-star request template.
    IF LOWER(COALESCE(NEW.template_name, '')) = 'post_service_feedback_v1' THEN
      NEW.request_rating_scale := 5;
      IF NEW.rating IS NULL AND NEW.cre_rating IS NULL THEN
        NEW.rating_scale := 5;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If an old wa-webhook writes a legacy 1..5 rating onto an unrated legacy row during cutover,
    -- it does not pass rating_scale = 10, so OLD.rating_scale = 5 and NEW.rating_scale = 5.
    -- Normalize deterministically to 2..10 so the rating is never corrupted or lost during transition.
    -- New wa-webhook always passes rating_scale = 10 (already normalized), so this branch never fires for it.
    IF OLD.rating IS NULL
       AND NEW.rating IS NOT NULL
       AND OLD.request_rating_scale = 5
       AND OLD.rating_scale = 5
       AND NEW.rating_scale = 5
       AND NEW.rating BETWEEN 1 AND 5 THEN
      NEW.rating := (NEW.rating * 2)::smallint;
      NEW.rating_scale := 10;
      NEW.rating_migrated_from_scale := 5;
      NEW.rating_migrated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.psf_guard_legacy_scale_transition() IS
  'Cutover safety trigger on post_service_feedback_messages: tags legacy post_service_feedback_v1 inserts with request_rating_scale=5 even if old sender runs, and normalizes legacy 1..5 updates from an old webhook during non-atomic cutover.';

CREATE TRIGGER trg_psf_guard_legacy_scale_transition
  BEFORE INSERT OR UPDATE OF rating ON public.post_service_feedback_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.psf_guard_legacy_scale_transition();

-- 9. Update column comments
COMMENT ON COLUMN public.post_service_feedback_messages.rating IS
  'Customer-submitted WhatsApp rating on the 1-10 scale (historical 1-5 ratings migrated x2), or null when the customer has not responded. Source feedback; CRE workflow must not overwrite this column.';

COMMENT ON COLUMN public.post_service_feedback_messages.cre_rating IS
  'CRE-entered rating on the 1-10 scale for workflow classification. Null means no manual rating. Does not replace rating or feedback_text.';

COMMENT ON COLUMN public.post_service_feedback_messages.effective_rating IS
  'Authoritative 1-10 rating for CRE tab classification (COALESCE(cre_rating, rating)). 1-4 Poor, 5-7 Average (1-7 Needs Follow-up), 8-10 Positive, NULL No Rating.';

COMMENT ON COLUMN public.post_service_feedback_messages.request_rating_scale IS
  'Rating scale (5 or 10) of the outbound WhatsApp feedback request sent for this row. Used by wa-webhook to reliably distinguish legacy 5-star responses from native 10-star responses.';

COMMENT ON COLUMN public.post_service_feedback_messages.rating_scale IS
  'Stored rating scale (10 for all migrated and new rated rows; 5 on unrated legacy requests until rated). Prevents double conversion on re-run and guards old-webhook cutover writes.';

COMMENT ON COLUMN public.post_service_feedback_messages.rating_migrated_from_scale IS
  'Set to 5 when historical or late legacy 1-5 ratings on this row were converted x2 to the 10-star scale. NULL for native 10-star rows or unrated rows.';

COMMENT ON COLUMN public.post_service_feedback_messages.rating_migrated_at IS
  'Timestamp when 5-star to 10-star rating conversion occurred for this row.';

COMMENT ON COLUMN public.post_feedback_bot_data.rating_scale IS
  'Rating scale (10 for migrated and new PSF-routed rows; NULL for non-PSF sync rows).';

-- 10. Update CRE rating RPC to accept genuine 1-10 integer ratings
CREATE OR REPLACE FUNCTION public.psf_set_cre_rating(p_feedback_id bigint, p_cre_rating smallint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_rating smallint;
  v_effective smallint;
begin
  if not (public.is_admin() or public.has_module_modify('post_service_feedback_cre')) then
    raise exception 'Insufficient permissions';
  end if;

  if p_cre_rating is null or p_cre_rating < 1 or p_cre_rating > 10 then
    raise exception 'Rating must be between 1 and 10';
  end if;

  update public.post_service_feedback_messages
  set cre_rating = p_cre_rating,
      rating_scale = 10,
      rating_at = now(),
      updated_at = now()
  where id = p_feedback_id
  returning rating, effective_rating into v_rating, v_effective;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cre_rating', p_cre_rating,
    'rating', v_rating,
    'effective_rating', v_effective
  );
end;
$$;

COMMENT ON FUNCTION public.psf_set_cre_rating(bigint, smallint) IS
  'Sets cre_rating (1-10) for workflow classification. Does not change customer rating, feedback_text, follow-up date, remarks, or resolution.';

-- 11. Update Today's Activity productivity RPC: >=8 Positive, <=7 Needs Follow-up
CREATE OR REPLACE FUNCTION public.psf_get_today_productivity() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_res jsonb;
begin
  v_today_start := (timezone('Asia/Kolkata', now())::date)::timestamp at time zone 'Asia/Kolkata';
  v_today_end := v_today_start + interval '1 day' - interval '1 microsecond';

  select jsonb_build_object(
    'positive', count(*) filter (where rating_at >= v_today_start and rating_at <= v_today_end and effective_rating >= 8),
    'needsFollowup', count(*) filter (where rating_at >= v_today_start and rating_at <= v_today_end and effective_rating <= 7),
    'inProgress', count(*) filter (where remarked_at >= v_today_start and remarked_at <= v_today_end and cre_status = 'in_progress' and latest_call_outcome != 'call_not_picked'),
    'callNotPicked', count(*) filter (where remarked_at >= v_today_start and remarked_at <= v_today_end and cre_status = 'in_progress' and latest_call_outcome = 'call_not_picked'),
    'resolved', count(*) filter (where resolved_at >= v_today_start and resolved_at <= v_today_end and cre_status = 'resolved'),
    'total', count(*) filter (where
      (remarked_at >= v_today_start and remarked_at <= v_today_end)
      or (rating_at >= v_today_start and rating_at <= v_today_end)
      or (resolved_at >= v_today_start and resolved_at <= v_today_end)
    )
  ) into v_res
  from public.post_service_feedback_messages;

  return coalesce(v_res, '{"positive": 0, "needsFollowup": 0, "inProgress": 0, "callNotPicked": 0, "resolved": 0, "total": 0}'::jsonb);
end;
$$;

-- 12. Update bot routing function: eligible when responded, rating <= 7, cre_status = open
CREATE OR REPLACE FUNCTION public.insert_post_feedback_bot_from_message(p_message_id bigint) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.post_feedback_bot_data (
    source_feedback_message_id,
    chassis_no,
    vehicle_registration_number,
    mobile_number,
    customer_name,
    rating,
    rating_scale,
    feedback_text,
    service_advisor_name,
    branch,
    service_type
  )
  SELECT
    m.id,
    jc.chassis_number,
    m.vehicle_registration_number,
    m.mobile_number,
    m.customer_name,
    m.rating,
    10::smallint,
    m.feedback_text,
    COALESCE(em.employee_name, jc.sr_assigned_to),
    jc.branch_label,
    jc.sr_type
  FROM public.post_service_feedback_messages m
  LEFT JOIN public.job_card_closed_data jc
    ON jc.id = m.job_card_closed_data_id
  LEFT JOIN public.employee_master em
    ON em.employee_code = jc.employee_code
  WHERE m.id = p_message_id
    AND m.status = 'responded'
    AND m.rating IS NOT NULL
    AND m.rating <= 7
    AND m.cre_status = 'open'
  ON CONFLICT ON CONSTRAINT post_feedback_bot_data_source_feedback_message_id_key
  DO NOTHING;
$$;

COMMENT ON FUNCTION public.insert_post_feedback_bot_from_message(bigint) IS
  'Idempotent insert of one eligible post_service_feedback_messages row into post_feedback_bot_data. Eligibility: status=responded, rating not null and <=7 (10-star scale), cre_status=open. Does not update or delete existing bot rows.';

-- 13. Update views (preserving exact output columns for backwards compatibility)
COMMENT ON VIEW public.post_service_feedback_cre_queue IS
  'Responded customer ratings plus CRE-rated cases on the 1-10 scale. rating is the customer score. effective_rating classifies Needs Follow-up (<=7) vs Positive (>=8).';

CREATE OR REPLACE VIEW public.post_service_feedback_cre_due_today AS
 SELECT m.id,
    m.job_card_closed_data_id,
    m.customer_name,
    m.mobile_number,
    m.vehicle_registration_number,
    m.job_card_number,
    m.closed_date,
    m.sent_at,
    m.rating,
    m.feedback_text,
    m.responded_at,
    m.cre_status,
    m.resolved_at,
    m.resolved_by_name,
    COALESCE(em.employee_name, jc.sr_assigned_to) AS service_advisor_name,
    jc.sr_type AS service_type,
    m.review_link_sent,
    jc.branch_label AS branch,
    m.next_follow_up_date,
    m.cre_rating,
    m.effective_rating
   FROM ((public.post_service_feedback_messages m
     LEFT JOIN public.job_card_closed_data jc ON ((jc.id = m.job_card_closed_data_id)))
     LEFT JOIN public.employee_master em ON ((em.employee_code = jc.employee_code)))
  WHERE ((m.next_follow_up_date = (timezone('Asia/Kolkata'::text, now()))::date)
    AND (m.cre_status <> 'resolved'::text)
    AND (((m.status = 'responded'::text) AND (m.effective_rating IS NOT NULL) AND (m.effective_rating <= 7))
      OR ((m.sent_at IS NOT NULL) AND (m.effective_rating IS NULL))
      OR ((m.sent_at IS NOT NULL) AND (m.cre_rating IS NOT NULL) AND (m.effective_rating <= 7))));

COMMENT ON VIEW public.post_service_feedback_cre_due_today IS
  'Actionable CRE cases whose next_follow_up_date is today in Asia/Kolkata. Includes effective ratings <= 7 (10-star scale) and sent-unrated messages. Excludes resolved cases and effective ratings >= 8. Membership is not service date.';

-- 14. Recreate bot routing trigger with 10-star threshold (<= 7)
CREATE TRIGGER trg_route_eligible_post_feedback_to_bot
  AFTER INSERT OR UPDATE OF status, rating, cre_status ON public.post_service_feedback_messages
  FOR EACH ROW
  WHEN (
    new.status = 'responded'
    AND new.rating IS NOT NULL
    AND new.rating <= 7
    AND new.cre_status = 'open'
  )
  EXECUTE FUNCTION public.route_eligible_post_feedback_to_bot();

COMMENT ON FUNCTION public.route_eligible_post_feedback_to_bot() IS
  'AFTER INSERT/UPDATE trigger on post_service_feedback_messages. Routes newly eligible low-rating (<=7 on 10-star scale) open CRE rows into post_feedback_bot_data.';

COMMIT;
