# MOBILE-HELP-001 — Employee Help Lite (Mobile)

**Plan ID:** MOBILE-HELP-001  
**Created:** 2026-08-11  
**Last Updated:** 2026-08-11 (dealer-agnostic visibility aligned with HELP-001)  
**Status:** Planned (documentation only)  
**Owner:** Mobile Team + Platform  
**Category:** help-tickets  
**Shared backend authority:** [HELP-001_COMPREHENSIVE_PLAN.md](../../../../webversion/categories/help-tickets/active/HELP-001_COMPREHENSIVE_PLAN.md)  
**Phase alignment:** HELP-001 Phase 4  

---

## 1) Objective

Ship **employee-only** Help Tickets on the Techwheels Service mobile app so linked employees can raise tickets, view their threads, reply, and verify resolution. Support/admin management remains **web-only**.

### Measurable outcomes
- Profile → Support → Raise a ticket / My tickets works for linked employees
- Create/list/detail/reply/verify use the same SECURITY DEFINER RPCs as web
- Ticket created on mobile appears immediately in web my-tickets / support inbox
- No mobile screen can assign, hold, escalate, or list all tickets

---

## 2) Scope

### In scope
- Expo Router screens under `mobile/src/app/help-tickets/`
- Entry from [`mobile/src/app/(tabs)/profile.tsx`](../../../../../../mobile/src/app/(tabs)/profile.tsx)
- Employee RPC subset + Drive upload for attachments
- Optional tertiary link to existing phone/WhatsApp contact (if present) — Help Lite remains primary

### Out of scope
- Mobile support console / assignee UI / audit log screens
- Calling `help_ticket_list_admin`, `help_ticket_assign`, `help_ticket_hold`, `help_ticket_escalate`, `help_ticket_mark_duplicate`, `help_ticket_get_audit_log`, `help_ticket_list_assignees`
- Registering a separate mobile admin module
- Reusing customer `complaint_tickets` / job-card complaint text fields

---

## 3) Prerequisites

| Prerequisite | Owner |
|---|---|
| HELP-001 Phase 1 RPCs + tables deployed | Backend |
| `universal-drive-upload` allows `help_ticket_attachment` | Platform (HELP-001 Phase 2) |
| Caller has active primary `user_employee_links` (`my_employee_code()` non-null) | Auth / Admin ops |

Mobile may start UI against Phase 1 once employee RPCs exist; Drive attach waits for allow-list.

---

## 4) Routing & Entry

### 4.1 Expo routes (proposed)

| Screen | Path | RPC |
|---|---|---|
| My tickets | `mobile/src/app/help-tickets/index.tsx` | `help_ticket_list_mine` |
| Raise ticket | `mobile/src/app/help-tickets/new.tsx` | `help_ticket_list_categories`, `help_ticket_create` |
| Detail + chat | `mobile/src/app/help-tickets/[ticketId].tsx` | `help_ticket_get_detail`, `help_ticket_send_message`, `help_ticket_verify_resolution` |
| Stack layout | `mobile/src/app/help-tickets/_layout.tsx` | — |

Register stack from root `mobile/src/app/_layout.tsx` if required by existing expo-router patterns (mirror `job-cards/` stack).

### 4.2 Profile entry

In `profile.tsx`, add a Support section:

1. **Raise a ticket** → `/help-tickets/new`
2. **My tickets** → `/help-tickets`
3. Optional: existing support-contact / phone fallback (tertiary)

Gate: hide Help Lite if session missing; if employee link missing, show clear “Link employee profile” message (do not crash).

---

## 5) RBAC (mobile)

Mobile does **not** use WEB `admin.help-tickets` or `useRightGate`.

| Action | Gate |
|---|---|
| Open Help Lite screens | Authenticated |
| Create / list mine / reply / verify | RPC enforces `my_employee_code()` |
| Support actions | **Not available** on mobile |

Do not require `help_tickets` module permission for employee Help Lite (same as web `/help/*`).

**Dealer-agnostic (shared with HELP-001 §6.0):** employee Help Lite lists **own** tickets by `raised_by_employee_code` only. Mobile never filters by `my_dealer_code()`. Web support users with `has_module_modify('help_tickets')` can work any ticket regardless of the raiser's dealer — mobile has no support surface for that.

---

## 6) API Layer

Create:
- `mobile/src/lib/api/helpTickets.ts` — typed wrappers for **employee** RPCs only
- `mobile/src/lib/api/helpTicketUpload.ts` — stage + `universal-drive-upload` (pattern: `mobile/src/lib/api/documents.ts`)

### Allowed RPC list (exhaustive for mobile)

```
help_ticket_list_categories
help_ticket_create
help_ticket_list_mine
help_ticket_get_detail
help_ticket_send_message          -- visibility must be 'public' from mobile
help_ticket_verify_resolution
help_ticket_attachment_create
help_ticket_attachment_mark_failed
```

Optional read for UX (if product wants badge on Profile later):
```
get_unread_help_ticket_notification_count
list_my_help_ticket_notifications
mark_help_ticket_notification_read
```

### Forbidden RPC list (code review reject)

```
help_ticket_list_admin
help_ticket_list_assigned_to_me
help_ticket_assign
help_ticket_update_status
help_ticket_update_priority
help_ticket_hold
help_ticket_escalate
help_ticket_mark_duplicate
help_ticket_get_audit_log
help_ticket_list_assignees
```

---

## 7) UX Requirements

### 7.1 My tickets
- List: ticket_number, subject, status, priority, updated_at
- Filter chips: open / resolved / closed / all (client-side or RPC status array)
- Empty state CTA → Raise ticket

### 7.2 Raise ticket
- Category picker from `help_ticket_list_categories`
- Subject + description required
- Optional priority (default category/default)
- Optional attachments (Drive pipeline)
- Submit → navigate to detail

### 7.3 Detail + chat
- Header: ticket_number, status, category, assignee name (if any)
- Message list: public only (RPC already filters)
- Composer for public replies when not closed
- When `status = resolved`: Verify / Not fixed actions → `help_ticket_verify_resolution`
- Attachment preview: open Drive URL / image preview; no raw UUID labels

### 7.4 Display rules
- Show `raised_by_name` / `assigned_to_name` / `created_by_name` snapshots
- Never show user UUIDs or employee codes as primary labels (codes OK in debug builds only)

---

## 8) Attachments

1. Client validate (≤ 25 MB; image/PDF/Office)
2. `help_ticket_attachment_create`
3. Stage to Storage path agreed in HELP-001
4. Invoke `universal-drive-upload` with `resource_type: 'help_ticket_attachment'`
5. Poll/refresh attachment until `status=uploaded` or `upload_failed`

Reuse compression patterns from autodoc / documents mobile upload where applicable.

---

## 9) Notifications (optional Phase 4 polish)

If HELP-001 Phase 3 web bell exists, mobile may:
- Show unread count on Profile Support row
- Deep link notification → `/help-tickets/[ticketId]`

Push notifications are **not** required for MOBILE-HELP-001 v1 (in-app list refresh on focus is enough).

---

## 10) Testing

| Case | Expected |
|---|---|
| Linked employee raises ticket | Appears in mobile list + web my-tickets |
| Unlinked employee | Clear error; no orphan rows |
| Reply on open ticket | Message visible web + mobile |
| Internal note posted on web | Never visible on mobile detail |
| Verify resolution | Status closed; web support sees update |
| Reject resolution | Status reopened |
| Attempt to import support RPC | Code review fail |
| Offline / flaky network | Upload failure sets `upload_failed`; user can retry |

Evidence: `docs/Implementation_plans/mobileversion/categories/help-tickets/evidence/`

---

## 11) Implementation Checklist (mobile)

- [ ] `_layout.tsx` + index / new / `[ticketId]` screens
- [ ] Profile Support entry
- [ ] `helpTickets.ts` employee wrappers only
- [ ] `helpTicketUpload.ts`
- [ ] Cross-platform smoke with web
- [ ] OTA / store notes
- [ ] Evidence file after QA

---

## 12) Guardrails

1. Shared schema/RPC contracts change only via HELP-001 (web plan) — mobile documents UI deltas here.
2. No mobile admin module registration in `public.modules`.
3. Do not confuse with bodyshop “support role” helpers in `businessRoles.ts`.
4. After backend migrations, rely on refreshed `supabase/backups/full_metadata.sql` as truth.
5. Never add dealer-scoped client filters that imply ticket privacy by dealer; employee list is raiser-scoped only.

---

## 13) Related Docs

- Web/shared: [HELP-001](../../../../webversion/categories/help-tickets/active/HELP-001_COMPREHENSIVE_PLAN.md)
- Phases: [PHASES.md](../../../../webversion/categories/help-tickets/active/PHASES.md)
- Drive: [DRIVE-001](../../../../webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md)
- Mobile program: [MOBILE-010](../../program/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md)
