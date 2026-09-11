-- OPS-PSF-BOT-001 / DBL-0049
-- Route eligible post-service feedback messages into post_feedback_bot_data.
-- Source of event: public.post_service_feedback_messages (not the CRE queue view).
-- Reversible:
--   DROP TRIGGER IF EXISTS trg_route_eligible_post_feedback_to_bot ON public.post_service_feedback_messages;
--   DROP FUNCTION IF EXISTS public.route_eligible_post_feedback_to_bot();
--   DROP FUNCTION IF EXISTS public.insert_post_feedback_bot_from_message(bigint);
--   ALTER TABLE public.post_feedback_bot_data
--     DROP CONSTRAINT IF EXISTS post_feedback_bot_data_source_feedback_message_id_fkey,
--     DROP CONSTRAINT IF EXISTS post_feedback_bot_data_source_feedback_message_id_key,
--     DROP COLUMN IF EXISTS source_feedback_message_id;

-- ─── 1. Source identifier ──────────────────────────────────────────────────
ALTER TABLE public.post_feedback_bot_data
  ADD COLUMN IF NOT EXISTS source_feedback_message_id bigint;

COMMENT ON COLUMN public.post_feedback_bot_data.source_feedback_message_id IS
  'Stable source key: public.post_service_feedback_messages.id. Unique. Bot rows are created when a message becomes eligible; they are not deleted when CRE status later leaves open.';

-- Attach source ids to existing bot rows that uniquely match currently eligible messages.
-- Match key is only used for this one-time historical attach; runtime idempotency uses source_feedback_message_id.
WITH eligible AS (
  SELECT
    m.id AS msg_id,
    m.mobile_number,
    m.vehicle_registration_number,
    m.rating
  FROM public.post_service_feedback_messages m
  WHERE m.status = 'responded'
    AND m.rating IS NOT NULL
    AND m.rating <= 3
    AND m.cre_status = 'open'
),
unique_eligible AS (
  SELECT e.*
  FROM eligible e
  WHERE (
    SELECT COUNT(*)
    FROM eligible e2
    WHERE e2.mobile_number IS NOT DISTINCT FROM e.mobile_number
      AND e2.vehicle_registration_number IS NOT DISTINCT FROM e.vehicle_registration_number
      AND e2.rating IS NOT DISTINCT FROM e.rating
  ) = 1
),
unique_bot AS (
  SELECT b.id AS bot_id, e.msg_id
  FROM public.post_feedback_bot_data b
  JOIN unique_eligible e
    ON b.mobile_number IS NOT DISTINCT FROM e.mobile_number
   AND b.vehicle_registration_number IS NOT DISTINCT FROM e.vehicle_registration_number
   AND b.rating IS NOT DISTINCT FROM e.rating
  WHERE b.source_feedback_message_id IS NULL
    AND (
      SELECT COUNT(*)
      FROM public.post_feedback_bot_data b2
      WHERE b2.source_feedback_message_id IS NULL
        AND b2.mobile_number IS NOT DISTINCT FROM b.mobile_number
        AND b2.vehicle_registration_number IS NOT DISTINCT FROM b.vehicle_registration_number
        AND b2.rating IS NOT DISTINCT FROM b.rating
    ) = 1
)
UPDATE public.post_feedback_bot_data b
SET source_feedback_message_id = u.msg_id
FROM unique_bot u
WHERE b.id = u.bot_id
  AND b.source_feedback_message_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'post_feedback_bot_data_source_feedback_message_id_key'
      AND conrelid = 'public.post_feedback_bot_data'::regclass
  ) THEN
    ALTER TABLE public.post_feedback_bot_data
      ADD CONSTRAINT post_feedback_bot_data_source_feedback_message_id_key
      UNIQUE (source_feedback_message_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'post_feedback_bot_data_source_feedback_message_id_fkey'
      AND conrelid = 'public.post_feedback_bot_data'::regclass
  ) THEN
    ALTER TABLE public.post_feedback_bot_data
      ADD CONSTRAINT post_feedback_bot_data_source_feedback_message_id_fkey
      FOREIGN KEY (source_feedback_message_id)
      REFERENCES public.post_service_feedback_messages(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── 2. Shared insert (trigger + backfill) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_post_feedback_bot_from_message(p_message_id bigint)
RETURNS void
LANGUAGE sql
SET search_path TO public
AS $$
  INSERT INTO public.post_feedback_bot_data (
    source_feedback_message_id,
    chassis_no,
    vehicle_registration_number,
    mobile_number,
    customer_name,
    rating,
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
    AND m.rating <= 3
    AND m.cre_status = 'open'
  ON CONFLICT ON CONSTRAINT post_feedback_bot_data_source_feedback_message_id_key
  DO NOTHING;
$$;

COMMENT ON FUNCTION public.insert_post_feedback_bot_from_message(bigint) IS
  'Idempotent insert of one eligible post_service_feedback_messages row into post_feedback_bot_data. Eligibility: status=responded, rating not null and <=3, cre_status=open. Does not update or delete existing bot rows.';

CREATE OR REPLACE FUNCTION public.route_eligible_post_feedback_to_bot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  PERFORM public.insert_post_feedback_bot_from_message(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.route_eligible_post_feedback_to_bot() IS
  'AFTER INSERT/UPDATE trigger on post_service_feedback_messages. Routes newly eligible low-rating open CRE rows into post_feedback_bot_data.';

DROP TRIGGER IF EXISTS trg_route_eligible_post_feedback_to_bot
  ON public.post_service_feedback_messages;

CREATE TRIGGER trg_route_eligible_post_feedback_to_bot
AFTER INSERT OR UPDATE OF status, rating, cre_status
ON public.post_service_feedback_messages
FOR EACH ROW
WHEN (
  NEW.status = 'responded'
  AND NEW.rating IS NOT NULL
  AND NEW.rating <= 3
  AND NEW.cre_status = 'open'
)
EXECUTE FUNCTION public.route_eligible_post_feedback_to_bot();

GRANT EXECUTE ON FUNCTION public.insert_post_feedback_bot_from_message(bigint)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.route_eligible_post_feedback_to_bot()
  TO anon, authenticated, service_role;

-- ─── 3. Historical backfill of remaining eligible rows ─────────────────────
INSERT INTO public.post_feedback_bot_data (
  source_feedback_message_id,
  chassis_no,
  vehicle_registration_number,
  mobile_number,
  customer_name,
  rating,
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
  m.feedback_text,
  COALESCE(em.employee_name, jc.sr_assigned_to),
  jc.branch_label,
  jc.sr_type
FROM public.post_service_feedback_messages m
LEFT JOIN public.job_card_closed_data jc
  ON jc.id = m.job_card_closed_data_id
LEFT JOIN public.employee_master em
  ON em.employee_code = jc.employee_code
WHERE m.status = 'responded'
  AND m.rating IS NOT NULL
  AND m.rating <= 3
  AND m.cre_status = 'open'
ON CONFLICT ON CONSTRAINT post_feedback_bot_data_source_feedback_message_id_key
DO NOTHING;
