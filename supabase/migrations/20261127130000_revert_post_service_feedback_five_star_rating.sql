-- Revert PSF 10-star experiment: restore 1–5 scale, ÷2 ratings backfilled from 1–5, restore workflow thresholds (>=4 positive, <=3 follow-up).

DROP TRIGGER IF EXISTS trg_route_eligible_post_feedback_to_bot ON public.post_service_feedback_messages;

ALTER TABLE public.post_service_feedback_messages
  DROP CONSTRAINT IF EXISTS psfm_rating_check,
  DROP CONSTRAINT IF EXISTS psfm_cre_rating_check;

UPDATE public.post_service_feedback_messages
SET rating = GREATEST(1, LEAST(5, rating / 2))
WHERE rating IS NOT NULL AND rating >= 2 AND rating <= 10;

UPDATE public.post_service_feedback_messages
SET cre_rating = GREATEST(1, LEAST(5, cre_rating / 2))
WHERE cre_rating IS NOT NULL AND cre_rating >= 2 AND cre_rating <= 10;

UPDATE public.post_feedback_bot_data b
SET rating = GREATEST(1, LEAST(5, b.rating / 2))
FROM public.post_service_feedback_messages m
WHERE b.source_feedback_message_id = m.id
  AND b.rating IS NOT NULL
  AND b.rating >= 2
  AND b.rating <= 10;

ALTER TABLE public.post_service_feedback_messages
  ADD CONSTRAINT psfm_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  ADD CONSTRAINT psfm_cre_rating_check CHECK (cre_rating IS NULL OR (cre_rating >= 1 AND cre_rating <= 5));

COMMENT ON COLUMN public.post_service_feedback_messages.rating IS
  'Customer-submitted WhatsApp rating (1-5), or null when the customer has not responded. Source feedback. CRE workflow must not overwrite this column.';

COMMENT ON COLUMN public.post_service_feedback_messages.cre_rating IS
  'CRE-entered rating (1-5) for workflow classification. Null means no manual rating. Does not replace rating or feedback_text.';

COMMENT ON VIEW public.post_service_feedback_cre_queue IS
  'Responded customer ratings plus CRE-rated cases. rating is the customer score. effective_rating classifies needs follow-up (<=3) vs positive (>=4).';

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

  if p_cre_rating is null or p_cre_rating < 1 or p_cre_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.post_service_feedback_messages
  set cre_rating = p_cre_rating,
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
  'Sets cre_rating for workflow classification. Does not change customer rating, feedback_text, follow-up date, remarks, or resolution.';

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
    'positive', count(*) filter (where rating_at >= v_today_start and rating_at <= v_today_end and effective_rating >= 4),
    'needsFollowup', count(*) filter (where rating_at >= v_today_start and rating_at <= v_today_end and effective_rating <= 3),
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
  WHERE ((m.next_follow_up_date = (timezone('Asia/Kolkata'::text, now()))::date) AND (m.cre_status <> 'resolved'::text) AND (((m.status = 'responded'::text) AND (m.effective_rating IS NOT NULL) AND (m.effective_rating <= 3)) OR ((m.sent_at IS NOT NULL) AND (m.effective_rating IS NULL)) OR ((m.sent_at IS NOT NULL) AND (m.cre_rating IS NOT NULL) AND (m.effective_rating <= 3))));

COMMENT ON VIEW public.post_service_feedback_cre_due_today IS
  'Actionable CRE cases whose next_follow_up_date is today in Asia/Kolkata. Includes effective ratings <= 3 and sent-unrated messages. Excludes resolved cases and effective ratings >= 4. Membership is not service date.';

CREATE TRIGGER trg_route_eligible_post_feedback_to_bot
  AFTER INSERT OR UPDATE OF status, rating, cre_status ON public.post_service_feedback_messages
  FOR EACH ROW
  WHEN (
    new.status = 'responded'
    AND new.rating IS NOT NULL
    AND new.rating <= 3
    AND new.cre_status = 'open'
  )
  EXECUTE FUNCTION public.route_eligible_post_feedback_to_bot();

COMMENT ON FUNCTION public.route_eligible_post_feedback_to_bot() IS
  'AFTER INSERT/UPDATE trigger on post_service_feedback_messages. Routes newly eligible low-rating open CRE rows into post_feedback_bot_data.';