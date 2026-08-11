# HELP-001 — Employee Help Ticket System (Get Help)

**Plan ID:** HELP-001  
**Date Created:** 2026-08-11  
**Last Updated:** 2026-08-11 (Phase 1–2 deployed: DB + edge + Vercel; Phase 3 next)  
**Status:** In progress — Phase 2 complete, Phase 3 pending  
**Owner:** Platform + Web + Mobile  
**Platform:** web (employee + support) • mobile (employee Help Lite) • shared Supabase  
**Category:** help-tickets  
**Database Dump Reference:** `supabase/backups/full_metadata.sql`  
**Risk Level:** Medium  
**Estimated Duration:** ~4–5 weeks across 5 phases  

---

## 1) Executive Summary

Give every onboarded Service employee a **Get Help** entry point on **web and mobile** to raise support tickets (category, description, attachments). **Support staff manage tickets only on web** at `/help-tickets` (assign, status, hold, escalate, internal notes, audit). On mobile, employees **raise tickets and respond on their own threads** only. Tickets cannot be permanently closed until the raiser verifies resolution (or auto-close after grace period).

### Measurable outcomes
- Any authenticated employee with an active primary `user_employee_links` row can raise a ticket in under 60 seconds (web or mobile).
- Support staff with `help_tickets` module **view** see **all** tickets org-wide; staff with **modify** (edit) can work **any** ticket — **dealer_code never gates visibility or work rights**.
- Attachments land on Google Drive via `universal-drive-upload` only.
- UI shows human names (`employee_name` snapshots) — never raw user UUIDs to end users.
- Create on web → immediately visible on mobile (and vice versa) via shared RPCs/tables.

### Hard separation from Complaints
| | `complaint_tickets` (existing) | `help_tickets` (this plan) |
|---|---|---|
| Raiser | Customer (anon token portal) | Authenticated employee |
| Anchor | `reception_entry_id` | `raised_by_employee_code` + `raised_by_user_id` |
| Staff route | `/complaints` | `/help-tickets` |
| Module | `complaints` | `help_tickets` |

**Do not** reuse, extend, or alias complaint tables for employee help.

---

## 2) Classification Record

- **State:** implementation plan (active)
- **Scope:** shared backend + web UI + mobile employee Help Lite
- **Intent:** active plan
- **Product parity reference:** TECHWHEELS-WEB Help Tickets plan (feature intent only)

---

## 3) Scope

### In scope
- Floating **Get Help** FAB on authenticated web pages (employee-linked users)
- Web employee routes: my tickets / raise / detail + chat / verify-reopen
- Web support module at `/help-tickets` with `?ticketId=` deep link
- Mobile employee Help Lite: Profile → Support → Raise / My tickets / detail
- Categories, status lifecycle, raiser verification gate
- Attachments via Universal Drive (`resource_type = help_ticket_attachment`)
- In-app notification outbox (complaints-style)
- RLS + SECURITY DEFINER RPC enforcement
- Module registration in `public.modules` + App.tsx wiring

### Out of scope
- Mobile support/admin console (no assign/status/hold UI on mobile)
- Extending `complaint_tickets`
- AI triage, WhatsApp inbox, public visitor ticket raising
- Ticket merging / parent-child (mark duplicate is web support only)
- Porting WEB `syncAdminModules.js`, `admin.help-tickets` context, `useRightGate`, `visibility_core_pass`, `role_permission_rights`
- Changing Drive root folder strategy beyond adding a resource_type allow-list entry

---

## 4) Authority Sources & Pre-Implementation Audit

### 4.1 Confirmed present in `full_metadata.sql` (2026-08-11 audit)

| Object | Status | Notes |
|---|---|---|
| `public.modules` / `user_module_permissions` | Present | Service RBAC authority |
| `get_all_my_permissions()` | Present | Returns `can_view` / `can_modify` / `can_delete` |
| `has_module_view` / `has_module_modify` / `has_module_delete` | Present | RPC gates |
| `is_admin()` | Present | `admin` / `super_admin` |
| `my_dealer_code()` | Present | Used elsewhere in Service; **not** an ACL input for help tickets |
| `my_employee_code()` | Present | Primary active link → `employee_code` |
| `employee_master` | Present | `employee_code` (text PK-ish), `employee_name` |
| `user_employee_links` | Present | `user_id` ↔ `employee_code` (+ dealer on link row; ignored for help-ticket ACL) |
| `complaint_*` tables + RPCs | Present | **Customer** complaints — do not reuse (complaints are dealer-scoped; help tickets are not) |
| `help_tickets` / `admin.help-tickets` | **Absent** | Greenfield |
| `syncAdminModules.js` / `useRightGate` | **Absent** | WEB-only patterns |
| `universal-drive-upload` | Present | Allow-list lacks `help_ticket_attachment` today |

### 4.2 WEB → Service adaptation map (locked)

| WEB assumption | Service decision |
|---|---|
| `syncAdminModules` + `admin.help-tickets` | Register `modules.name = 'help_tickets'`, route `/help-tickets`; wire `src/App.tsx` |
| Rights `view/create/edit/approve` | Employee raise = auth + `my_employee_code()`; support view = `has_module_view('help_tickets')`; support mutate/edit = `has_module_modify('help_tickets')` — **global, all dealers** |
| `employees(id)` UUID FKs | `employee_code text` (+ `raised_by_user_id uuid`) |
| Dealer / tenant row filters | **Forbidden for ACL.** Optional `raiser_dealer_code` snapshot for display/analytics only |
| WEB notification catalog | Domain outbox `help_ticket_notifications` |
| Mobile admin | Forbidden |

---

## 5) Architecture

```
┌──────────────────── Web Employee ────────────────────┐
│  GetHelpFab → /help/tickets → /help/tickets/new      │
│               /help/tickets/:id (chat + verify)      │
└───────────────────────┬──────────────────────────────┘
                        │ supabase.rpc(...)
┌──────────────────── Web Support ─────────────────────┐
│  NAV "Help Tickets" → /help-tickets                  │
│  Deep link /help-tickets?ticketId={uuid}             │
│  RequireAccess(modules: help_tickets)                │
└───────────────────────┬──────────────────────────────┘
                        │
┌──────────────── Mobile Help Lite ────────────────────┐
│  Profile → Support → help-tickets list/new/[id]      │
│  Employee RPC subset only                            │
└───────────────────────┬──────────────────────────────┘
                        ▼
        SECURITY DEFINER RPCs + RLS deny direct writes
                        ▼
   help_ticket_* tables + help_ticket_notifications
                        ▼
        universal-drive-upload (help_ticket_attachment)
```

---

## 6) Canonical RBAC (Service-native)

### 6.0 Dealer-agnostic visibility (non-negotiable)

Help Tickets are **org-wide / dealer-agnostic**.

| Rule | Detail |
|---|---|
| Support **view** | `has_module_view('help_tickets')` (or `is_admin()`) → see **every** ticket, all dealers |
| Support **edit/modify** | `has_module_modify('help_tickets')` (or `is_admin()`) → assign/status/hold/escalate/internal notes on **any** ticket, all dealers |
| Employee raiser | Sees **own** tickets only (`raised_by_employee_code = my_employee_code()`), still across dealers if they ever move — raiser identity is employee_code, not dealer |
| `dealer_code` / `my_dealer_code()` | **Must not** appear in `help_ticket_can_see`, `help_ticket_list_admin`, RLS policies, or notification recipient selection |
| Optional snapshot | May store `raiser_dealer_code` at create time for display/reporting filters in the UI only — never as a security predicate |

**Anti-pattern (do not copy from complaints):** filtering staff inbox with `dealer_code = my_dealer_code()`.

### 6.1 Gates

| Surface | Gate |
|---|---|
| Employee raise / list mine / reply (public) / verify | Authenticated + non-null `my_employee_code()` |
| Support list / detail / audit (all tickets, all dealers) | `is_admin()` OR `has_module_view('help_tickets')` |
| Assign / status / hold / escalate / internal notes (any ticket) | `is_admin()` OR `has_module_modify('help_tickets')` |
| Soft-delete (optional) | `is_admin()` OR `has_module_delete('help_tickets')` |

Employee self-service does **not** require a `user_module_permissions` row for `help_tickets`. Support inbox **does**.

### 6.2 Module registration (migration owns this)

```sql
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
```

`nav_group` is optional (many Service modules omit it). Set later via Admin if grouping is desired.

### 6.3 Support permission grants

Grant via Admin UI (`/admin`) or one-time seed SQL against known support user IDs:

```sql
-- Example pattern (adjust user_ids at deploy time)
INSERT INTO public.user_module_permissions (user_id, module_id, can_view, can_modify, can_delete)
SELECT u.id, m.id, true, true, false
FROM public.users u
CROSS JOIN public.modules m
WHERE m.name = 'help_tickets'
  AND u.email IN (/* support emails */)
ON CONFLICT DO NOTHING; -- match actual unique constraint at implement time
```

Admins (`users.role` in `admin` / `super_admin`) already bypass route guards in `App.tsx` and pass `is_admin()` in RPCs.

### 6.4 Frontend wiring (required)

Update [`src/App.tsx`](../../../../../../src/App.tsx):
1. Add `'help_tickets'` to `ModuleName`
2. Add `'/help-tickets'` to `AppRoute` + `ROUTE_MODULE_MAP['/help-tickets'] = ['help_tickets']`
3. Add `canAccessPath` branch for `/help-tickets`
4. Add `NAV_ITEMS` entry (support-facing)
5. Add `RequireAccess` route for support page
6. Add **ungated** (auth-only) routes under `/help/*` for employees
7. Mount `GetHelpFab` in authenticated shell

Update [`docs/shared/reference/MODULE_ROUTE_CONTRACT.md`](../../../../shared/reference/MODULE_ROUTE_CONTRACT.md) matrix.

**Forbidden:** `INSERT INTO admin_menu_modules`, WEB `permissions.context`, `role_permission_rights`.

---

## 7) Database Schema (migration specification)

**Rules:** Additive only. Grep `full_metadata.sql` for collisions before apply. Prefer UUID PKs for new help-ticket entities (complaints use bigint; help tickets are greenfield — UUID is fine and matches WEB product reference for ticket IDs in deep links).

### 7.1 `help_ticket_categories`

```sql
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
```

### 7.2 `help_tickets`

Identity columns use **employee_code**, not WEB `employees.id`.

`raiser_dealer_code` is an optional **snapshot only** (display/analytics). It is **not** an ACL column. Prefer nullable; do not default-filter RPCs on it.

```sql
CREATE TABLE IF NOT EXISTS public.help_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL, -- HT-000001

  -- Optional snapshot at raise time for display/reporting ONLY.
  -- NEVER use in help_ticket_can_see / list_admin / RLS security predicates.
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

CREATE INDEX idx_help_tickets_status ON public.help_tickets (status, created_at DESC);
CREATE INDEX idx_help_tickets_raiser ON public.help_tickets (raised_by_employee_code, status, created_at DESC);
CREATE INDEX idx_help_tickets_assignee ON public.help_tickets (assigned_to_employee_code, status, created_at DESC);
-- Optional analytics-only index (UI filter); never used as security gate:
CREATE INDEX idx_help_tickets_raiser_dealer ON public.help_tickets (raiser_dealer_code, status, created_at DESC)
  WHERE raiser_dealer_code IS NOT NULL;
CREATE INDEX idx_help_tickets_sla ON public.help_tickets (sla_resolution_at)
  WHERE status <> 'closed' AND sla_resolution_at IS NOT NULL;

COMMENT ON COLUMN public.help_tickets.raiser_dealer_code IS
  'Optional snapshot of raiser dealer at create time for display/reporting. Not an ACL or visibility predicate.';
```

### 7.3 `help_ticket_messages`

```sql
CREATE TABLE IF NOT EXISTS public.help_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.help_tickets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,

  created_by_user_id uuid NOT NULL REFERENCES public.users(id),
  created_by_employee_code text NOT NULL,
  created_by_name text NOT NULL,
  created_by_role text, -- raiser | support | admin | system

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

CREATE INDEX idx_help_ticket_messages_ticket
  ON public.help_ticket_messages (ticket_id, sequence_number ASC);
```

### 7.4 `help_ticket_attachments`

```sql
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
  storage_staging_path text, -- temporary; cleared after Drive success

  status text NOT NULL DEFAULT 'uploading'
    CHECK (status = ANY (ARRAY['uploading','uploaded','upload_failed'])),
  error_message text,

  download_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz
);

CREATE INDEX idx_help_ticket_attachments_ticket
  ON public.help_ticket_attachments (ticket_id);
```

### 7.5 `help_ticket_audit_log`

```sql
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

CREATE INDEX idx_help_ticket_audit_log_ticket
  ON public.help_ticket_audit_log (ticket_id, changed_at DESC);
```

### 7.6 `help_ticket_notifications`

Mirror complaints outbox shape (`complaint_notifications`) with help-ticket events:

```sql
CREATE TABLE IF NOT EXISTS public.help_ticket_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- No dealer_code column: support notifications are module-right based, not tenant-scoped.
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

CREATE INDEX idx_help_ticket_notifications_recipient
  ON public.help_ticket_notifications (recipient_user_id, created_at DESC)
  WHERE dismissed_at IS NULL;
```

---

## 8) Status Lifecycle

```
new
  → open                 (first support message OR assignment)
  → in_progress          (support starts work)
      ↔ waiting_raiser   (SLA paused)
      ↔ on_hold          (SLA paused)
      → escalated
      → resolved         (await raiser verification)
          → closed       (raiser verifies OR auto-close after 7 days)
          → reopened     (raiser rejects)
cannot_reproduce → closed (raiser accepts) / reopened
```

**Hard rules**
- Only raiser (`raised_by_employee_code = my_employee_code()`) can verify or reopen from `resolved`.
- Only support/admin (`has_module_modify` / `is_admin`) can assign, hold, escalate, set priority, post `visibility='internal'`.
- Raisers never receive internal notes in `help_ticket_get_detail` / `list_messages`.
- `closed` requires `verification_status IN ('verified','auto_closed')` or explicit support close after cannot_reproduce acceptance.

---

## 9) RPC Layer (SECURITY DEFINER)

All mutations via RPCs. Direct table writes denied by RLS for `authenticated` (SELECT limited; INSERT/UPDATE/DELETE via RPC only — same spirit as complaints staff RPCs).

### 9.1 Employee RPCs (web + mobile)

| RPC | Purpose | Gate |
|---|---|---|
| `help_ticket_list_categories()` | Active categories | Auth + employee link |
| `help_ticket_create(p_category_key, p_subject, p_description, p_priority?, p_severity?)` | Raise ticket | Auth + employee link |
| `help_ticket_list_mine(p_status[]?, p_limit, p_cursor?)` | Own tickets | Raiser functional |
| `help_ticket_get_detail(p_ticket_id)` | Ticket + public messages + attachments | Raiser or support view |
| `help_ticket_send_message(p_ticket_id, p_message_text, p_visibility DEFAULT 'public')` | Chat | Raiser (public only) or support |
| `help_ticket_verify_resolution(p_ticket_id, p_verified, p_reason?)` | Accept/reject resolution | Raiser only |
| `help_ticket_attachment_create(...)` | Staging row `status=uploading` | Participant |
| `help_ticket_attachment_mark_failed(p_id, p_error)` | Client/edge failure | Uploader |

### 9.2 Support RPCs (web only — mobile must not call)

| RPC | Purpose | Gate |
|---|---|---|
| `help_ticket_list_admin(...)` | Org-wide inbox (optional UI filters: status/assignee/priority/`raiser_dealer_code` display filter — never security) | `has_module_view` / admin |
| `help_ticket_list_assigned_to_me()` | Assignee queue | Support |
| `help_ticket_assign(p_ticket_id, p_assignee_employee_code, p_reason?)` | Assign | `has_module_modify` |
| `help_ticket_update_status(...)` | Status transitions | `has_module_modify` |
| `help_ticket_update_priority(...)` | Priority | `has_module_modify` |
| `help_ticket_hold(...)` | On hold + SLA pause | `has_module_modify` |
| `help_ticket_escalate(...)` | Escalate | `has_module_modify` |
| `help_ticket_mark_duplicate(...)` | Duplicate link | `has_module_modify` |
| `help_ticket_get_audit_log(p_ticket_id)` | Audit trail | `has_module_view` |
| `help_ticket_list_assignees(p_search?)` | Support picker from `employee_master` | `has_module_modify` |

### 9.3 Notification RPCs

| RPC | Purpose |
|---|---|
| `list_my_help_ticket_notifications(p_limit, p_offset, p_include_dismissed)` | Inbox |
| `get_unread_help_ticket_notification_count()` | Badge |
| `mark_help_ticket_notification_read(p_id)` | Mark one |
| `mark_all_help_ticket_notifications_read()` | Mark all |

Pattern source: `list_my_complaint_notifications` / TopNav bell in `src/App.tsx`.

### 9.4 Helpers (private / SECURITY DEFINER)

| Helper | Purpose |
|---|---|
| `help_ticket_require_employee()` | Resolve `auth.uid()` + `my_employee_code()` or raise |
| `help_ticket_require_support_view()` | Admin or `has_module_view('help_tickets')` |
| `help_ticket_require_support_modify()` | Admin or `has_module_modify('help_tickets')` |
| `help_ticket_can_see(p_ticket_id)` | Raiser OR assignee OR `has_module_view('help_tickets')` OR admin — **no dealer_code check** |
| `help_ticket_next_number()` | `HT-` + zero-padded sequence |
| `help_ticket_next_sequence_number(p_ticket_id)` | Message ordering with row lock |
| `help_ticket_calculate_sla_targets(p_category_id, p_priority)` | SLA timestamps |
| `help_ticket_emit_notification(...)` | Outbox insert (best-effort; never fail parent txn) |

### 9.5 Ticket number helper (sketch)

```sql
CREATE OR REPLACE FUNCTION public.help_ticket_next_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_n bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(ticket_number, '\D', '', 'g'), '')::bigint), 0) + 1
    INTO v_n
  FROM public.help_tickets;
  RETURN 'HT-' || lpad(v_n::text, 6, '0');
END;
$$;
```

Prefer a dedicated sequence `help_ticket_number_seq` at implement time for concurrency safety.

---

## 10) RLS Strategy

Enable RLS on all `help_ticket_*` tables.

Recommended posture:
- **No** broad `INSERT`/`UPDATE`/`DELETE` for `authenticated` on core tables.
- Preferred for Phase 1: **RPC-only reads/writes** (GRANT EXECUTE to `authenticated`; revoke direct DML).
- If any SELECT policy is added for debugging, it must **not** constrain by `raiser_dealer_code` / `my_dealer_code()` for support users — support visibility is module-right only.
- Do **not** copy complaints-style `dealer_code = my_dealer_code()` policies onto help-ticket tables.

Internal notes: never returned to raiser in RPC JSON even if a SELECT policy exists.

---

## 11) File Upload — Universal Drive Only

### 11.1 Edge allow-list change

Extend [`supabase/functions/universal-drive-upload/index.ts`](../../../../../../supabase/functions/universal-drive-upload/index.ts):

```ts
resource_type?: 'document' | 'panel_photo' | 'reception_estimate' | 'reception_invoice'
  | 'bodyshop_intake_photo' | 'bodyshop_document' | 'insurance_renewal_quote'
  | 'help_ticket_attachment'
```

### 11.2 Client flow

1. Validate file (max 25 MB; images/PDF/Office).
2. `help_ticket_attachment_create` → row `status='uploading'`.
3. Stage to Supabase Storage temporary path (bucket already used by Drive pipeline — confirm at implement time; prefer existing internal/autodoc staging conventions).
4. Invoke `universal-drive-upload` with metadata pointing at `help_ticket_attachments.drive_url` / `drive_file_id`.
5. On success: `status='uploaded'`, clear staging path; on failure: `upload_failed`.

### 11.3 Client helpers to create

| Platform | File | Pattern source |
|---|---|---|
| Web | `src/lib/helpTicketUpload.ts` | Reception / bodyshop Drive callers |
| Web | `src/lib/api/helpTickets.ts` | `src/lib/api/complaints.ts` |
| Mobile | `mobile/src/lib/api/helpTicketUpload.ts` | `mobile/src/lib/api/documents.ts` |
| Mobile | `mobile/src/lib/api/helpTickets.ts` | same RPC contracts |

### 11.4 Forbidden
- Permanent Supabase Storage URLs as attachment source of truth
- Bypassing `universal-drive-upload`
- Storing file blobs in message JSON

---

## 12) Frontend Implementation

### 12.1 Web employee

| Artifact | Path |
|---|---|
| FAB | `src/components/help/GetHelpFab.tsx` |
| My tickets | `src/pages/help/MyHelpTicketsPage.tsx` → `/help/tickets` |
| Raise | `src/pages/help/RaiseHelpTicketPage.tsx` → `/help/tickets/new` |
| Detail | `src/pages/help/HelpTicketDetailPage.tsx` → `/help/tickets/:id` |
| API | `src/lib/api/helpTickets.ts` |

FAB visible when session exists and employee link resolves (reuse whatever App already uses for linked identity; fail closed if `my_employee_code` would be null).

### 12.2 Web support

| Artifact | Path |
|---|---|
| Admin inbox | `src/pages/HelpTicketsAdminPage.tsx` → `/help-tickets` |
| Deep link | `/help-tickets?ticketId={uuid}` |

UX patterns to borrow from [`src/pages/ComplaintsPage.tsx`](../../../../../../src/pages/ComplaintsPage.tsx): status filters, detail drawer/panel, activity/audit, message thread with internal toggle.

### 12.3 Notifications (web)

Extend TopNav bell in `src/App.tsx` (or extract shared bell) to also poll:
- `get_unread_help_ticket_notification_count`
- `list_my_help_ticket_notifications`

Deep link:
- Raiser → `/help/tickets/{id}`
- Support → `/help-tickets?ticketId={id}`

### 12.4 Mobile

Owned by **MOBILE-HELP-001** (employee subset). Shared backend contracts live in this document.

---

## 13) Notifications Design

Emit from ticket/message triggers or end of RPCs via `help_ticket_emit_notification` (EXCEPTION handler → NOTICE, never abort parent — mirror complaints trigger style).

| Event | Recipients |
|---|---|
| raised | All users with `help_tickets` modify (or view) + admins — **not** filtered by raiser dealer |
| assigned | Assignee user (resolve via `user_employee_links` by employee_code; ignore dealer on link) |
| message_added (public) | Counterparty (raiser ↔ assignee/support) |
| resolved | Raiser |
| reopened | Assignee + all support modify holders |
| escalated / held / sla_breached | All support modify holders (org-wide) |

Phase 1 channel: `in_app` only. Email optional later.

---

## 14) Implementation Phases (summary)

See [PHASES.md](PHASES.md) for full tracking.

| Phase | Focus | Duration |
|---|---|---|
| 1 | DB: tables, RLS, helpers, RPCs, module row | ~1 week |
| 2 | Web employee + support UI + Drive resource_type | ~1–1.5 weeks |
| 3 | In-app notifications + TopNav + deep links | ~3–4 days |
| 4 | Mobile Help Lite + OTA | ~1 week |
| 5 | SLA breach job + hardening + evidence | ~3–5 days |

---

## 15) Testing & Acceptance

### 15.1 Backend
- Employee without module grant can create + list mine.
- Employee cannot call `help_ticket_list_admin` / assign / internal note.
- Support with view sees **org-wide** inbox (tickets from every dealer); without modify cannot assign.
- Support with modify can assign/update a ticket whose `raiser_dealer_code` differs from the support user's own dealer link.
- `help_ticket_can_see` / `list_admin` SQL contains **no** `my_dealer_code()` / `raiser_dealer_code` equality security filter.
- Raiser cannot see `visibility='internal'` messages.
- Only raiser can verify/reopen from `resolved`.
- Attachment finalize writes Drive URL; staging cleaned.
- Cross-client: create on web → appears in `help_ticket_list_mine` on mobile session.

### 15.2 Frontend
- FAB hidden for unauthenticated / unlinked users.
- `/help-tickets` denied without module (non-admin).
- `/help/*` reachable for linked employees without module.
- Mobile has no admin screens and does not import support RPCs.

### 15.3 Evidence location
`docs/Implementation_plans/webversion/categories/help-tickets/evidence/`

---

## 16) Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Confusion with complaints | Separate tables/routes/docs; explicit UI labels "Get Help" vs "Complaints" |
| Accidental dealer scoping (copying complaints) | §6.0 forbids dealer ACL; checklist + acceptance tests for cross-dealer support |
| Copy-paste WEB RBAC | Checklist forbids `admin.*` contexts and syncAdminModules |
| Unlinked users | RPC raises clear error; FAB gated |
| Drive allow-list miss | Phase 2 blocked until `help_ticket_attachment` deployed |
| Notification spam | Deduplicate assign storms; in_app only Phase 1 |
| SLA concurrency | Dedicated sequence for ticket numbers; pause flags for hold/waiting |

---

## 17) Guardrails & Constraints

1. **DB truth** after every migration batch: refresh `supabase/backups/full_metadata.sql`.
2. **Additive migrations only** — no DROP of unrelated objects.
3. **Never** insert into WEB-only tables (`admin_menu_modules`, WEB `permissions`/`rights`).
4. **Never** reuse `complaint_*` for employee help.
5. **Never** use `dealer_code` / `my_dealer_code()` / `raiser_dealer_code` as a visibility or work-rights predicate.
6. **Never** show raw UUIDs in UI; use name snapshots.
7. **Mobile** must not call support-only RPCs.
8. Update `MODULE_ROUTE_CONTRACT.md` in the same PR as App.tsx module wiring.
9. Seed inserts use `ON CONFLICT DO NOTHING`.

---

## 18) File Touch Map (implementation, not this docs PR)

### Migrations
- `supabase/migrations/YYYYMMDDHHMMSS_help_tickets_schema.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_help_tickets_rpcs.sql`
- `supabase/migrations/YYYYMMDDHHMMSS_help_tickets_module.sql` (may merge)

### Edge
- `supabase/functions/universal-drive-upload/index.ts`

### Web
- `src/App.tsx`
- `src/lib/api/helpTickets.ts`
- `src/lib/helpTicketUpload.ts`
- `src/components/help/*`
- `src/pages/help/*`
- `src/pages/HelpTicketsAdminPage.tsx`
- `docs/shared/reference/MODULE_ROUTE_CONTRACT.md`

### Mobile
- `mobile/src/app/help-tickets/*`
- `mobile/src/app/(tabs)/profile.tsx` (entry)
- `mobile/src/lib/api/helpTickets.ts`
- `mobile/src/lib/api/helpTicketUpload.ts`

---

## 19) Related Plans

- Complaints (peer patterns): `../complaints/active/01_COMPREHENSIVE_PLAN.md`
- Drive: `../drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md`
- Mobile companion: `../../../../mobileversion/categories/help-tickets/active/MOBILE-HELP-001_EMPLOYEE_HELP_LITE_PLAN.md`
- WEB product reference (external): TECHWHEELS-WEB `HELP_TICKETS_IMPLEMENTATION_PLAN.md`
