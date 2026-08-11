# HELP-001 — Phase Tracking

**Implementation Plan:** HELP-001  
**Last Updated:** 2026-08-11 (dealer-agnostic visibility locked)  
**Total Phases:** 5  
**Current Progress:** 0/5 (0%)  
**Status:** Not Started  

---

## Phase Overview

| Phase | Name | Duration | Status | Completion % |
|-------|------|----------|--------|--------------|
| 1 | Database schema, RLS, RPCs, module | ~1 week | ⏳ Not Started | 0% |
| 2 | Web employee + support UI + Drive | ~1–1.5 weeks | ⏳ Blocked by Phase 1 | 0% |
| 3 | In-app notifications + deep links | ~3–4 days | ⏳ Blocked by Phase 2 | 0% |
| 4 | Mobile employee Help Lite | ~1 week | ⏳ Blocked by Phase 1 (RPC) / Phase 2 preferred | 0% |
| 5 | SLA cron + hardening + evidence | ~3–5 days | ⏳ Blocked by Phase 3 | 0% |

**Overall Progress: 0% — Docs complete; ready to begin Phase 1 implementation**

Authority: [HELP-001_COMPREHENSIVE_PLAN.md](HELP-001_COMPREHENSIVE_PLAN.md)  
Execution checklist: [CHECKLIST.md](CHECKLIST.md)  
Mobile detail: [MOBILE-HELP-001](../../../../mobileversion/categories/help-tickets/active/MOBILE-HELP-001_EMPLOYEE_HELP_LITE_PLAN.md)

---

## Phase 1: Database Schema, RLS, RPCs, Module

**Goal:** Greenfield `help_ticket_*` backend ready for web and mobile clients.

### Deliverables
- [ ] Pre-migration grep against `supabase/backups/full_metadata.sql` (no `help_ticket_*` collisions)
- [ ] Tables: categories, tickets, messages, attachments, audit_log, notifications
- [ ] Category seed (Service keys)
- [ ] Helpers + employee/support/notification RPCs
- [ ] RLS enabled; RPC-only mutation posture
- [ ] `modules` row `help_tickets` → `/help-tickets`
- [ ] Refresh `full_metadata.sql` after apply

### Success Criteria
- [ ] Linked employee can `help_ticket_create` + `help_ticket_list_mine`
- [ ] Unlinked / anon cannot create
- [ ] Employee cannot execute support-only RPCs
- [ ] Support view/modify gates enforced
- [ ] Support with modify on dealer B can work tickets raised from dealer A (org-wide)
- [ ] No `my_dealer_code()` / dealer equality in `help_ticket_can_see` or `list_admin`
- [ ] Internal notes never returned to raiser in `help_ticket_get_detail`

### Evidence
- Place under `../evidence/` (e.g. `HELP-001_PHASE1_RPC_MATRIX.md`)

### Dependencies
- Existing helpers: `my_employee_code()`, `is_admin()`, `has_module_*` (`my_dealer_code` must not gate help tickets)

---

## Phase 2: Web Employee + Support UI + Drive

**Goal:** Full web product surface; attachments via Universal Drive.

### Deliverables
- [ ] `ModuleName` / `ROUTE_MODULE_MAP` / `NAV_ITEMS` / routes in `src/App.tsx`
- [ ] Update `MODULE_ROUTE_CONTRACT.md`
- [ ] `GetHelpFab` + `/help/tickets*` pages
- [ ] `HelpTicketsAdminPage` + `?ticketId=` deep link
- [ ] `src/lib/api/helpTickets.ts` + `src/lib/helpTicketUpload.ts`
- [ ] `universal-drive-upload` allow-list: `help_ticket_attachment`
- [ ] Grant support users `can_view`/`can_modify` via Admin or seed

### Success Criteria
- [ ] Raise ticket under 60s (happy path)
- [ ] Support inbox lists all tickets; employee list shows only mine
- [ ] Attachment ends with non-null `drive_url` and `status=uploaded`
- [ ] Non-support non-admin denied at `/help-tickets`

### Dependencies
- Phase 1 RPCs deployed

---

## Phase 3: In-App Notifications + Deep Links

**Goal:** Ticket lifecycle events visible in TopNav; correct deep links.

### Deliverables
- [ ] Emit notifications from RPCs/triggers (best-effort outbox)
- [ ] Notification list / unread / mark-read RPCs wired in UI
- [ ] TopNav bell integration (sibling or merge with complaints bell)
- [ ] Deep links: raiser → `/help/tickets/:id`; support → `/help-tickets?ticketId=`

### Success Criteria
- [ ] Raise → support recipients get in_app row
- [ ] Resolve → raiser notified
- [ ] Mark read clears badge
- [ ] Deep link opens correct surface

### Dependencies
- Phase 2 pages exist for deep-link targets

---

## Phase 4: Mobile Employee Help Lite

**Goal:** Employee parity for create/list/detail/reply/verify; no mobile admin.

### Deliverables
- [ ] Expo routes under `mobile/src/app/help-tickets/`
- [ ] Profile → Support entry points
- [ ] `mobile/src/lib/api/helpTickets.ts` + upload helper
- [ ] Employee RPC subset only (lint/review ban on support RPCs)
- [ ] OTA / release notes

### Success Criteria
- [ ] Create on mobile visible on web immediately (and reverse)
- [ ] No admin/assign UI shipped
- [ ] Attachments work via Drive allow-list

### Dependencies
- Phase 1 required; Phase 2/3 recommended for notification parity

See MOBILE-HELP-001 for screen-level detail.

---

## Phase 5: SLA Cron + Hardening + Evidence

**Goal:** Support-facing SLA breach detection and production hardening.

### Deliverables
- [ ] `check_help_ticket_sla_breaches` (or pg_cron / scheduled edge) — pause-aware
- [ ] Breach → notification + optional status/escalation flag
- [ ] Auto-close resolved tickets after 7 days without verification
- [ ] pgTAP / SQL checks for gates + visibility
- [ ] Evidence pack + tracker status → DN when signed off

### Success Criteria
- [ ] Held / waiting_raiser tickets do not false-breach
- [ ] Auto-close sets `verification_status=auto_closed`
- [ ] Evidence checklist complete

### Dependencies
- Phases 1–3

---

## Blockers Log

| Date | Phase | Blocker | Owner | Resolution |
|------|-------|---------|-------|------------|
| — | — | None | — | — |
