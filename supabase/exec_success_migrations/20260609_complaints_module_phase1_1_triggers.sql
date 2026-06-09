-- ============================================================================
-- COMPLAINTS MODULE — PHASE 1.1: TRIGGER FUNCTIONS
-- ============================================================================
-- Created: 2026-06-09
-- Scope: Triggers for ticket lifecycle (numbering, assignment, SLA, history, touches)
-- Depends on: Phase 1 schema (tables must exist first)
-- ============================================================================

-- ============================================================================
-- 1. TRIGGER FUNCTION: trg_ct_ticket_number_fn
-- ============================================================================
-- Generate unique ticket number: CMP-<dealer>-<branch>-<fy>-<seq>
-- Pattern mirrors existing JC numbering scheme.

CREATE OR REPLACE FUNCTION public.trg_ct_ticket_number_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_dealer_abbr text;
  v_branch_code text;
  v_fiscal_year text;
  v_seq bigint;
BEGIN
  -- Extract dealer abbreviation (first 6 chars, typically FstMbl)
  v_dealer_abbr := SUBSTRING(NEW.dealer_code FROM 1 FOR 6);
  
  -- Extract branch code (3-char abbreviation, e.g., FQ7, or default to XX)
  v_branch_code := COALESCE(
    SUBSTRING(NEW.branch FROM 1 FOR 3),
    'XX'
  );
  
  -- Fiscal year (2626 format: 2026-27 → 2627)
  -- TODO: Replace with dynamic computation if fiscal year logic differs in your codebase
  v_fiscal_year := '2627';
  
  -- Get next sequence number for this dealer
  -- Increments per dealer; use MAX of existing + 1
  SELECT COALESCE(
    MAX(
      SUBSTRING(ticket_number FROM '([0-9]+)$')::bigint
    ),
    0
  ) + 1
  INTO v_seq
  FROM public.complaint_tickets
  WHERE dealer_code = NEW.dealer_code;
  
  -- Construct ticket number: CMP-FstMbl-FQ7-2627-000118
  NEW.ticket_number := FORMAT('CMP-%s-%s-%s-%06s',
    v_dealer_abbr, v_branch_code, v_fiscal_year, v_seq);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ct_ticket_number
BEFORE INSERT ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_ct_ticket_number_fn();

-- ============================================================================
-- 2. TRIGGER FUNCTION: trg_ct_autoassign_fn
-- ============================================================================
-- Copy sa_employee_code from reception entry.
-- Resolve assigned_to user ID from user_employee_links.

CREATE OR REPLACE FUNCTION public.trg_ct_autoassign_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sa_code text;
  v_assigned_user_id uuid;
BEGIN
  -- Get the SA employee code from the linked reception entry
  SELECT sa_employee_code INTO v_sa_code
  FROM public.service_reception_entries
  WHERE id = NEW.reception_entry_id;
  
  IF v_sa_code IS NOT NULL THEN
    NEW.sa_employee_code := v_sa_code;
    
    -- Resolve the user ID from user_employee_links
    -- Note: user_employee_links has NO deleted_at column (verified from schema audit)
    SELECT user_id INTO v_assigned_user_id
    FROM public.user_employee_links
    WHERE employee_code = v_sa_code
      AND is_primary = true
      AND is_active = true
      AND dealer_code = NEW.dealer_code
    LIMIT 1;
    
    NEW.assigned_to := v_assigned_user_id;  -- may be NULL if advisor not found
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ct_autoassign
BEFORE INSERT ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_ct_autoassign_fn();

-- ============================================================================
-- 3. TRIGGER FUNCTION: trg_ct_sla_fn
-- ============================================================================
-- Set response_due_at and resolution_due_at from complaint_sla_policies.
-- Fires on INSERT and on UPDATE of priority.

CREATE OR REPLACE FUNCTION public.trg_ct_sla_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_response_mins integer;
  v_resolution_mins integer;
BEGIN
  -- Fetch SLA targets for the ticket's dealer and priority
  SELECT response_mins, resolution_mins
  INTO v_response_mins, v_resolution_mins
  FROM public.complaint_sla_policies
  WHERE dealer_code = NEW.dealer_code
    AND priority = NEW.priority;
  
  IF v_response_mins IS NOT NULL THEN
    NEW.response_due_at := now() + (v_response_mins || ' minutes')::interval;
  END IF;
  
  IF v_resolution_mins IS NOT NULL THEN
    NEW.resolution_due_at := now() + (v_resolution_mins || ' minutes')::interval;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ct_sla
BEFORE INSERT ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_ct_sla_fn();

CREATE TRIGGER trg_ct_sla_on_priority_change
BEFORE UPDATE OF priority ON public.complaint_tickets
FOR EACH ROW
WHEN (OLD.priority IS DISTINCT FROM NEW.priority)
EXECUTE FUNCTION public.trg_ct_sla_fn();

-- ============================================================================
-- 4. TRIGGER FUNCTION: trg_ct_touch_fn
-- ============================================================================
-- Update updated_at timestamp on every modification.

CREATE OR REPLACE FUNCTION public.trg_ct_touch_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ct_touch
BEFORE UPDATE ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_ct_touch_fn();

-- ============================================================================
-- 5. TRIGGER FUNCTION: trg_ct_history_fn
-- ============================================================================
-- Write complaint_activity records on status/assignment/escalation changes.
-- Stamps milestone timestamps (first_response_at, resolved_at, closed_at, reopened_at).

CREATE OR REPLACE FUNCTION public.trg_ct_history_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- On status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.complaint_activity (
      dealer_code, complaint_id, event_type, from_value, to_value,
      actor_type, actor_id, actor_name
    ) VALUES (
      NEW.dealer_code,
      NEW.id,
      'status_change',
      OLD.status,
      NEW.status,
      'staff',
      auth.uid(),
      COALESCE(auth.jwt()->>'email', 'system')
    );
    
    -- Stamp milestone timestamps
    IF NEW.status = 'acknowledged' AND OLD.status IN ('new') THEN
      NEW.first_response_at := now();
    END IF;
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.status = 'closed' THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.status = 'reopened' THEN
      NEW.reopened_at := now();
    END IF;
  END IF;
  
  -- On assignment change
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.complaint_activity (
      dealer_code, complaint_id, event_type, from_value, to_value,
      actor_type, actor_id, actor_name
    ) VALUES (
      NEW.dealer_code,
      NEW.id,
      'assigned',
      OLD.assigned_to::text,
      NEW.assigned_to::text,
      'staff',
      auth.uid(),
      COALESCE(auth.jwt()->>'email', 'system')
    );
  END IF;
  
  -- On escalation change
  IF OLD.is_escalated IS DISTINCT FROM NEW.is_escalated THEN
    IF NEW.is_escalated = true THEN
      NEW.escalated_at := now();
      INSERT INTO public.complaint_activity (
        dealer_code, complaint_id, event_type, note,
        actor_type, actor_name
      ) VALUES (
        NEW.dealer_code,
        NEW.id,
        'escalated',
        NEW.escalation_reason,
        'staff',
        COALESCE(auth.jwt()->>'email', 'system')
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ct_history
AFTER UPDATE ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_ct_history_fn();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
