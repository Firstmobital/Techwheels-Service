-- Plan: SUPABASE-002 Fuel Card RPC Contract
-- Purpose: Provide minimal-backend RPCs for queue fetch and resolve workflow.

BEGIN;

-- Centralized access check for Fuel RPCs.
-- Allows: admin users, service_role callers, and SQL editor postgres sessions.
CREATE OR REPLACE FUNCTION public.can_manage_fuel_rules()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(public.is_admin(), false)
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR session_user = 'postgres';
$$;

COMMENT ON FUNCTION public.can_manage_fuel_rules()
IS 'Fuel RPC guard: true for admin users, service_role API callers, and postgres SQL-editor sessions.';

-- Queue endpoint contract: returns JSON payload shaped for the Fuel card.
CREATE OR REPLACE FUNCTION public.rpc_fuel_queue(
  p_limit integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_items jsonb;
  v_remaining_groups bigint;
BEGIN
  IF NOT public.can_manage_fuel_rules() THEN
    RAISE EXCEPTION 'admin role required'
      USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);

  WITH unknown_groups AS (
    SELECT
      btrim(a.product_line) AS product_line,
      COUNT(*)::bigint AS unknown_rows,
      MIN(a.model) FILTER (WHERE a.model IS NOT NULL AND btrim(a.model) <> '') AS sample_model,
      MIN(a.last_service_type) FILTER (WHERE a.last_service_type IS NOT NULL AND btrim(a.last_service_type) <> '') AS sample_last_service_type
    FROM public.all_service_data a
    WHERE a.powertrain_type = 'UNKNOWN'
      AND a.product_line IS NOT NULL
      AND btrim(a.product_line) <> ''
    GROUP BY btrim(a.product_line)
  ), top_groups AS (
    SELECT *
    FROM unknown_groups
    ORDER BY unknown_rows DESC, product_line ASC
    LIMIT v_limit
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_line', t.product_line,
        'unknown_rows', t.unknown_rows,
        'sample_model', t.sample_model,
        'sample_last_service_type', t.sample_last_service_type,
        'signals', jsonb_build_object(
          'contains_ev', upper(t.product_line) LIKE '%EV%',
          'contains_cng', upper(t.product_line) LIKE '%CNG%',
          'diesel_markers', jsonb_build_array(),
          'petrol_markers', jsonb_build_array()
        ),
        'existing_override', (
          SELECT jsonb_build_object(
            'id', o.id,
            'match_pattern', o.match_pattern,
            'powertrain_type', o.powertrain_type,
            'priority', o.priority,
            'is_active', o.is_active,
            'notes', o.notes,
            'updated_at', o.updated_at
          )
          FROM public.all_service_data_powertrain_overrides o
          WHERE o.is_active = true
            AND upper(btrim(o.match_pattern)) = upper(t.product_line)
          ORDER BY o.priority ASC, o.id ASC
          LIMIT 1
        ),
        'suggested_powertrain_type', NULL
      )
      ORDER BY t.unknown_rows DESC, t.product_line ASC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM top_groups t;

  SELECT COUNT(*)::bigint
  INTO v_remaining_groups
  FROM (
    SELECT btrim(a.product_line)
    FROM public.all_service_data a
    WHERE a.powertrain_type = 'UNKNOWN'
      AND a.product_line IS NOT NULL
      AND btrim(a.product_line) <> ''
    GROUP BY btrim(a.product_line)
  ) s;

  RETURN jsonb_build_object(
    'items', v_items,
    'limit', v_limit,
    'remaining_unknown_groups', v_remaining_groups,
    'as_of', now()
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_fuel_queue(integer)
IS 'Fuel card queue RPC. Admin-only. Returns top unknown product_line groups and queue metadata.';

-- Resolve endpoint contract: upsert override intent and recompute mapped rows, then return fresh queue.
CREATE OR REPLACE FUNCTION public.rpc_fuel_resolve(
  p_product_line text,
  p_powertrain_type text,
  p_priority integer DEFAULT 10,
  p_notes text DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_line text;
  v_powertrain_type text;
  v_priority integer;
  v_affected_rows bigint;
  v_queue jsonb;
BEGIN
  IF NOT public.can_manage_fuel_rules() THEN
    RAISE EXCEPTION 'admin role required'
      USING ERRCODE = '42501';
  END IF;

  v_product_line := btrim(COALESCE(p_product_line, ''));
  IF v_product_line = '' THEN
    RAISE EXCEPTION 'product_line is required'
      USING ERRCODE = '22023';
  END IF;

  v_powertrain_type := upper(btrim(COALESCE(p_powertrain_type, '')));
  IF v_powertrain_type NOT IN ('EV', 'CNG', 'DIESEL', 'PETROL') THEN
    RAISE EXCEPTION 'powertrain_type must be one of EV, CNG, DIESEL, PETROL'
      USING ERRCODE = '22023';
  END IF;

  v_priority := COALESCE(p_priority, 10);

  -- Keep rule history but ensure one active exact-match rule for this product_line.
  UPDATE public.all_service_data_powertrain_overrides o
  SET is_active = false,
      updated_at = now()
  WHERE upper(btrim(o.match_pattern)) = upper(v_product_line)
    AND o.is_active = true;

  INSERT INTO public.all_service_data_powertrain_overrides (
    match_pattern,
    powertrain_type,
    priority,
    is_active,
    notes,
    created_at,
    updated_at
  )
  VALUES (
    v_product_line,
    v_powertrain_type,
    v_priority,
    true,
    p_notes,
    now(),
    now()
  );

  UPDATE public.all_service_data a
  SET powertrain_type = public.calc_all_service_powertrain_type(a.product_line)
  WHERE btrim(a.product_line) = v_product_line
    AND a.powertrain_type IS DISTINCT FROM public.calc_all_service_powertrain_type(a.product_line);

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;

  v_queue := public.rpc_fuel_queue(p_limit);

  RETURN jsonb_build_object(
    'resolved', jsonb_build_object(
      'product_line', v_product_line,
      'powertrain_type', v_powertrain_type,
      'affected_rows', v_affected_rows
    ),
    'queue', v_queue
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_fuel_resolve(text, text, integer, text, integer)
IS 'Fuel card resolve RPC. Admin-only. Deactivates existing exact-match active rules, inserts selected rule, recomputes mapped rows, and returns refreshed queue.';

-- Optional admin list RPC for review screens.
CREATE OR REPLACE FUNCTION public.rpc_fuel_overrides(
  p_only_active boolean DEFAULT true,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  match_pattern text,
  powertrain_type text,
  priority integer,
  is_active boolean,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_manage_fuel_rules() THEN
    RAISE EXCEPTION 'admin role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.match_pattern,
    o.powertrain_type,
    o.priority,
    o.is_active,
    o.notes,
    o.created_at,
    o.updated_at
  FROM public.all_service_data_powertrain_overrides o
  WHERE (NOT p_only_active) OR o.is_active = true
  ORDER BY o.priority ASC, o.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

COMMENT ON FUNCTION public.rpc_fuel_overrides(boolean, integer, integer)
IS 'Fuel override listing RPC. Admin-only. Supports active-only and paginated admin review.';

-- RPC execute grants: frontend can call via supabase.rpc; admin gate enforced inside functions.
REVOKE ALL ON FUNCTION public.rpc_fuel_queue(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fuel_resolve(text, text, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fuel_overrides(boolean, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_fuel_rules() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_fuel_queue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fuel_resolve(text, text, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fuel_overrides(boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fuel_queue(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fuel_resolve(text, text, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fuel_overrides(boolean, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_fuel_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_fuel_rules() TO service_role;

COMMIT;
