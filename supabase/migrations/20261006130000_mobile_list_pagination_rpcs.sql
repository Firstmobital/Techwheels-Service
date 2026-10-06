  -- Keyset list RPCs for mobile staff app (page size configurable from client).

  CREATE OR REPLACE FUNCTION public.list_bodyshop_repair_cards_page(
    p_page_size integer DEFAULT 20,
    p_cursor_created_at timestamptz DEFAULT NULL,
    p_cursor_id integer DEFAULT NULL,
    p_search_query text DEFAULT NULL,
    p_bodyshop_floor text DEFAULT NULL
  )
  RETURNS SETOF public.bodyshop_repair_cards
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO public
  AS $$
    WITH params AS (
      SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
    ),
    q AS (
      SELECT trim(coalesce(p_search_query, '')) AS search_q
    )
    SELECT c.*
    FROM public.bodyshop_repair_cards c
    CROSS JOIN params
    CROSS JOIN q
    WHERE coalesce(trim(c.job_card_no), '') <> ''
      AND (p_bodyshop_floor IS NULL OR c.bodyshop_floor = p_bodyshop_floor)
      AND (
        q.search_q = ''
        OR c.job_card_no ILIKE '%' || q.search_q || '%'
        OR coalesce(c.reg_number, '') ILIKE '%' || q.search_q || '%'
        OR coalesce(c.customer_name, '') ILIKE '%' || q.search_q || '%'
      )
      AND (
        p_cursor_created_at IS NULL
        OR p_cursor_id IS NULL
        OR (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY c.created_at DESC NULLS LAST, c.id DESC
    LIMIT (SELECT page_size FROM params);
  $$;

  CREATE OR REPLACE FUNCTION public.list_bodyshop_assignments_active_page(
    p_page_size integer DEFAULT 20,
    p_cursor_created_at timestamptz DEFAULT NULL,
    p_cursor_id bigint DEFAULT NULL
  )
  RETURNS SETOF public.bodyshop_assignments
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO public
  AS $$
    WITH params AS (
      SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
    )
    SELECT a.*
    FROM public.bodyshop_assignments a
    CROSS JOIN params
    WHERE a.is_active = true
      AND (
        p_cursor_created_at IS NULL
        OR p_cursor_id IS NULL
        OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT (SELECT page_size FROM params);
  $$;

  CREATE OR REPLACE FUNCTION public.list_bodyshop_floor_support_active_page(
    p_page_size integer DEFAULT 20,
    p_cursor_created_at timestamptz DEFAULT NULL,
    p_cursor_id bigint DEFAULT NULL
  )
  RETURNS SETOF public.bodyshop_floor_support_assignments
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO public
  AS $$
    WITH params AS (
      SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
    )
    SELECT s.*
    FROM public.bodyshop_floor_support_assignments s
    CROSS JOIN params
    WHERE s.is_active = true
      AND (
        p_cursor_created_at IS NULL
        OR p_cursor_id IS NULL
        OR (s.created_at, s.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT (SELECT page_size FROM params);
  $$;

  CREATE OR REPLACE FUNCTION public.list_service_bookings_driver_page(
    p_page_size integer DEFAULT 20,
    p_cursor_appointment_date date DEFAULT NULL,
    p_cursor_id bigint DEFAULT NULL
  )
  RETURNS SETOF public.service_bookings
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO public
  AS $$
    WITH params AS (
      SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
    )
    SELECT b.*
    FROM public.service_bookings b
    CROSS JOIN params
    WHERE (
        b.pickup_required = true
        OR b.drop_required = true
        OR b.driver_name IS NOT NULL
      )
      AND (
        p_cursor_appointment_date IS NULL
        OR p_cursor_id IS NULL
        OR (coalesce(b.appointment_date, '9999-12-31'::date), b.id) > (p_cursor_appointment_date, p_cursor_id)
      )
    ORDER BY coalesce(b.appointment_date, '9999-12-31'::date) ASC, b.id ASC
    LIMIT (SELECT page_size FROM params);
  $$;

  CREATE OR REPLACE FUNCTION public.list_job_card_summary_claim_page(
    p_page_size integer DEFAULT 20,
    p_cursor_warranty_age_days integer DEFAULT NULL,
    p_cursor_job_card_id uuid DEFAULT NULL,
    p_include_hidden boolean DEFAULT false
  )
  RETURNS TABLE (
    job_card_id uuid,
    jc_number text,
    reg_number text,
    vin text,
    model text,
    colour text,
    warranty_age_days integer,
    has_ppt_pre boolean,
    has_ppt_post boolean,
    has_excel_estimate boolean,
    gdc_status text,
    claim_hidden boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO public
  AS $$
    WITH params AS (
      SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
    )
    SELECT
      v.job_card_id,
      v.jc_number,
      v.reg_number,
      v.vin,
      v.model,
      v.colour,
      v.warranty_age_days,
      v.has_ppt_pre,
      v.has_ppt_post,
      v.has_excel_estimate,
      v.gdc_status,
      v.claim_hidden
    FROM public.job_card_summary v
    CROSS JOIN params
    WHERE v.status IN ('submitted', 'completed')
      AND (p_include_hidden OR coalesce(v.claim_hidden, false) = false)
      AND (
        p_cursor_warranty_age_days IS NULL
        OR p_cursor_job_card_id IS NULL
        OR (coalesce(v.warranty_age_days, -1), v.job_card_id) < (p_cursor_warranty_age_days, p_cursor_job_card_id)
      )
    ORDER BY coalesce(v.warranty_age_days, -1) DESC, v.job_card_id DESC
    LIMIT (SELECT page_size FROM params);
  $$;

  CREATE OR REPLACE FUNCTION public.list_job_card_summaries_page(
    p_page_size integer DEFAULT 20,
    p_cursor_jc_created_at timestamptz DEFAULT NULL,
    p_cursor_job_card_id uuid DEFAULT NULL
  )
  RETURNS SETOF public.job_card_summary
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO public
  AS $$
    WITH params AS (
      SELECT least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size
    )
    SELECT v.*
    FROM public.job_card_summary v
    CROSS JOIN params
    WHERE (
        p_cursor_jc_created_at IS NULL
        OR p_cursor_job_card_id IS NULL
        OR (coalesce(v.jc_created_at, v.complaint_date::timestamptz, 'epoch'::timestamptz), v.job_card_id)
          < (p_cursor_jc_created_at, p_cursor_job_card_id)
      )
    ORDER BY coalesce(v.jc_created_at, v.complaint_date::timestamptz, 'epoch'::timestamptz) DESC NULLS LAST,
            v.job_card_id DESC
    LIMIT (SELECT page_size FROM params);
  $$;

  GRANT EXECUTE ON FUNCTION public.list_bodyshop_repair_cards_page(integer, timestamptz, integer, text, text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.list_bodyshop_assignments_active_page(integer, timestamptz, bigint) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.list_bodyshop_floor_support_active_page(integer, timestamptz, bigint) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.list_service_bookings_driver_page(integer, date, bigint) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.list_job_card_summary_claim_page(integer, integer, uuid, boolean) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.list_job_card_summaries_page(integer, timestamptz, uuid) TO authenticated;
