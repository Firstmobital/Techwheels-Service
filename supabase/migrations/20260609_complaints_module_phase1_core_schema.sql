-- ============================================================================
-- COMPLAINTS MODULE — PHASE 1: CORE SCHEMA & HELPERS
-- ============================================================================
-- Created: 2026-06-09
-- Scope: Table DDL, helper functions, module registration, basic RLS setup
-- Status: Ready for migration (collision-checked against authoritative dump)
-- ============================================================================

-- ============================================================================
-- 1. HELPER FUNCTION: my_employee_code()
-- ============================================================================
-- Returns the employee code (SA_CODE) of the calling user.
-- Single source: active user_employee_links record marked is_primary & is_active.
-- Note: employee_code = SA_CODE from CRM employee_master (immutable, per dump schema comment)

CREATE OR REPLACE FUNCTION public.my_employee_code()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT employee_code
  FROM public.user_employee_links
  WHERE user_id = auth.uid()
    AND is_primary = true
    AND is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.my_employee_code() IS
  'Returns the employee code (SA_CODE) of the calling user, from the active primary user_employee_links record.';

GRANT EXECUTE ON FUNCTION public.my_employee_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_employee_code() TO service_role;

-- ============================================================================
-- 2. TABLE: complaint_sla_policies
-- ============================================================================
-- Per-dealer SLA targets by priority. Seed data: urgent/high/medium/low.

CREATE TABLE public.complaint_sla_policies (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code     text NOT NULL DEFAULT public.my_dealer_code(),
    priority        text NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
    response_mins   integer NOT NULL,     -- minutes to first response (from raised)
    resolution_mins integer NOT NULL,    -- minutes to resolution (from raised)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (dealer_code, priority)
);

ALTER TABLE public.complaint_sla_policies ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_complaint_sla_policies_dealer_priority
  ON public.complaint_sla_policies (dealer_code, priority);

-- NOTE: Seed SLA defaults per dealer manually after migration
-- Example for FstMbl dealer:
-- INSERT INTO public.complaint_sla_policies (dealer_code, priority, response_mins, resolution_mins) VALUES
--   ('FstMbl', 'urgent', 60, 480),
--   ('FstMbl', 'high', 240, 1440),
--   ('FstMbl', 'medium', 480, 2880),
--   ('FstMbl', 'low', 1440, 5760)
-- ON CONFLICT (dealer_code, priority) DO NOTHING;

-- ============================================================================
-- 3. TABLE: complaint_tickets
-- ============================================================================
-- The complaint/ticket row. One per raised complaint.

CREATE TABLE public.complaint_tickets (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code          text NOT NULL DEFAULT public.my_dealer_code(),
    ticket_number        text NOT NULL,  -- CMP-<dealer>-<branch>-<fy>-<seq>
    reception_entry_id   bigint NOT NULL UNIQUE REFERENCES public.service_reception_entries(id),
    
    -- Denormalized snapshot (frozen at raise time, immutable for customer view & SLA)
    reg_number           text NOT NULL,  -- vehicle registration
    model                text,            -- vehicle model
    jc_number            text,            -- job card reference
    service_type         text,            -- e.g., 'Paid Service', 'Free Service'
    branch               text,            -- service branch
    customer_name        text,            -- from complaint raise or entry lookup
    customer_phone       text CHECK (customer_phone IS NULL OR customer_phone ~ '^[0-9]{10}$'),
    
    -- Classification & triage
    category             text NOT NULL CHECK (category IN (
                         'service_quality','billing','delivery_delay','staff_behaviour',
                         'parts_spares','damage_during_service','cleanliness','other')),
    title                text NOT NULL,   -- complaint subject
    description          text,            -- detailed description
    priority             text NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low','medium','high','urgent')),
    severity_self        text CHECK (severity_self IN ('low','medium','high')),
    status               text NOT NULL DEFAULT 'new' CHECK (status IN (
                         'new','acknowledged','in_progress','resolved','closed','reopened')),
    
    -- Assignment (advisor responsibility & manager override)
    sa_employee_code     text,            -- inherited from reception entry, immutable
    assigned_to          uuid REFERENCES public.users(id),
    
    -- Escalation (auto on SLA breach or customer reopen)
    is_escalated         boolean NOT NULL DEFAULT false,
    escalated_at         timestamptz,
    escalated_to         uuid REFERENCES public.users(id),
    escalation_reason    text,
    
    -- SLA tracking
    response_due_at      timestamptz,     -- computed from priority on insert/change
    resolution_due_at    timestamptz,     -- computed from priority on insert/change
    first_response_at    timestamptz,     -- stamped by trigger on first staff message
    resolved_at          timestamptz,     -- stamped when status→resolved
    closed_at            timestamptz,     -- stamped when status→closed
    reopened_at          timestamptz,     -- stamped when customer reopens
    response_breached    boolean NOT NULL DEFAULT false,  -- flagged by breach sweep
    resolution_breached  boolean NOT NULL DEFAULT false,  -- flagged by breach sweep
    
    -- CSAT (capture after resolved/closed)
    csat_rating          smallint CHECK (csat_rating BETWEEN 1 AND 5),
    csat_comment         text,
    csat_at              timestamptz,
    
    -- Meta
    channel              text NOT NULL DEFAULT 'web_link',
    created_by           text NOT NULL DEFAULT COALESCE(auth.jwt()->>'email', auth.uid()::text, 'system'),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE (dealer_code, ticket_number)
);

ALTER TABLE public.complaint_tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_complaint_tickets_entry   ON public.complaint_tickets (reception_entry_id);
CREATE INDEX ix_complaint_tickets_status  ON public.complaint_tickets (dealer_code, status);
CREATE INDEX ix_complaint_tickets_sa      ON public.complaint_tickets (dealer_code, sa_employee_code);
CREATE INDEX ix_complaint_tickets_branch  ON public.complaint_tickets (dealer_code, branch);
CREATE INDEX ix_complaint_tickets_assigned ON public.complaint_tickets (assigned_to);

-- ============================================================================
-- 4. TABLE: complaint_access_links
-- ============================================================================
-- One-time-use (for raise) customer link. Ties reception entry to complaint.

CREATE TABLE public.complaint_access_links (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code        text NOT NULL DEFAULT public.my_dealer_code(),
    reception_entry_id bigint NOT NULL UNIQUE REFERENCES public.service_reception_entries(id),
    token              text NOT NULL UNIQUE,  -- unguessable, url-safe token or sha256 hash
    status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','consumed','revoked')),
    complaint_id       bigint REFERENCES public.complaint_tickets(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    consumed_at        timestamptz,
    last_viewed_at     timestamptz,
    view_count         integer NOT NULL DEFAULT 0
);

ALTER TABLE public.complaint_access_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_complaint_access_links_token ON public.complaint_access_links (token);
CREATE INDEX ix_complaint_access_links_status ON public.complaint_access_links (status);

-- ============================================================================
-- 5. TABLE: complaint_messages
-- ============================================================================
-- Conversation thread: customer ↔ staff, plus internal notes (staff-only).

CREATE TABLE public.complaint_messages (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code   text NOT NULL DEFAULT public.my_dealer_code(),
    complaint_id  bigint NOT NULL REFERENCES public.complaint_tickets(id) ON DELETE CASCADE,
    author_type   text NOT NULL CHECK (author_type IN ('customer','staff','system')),
    author_id     uuid REFERENCES public.users(id),
    author_name   text,
    body          text NOT NULL,
    is_internal   boolean NOT NULL DEFAULT false,  -- invisible to customer RPCs
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_complaint_messages_complaint ON public.complaint_messages (complaint_id, created_at);

-- ============================================================================
-- 6. TABLE: complaint_activity
-- ============================================================================
-- Immutable audit log: status changes, assignments, escalations, milestone stamps.

CREATE TABLE public.complaint_activity (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code   text NOT NULL DEFAULT public.my_dealer_code(),
    complaint_id  bigint NOT NULL REFERENCES public.complaint_tickets(id) ON DELETE CASCADE,
    event_type    text NOT NULL,  -- raised|acknowledged|status_change|assigned|escalated|reopened|csat|closed
    from_value    text,
    to_value      text,
    actor_type    text NOT NULL DEFAULT 'staff' CHECK (actor_type IN ('customer','staff','system')),
    actor_id      uuid,
    actor_name    text,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.complaint_activity ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_complaint_activity_complaint ON public.complaint_activity (complaint_id, created_at);

-- ============================================================================
-- 7. TABLE: complaint_attachments
-- ============================================================================
-- File metadata for customer/staff uploads (Supabase Storage paths).

CREATE TABLE public.complaint_attachments (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code     text NOT NULL DEFAULT public.my_dealer_code(),
    complaint_id    bigint NOT NULL REFERENCES public.complaint_tickets(id) ON DELETE CASCADE,
    message_id      bigint REFERENCES public.complaint_messages(id) ON DELETE SET NULL,
    storage_path    text NOT NULL,      -- e.g., 'complaint-attachments/CMP-XXX-118/photo_1.jpg'
    file_name       text,
    content_type    text,
    uploaded_by_type text NOT NULL DEFAULT 'customer' CHECK (uploaded_by_type IN ('customer','staff')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX ix_complaint_attachments_complaint ON public.complaint_attachments (complaint_id);

-- ============================================================================
-- 8. MODULE REGISTRATION
-- ============================================================================
-- Register the complaints module (one-time, ON CONFLICT safe)

INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES ('complaints',
        'Complaints',
        'Customer complaint resolution — tickets, SLA, escalation & CSAT',
        'message-warning',
        '/complaints',
        14,
        true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 9. INITIAL MODULE PERMISSIONS
-- ============================================================================
-- Backfill: admins get full access (view+modify+delete)
--           managers get view+modify (no delete)
--           staff/viewers get view only
--
-- Note: Adjust role mapping per your RBAC model. This grants permissions
-- only to users without existing complaints module permissions.

INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete, granted_by)
SELECT u.id, m.id,
       true,                    -- can_view: all authenticated users
       (u.role IN ('admin','manager')), -- can_modify for admin/manager
       (u.role = 'admin'),      -- can_delete for admin only
       u.id                     -- granted_by: self-assign
FROM public.users u
CROSS JOIN public.modules m
WHERE m.name = 'complaints'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_permissions p
    WHERE p.user_id = u.id AND p.module_id = m.id
  )
ON CONFLICT (user_id, module_id) DO NOTHING;

-- ============================================================================
-- 10. BASIC ROW-LEVEL SECURITY POLICIES
-- ============================================================================
-- Admin bypass: admins see all
-- Staff/Manager: scoped by dealer_code + role-specific branch access
-- Anon: no table access (all via SECURITY DEFINER RPCs)

-- complaint_tickets RLS
CREATE POLICY admin_bypass_complaints_all_ops
  ON public.complaint_tickets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY user_view_own_dealer_complaints
  ON public.complaint_tickets
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('complaints')
  );

CREATE POLICY user_modify_own_dealer_complaints
  ON public.complaint_tickets
  FOR UPDATE TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('complaints')
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('complaints')
  );

CREATE POLICY user_delete_own_dealer_complaints
  ON public.complaint_tickets
  FOR DELETE TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_delete('complaints')
  );

-- complaint_access_links RLS (only visible to staff/admin for audit; anon via RPC)
CREATE POLICY admin_bypass_complaint_links_all_ops
  ON public.complaint_access_links
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY user_view_own_dealer_complaint_links
  ON public.complaint_access_links
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('complaints')
  );

-- complaint_messages RLS
CREATE POLICY admin_bypass_complaint_messages_all_ops
  ON public.complaint_messages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY user_view_own_dealer_complaint_messages
  ON public.complaint_messages
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('complaints')
  );

CREATE POLICY user_insert_complaint_messages
  ON public.complaint_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('complaints')
  );

-- complaint_activity RLS
CREATE POLICY admin_bypass_complaint_activity_all_ops
  ON public.complaint_activity
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY user_view_own_dealer_complaint_activity
  ON public.complaint_activity
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('complaints')
  );

-- complaint_attachments RLS
CREATE POLICY admin_bypass_complaint_attachments_all_ops
  ON public.complaint_attachments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY user_view_own_dealer_complaint_attachments
  ON public.complaint_attachments
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('complaints')
  );

CREATE POLICY user_insert_complaint_attachments
  ON public.complaint_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('complaints')
  );

-- complaint_sla_policies RLS (typically read-only for staff; admin writes)
CREATE POLICY admin_bypass_complaint_sla_policies_all_ops
  ON public.complaint_sla_policies
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY user_view_own_dealer_complaint_sla_policies
  ON public.complaint_sla_policies
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('complaints')
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
