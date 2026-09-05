-- DBL-0040: Safe payroll month unlock (advance reversal) + Payroll Security Code gate.
--
-- Stage 1: payroll_unlock_month reverts applied schedules and recovered_amount
-- before flipping payroll_months to draft. payroll_entries are not rewritten.
-- payroll_months status writes are RPC-only. Adjustment inserts are month-gated.
--
-- Stage 2: hashed security code (pgcrypto), short-lived grants, RLS grant check
-- for non-admin payroll writes. Unlock requires a fresh code for every caller,
-- including admin. Do not seed a plaintext code in this file.
--
-- Operator after apply (SQL editor, as an admin session or via payroll_set_security_code):
--   SELECT public.payroll_set_security_code('<operator-chosen-code>');
-- Rotate the same way. Never commit the plaintext.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.payroll_unlock_month(date, text, text, text);
--   -- restore prior payroll_unlock_month(date, text, text) from 20260903120000
--   DROP FUNCTION IF EXISTS public.payroll_verify_security_code(text);
--   DROP FUNCTION IF EXISTS public.payroll_set_security_code(text);
--   DROP FUNCTION IF EXISTS public.payroll_security_grant_status();
--   DROP FUNCTION IF EXISTS public.payroll_assert_security_code(text);
--   DROP FUNCTION IF EXISTS public.payroll_can_mutate_payroll();
--   DROP FUNCTION IF EXISTS public.payroll_has_security_grant();
--   DROP TABLE IF EXISTS public.payroll_security_attempt_state;
--   DROP TABLE IF EXISTS public.payroll_security_grants;
--   DROP TABLE IF EXISTS public.payroll_security_settings;
--   -- restore prior payroll_months_modify / payroll_*_modify / payroll_finalize_month

-- ── Stage 2 storage (created first so unlock can call assert) ──

CREATE TABLE public.payroll_security_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  security_code_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.payroll_security_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE public.payroll_security_attempt_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fail_count integer NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  locked_until timestamptz
);

ALTER TABLE public.payroll_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_security_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_security_attempt_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payroll_security_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payroll_security_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payroll_security_attempt_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payroll_security_settings TO service_role;
GRANT ALL ON TABLE public.payroll_security_grants TO service_role;
GRANT ALL ON TABLE public.payroll_security_attempt_state TO service_role;

CREATE OR REPLACE FUNCTION public.payroll_has_security_grant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payroll_security_grants g
    WHERE g.user_id = auth.uid()
      AND g.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.payroll_can_mutate_payroll()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR (
      public.has_module_modify('payroll')
      AND public.payroll_has_security_grant()
    );
$$;

CREATE OR REPLACE FUNCTION public.payroll_assert_security_code(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_locked_until timestamptz;
  v_fail_count integer := 0;
  v_match boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT s.locked_until, s.fail_count
    INTO v_locked_until, v_fail_count
  FROM public.payroll_security_attempt_state s
  WHERE s.user_id = v_uid;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'Incorrect security code.';
  END IF;

  SELECT security_code_hash INTO v_hash
  FROM public.payroll_security_settings
  WHERE id = 1;

  IF v_hash IS NOT NULL
     AND trim(coalesce(p_code, '')) <> ''
     AND v_hash = extensions.crypt(p_code, v_hash) THEN
    v_match := true;
  END IF;

  IF NOT v_match THEN
    INSERT INTO public.payroll_security_attempt_state (user_id, fail_count, locked_until)
    VALUES (
      v_uid,
      1,
      CASE WHEN 1 >= 5 THEN now() + interval '5 minutes' ELSE NULL END
    )
    ON CONFLICT (user_id) DO UPDATE
    SET fail_count = public.payroll_security_attempt_state.fail_count + 1,
        locked_until = CASE
          WHEN public.payroll_security_attempt_state.fail_count + 1 >= 5
            THEN now() + interval '5 minutes'
          ELSE public.payroll_security_attempt_state.locked_until
        END;

    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, details)
    VALUES (
      v_uid,
      'payroll_security_code_failed',
      'payroll_security',
      NULL,
      jsonb_build_object('at', now())
    );

    RAISE EXCEPTION 'Incorrect security code.';
  END IF;

  INSERT INTO public.payroll_security_attempt_state (user_id, fail_count, locked_until)
  VALUES (v_uid, 0, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET fail_count = 0, locked_until = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_verify_security_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expires timestamptz := now() + interval '30 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (public.is_admin() OR public.has_module_modify('payroll')) THEN
    RAISE EXCEPTION 'Unauthorized: payroll security verification requires modify permission';
  END IF;

  PERFORM public.payroll_assert_security_code(p_code);

  INSERT INTO public.payroll_security_grants (user_id, issued_at, expires_at)
  VALUES (v_uid, now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE
  SET issued_at = now(), expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_security_grant_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_expires timestamptz;
BEGIN
  SELECT g.expires_at INTO v_expires
  FROM public.payroll_security_grants g
  WHERE g.user_id = auth.uid()
    AND g.expires_at > now();

  RETURN jsonb_build_object(
    'active', v_expires IS NOT NULL,
    'expires_at', v_expires
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_set_security_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: setting the payroll security code requires admin';
  END IF;

  IF trim(coalesce(p_code, '')) = '' THEN
    RAISE EXCEPTION 'Security code is required';
  END IF;

  INSERT INTO public.payroll_security_settings (id, security_code_hash, updated_at, updated_by)
  VALUES (1, extensions.crypt(p_code, extensions.gen_salt('bf')), now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
  SET security_code_hash = EXCLUDED.security_code_hash,
      updated_at = now(),
      updated_by = auth.uid();

  RETURN jsonb_build_object('ok', true, 'updated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_has_security_grant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_can_mutate_payroll() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_assert_security_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_verify_security_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_security_grant_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_set_security_code(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.payroll_has_security_grant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_can_mutate_payroll() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_verify_security_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_security_grant_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_set_security_code(text) TO authenticated, service_role;
-- Internal only. Nested calls from SECURITY DEFINER unlock/verify run as the owner.
GRANT EXECUTE ON FUNCTION public.payroll_assert_security_code(text) TO service_role;

-- ── Stage 1 + 2: unlock (advance reversal + fresh code, including admin) ──

DROP FUNCTION IF EXISTS public.payroll_unlock_month(date, text, text);

CREATE OR REPLACE FUNCTION public.payroll_unlock_month(
  p_month date,
  p_reason text,
  p_security_code text,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
  v_uid uuid := auth.uid();
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF NOT (public.is_admin() OR public.has_module_delete('payroll')) THEN
    RAISE EXCEPTION 'Unauthorized: payroll unlock requires delete permission';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Unlock reason is required';
  END IF;

  -- Fresh code for every caller, including admin. Does not issue a draft-edit grant.
  PERFORM public.payroll_assert_security_code(p_security_code);

  IF NOT public.payroll_is_month_finalized(v_month) THEN
    RAISE EXCEPTION 'Payroll month % is not finalized', v_month;
  END IF;

  UPDATE public.payroll_advance_schedules
  SET status = 'pending',
      applied_amount = 0,
      updated_at = now()
  WHERE payroll_month = v_month
    AND status = 'applied';

  UPDATE public.payroll_advances pa
  SET recovered_amount = COALESCE(sub.total_applied, 0),
      status = CASE
        WHEN pa.status = 'cancelled' THEN pa.status
        WHEN COALESCE(sub.total_applied, 0) >= pa.original_amount THEN 'closed'
        WHEN pa.status = 'closed' AND COALESCE(sub.total_applied, 0) < pa.original_amount THEN 'active'
        ELSE pa.status
      END,
      updated_at = now()
  FROM (
    SELECT pas.advance_id,
           COALESCE(sum(pas.applied_amount) FILTER (WHERE pas.status = 'applied'), 0) AS total_applied
    FROM public.payroll_advance_schedules pas
    WHERE pas.advance_id IN (
      SELECT s2.advance_id
      FROM public.payroll_advance_schedules s2
      WHERE s2.payroll_month = v_month
    )
    GROUP BY pas.advance_id
  ) sub
  WHERE pa.id = sub.advance_id;

  UPDATE public.payroll_months
  SET status = 'draft',
      unlock_reason = v_reason,
      unlocked_at = now(),
      unlocked_by = p_actor,
      updated_at = now()
  WHERE payroll_month = v_month
    AND status = 'finalized';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll month % is not finalized', v_month;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, details)
  VALUES (
    v_uid,
    'payroll_month_unlocked',
    'payroll_month',
    v_month::text,
    jsonb_build_object(
      'payroll_month', v_month,
      'reason', v_reason,
      'actor', p_actor,
      'previous_status', 'finalized',
      'resulting_status', 'draft'
    )
  );

  RETURN jsonb_build_object('payroll_month', v_month, 'status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_unlock_month(date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_unlock_month(date, text, text, text) TO authenticated, service_role;

-- ── Finalize: non-admin must hold a draft security grant ──

CREATE OR REPLACE FUNCTION public.payroll_finalize_month(
  p_month date,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('payroll')) THEN
    RAISE EXCEPTION 'Unauthorized: payroll finalize requires modify permission';
  END IF;

  IF NOT public.is_admin() AND NOT public.payroll_has_security_grant() THEN
    RAISE EXCEPTION 'Unauthorized: payroll finalize requires security verification';
  END IF;

  IF public.payroll_is_month_finalized(v_month) THEN
    RAISE EXCEPTION 'Payroll month % is already finalized', v_month;
  END IF;

  INSERT INTO payroll_months (payroll_month, status, finalized_at, finalized_by, updated_at)
  VALUES (v_month, 'finalized', now(), p_actor, now())
  ON CONFLICT (payroll_month) DO UPDATE
  SET status = 'finalized', finalized_at = now(), finalized_by = p_actor,
      unlock_reason = NULL, unlocked_at = NULL, unlocked_by = NULL, updated_at = now();

  UPDATE payroll_advance_schedules pas
  SET applied_amount = pas.scheduled_amount, status = 'applied', updated_at = now()
  FROM payroll_entries pe
  WHERE pas.payroll_month = v_month
    AND pas.status = 'pending'
    AND pas.scheduled_amount > 0
    AND EXISTS (
      SELECT 1 FROM payroll_advances pa
      WHERE pa.id = pas.advance_id
        AND upper(trim(pa.employee_code)) = upper(trim(pe.employee_code))
        AND pe.payroll_month = v_month
        AND pe.advance_deduction >= pas.scheduled_amount
    );

  UPDATE payroll_advances pa
  SET recovered_amount = sub.total_applied,
      status = CASE WHEN sub.total_applied >= pa.original_amount THEN 'closed' ELSE pa.status END,
      updated_at = now()
  FROM (
    SELECT advance_id, sum(applied_amount) AS total_applied
    FROM payroll_advance_schedules
    WHERE status = 'applied'
    GROUP BY advance_id
  ) sub
  WHERE pa.id = sub.advance_id;

  RETURN jsonb_build_object('payroll_month', v_month, 'status', 'finalized');
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_finalize_month(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_finalize_month(date, text) TO authenticated, service_role;

-- ── RLS: month status RPC-only; non-admin writes need a grant ──

DROP POLICY IF EXISTS payroll_months_modify ON public.payroll_months;

DROP POLICY IF EXISTS payroll_compensation_modify ON public.payroll_compensation;
CREATE POLICY payroll_compensation_modify ON public.payroll_compensation
  FOR ALL TO authenticated
  USING (public.payroll_can_mutate_payroll())
  WITH CHECK (public.payroll_can_mutate_payroll());

DROP POLICY IF EXISTS payroll_attendance_modify ON public.payroll_attendance;
CREATE POLICY payroll_attendance_modify ON public.payroll_attendance
  FOR ALL TO authenticated
  USING (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

DROP POLICY IF EXISTS payroll_advances_modify ON public.payroll_advances;
CREATE POLICY payroll_advances_modify ON public.payroll_advances
  FOR ALL TO authenticated
  USING (public.payroll_can_mutate_payroll())
  WITH CHECK (public.payroll_can_mutate_payroll());

DROP POLICY IF EXISTS payroll_advance_schedules_modify ON public.payroll_advance_schedules;
CREATE POLICY payroll_advance_schedules_modify ON public.payroll_advance_schedules
  FOR ALL TO authenticated
  USING (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

DROP POLICY IF EXISTS payroll_entries_modify ON public.payroll_entries;
CREATE POLICY payroll_entries_modify ON public.payroll_entries
  FOR ALL TO authenticated
  USING (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  )
  WITH CHECK (
    public.payroll_can_mutate_payroll()
    AND NOT public.payroll_is_month_finalized(payroll_month)
  );

DROP POLICY IF EXISTS payroll_adjustments_modify ON public.payroll_adjustments;
CREATE POLICY payroll_adjustments_modify ON public.payroll_adjustments
  FOR ALL TO authenticated
  USING (
    public.payroll_can_mutate_payroll()
    AND EXISTS (
      SELECT 1
      FROM public.payroll_entries pe
      WHERE pe.id = payroll_entry_id
        AND NOT public.payroll_is_month_finalized(pe.payroll_month)
    )
  )
  WITH CHECK (
    public.payroll_can_mutate_payroll()
    AND EXISTS (
      SELECT 1
      FROM public.payroll_entries pe
      WHERE pe.id = payroll_entry_id
        AND NOT public.payroll_is_month_finalized(pe.payroll_month)
    )
  );
