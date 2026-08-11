-- HELP-001 Phase 1: Employee Help Tickets schema + module registration.
-- Dealer-agnostic: raiser_dealer_code is optional snapshot only (not ACL).
-- Authority: docs/Implementation_plans/webversion/categories/help-tickets/active/HELP-001_COMPREHENSIVE_PLAN.md

CREATE SEQUENCE IF NOT EXISTS public.help_ticket_number_seq START WITH 1 INCREMENT BY 1;

-- ── Categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.help_ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  default_priority text NOT NULL DEFAULT 'normal'
    CHECK (default_priority = ANY (ARRAY['low','normal','high','urgent'])),
  sla_response_minutes integer NOT NULL DEFAULT 240,
  sla_resolution_minutes integer NOT NULL DEFAULT 1440,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.help_ticket_categories
  (key, label, description, sla_response_minutes, sla_resolution_minutes)
VALUES
  ('technical', 'Technical Issues', 'App crashes, bugs, performance', 120, 480),
  ('web_app', 'Web App', 'Web platform issues', 120, 480),
  ('mobile_app', 'Mobile App', 'iOS/Android specific issues', 120, 480),
  ('reception_ops', 'Reception Ops', 'Reception / intake workflow issues', 240, 1440),
  ('parts_stock', 'Parts & Stock', 'Parts stock / inventory discrepancies', 240, 1440),
  ('bodyshop_ops', 'Bodyshop Ops', 'Bodyshop floor / tracker issues', 240, 1440),
  ('hr_admin', 'HR & Admin', 'Access, policies, onboarding', 480, 2880),
  ('billing', 'Billing & Payments', 'Invoice / payment issues', 240, 720),
  ('other', 'Other', 'Miscellaneous', 480, 2880)
ON CONFLICT (key) DO NOTHING;

-- ── Tickets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.help_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,

  -- Optional snapshot at raise time for display/reporting ONLY. Not an ACL predicate.
  raiser_dealer_code text,

  raised_by_user_id uuid NOT NULL REFERENCES public.users(id),
  raised_by_employee_code text NOT NULL,
  raised_by_name text NOT NULL,
  raised_by_email text,
  raised_by_department text,

  category_id uuid NOT NULL REFERENCES public.help_ticket_categories(id),
  category_key text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,

  status text NOT NULL DEFAULT 'new'
    CHECK (status = ANY (ARRAY[
      'new','open','in_progress','waiting_raiser','on_hold','escalated',
      'resolved','cannot_reproduce','closed','reopened'
    ])),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority = ANY (ARRAY['low','normal','high','urgent'])),
  severity text NOT NULL DEFAULT 'minor'
    CHECK (severity = ANY (ARRAY['cosmetic','minor','major','critical'])),

  assigned_to_employee_code text,
  assigned_to_name text,
  assigned_at timestamptz,
  assigned_by_employee_code text,

  due_date timestamptz,
  sla_response_target_minutes integer,
  sla_resolution_target_minutes integer,
  sla_response_at timestamptz,
  sla_resolution_at timestamptz,
  sla_paused boolean NOT NULL DEFAULT false,

  first_response_at timestamptz,
  resolved_at timestamptz,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status = ANY (ARRAY['pending','verified','rejected','auto_closed'])),
  verified_at timestamptz,
  verified_by_employee_code text,

  closed_at timestamptz,
  closure_reason text,

  is_escalated boolean NOT NULL DEFAULT false,
  escalated_to_employee_code text,
  escalated_at timestamptz,
  escalation_reason text,

  hold_reason text,
  hold_reason_detail text,
  held_at timestamptz,

  reopen_count integer NOT NULL DEFAULT 0,
  last_reopened_at timestamptz,
  last_reopened_by_employee_code text,

  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of_ticket_id uuid REFERENCES public.help_tickets(id),

  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  internal_notes text,
  resolution_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_help_tickets_status
  ON public.help_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_tickets_raiser
  ON public.help_tickets (raised_by_employee_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_tickets_assignee
  ON public.help_tickets (assigned_to_employee_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_help_tickets_raiser_dealer
  ON public.help_tickets (raiser_dealer_code, status, created_at DESC)
  WHERE raiser_dealer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_help_tickets_sla
  ON public.help_tickets (sla_resolution_at)
  WHERE status <> 'closed' AND sla_resolution_at IS NOT NULL;

COMMENT ON COLUMN public.help_tickets.raiser_dealer_code IS
  'Optional snapshot of raiser dealer at create time for display/reporting. Not an ACL or visibility predicate.';

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.help_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.help_tickets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,

  created_by_user_id uuid NOT NULL REFERENCES public.users(id),
  created_by_employee_code text NOT NULL,
  created_by_name text NOT NULL,
  created_by_role text,

  message_text text NOT NULL,
  message_type text NOT NULL DEFAULT 'user_comment'
    CHECK (message_type = ANY (ARRAY[
      'user_comment','internal_note','status_change','assignment_change',
      'priority_change','attachment','resolution_update','system'
    ])),
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility = ANY (ARRAY['public','internal'])),

  parent_message_id uuid REFERENCES public.help_ticket_messages(id),
  sequence_number bigint NOT NULL,
  UNIQUE (ticket_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_help_ticket_messages_ticket
  ON public.help_ticket_messages (ticket_id, sequence_number ASC);

-- ── Attachments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.help_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.help_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.help_ticket_messages(id) ON DELETE SET NULL,

  uploaded_by_user_id uuid NOT NULL REFERENCES public.users(id),
  uploaded_by_employee_code text NOT NULL,
  uploaded_by_name text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  original_filename text NOT NULL,
  file_size_bytes integer NOT NULL,
  file_type text,

  drive_url text,
  drive_file_id text,
  thumbnail_url text,
  storage_staging_path text,

  status text NOT NULL DEFAULT 'uploading'
    CHECK (status = ANY (ARRAY['uploading','uploaded','upload_failed'])),
  error_message text,

  download_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_help_ticket_attachments_ticket
  ON public.help_ticket_attachments (ticket_id);

-- ── Audit ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.help_ticket_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.help_tickets(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  changed_by_user_id uuid,
  changed_by_employee_code text,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_value text,
  new_value text,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_help_ticket_audit_log_ticket
  ON public.help_ticket_audit_log (ticket_id, changed_at DESC);

-- ── Notifications (no dealer_code — module-right based) ─────────────────────
CREATE TABLE IF NOT EXISTS public.help_ticket_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.help_tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type = ANY (ARRAY[
      'raised','assigned','status_changed','message_added','resolved',
      'reopened','closed','escalated','held','sla_breached'
    ])),
  recipient_type text NOT NULL
    CHECK (recipient_type = ANY (ARRAY['raiser','assignee','support','admin'])),
  recipient_user_id uuid,
  channel text NOT NULL DEFAULT 'in_app'
    CHECK (channel = ANY (ARRAY['in_app','email'])),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','sent','failed','skipped'])),
  payload jsonb,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_help_ticket_notifications_recipient
  ON public.help_ticket_notifications (recipient_user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

-- ── Module registration ─────────────────────────────────────────────────────
INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'help_tickets',
  'Help Tickets',
  'Employee support ticket inbox for IT/ops support staff.',
  'help-circle',
  '/help-tickets',
  28,
  true
)
ON CONFLICT (name) DO NOTHING;

-- ── RLS: RPC-only posture for authenticated (no direct DML/select policies) ─
ALTER TABLE public.help_ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_ticket_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_ticket_notifications ENABLE ROW LEVEL SECURITY;

-- Explicit deny of direct table access for authenticated/anon.
-- SECURITY DEFINER RPCs (table owner) bypass RLS for authorized operations.
REVOKE ALL ON TABLE public.help_ticket_categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.help_tickets FROM anon, authenticated;
REVOKE ALL ON TABLE public.help_ticket_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.help_ticket_attachments FROM anon, authenticated;
REVOKE ALL ON TABLE public.help_ticket_audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.help_ticket_notifications FROM anon, authenticated;

GRANT ALL ON TABLE public.help_ticket_categories TO service_role;
GRANT ALL ON TABLE public.help_tickets TO service_role;
GRANT ALL ON TABLE public.help_ticket_messages TO service_role;
GRANT ALL ON TABLE public.help_ticket_attachments TO service_role;
GRANT ALL ON TABLE public.help_ticket_audit_log TO service_role;
GRANT ALL ON TABLE public.help_ticket_notifications TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.help_ticket_number_seq TO service_role;
