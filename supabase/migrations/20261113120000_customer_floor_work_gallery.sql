-- Customer portal: floor work daily-log photos for the customer's bodyshop repair card.

CREATE OR REPLACE FUNCTION public.customer_floor_work_photo_allowed(
  p_session_token text,
  p_reg text,
  p_photo_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_card record;
  v_jc text;
BEGIN
  IF p_photo_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT b.id, upper(trim(coalesce(b.job_card_no, ''))) AS jc
  INTO v_card
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = p_reg
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF v_card.id IS NULL THEN
    RETURN false;
  END IF;

  v_jc := coalesce(v_card.jc, '');

  RETURN EXISTS (
    SELECT 1
    FROM public.bodyshop_floor_role_daily_log_photos p
    JOIN public.bodyshop_floor_role_daily_logs l ON l.id = p.log_id
    WHERE p.id = p_photo_id
      AND (
        l.repair_card_id = v_card.id
        OR (v_jc <> '' AND upper(trim(l.job_card_number)) = v_jc)
        OR public.customer_norm_reg(coalesce(p.reg_number, '')) = p_reg
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_list_floor_work_gallery(
  p_session_token text,
  p_reg_number text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_reg text;
  v_card record;
  v_jc text;
BEGIN
  PERFORM public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  SELECT b.id, b.job_card_no, b.reg_number, upper(trim(coalesce(b.job_card_no, ''))) AS jc
  INTO v_card
  FROM public.bodyshop_repair_cards b
  WHERE public.customer_norm_reg(b.reg_number) = v_reg
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF v_card.id IS NULL THEN
    RETURN jsonb_build_object(
      'repair_card_id', null,
      'job_card_no', null,
      'reg_number', null,
      'entries', '[]'::jsonb
    );
  END IF;

  v_jc := coalesce(v_card.jc, '');

  RETURN jsonb_build_object(
    'repair_card_id', v_card.id,
    'job_card_no', v_card.job_card_no,
    'reg_number', v_card.reg_number,
    'entries', COALESCE(
      (
        SELECT jsonb_agg(entry ORDER BY (entry->>'update_date') DESC NULLS LAST, (entry->>'log_id')::bigint DESC)
        FROM (
          SELECT jsonb_build_object(
            'log_id', l.id,
            'update_date', l.update_date,
            'floor_role', l.floor_role,
            'employee_code', l.employee_code,
            'employee_name', l.employee_name,
            'note_text', l.note_text,
            'is_support', l.is_support,
            'updated_at', l.updated_at,
            'photos', COALESCE(
              (
                SELECT jsonb_agg(photo_row ORDER BY (photo_row->>'sort_order')::int, (photo_row->>'photo_id')::bigint)
                FROM (
                  SELECT jsonb_build_object(
                    'photo_id', p.id,
                    'storage_bucket', coalesce(nullif(btrim(p.storage_bucket), ''), 'autodoc'),
                    'storage_path', p.storage_path,
                    'drive_url', nullif(btrim(coalesce(p.drive_url, '')), ''),
                    'drive_file_id', nullif(btrim(coalesce(p.drive_file_id, '')), ''),
                    'file_name', p.file_name,
                    'content_type', p.content_type,
                    'sort_order', p.sort_order,
                    'created_at', p.created_at
                  ) AS photo_row
                  FROM public.bodyshop_floor_role_daily_log_photos p
                  WHERE p.log_id = l.id
                ) photos_sub
              ),
              '[]'::jsonb
            )
          ) AS entry
          FROM public.bodyshop_floor_role_daily_logs l
          WHERE l.id IN (
            SELECT lg.id
            FROM public.bodyshop_floor_role_daily_logs lg
            WHERE lg.repair_card_id = v_card.id
               OR (v_jc <> '' AND upper(trim(lg.job_card_number)) = v_jc)
            UNION
            SELECT DISTINCT p.log_id
            FROM public.bodyshop_floor_role_daily_log_photos p
            WHERE public.customer_norm_reg(coalesce(p.reg_number, '')) = v_reg
          )
        ) entries_sub
        WHERE jsonb_array_length(coalesce(entries_sub.entry->'photos', '[]'::jsonb)) > 0
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_get_floor_work_photo(
  p_session_token text,
  p_reg_number text,
  p_photo_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
SET row_security TO off
AS $$
DECLARE
  v_reg text;
  v_doc jsonb;
BEGIN
  PERFORM public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  IF NOT public.customer_floor_work_photo_allowed(p_session_token, v_reg, p_photo_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'photo_id', p.id,
    'storage_bucket', coalesce(nullif(btrim(p.storage_bucket), ''), 'autodoc'),
    'storage_path', p.storage_path,
    'drive_url', nullif(btrim(coalesce(p.drive_url, '')), ''),
    'drive_file_id', nullif(btrim(coalesce(p.drive_file_id, '')), ''),
    'file_name', p.file_name,
    'content_type', p.content_type,
    'sort_order', p.sort_order,
    'created_at', p.created_at
  )
  INTO v_doc
  FROM public.bodyshop_floor_role_daily_log_photos p
  WHERE p.id = p_photo_id;

  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_floor_work_photo_allowed(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_floor_work_photo_allowed(text, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.customer_list_floor_work_gallery(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_list_floor_work_gallery(text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_get_floor_work_photo(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_get_floor_work_photo(text, text, bigint) TO anon, authenticated, service_role;
