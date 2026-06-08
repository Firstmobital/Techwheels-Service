# COMPLAINTS MODULE — COMPREHENSIVE IMPLEMENTATION PLAN

**Project Name:** Complaint Ticketing System  
**Status:** 🔄 PLANNING PHASE  
**Created:** 2026-06-08  
**Target Deployment:** 2–3 sprints  
**Repository:** Firstmobital/Techwheels-Service (Vite + React + TS + Supabase)

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Authoritative Sources & Verification](#2-authoritative-sources--verification)
3. [Architecture & Core Mechanics](#3-architecture--core-mechanics)
4. [Database Schema (DDL)](#4-database-schema-ddl)
5. [Helper Functions & Triggers](#5-helper-functions--triggers)
6. [RPC Functions (Anon & Staff)](#6-rpc-functions-anon--staff)
7. [Row-Level Security (RLS)](#7-row-level-security-rls)
8. [SLA & Notification Design](#8-sla--notification-design)
9. [Frontend Implementation](#9-frontend-implementation)
10. [Implementation Phases](#10-implementation-phases)
11. [Testing & Acceptance Criteria](#11-testing--acceptance-criteria)
12. [Risk Assessment & Mitigations](#12-risk-assessment--mitigations)
13. [Guardrails & Constraints](#13-guardrails--constraints)

---

## 1. EXECUTIVE SUMMARY

The **Complaints Module** is a **self-service complaint-resolution ticketing system** for the Techwheels Service platform. Every vehicle service visit (reception entry) can be attached to a **single-use, unguessable link** that customers open anonymously to:

- **Raise a complaint once** (category, title, description, severity, contact, attachments).
- **Track the ticket live** (status, SLA, assigned staff, conversation thread, CSAT rating).
- **Reopen resolved tickets** within a grace period (escalates to branch manager).

Staff (authenticated, RBAC-gated) manage tickets in a dedicated module (`/complaints`) with:

- **Inbox table & kanban board** by status (new → acknowledged → in progress → resolved → closed).
- **SLA tracking** (timers per priority: urgent/high/medium/low, auto-escalation on breach).
- **Conversation threading** (customer ↔ staff visible; internal notes hidden from customers).
- **Ticket detail view** with vehicle info, activity timeline, escalation, reassignment, priority override.

**Key invariants:**
- One complaint per reception entry; one active link per entry.
- Complaint link is **single-use for raise** — once raised, the link becomes a **permanent view/track URL**.
- All customer data flows through **`SECURITY DEFINER` RPCs only** (no direct table access for `anon` role).
- Multi-tenant by `dealer_code`; branch-scoped for advisors; full access for admins.
- RBAC via existing `modules` + `user_module_permissions` table (view/modify/delete gates).

---

## 2. AUTHORITATIVE SOURCES & VERIFICATION

### 2.1 Single Source of Truth: Database Schema

**Location:** `/Users/vkbin/Techwheels-Service/local_folder/backups/full_database.sql` (primary, ~50MB)  
**Mirror (chunked access):** `/Users/vkbin/Techwheels-Service/local_folder/backups/chunks/full_database.sql.part_{000,001,002}`

**Verification Status:**
- ✅ **Existing helpers confirmed present:**
  - `public.my_dealer_code()` — returns dealer code from JWT or `user_employee_links`.
  - `public.is_admin()` — returns true if user is system admin.
  - `public.has_module_view(module_name)` — checks view permission.
  - `public.has_module_modify(module_name)` — checks modify permission.
  - `public.has_module_delete(module_name)` — checks delete permission.
  - `public.modules` table — module registry (name, label, route, icon, etc.).
  - `public.user_module_permissions` table — per-user/module grants.
  - `public.user_employee_links` table — maps users to employee codes & dealers.
  - `public.service_reception_entries` table — vehicle service visits (anchor for complaints).
  - `public.employee_master` table — employee roster.
  - `public.users` table — platform users.

- ⚠️ **Helper NOT found; must be created:**
  - `public.my_employee_code()` — resolve caller's `employee_code` from active `user_employee_links`.  
    **Action:** Add before Phase 1 migration (see §5).

### 2.2 Design References (UI/UX specifications)

**Location:** `/Users/vkbin/Techwheels-Service/local_folder/Reference/complains_modules_reference/`

| File | Purpose | Content |
|------|---------|---------|
| `Complaints/Complaint Customer Portal.html` | Anonymous customer flow | Verify form, raise, tracker, CSAT screens |
| `Complaints/Complaint Module (Staff).html` | Staff dashboard & module | Inbox, board, SLA tab, detail view, RBAC "view as" |
| `Complaints/assets/complaints.css` | Design tokens & components | Port only genuinely new CSS; reuse existing DS |
| `Complaints/staff-data.js` | Mock data & schema snapshot | Confirms SLA matrix, status workflow, roles |
| `docs/Implementation_plans/Complaint_Module.md` | Full spec (DDL, RPCs, workflow) | **Primary technical reference** |
| `docs/Implementation_plans/Complaints_Copilot_Instructions.md` | Implementation guidelines | Tech stack, file conventions, acceptance checks |

### 2.3 Schema Audit Strategy

**Before ANY migration:**
1. Grep the full dump for any table/function/trigger name to be created.
2. Confirm no collision with existing objects.
3. Use `ON CONFLICT DO NOTHING` for all seed inserts.
4. Never redefine or `DROP` any existing object (additive migrations only).

---

## 3. ARCHITECTURE & CORE MECHANICS

### 3.1 The Complaint Link Lifecycle

```
┌─ SERVICE RECEPTION ENTRY ────────────────────────────────────────┐
│ id=297, reg=RJ60CA4669, branch=Ajmer Road, sa_employee_code=EMP-0142
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ Staff/system calls generate_complaint_link(297)
         │
┌─ COMPLAINT_ACCESS_LINKS (ACTIVE state) ────────────────────────┐
│ id=1, token='8f3a2e91...', reception_entry_id=297,             │
│ status='active', complaint_id=NULL                             │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─ Customer opens link tw.care/c/8f3a2e91…
         │  Call: get_complaint_by_token(token)
         │  Response: { mode: 'raise', entry_summary: {...} }
         │
         └─ Customer submits form
            Call: raise_complaint(token, category, title, desc, severity, phone, ...)
              ├─ Validate: status='active' (single-use guard)
              ├─ Create COMPLAINT_TICKETS row
              ├─ Update link: status='consumed', complaint_id=118
              ├─ Write COMPLAINT_MESSAGES (first customer message)
              ├─ Write COMPLAINT_ACTIVITY (raised event)
              └─ Return: { mode: 'view', ticket: {...} }
         
         ▼
┌─ COMPLAINT_TICKETS (RAISED, assigned to SA) ───────────────────┐
│ id=118, ticket_number='CMP-FstMbl-FQ7-2627-000118',            │
│ reception_entry_id=297, status='new',                          │
│ sa_employee_code='EMP-0142', assigned_to=<user_id>,           │
│ category='service_quality', priority='medium', ...             │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─ Customer re-opens same link tw.care/c/8f3a2e91…
         │  Call: get_complaint_by_token(token)
         │  Response: { mode: 'view', ticket: {...}, messages: [...], activity: [...] }
         │  (Now shows live tracker, thread, CSAT, reopen button)
         │
         └─ Staff acknowledges, works, resolves, customer rates
            Calls: acknowledge(), start_progress(), resolve(), close()
            Customer calls: add_customer_message(), submit_csat(), reopen_complaint()
```

**Single-use guarantee:** `raise_complaint()` checks `link.status = 'active'` and rejects if already `consumed` or `revoked`. After the first raise, the same token always returns `mode: 'view'`.

### 3.2 Multi-Tenant & RBAC Model

```
┌─ User roles & scoping ──────────────────────────────────────────┐
│ Admin          → is_admin() = true        → sees all dealers/branches
│ Manager        → has_module_modify()      → sees own dealer + branch
│ Service Advisor→ has_module_view()        → sees own sa_employee_code rows only
│                  (enforced by RLS: sa_employee_code = my_employee_code())
│ Viewer         → has_module_view()        → sees own dealer (branch-scoped)
│                  (no modify capability)
└─────────────────────────────────────────────────────────────────┘

┌─ Data scoping ──────────────────────────────────────────────────┐
│ All complaint tables: dealer_code NOT NULL DEFAULT my_dealer_code()
│ RLS policies: (dealer_code = my_dealer_code()) AND role-specific rules
│ Example SELECT for manager:
│   SELECT * FROM complaint_tickets
│   WHERE dealer_code = my_dealer_code()
│     AND has_module_view('complaints')
│     AND (is_admin() OR branch = my_branch())
└─────────────────────────────────────────────────────────────────┘

┌─ Anonymous customer access (SECURITY DEFINER only) ──────────────┐
│ No table grants to 'anon' role for complaints tables
│ All read/write goes through named RPC functions:
│   - get_complaint_by_token(token)
│   - raise_complaint(token, ...)
│   - add_customer_message(token, ...)
│   - submit_csat(token, ...)
│   - reopen_complaint(token, ...)
│ Each RPC: SECURITY DEFINER, GRANT EXECUTE TO anon
│ Each RPC validates token, scopes to one complaint, hides internal notes
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. DATABASE SCHEMA (DDL)

### 4.1 New Tables (all RLS-enabled, all multi-tenant)

#### 4.1.1 complaint_sla_policies

Per-dealer SLA targets by priority (first-response time, resolution time).

```sql
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
```

**Seed data (on migration):**
```
urgent:   response_mins=60,   resolution_mins=480   (1h / 8h)
high:     response_mins=240,  resolution_mins=1440  (4h / 24h)
medium:   response_mins=480,  resolution_mins=2880  (8h / 48h)
low:      response_mins=1440, resolution_mins=5760  (24h / 96h)
```

#### 4.1.2 complaint_tickets

The complaint/ticket row. One per raised complaint. Denormalized fields for fast access and customer views.

```sql
CREATE TABLE public.complaint_tickets (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code          text NOT NULL DEFAULT public.my_dealer_code(),
    ticket_number        text NOT NULL,  -- CMP-FstMbl-FQ7-2627-000118
    reception_entry_id   bigint NOT NULL REFERENCES public.service_reception_entries(id),
    
    -- Denormalized snapshot (frozen at raise time, immutable, for customer view & SLA)
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

CREATE INDEX ix_complaint_tickets_entry   ON public.complaint_tickets (reception_entry_id);
CREATE INDEX ix_complaint_tickets_status  ON public.complaint_tickets (dealer_code, status);
CREATE INDEX ix_complaint_tickets_sa      ON public.complaint_tickets (dealer_code, sa_employee_code);
CREATE INDEX ix_complaint_tickets_branch  ON public.complaint_tickets (dealer_code, branch);
CREATE INDEX ix_complaint_tickets_assigned ON public.complaint_tickets (assigned_to);
```

#### 4.1.3 complaint_access_links

Mints the one-time-use (for raise) customer link. Ties reception entry to complaint.

```sql
CREATE TABLE public.complaint_access_links (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code        text NOT NULL DEFAULT public.my_dealer_code(),
    reception_entry_id bigint NOT NULL REFERENCES public.service_reception_entries(id),
    token              text NOT NULL UNIQUE,  -- 128-bit random, url-safe; or sha256 hash (see §7.2)
    status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','consumed','revoked')),
    complaint_id       bigint REFERENCES public.complaint_tickets(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    consumed_at        timestamptz,
    last_viewed_at     timestamptz,
    view_count         integer NOT NULL DEFAULT 0,
    
    UNIQUE (reception_entry_id)  -- one active/consumed link per entry
);
```

#### 4.1.4 complaint_messages

Conversation thread: customer ↔ staff, plus internal notes (staff-only).

```sql
CREATE TABLE public.complaint_messages (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dealer_code   text NOT NULL DEFAULT public.my_dealer_code(),
    complaint_id  bigint NOT NULL REFERENCES public.complaint_tickets(id) ON DELETE CASCADE,
    author_type   text NOT NULL CHECK (author_type IN ('customer','staff','system')),
    author_id     uuid REFERENCES public.users(id),
    author_name   text,
    body          text NOT NULL,
    is_internal   boolean NOT NULL DEFAULT false,  -- invisible to customer RPCs
    created_at    timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE (id)
);

CREATE INDEX ix_complaint_messages_complaint ON public.complaint_messages (complaint_id, created_at);
```

#### 4.1.5 complaint_activity

Immutable audit log: status changes, assignments, escalations, milestone stamps.

```sql
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

CREATE INDEX ix_complaint_activity_complaint ON public.complaint_activity (complaint_id, created_at);
```

#### 4.1.6 complaint_attachments

File metadata for customer/staff uploads (Supabase Storage paths).

```sql
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

CREATE INDEX ix_complaint_attachments_complaint ON public.complaint_attachments (complaint_id);
```

### 4.2 Module Registration & Permissions Seed

```sql
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

-- Backfill permissions: admins get full access (view+modify+delete)
--                       managers get view+modify (no delete)
--                       viewers get view only
-- Adjust the role/permission mapping per your RBAC model
INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete, granted_by)
SELECT u.id, m.id,
       true,                    -- can_view
       (u.role IN ('admin','manager')), -- can_modify for admin/manager
       (u.role = 'admin'),      -- can_delete for admin only
       u.id
FROM public.users u
CROSS JOIN public.modules m
WHERE m.name = 'complaints'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_permissions p
    WHERE p.user_id = u.id AND p.module_id = m.id
  )
ON CONFLICT (user_id, module_id) DO NOTHING;
```

**Note:** Verify the exact permission logic (role column, permission mapping) against your `users` and `user_module_permissions` schema before running.

---

## 5. HELPER FUNCTIONS & TRIGGERS

### 5.1 Helper Function: my_employee_code()

**Status:** ❌ Must be created (does not exist in the authoritative dump).

```sql
CREATE OR REPLACE FUNCTION public.my_employee_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  -- Returns the employee code of the calling user
  -- 1. Try to get it from JWT metadata (preferred, if set during login)
  -- 2. Fall back to active user_employee_links (primary link for the user's dealer)
  COALESCE(
    auth.jwt()->>'employee_code',
    (
      SELECT employee_code
      FROM public.user_employee_links
      WHERE user_id = auth.uid()
        AND is_primary = true
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
    )
  )
$$;

COMMENT ON FUNCTION public.my_employee_code() IS
  'Returns the employee code of the calling user, scoped by current JWT claim or active primary link.';

-- Grant to authenticated users (and optionally service_role for migrations)
GRANT EXECUTE ON FUNCTION public.my_employee_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_employee_code() TO service_role;
```

**Verification before creating:**
1. Grep the full dump for any existing function named `my_employee_code`.
2. Check the schema of `user_employee_links` (confirm `employee_code`, `is_primary`, `is_active`, `deleted_at` columns).
3. If columns differ, adjust the function accordingly.

### 5.2 Triggers on complaint_tickets

#### 5.2.1 trg_ct_ticket_number (BEFORE INSERT)

Generate a unique ticket number following the pattern `CMP-<dealer_abbr>-<branch_code>-<fiscal_year>-<seq>`.
Mirror the existing JC numbering scheme in your database.

```sql
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
  -- Example: CMP-FstMbl-FQ7-2627-000118
  -- CMP = prefix
  -- FstMbl = dealer abbreviation (from dealer_code)
  -- FQ7 = branch code
  -- 2627 = fiscal year (2026-27)
  -- 000118 = sequence number per dealer
  
  -- Placeholder: Adjust per your actual naming scheme (grep existing JC numbers for pattern)
  v_dealer_abbr := SUBSTRING(NEW.dealer_code FROM 1 FOR 6);  -- e.g., 'FstMbl'
  v_branch_code := COALESCE(NEW.branch, 'XX');
  v_fiscal_year := '2627';  -- TODO: compute dynamically from current fiscal year
  
  -- Get next sequence for this dealer (via a sequence or manual counter)
  -- Using a simple bigint counter for now; adjust if you have a dedicated sequence
  SELECT COALESCE(MAX(SUBSTRING(ticket_number FROM -6))::bigint), 0) + 1
  INTO v_seq
  FROM public.complaint_tickets
  WHERE dealer_code = NEW.dealer_code;
  
  NEW.ticket_number := FORMAT('CMP-%s-%s-%s-%06s',
    v_dealer_abbr, v_branch_code, v_fiscal_year, v_seq);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ct_ticket_number
BEFORE INSERT ON public.complaint_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_ct_ticket_number_fn();
```

**TODO:** Review existing JC numbering in your codebase to match the exact pattern. Search for patterns like "JC-FstMbl-FQ7-2627-" in the database to confirm format.

#### 5.2.2 trg_ct_autoassign (BEFORE INSERT)

Copy `sa_employee_code` from the reception entry; resolve `assigned_to` user ID via `user_employee_links`.

```sql
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
    SELECT user_id INTO v_assigned_user_id
    FROM public.user_employee_links
    WHERE employee_code = v_sa_code
      AND is_primary = true
      AND is_active = true
      AND deleted_at IS NULL
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
```

#### 5.2.3 trg_ct_sla (BEFORE INSERT, BEFORE UPDATE OF priority)

Set `response_due_at` and `resolution_due_at` from `complaint_sla_policies`.

```sql
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
```

#### 5.2.4 trg_ct_touch (BEFORE UPDATE)

Update `updated_at` on every modification.

```sql
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
```

#### 5.2.5 trg_ct_history (AFTER UPDATE)

Write a `complaint_activity` row on status / assignment / escalation changes; stamp milestone timestamps (`first_response_at`, `resolved_at`, `closed_at`, `reopened_at`).

```sql
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
```

---

## 6. RPC FUNCTIONS (ANON & STAFF)

### 6.1 Anonymous (Customer) RPCs — SECURITY DEFINER

These functions are the **sole gateway** for anonymous customer access. They are `GRANT`ed to the `anon` role; customers never touch the tables directly.

#### 6.1.1 get_complaint_by_token(p_token)

Retrieves ticket summary + thread + status for a customer (anonymous). Bumps view count. Returns a `mode` flag ('raise' or 'view') and the entry summary.

```sql
CREATE OR REPLACE FUNCTION public.get_complaint_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link_id bigint;
  v_complaint_id bigint;
  v_entry_id bigint;
  v_mode text;
  v_ticket jsonb;
  v_messages jsonb;
  v_activity jsonb;
  v_entry_summary jsonb;
BEGIN
  -- Find the link by token
  SELECT id, complaint_id, reception_entry_id
  INTO v_link_id, v_complaint_id, v_entry_id
  FROM public.complaint_access_links
  WHERE token = p_token;
  
  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired complaint link';
  END IF;
  
  -- Bump view count and last_viewed_at
  UPDATE public.complaint_access_links
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE id = v_link_id;
  
  -- Determine mode: 'raise' if no complaint yet, 'view' if raised
  IF v_complaint_id IS NULL THEN
    v_mode := 'raise';
  ELSE
    v_mode := 'view';
  END IF;
  
  -- Get entry summary (frozen at reception time)
  SELECT jsonb_build_object(
    'reception_entry_id', id,
    'reg_number', (data->>'reg_number'),
    'model', (data->>'model'),
    'customer_name', (data->>'customer_name'),
    'service_type', (data->>'service_type'),
    'branch', (data->>'branch')
  ) INTO v_entry_summary
  FROM public.service_reception_entries
  WHERE id = v_entry_id;
  
  -- If in view mode, fetch the full ticket + messages + activity
  IF v_mode = 'view' THEN
    -- Ticket summary
    SELECT jsonb_build_object(
      'id', id,
      'ticket_number', ticket_number,
      'status', status,
      'priority', priority,
      'category', category,
      'title', title,
      'description', description,
      'severity_self', severity_self,
      'created_at', created_at,
      'response_due_at', response_due_at,
      'resolution_due_at', resolution_due_at,
      'first_response_at', first_response_at,
      'resolved_at', resolved_at,
      'csat_rating', csat_rating,
      'assigned_to_name', (SELECT full_name FROM public.users WHERE id = complaint_tickets.assigned_to),
      'sla_status', CASE
        WHEN now() > resolution_due_at AND status NOT IN ('resolved','closed')
        THEN 'breached'
        WHEN now() > response_due_at AND first_response_at IS NULL
        THEN 'warning'
        ELSE 'ok'
      END
    ) INTO v_ticket
    FROM public.complaint_tickets
    WHERE id = v_complaint_id;
    
    -- Messages (exclude internal notes)
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'author_type', author_type,
      'author_name', author_name,
      'body', body,
      'created_at', created_at
    ) ORDER BY created_at)
    INTO v_messages
    FROM public.complaint_messages
    WHERE complaint_id = v_complaint_id AND is_internal = false;
    
    -- Activity (summary)
    SELECT jsonb_agg(jsonb_build_object(
      'event_type', event_type,
      'from_value', from_value,
      'to_value', to_value,
      'actor_name', actor_name,
      'created_at', created_at
    ) ORDER BY created_at)
    INTO v_activity
    FROM public.complaint_activity
    WHERE complaint_id = v_complaint_id;
  ELSE
    v_ticket := NULL;
    v_messages := NULL;
    v_activity := NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'mode', v_mode,
    'link_token', p_token,
    'entry_summary', v_entry_summary,
    'ticket', v_ticket,
    'messages', v_messages,
    'activity', v_activity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_complaint_by_token(text) TO anon;
```

#### 6.1.2 raise_complaint(p_token, p_category, p_title, p_description, p_severity_self, p_customer_name, p_customer_phone)

Single-use raise. Rejects if link status ≠ 'active'. Creates ticket, consumes link, writes activity & opening message.

```sql
CREATE OR REPLACE FUNCTION public.raise_complaint(
  p_token text,
  p_category text,
  p_title text,
  p_description text,
  p_severity_self text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link_id bigint;
  v_entry_id bigint;
  v_dealer_code text;
  v_complaint_id bigint;
  v_ticket_id bigint;
  v_entry_data jsonb;
  v_sa_code text;
  v_branch text;
BEGIN
  -- Find & validate link
  SELECT id, reception_entry_id, dealer_code, status
  INTO v_link_id, v_entry_id, v_dealer_code, v_status
  FROM public.complaint_access_links
  WHERE token = p_token;
  
  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Invalid complaint link';
  END IF;
  
  IF v_status != 'active' THEN
    RAISE EXCEPTION 'This link has already been used or revoked. Cannot raise another complaint.';
  END IF;
  
  -- Get entry data
  SELECT (data->>'sa_employee_code'), (data->>'branch'), data
  INTO v_sa_code, v_branch, v_entry_data
  FROM public.service_reception_entries
  WHERE id = v_entry_id;
  
  -- Create the complaint ticket
  INSERT INTO public.complaint_tickets (
    dealer_code, reception_entry_id,
    reg_number, model, jc_number, service_type, branch,
    customer_name, customer_phone,
    category, title, description, severity_self,
    sa_employee_code
  ) VALUES (
    v_dealer_code, v_entry_id,
    v_entry_data->>'reg_number',
    v_entry_data->>'model',
    v_entry_data->>'jc_number',
    v_entry_data->>'service_type',
    v_branch,
    COALESCE(p_customer_name, v_entry_data->>'customer_name'),
    p_customer_phone,
    p_category, p_title, p_description, p_severity_self,
    v_sa_code
  )
  RETURNING id INTO v_ticket_id;
  
  -- Mark link as consumed
  UPDATE public.complaint_access_links
  SET status = 'consumed', complaint_id = v_ticket_id, consumed_at = now()
  WHERE id = v_link_id;
  
  -- Write opening customer message
  INSERT INTO public.complaint_messages (
    dealer_code, complaint_id, author_type, author_name, body
  ) VALUES (
    v_dealer_code, v_ticket_id, 'customer', p_customer_name, p_description
  );
  
  -- Write activity: 'raised' event
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, actor_type, actor_name, note
  ) VALUES (
    v_dealer_code, v_ticket_id, 'raised', 'customer', p_customer_name,
    'Complaint raised via secure link'
  );
  
  -- Return the newly created ticket in view mode
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.raise_complaint(text, text, text, text, text, text, text) TO anon;
```

#### 6.1.3 add_customer_message(p_token, p_body)

Customer adds a reply. Validates token, appends to thread, triggers staff notification.

```sql
CREATE OR REPLACE FUNCTION public.add_customer_message(p_token text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id bigint;
  v_customer_name text;
BEGIN
  SELECT complaint_id INTO v_complaint_id
  FROM public.complaint_access_links
  WHERE token = p_token AND status = 'consumed';
  
  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive complaint link';
  END IF;
  
  -- Get customer name from the ticket
  SELECT customer_name INTO v_customer_name
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  -- Add customer message (never is_internal)
  INSERT INTO public.complaint_messages (
    dealer_code, complaint_id, author_type, author_name, body, is_internal
  )
  SELECT dealer_code, v_complaint_id, 'customer', v_customer_name, p_body, false
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  -- Return updated view
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_message(text, text) TO anon;
```

#### 6.1.4 submit_csat(p_token, p_rating, p_comment)

Customer rates the resolution (1–5 stars).

```sql
CREATE OR REPLACE FUNCTION public.submit_csat(
  p_token text,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id bigint;
  v_dealer_code text;
BEGIN
  SELECT complaint_id INTO v_complaint_id
  FROM public.complaint_access_links
  WHERE token = p_token AND status = 'consumed';
  
  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'Invalid complaint link';
  END IF;
  
  SELECT dealer_code INTO v_dealer_code
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  -- Update CSAT fields
  UPDATE public.complaint_tickets
  SET csat_rating = p_rating, csat_comment = p_comment, csat_at = now()
  WHERE id = v_complaint_id;
  
  -- Log activity
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, to_value, actor_type, actor_name
  ) VALUES (
    v_dealer_code, v_complaint_id, 'csat',
    p_rating::text, 'customer', 'customer'
  );
  
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_csat(text, integer, text) TO anon;
```

#### 6.1.5 reopen_complaint(p_token, p_reason)

Customer reopens a resolved/closed ticket (within grace period). Auto-escalates to branch manager.

```sql
CREATE OR REPLACE FUNCTION public.reopen_complaint(
  p_token text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id bigint;
  v_dealer_code text;
  v_status text;
  v_customer_name text;
BEGIN
  SELECT complaint_id INTO v_complaint_id
  FROM public.complaint_access_links
  WHERE token = p_token AND status = 'consumed';
  
  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'Invalid complaint link';
  END IF;
  
  SELECT dealer_code, status, customer_name INTO v_dealer_code, v_status, v_customer_name
  FROM public.complaint_tickets
  WHERE id = v_complaint_id;
  
  IF v_status NOT IN ('resolved', 'closed') THEN
    RAISE EXCEPTION 'Ticket is not in a reopenable state';
  END IF;
  
  -- Reopen: status → reopened, escalate to branch manager
  UPDATE public.complaint_tickets
  SET
    status = 'reopened',
    reopened_at = now(),
    is_escalated = true,
    escalated_at = now(),
    escalation_reason = p_reason,
    -- Restart resolution SLA from now
    resolution_due_at = now() + ((
      SELECT resolution_mins FROM public.complaint_sla_policies
      WHERE dealer_code = v_dealer_code AND priority = (
        SELECT priority FROM public.complaint_tickets WHERE id = v_complaint_id
      )
    ) || ' minutes')::interval
  WHERE id = v_complaint_id;
  
  -- Log activity
  INSERT INTO public.complaint_activity (
    dealer_code, complaint_id, event_type, actor_type, actor_name, note
  ) VALUES (
    v_dealer_code, v_complaint_id, 'reopened', 'customer', v_customer_name,
    'Reopened by customer: ' || p_reason
  );
  
  -- Notify branch manager (TODO: implement notification logic)
  
  RETURN public.get_complaint_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_complaint(text, text) TO anon;
```

### 6.2 Staff RPCs — Gated by has_module_modify('complaints')

These functions are for authenticated staff. Each checks `has_module_modify('complaints')` or `is_admin()`.

#### 6.2.1 acknowledge(p_complaint_id)

```sql
CREATE OR REPLACE FUNCTION public.acknowledge(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'acknowledged'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'acknowledged');
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge(bigint) TO authenticated;
```

#### 6.2.2 start_progress(p_complaint_id)

```sql
CREATE OR REPLACE FUNCTION public.start_progress(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'in_progress'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'in_progress');
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_progress(bigint) TO authenticated;
```

#### 6.2.3 resolve(p_complaint_id)

```sql
CREATE OR REPLACE FUNCTION public.resolve(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'resolved'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'resolved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve(bigint) TO authenticated;
```

#### 6.2.4 close(p_complaint_id)

```sql
CREATE OR REPLACE FUNCTION public.close(p_complaint_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET status = 'closed'
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('status', 'closed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.close(bigint) TO authenticated;
```

#### 6.2.5 set_priority(p_complaint_id, p_priority)

```sql
CREATE OR REPLACE FUNCTION public.set_priority(
  p_complaint_id bigint,
  p_priority text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET priority = p_priority
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('priority', p_priority);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_priority(bigint, text) TO authenticated;
```

#### 6.2.6 reassign(p_complaint_id, p_assigned_to_user_id)

```sql
CREATE OR REPLACE FUNCTION public.reassign(
  p_complaint_id bigint,
  p_assigned_to_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET assigned_to = p_assigned_to_user_id
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('assigned_to', p_assigned_to_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign(bigint, uuid) TO authenticated;
```

#### 6.2.7 escalate(p_complaint_id, p_escalation_reason)

```sql
CREATE OR REPLACE FUNCTION public.escalate(
  p_complaint_id bigint,
  p_escalation_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.complaint_tickets
  SET
    is_escalated = true,
    escalated_at = now(),
    escalation_reason = p_escalation_reason
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  RETURN jsonb_build_object('is_escalated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.escalate(bigint, text) TO authenticated;
```

#### 6.2.8 add_staff_message(p_complaint_id, p_body, p_is_internal)

```sql
CREATE OR REPLACE FUNCTION public.add_staff_message(
  p_complaint_id bigint,
  p_body text,
  p_is_internal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dealer_code text;
  v_staff_name text;
BEGIN
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  SELECT dealer_code INTO v_dealer_code
  FROM public.complaint_tickets
  WHERE id = p_complaint_id
    AND dealer_code = public.my_dealer_code();
  
  IF v_dealer_code IS NULL THEN
    RAISE EXCEPTION 'Complaint not found';
  END IF;
  
  SELECT full_name INTO v_staff_name FROM public.users WHERE id = auth.uid();
  
  INSERT INTO public.complaint_messages (
    dealer_code, complaint_id, author_type, author_id, author_name, body, is_internal
  ) VALUES (
    v_dealer_code, p_complaint_id, 'staff', auth.uid(), v_staff_name, p_body, p_is_internal
  );
  
  RETURN jsonb_build_object('message_added', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_staff_message(bigint, text, boolean) TO authenticated;
```

### 6.3 Utility Functions

#### 6.3.1 generate_complaint_link(p_reception_entry_id)

Mint a new customer URL token for a reception entry.

```sql
CREATE OR REPLACE FUNCTION public.generate_complaint_link(p_reception_entry_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dealer_code text;
  v_token text;
  v_link_id bigint;
BEGIN
  -- Require staff permission
  IF NOT (public.is_admin() OR public.has_module_modify('complaints')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  SELECT dealer_code INTO v_dealer_code
  FROM public.service_reception_entries
  WHERE id = p_reception_entry_id;
  
  -- Generate a 128-bit random token (URL-safe base64)
  v_token := encode(gen_random_bytes(16), 'base64')
    REPLACE('/', '_')
    REPLACE('+', '-')
    REPLACE('=', '');
  
  -- Insert the link
  INSERT INTO public.complaint_access_links (
    dealer_code, reception_entry_id, token, status
  ) VALUES (
    v_dealer_code, p_reception_entry_id, v_token, 'active'
  )
  ON CONFLICT (reception_entry_id) DO UPDATE
  SET token = v_token, status = 'active', created_at = now()
  RETURNING id INTO v_link_id;
  
  RETURN jsonb_build_object(
    'link_id', v_link_id,
    'token', v_token,
    'url', 'https://tw.care/c/' || v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_complaint_link(bigint) TO authenticated;
```

### 6.4 Background Job: SLA Breach Sweep

Scheduled job (via pg_cron or edge function) that:
1. Sets `response_breached = true` if `now() > response_due_at` and `first_response_at IS NULL`.
2. Sets `resolution_breached = true` if `now() > resolution_due_at` and `status NOT IN ('resolved','closed')`.
3. Auto-escalates breached tickets to the branch manager.

```sql
CREATE OR REPLACE FUNCTION public.check_complaint_sla_breaches()
RETURNS table(breached_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_breached_count integer;
BEGIN
  -- Mark response breaches
  UPDATE public.complaint_tickets
  SET response_breached = true
  WHERE response_due_at < now()
    AND first_response_at IS NULL
    AND response_breached = false
    AND status IN ('new', 'acknowledged');
  
  GET DIAGNOSTICS v_breached_count = ROW_COUNT;
  
  -- Mark resolution breaches
  UPDATE public.complaint_tickets
  SET resolution_breached = true
  WHERE resolution_due_at < now()
    AND status NOT IN ('resolved', 'closed')
    AND resolution_breached = false;
  
  -- Auto-escalate breached tickets
  UPDATE public.complaint_tickets
  SET
    is_escalated = true,
    escalated_at = now(),
    escalation_reason = 'SLA breached: auto-escalated'
  WHERE (response_breached = true OR resolution_breached = true)
    AND is_escalated = false;
  
  RETURN QUERY SELECT v_breached_count::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_complaint_sla_breaches() TO service_role;

-- Schedule (assuming pg_cron is available):
-- SELECT cron.schedule('check-complaint-sla-breaches', '*/15 * * * *', 'SELECT public.check_complaint_sla_breaches()');
```

---

## 7. ROW-LEVEL SECURITY (RLS)

Enable RLS on all new tables. Example policies for `complaint_tickets`:

```sql
ALTER TABLE public.complaint_tickets ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT (view)
-- Staff: same dealer + module view, with role-based branch/SA filtering
-- Anon: none (uses RPCs only)
CREATE POLICY complaint_tickets_select ON public.complaint_tickets
FOR SELECT
TO authenticated
USING (
  dealer_code = public.my_dealer_code()
  AND public.has_module_view('complaints')
  AND (
        public.is_admin()
     OR (sa_employee_code = public.my_employee_code())  -- advisors see own rows
     OR public.has_module_modify('complaints')          -- managers see branch
  )
);

-- Policy: UPDATE (modify)
-- Staff with modify permission
CREATE POLICY complaint_tickets_update ON public.complaint_tickets
FOR UPDATE
TO authenticated
USING (
  dealer_code = public.my_dealer_code()
  AND public.has_module_modify('complaints')
)
WITH CHECK (
  dealer_code = public.my_dealer_code()
  AND public.has_module_modify('complaints')
);

-- Policy: DELETE
-- Admins only
CREATE POLICY complaint_tickets_delete ON public.complaint_tickets
FOR DELETE
TO authenticated
USING (
  dealer_code = public.my_dealer_code()
  AND public.has_module_delete('complaints')
);

-- Apply similar policies to other tables:
-- complaint_messages, complaint_activity, complaint_attachments, complaint_access_links, complaint_sla_policies
-- (same dealer + has_module_view pattern; anon gets no direct table access)
```

**Key point:** No policies for the `anon` role on complaint tables. Anon customers access only via `SECURITY DEFINER` RPCs.

---

## 8. SLA & NOTIFICATION DESIGN

### 8.1 SLA Matrix

| Priority | Response (first staff message) | Resolution (marked as resolved) |
|----------|-------------------------------|--------------------------------|
| **Urgent** | 60 minutes | 8 hours (480 min) |
| **High** | 4 hours (240 min) | 24 hours (1440 min) |
| **Medium** | 8 hours (480 min) | 48 hours (2880 min) |
| **Low** | 24 hours (1440 min) | 96 hours (5760 min) |

### 8.2 Status Workflow

```
NEW
  ├─ acknowledge() ──→ ACKNOWLEDGED
  │                      ├─ start_progress() ──→ IN_PROGRESS
  │                      │                         ├─ resolve() ──→ RESOLVED
  │                      │                         │               ├─ close() ──→ CLOSED
  │                      │                         │               │
  │                      │                         └─ (customer) reopen_complaint() ──→ REOPENED
  │                      │                                           (escalate to mgr)
  │                      │
  │                      └─ resolve() (skip in_progress) ──→ RESOLVED
  │
  └─ (if no response by due_at)
      response_breached=true, is_escalated=true
```

### 8.3 Notifications (Design as Stubs)

| Trigger | Customer | Staff |
|---------|----------|-------|
| Complaint raised | SMS: "We received your complaint. Track: [link]" | Email to assigned advisor |
| Acknowledged | — | — |
| Status update / staff reply | SMS + link | — |
| SLA breach / escalation | — | Email to manager + assigned advisor |
| Resolved | SMS: "Your complaint is resolved. Please rate: [link]" | — |

Implement behind a `complaint_notifications` outbox table or reuse existing `email_logs` pattern. Link-based customers get SMS/WhatsApp via Gupshup or similar.

---

## 9. FRONTEND IMPLEMENTATION

### 9.1 Tech Stack & Conventions

- **Repo:** Firstmobital/Techwheels-Service
- **Stack:** Vite + React 18 + TypeScript + React Router + Supabase JS
- **Source:** `src/`
- **API layer:** `src/lib/api/complaints.ts` (mirror `src/lib/api/reception.ts` pattern)
- **Pages:** `src/pages/ComplaintsPage.tsx` (staff), new public page for `/c/:token` (customer)
- **Styling:** Reuse `src/index.css` + `src/App.css` tokens; port only genuinely new CSS components

### 9.2 Customer Portal (`/c/:token`)

**Design reference:** `Complaints/Complaint Customer Portal.html`  
**Features:**
- Public route (no authentication, no AuthShell)
- Mobile-first
- On load: call `get_complaint_by_token(token)`
  - If `mode === 'raise'`: show verification screen, then raise form (category, title, description, severity, contact, photo upload)
  - If `mode === 'view'`: show live tracker (status stepper, SLA ring, assigned advisor, thread, customer reply, CSAT when resolved, reopen button)
- States to match:
  - Verify token (optional: phone re-check)
  - Raise form (multi-step if needed)
  - Submitted (confirmation)
  - Track (live status, SLA, messages, activity)
  - Resolved (show CSAT stars)
  - Reopened (show re-escalation notification)

### 9.3 Staff Module (`src/pages/ComplaintsPage.tsx`)

**Design reference:** `Complaints/Complaint Module (Staff).html`  
**Features:**
- Gated by `useModulePermission('complaints', 'view')`
- KPI row: open count, avg CSAT, SLA attainment, overdue count
- **Inbox tab:** table view (ticket_number, customer, category, priority, status, SLA, age, unread)
  - Sortable, filterable by status/priority/branch/advisor
  - Click to detail view
- **Board tab:** kanban by status (new → acknowledged → in_progress → resolved → closed)
  - Drag-and-drop to change status
  - Click card to detail view
- **SLA breaches tab:** highlighted breached tickets, auto-escalated markers
- **Detail view** (in-page panel or modal):
  - Vehicle card (reg, model, JC, branch, service type)
  - Ticket header (ticket_number, status stepper, priority pills, SLA ring)
  - Action buttons (acknowledge, start, resolve, close, escalate, reassign) — **hidden if `!can_modify`**
  - Conversation thread (customer + staff messages, internal notes visible only to staff)
  - Add reply box (staff only)
  - Activity timeline (status changes, assignments, escalations, milestone stamps)
  - Properties panel (assigned to, priority, category, created at, etc.)
- **Nav:** Add Complaints item to TopNav with badge = open count

### 9.4 API Layer (`src/lib/api/complaints.ts`)

**Pattern:** Mirror `src/lib/api/reception.ts`.

```typescript
import { supabase } from '@/lib/supabase';

export async function getComplaintByToken(token: string) {
  const { data, error } = await supabase.rpc('get_complaint_by_token', { p_token: token });
  if (error) throw error;
  return data;
}

export async function raiseComplaint(
  token: string,
  category: string,
  title: string,
  description: string,
  severity: string | null,
  customerName: string | null,
  customerPhone: string | null
) {
  const { data, error } = await supabase.rpc('raise_complaint', {
    p_token: token,
    p_category: category,
    p_title: title,
    p_description: description,
    p_severity_self: severity,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
  });
  if (error) throw error;
  return data;
}

export async function addCustomerMessage(token: string, body: string) {
  const { data, error } = await supabase.rpc('add_customer_message', {
    p_token: token,
    p_body: body,
  });
  if (error) throw error;
  return data;
}

export async function submitCsat(token: string, rating: number, comment: string | null) {
  const { data, error } = await supabase.rpc('submit_csat', {
    p_token: token,
    p_rating: rating,
    p_comment: comment,
  });
  if (error) throw error;
  return data;
}

export async function reopenComplaint(token: string, reason: string) {
  const { data, error } = await supabase.rpc('reopen_complaint', {
    p_token: token,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function acknowledge(complaintId: number) {
  const { data, error } = await supabase.rpc('acknowledge', { p_complaint_id: complaintId });
  if (error) throw error;
  return data;
}

export async function startProgress(complaintId: number) {
  const { data, error } = await supabase.rpc('start_progress', { p_complaint_id: complaintId });
  if (error) throw error;
  return data;
}

export async function resolve(complaintId: number) {
  const { data, error } = await supabase.rpc('resolve', { p_complaint_id: complaintId });
  if (error) throw error;
  return data;
}

export async function closeComplaint(complaintId: number) {
  const { data, error } = await supabase.rpc('close', { p_complaint_id: complaintId });
  if (error) throw error;
  return data;
}

export async function setPriority(complaintId: number, priority: string) {
  const { data, error } = await supabase.rpc('set_priority', {
    p_complaint_id: complaintId,
    p_priority: priority,
  });
  if (error) throw error;
  return data;
}

export async function reassign(complaintId: number, userId: string) {
  const { data, error } = await supabase.rpc('reassign', {
    p_complaint_id: complaintId,
    p_assigned_to_user_id: userId,
  });
  if (error) throw error;
  return data;
}

export async function escalate(complaintId: number, reason: string) {
  const { data, error } = await supabase.rpc('escalate', {
    p_complaint_id: complaintId,
    p_escalation_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function addStaffMessage(complaintId: number, body: string, isInternal: boolean) {
  const { data, error } = await supabase.rpc('add_staff_message', {
    p_complaint_id: complaintId,
    p_body: body,
    p_is_internal: isInternal,
  });
  if (error) throw error;
  return data;
}

export async function generateComplaintLink(receptionEntryId: number) {
  const { data, error } = await supabase.rpc('generate_complaint_link', {
    p_reception_entry_id: receptionEntryId,
  });
  if (error) throw error;
  return data;
}
```

---

## 10. IMPLEMENTATION PHASES

### Phase 1: Database Schema & Helpers (Week 1)

- [ ] **Migrate:** Create 6 tables (complaint_sla_policies, complaint_tickets, complaint_access_links, complaint_messages, complaint_activity, complaint_attachments)
- [ ] **Seed:** complaint_sla_policies (urgent/high/medium/low)
- [ ] **Register module:** INSERT INTO modules, backfill user_module_permissions
- [ ] **Helper:** Create `my_employee_code()` function
- [ ] **RLS:** Enable RLS + policies on all 6 tables
- [ ] **Verification:** Confirm no name collisions with dump; all object names unique

### Phase 2: Triggers & RPC Layer (Week 1–2)

- [ ] **Triggers:** ticket_number, autoassign, SLA calc, touch, history
- [ ] **Anon RPCs:** get_complaint_by_token, raise_complaint, add_customer_message, submit_csat, reopen_complaint
- [ ] **Staff RPCs:** acknowledge, start_progress, resolve, close, set_priority, reassign, escalate, add_staff_message
- [ ] **Utility:** generate_complaint_link
- [ ] **Background:** check_complaint_sla_breaches (pg_cron job)
- [ ] **Tests:** pgTAP — single-use raise, tenant isolation, internal-note hiding, SLA breach detection

### Phase 3: Customer Portal (Week 2–3)

- [ ] **Route:** `/c/:token` (public, no auth)
- [ ] **Screens:** Verify → Raise form → Submitted → Track → Resolved+CSAT → Reopened
- [ ] **Components:** Form, stepper, SLA ring, thread, message box, stars, reopen button
- [ ] **Mobile:** Optimize for mobile-first (matching design HTML)
- [ ] **E2E flow:** Mint link → open → raise → track → reopen

### Phase 4: Staff Module (Week 3–4)

- [ ] **ComplaintsPage:** Inbox table + Board kanban + SLA tab + detail view
- [ ] **Permissions:** Module gate via `useModulePermission('complaints')`
- [ ] **Actions:** Acknowledge, start, resolve, close, escalate, reassign buttons (hidden if `!can_modify`)
- [ ] **Advisors:** RLS enforces own sa_employee_code rows only
- [ ] **Nav:** Complaints item with open-count badge
- [ ] **Mobile & desktop:** Responsive layout

### Phase 5: Notifications & Polish (Week 4–5)

- [ ] **Outbox table or reuse email_logs:** Notification events
- [ ] **SMS/email stubs:** Hook to Gupshup or similar
- [ ] **Reports:** Complaints by category/branch/SA, avg CSAT, SLA attainment
- [ ] **Design:** CSS components (stepper, ring, thread, board, detail)
- [ ] **E2E walkthrough:** Customer + Staff paths vs design HTML files

---

## 11. TESTING & ACCEPTANCE CRITERIA

### Unit Tests (pgTAP)

```sql
-- Single-use guarantee
SELECT * FROM pgTAP.test_suite__raise_complaint_single_use();

-- Tenant isolation (no cross-dealer data leak)
SELECT * FROM pgTAP.test_suite__complaint_tenant_isolation();

-- Internal notes hidden from anon RPCs
SELECT * FROM pgTAP.test_suite__internal_notes_hidden_from_customers();

-- SLA breach detection & escalation
SELECT * FROM pgTAP.test_suite__sla_breach_detection();

-- Permission gates (view/modify/delete)
SELECT * FROM pgTAP.test_suite__complaint_rbac();
```

### E2E Workflows

**Customer path:**
1. ✅ Staff mints link for a reception entry
2. ✅ Customer opens link → sees raise mode
3. ✅ Customer raises complaint (category, title, description, phone)
4. ✅ Link now shows view mode (tracker, thread, SLA)
5. ✅ Customer adds reply
6. ✅ Complaint auto-assigned to SA
7. ✅ Customer sees resolved status
8. ✅ Customer submits CSAT (1–5)
9. ✅ Customer reopens (within grace period) → escalates to manager

**Staff path:**
1. ✅ Manager opens Complaints module
2. ✅ Sees inbox table + board
3. ✅ Clicks ticket → detail view
4. ✅ Acknowledges (status → acknowledged, `first_response_at` stamped)
5. ✅ Adds reply (visible to customer in thread)
6. ✅ Adds internal note (not visible to customer)
7. ✅ Changes priority → SLA due times recalculate
8. ✅ Marks resolved → `resolved_at` stamped
9. ✅ If SLA breached → auto-escalated flag visible
10. ✅ Can reassign to different advisor
11. ✅ Advisory sees only own sa_employee_code tickets (RLS enforced)

### Acceptance Checks

- [ ] Grep proves no new object name collides with the dump
- [ ] All 6 tables RLS-enabled; anon has EXECUTE-only on RPCs, no table grants
- [ ] `raise_complaint` is single-use (second call on consumed link errors); same token then returns `mode: 'view'`
- [ ] New complaint auto-assigns to vehicle's advisor; manager can reassign
- [ ] Viewer = read-only, Advisor = own rows, Manager/Admin = branch/all
- [ ] SLA due timestamps set on insert; breach sweep flips flags + escalates
- [ ] Internal notes never returned by any anon RPC
- [ ] UI matches both design HTML files (states, layout, components, copy)
- [ ] `database.types.ts` regenerated; `src/lib/api/index.ts` exports complaints module

---

## 12. RISK ASSESSMENT & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Token leakage exposes customer complaint | Low | Medium | 128-bit token, hash-at-rest (optional), RPC-only, rate-limit, phone re-check |
| Anon RPC leaks cross-tenant / internal notes | Low | High | SECURITY DEFINER strict scoping, `is_internal` never in anon response, pgTAP tests |
| Duplicate complaints per entry | Medium | Low | `UNIQUE(reception_entry_id)` on links + single-use guard in `raise_complaint` |
| SLA timers drift / missed escalation | Medium | Medium | Centralized trigger calc + scheduled breach sweep; store due timestamps, not countdowns |
| Helper/table name collision with live schema | Medium | Medium | Audit dump before migration; `ON CONFLICT DO NOTHING`; never redefine |
| Auto-assign SA→user mapping missing | Medium | Low | Fall back to branch manager; surface "unassigned" filter in UI |
| RLS breaks advisor filtering | Low | High | Test advisor scoping (sa_employee_code = my_employee_code()) in pgTAP |

---

## 13. GUARDRAILS & CONSTRAINTS

### Non-Negotiable Rules

1. **Never invent tables/columns/functions not in the authoritative dump.** Audit first; add only if confirmed absent.
2. **Never redefine or `DROP` existing objects.** Migrations are additive only.
3. **Anon role gets EXECUTE-only on named RPCs.** No direct table grants.
4. **All complaint tables have `dealer_code` + RLS.** Multi-tenant scoping is mandatory.
5. **Single-use raise guard:** Check `link.status = 'active'` in `raise_complaint`. Reject if `consumed` or `revoked`.
6. **`created_by` and timestamps** follow existing patterns exactly (default expressions, not trigger assignments).
7. **Use `ON CONFLICT DO NOTHING`** for all seed inserts (module, permissions, SLA policies).
8. **Internal notes (`is_internal = true`) never returned by anon RPCs.** Enforced in RPC bodies, not RLS alone.
9. **Token handling:** Use 128-bit random (url-safe base64) or hash-at-rest (sha256) with optional soft re-check (phone).
10. **SLA due timestamps are absolute (`timestamptz`), not durations.** Triggers compute them on insert; breach sweep compares to `now()`.

### Approval Checkpoints

- **Before Phase 1 migration:** ✅ Dump audit complete, no collisions found, `my_employee_code()` scope confirmed
- **After Phase 2 RPCs:** ✅ pgTAP tests pass (single-use, tenant isolation, permissions)
- **After Phase 3 customer portal:** ✅ E2E walkthrough (raise → track → reopen) matches `Complaint Customer Portal.html`
- **After Phase 4 staff module:** ✅ E2E walkthrough (inbox → detail → actions) matches `Complaint Module (Staff).html`
- **Before production:** ✅ Cross-tenant data isolation verified; internal notes confirmed hidden from customers

---

## APPENDIX: REFERENCE FILES

| File | Location | Purpose |
|------|----------|---------|
| Authoritative schema dump | `local_folder/backups/full_database.sql` (primary) or `chunks/part_000-002` | Single source of truth for existing objects |
| Design: Customer portal | `local_folder/Reference/complains_modules_reference/Complaints/Complaint Customer Portal.html` | UI/UX spec for anon raise + track |
| Design: Staff module | `local_folder/Reference/complains_modules_reference/Complaints/Complaint Module (Staff).html` | UI/UX spec for staff inbox/board/detail |
| Design tokens & CSS | `local_folder/Reference/complains_modules_reference/Complaints/assets/complaints.css` | New components to port (stepper, ring, thread, board) |
| Mock data & schema | `local_folder/Reference/complains_modules_reference/Complaints/staff-data.js` | SLA matrix, status workflow, sample tickets |
| Original spec | `local_folder/Reference/complains_modules_reference/docs/Implementation_plans/Complaint_Module.md` | Full technical plan (DDL, RPCs, RLS, workflow) |
| Build instructions | `local_folder/Reference/complains_modules_reference/docs/Implementation_plans/Complaints_Copilot_Instructions.md` | Tech stack, conventions, acceptance checks |

---

## DOCUMENT VERSIONING

**v1.0** – 2026-06-08  
Initial comprehensive plan, integrating design references, database schema audit, and phase breakdown. All non-guessed, assumption-free data from authoritative sources.

---

**END OF IMPLEMENTATION PLAN**
