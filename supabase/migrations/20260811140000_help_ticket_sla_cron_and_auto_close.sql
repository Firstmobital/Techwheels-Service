-- HELP-001 Phase 5: SLA breach detection (pause-aware) + auto-close unverified resolutions
-- Dealer-agnostic: no my_dealer_code() / raiser_dealer_code ACL filters.

-- ── Breach tracking columns (idempotent notifications) ──────────────────────
ALTER TABLE public.help_tickets
  ADD COLUMN IF NOT EXISTS sla_response_breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_breached_at timestamptz;

COMMENT ON COLUMN public.help_tickets.sla_response_breached_at IS
  'Set once when response SLA is breached (first support reply overdue).';
COMMENT ON COLUMN public.help_tickets.sla_resolution_breached_at IS
  'Set once when resolution SLA is breached (ticket still open past target).';

CREATE INDEX IF NOT EXISTS idx_help_tickets_sla_response
  ON public.help_tickets (sla_response_at)
  WHERE status <> 'closed'
    AND first_response_at IS NULL
    AND sla_response_at IS NOT NULL
    AND sla_response_breached_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_help_tickets_auto_close
  ON public.help_tickets (resolved_at)
  WHERE status IN ('resolved', 'cannot_reproduce')
    AND verification_status = 'pending'
    AND resolved_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- check_help_ticket_sla_breaches — pause-aware; notifies support holders
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_help_ticket_sla_breaches(
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_response_count integer := 0;
  v_resolution_count integer := 0;
  r record;
  v_payload jsonb;
BEGIN
  -- Response SLA: no first support reply yet; not paused; still open work
  FOR r IN
    SELECT t.id, t.ticket_number, t.sla_response_at, t.status, t.priority
    FROM public.help_tickets t
    WHERE t.status NOT IN ('closed', 'resolved', 'cannot_reproduce')
      AND COALESCE(t.sla_paused, false) = false
      AND t.status NOT IN ('on_hold', 'waiting_raiser')
      AND t.first_response_at IS NULL
      AND t.sla_response_at IS NOT NULL
      AND t.sla_response_at < now()
      AND t.sla_response_breached_at IS NULL
    ORDER BY t.sla_response_at ASC
    LIMIT v_limit
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    UPDATE public.help_tickets SET
      sla_response_breached_at = now(),
      tags = CASE
        WHEN 'sla_breached' = ANY(tags) THEN tags
        ELSE array_append(tags, 'sla_breached')
      END,
      updated_at = now()
    WHERE id = r.id;

    PERFORM public.help_ticket_write_audit(
      r.id,
      'sla_breached',
      NULL,
      'response',
      'Response SLA breached',
      NULL,
      NULL,
      'system'
    );

    v_payload := jsonb_build_object(
      'ticket_number', r.ticket_number,
      'breach_type', 'response',
      'sla_at', r.sla_response_at,
      'status', r.status,
      'priority', r.priority
    );
    PERFORM public.help_ticket_notify_support_holders(r.id, 'sla_breached', v_payload);

    v_response_count := v_response_count + 1;
  END LOOP;

  -- Resolution SLA: still not resolved/closed; not paused
  FOR r IN
    SELECT t.id, t.ticket_number, t.sla_resolution_at, t.status, t.priority
    FROM public.help_tickets t
    WHERE t.status NOT IN ('closed', 'resolved', 'cannot_reproduce')
      AND COALESCE(t.sla_paused, false) = false
      AND t.status NOT IN ('on_hold', 'waiting_raiser')
      AND t.sla_resolution_at IS NOT NULL
      AND t.sla_resolution_at < now()
      AND t.sla_resolution_breached_at IS NULL
    ORDER BY t.sla_resolution_at ASC
    LIMIT v_limit
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    UPDATE public.help_tickets SET
      sla_resolution_breached_at = now(),
      tags = CASE
        WHEN 'sla_breached' = ANY(tags) THEN tags
        ELSE array_append(tags, 'sla_breached')
      END,
      updated_at = now()
    WHERE id = r.id;

    PERFORM public.help_ticket_write_audit(
      r.id,
      'sla_breached',
      NULL,
      'resolution',
      'Resolution SLA breached',
      NULL,
      NULL,
      'system'
    );

    v_payload := jsonb_build_object(
      'ticket_number', r.ticket_number,
      'breach_type', 'resolution',
      'sla_at', r.sla_resolution_at,
      'status', r.status,
      'priority', r.priority
    );
    PERFORM public.help_ticket_notify_support_holders(r.id, 'sla_breached', v_payload);

    v_resolution_count := v_resolution_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'response_breaches', v_response_count,
    'resolution_breaches', v_resolution_count,
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.check_help_ticket_sla_breaches(integer) IS
  'HELP-001 Phase 5: marks pause-aware SLA breaches, audits, and notifies support holders (cron).';

-- ═══════════════════════════════════════════════════════════════════════════
-- auto_close_unverified_help_tickets — 7-day grace after resolve
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_close_unverified_help_tickets(
  p_limit integer DEFAULT 200,
  p_grace_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_grace integer := GREATEST(1, COALESCE(p_grace_days, 7));
  v_closed_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT t.id, t.ticket_number, t.raised_by_user_id, t.status, t.resolved_at
    FROM public.help_tickets t
    WHERE t.status IN ('resolved', 'cannot_reproduce')
      AND t.verification_status = 'pending'
      AND t.resolved_at IS NOT NULL
      AND t.resolved_at < (now() - make_interval(days => v_grace))
    ORDER BY t.resolved_at ASC
    LIMIT v_limit
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    UPDATE public.help_tickets SET
      status = 'closed',
      verification_status = 'auto_closed',
      closed_at = now(),
      closure_reason = COALESCE(closure_reason, 'auto_closed_unverified'),
      updated_at = now()
    WHERE id = r.id;

    PERFORM public.help_ticket_write_audit(
      r.id,
      'closed',
      r.status,
      'closed',
      format('Auto-closed after %s days without raiser verification', v_grace),
      NULL,
      NULL,
      'system'
    );

    PERFORM public.help_ticket_emit_notification(
      r.id,
      'closed',
      'raiser',
      r.raised_by_user_id,
      jsonb_build_object(
        'ticket_number', r.ticket_number,
        'reason', 'auto_closed_unverified',
        'grace_days', v_grace
      )
    );
    PERFORM public.help_ticket_notify_support_holders(
      r.id,
      'closed',
      jsonb_build_object(
        'ticket_number', r.ticket_number,
        'reason', 'auto_closed_unverified',
        'grace_days', v_grace
      )
    );

    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'closed_count', v_closed_count,
    'grace_days', v_grace,
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) IS
  'HELP-001 Phase 5: closes resolved/cannot_reproduce tickets after grace days without verification.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Wrapper for pg_cron
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.run_help_ticket_sla_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sla jsonb;
  v_close jsonb;
BEGIN
  v_sla := public.check_help_ticket_sla_breaches(200);
  v_close := public.auto_close_unverified_help_tickets(200, 7);
  RETURN jsonb_build_object(
    'ok', true,
    'sla', v_sla,
    'auto_close', v_close,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.run_help_ticket_sla_jobs() IS
  'HELP-001 Phase 5 pg_cron entrypoint: SLA breach check + auto-close unverified tickets.';

REVOKE ALL ON FUNCTION public.check_help_ticket_sla_breaches(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_help_ticket_sla_jobs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_help_ticket_sla_breaches(integer) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.auto_close_unverified_help_tickets(integer, integer) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.run_help_ticket_sla_jobs() TO postgres, service_role;

-- Schedule every 15 minutes (idempotent by job name / command match)
DO $cron$
DECLARE
  v_new_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping help-ticket-sla-jobs schedule';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job j
    WHERE j.jobname = 'help-ticket-sla-jobs'
       OR j.command ILIKE '%run_help_ticket_sla_jobs%'
  ) THEN
    RAISE NOTICE 'help-ticket-sla-jobs cron already registered';
    RETURN;
  END IF;

  SELECT cron.schedule(
    'help-ticket-sla-jobs',
    '*/15 * * * *',
    $cmd$SELECT public.run_help_ticket_sla_jobs();$cmd$
  )
  INTO v_new_job_id;

  RAISE NOTICE 'Scheduled help-ticket-sla-jobs (jobid %)', v_new_job_id;
END;
$cron$;
