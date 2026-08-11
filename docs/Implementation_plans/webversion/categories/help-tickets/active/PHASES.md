# HELP-001 — Phase Tracking

**Implementation Plan:** HELP-001  
**Last Updated:** 2026-08-11 (Phase 5 SLA cron migration authored)  
**Total Phases:** 5  
**Current Progress:** 5/5 (95%)  
**Status:** Phase 5 migration ready — apply SQL + checks + metadata refresh  

---

## Phase Overview

| Phase | Name | Duration | Status | Completion % |
|-------|------|----------|--------|--------------|
| 1 | Database schema, RLS, RPCs, module | ~1 week | ✅ Applied + full_metadata refreshed | 100% |
| 2 | Web employee + support UI + Drive | ~1–1.5 weeks | ✅ Deployed (edge `universal-drive-upload` + Vercel) | 100% |
| 3 | In-app notifications + deep links | ~3–4 days | 🟡 Code landed — deploy + smoke | 90% |
| 4 | Mobile Employee Help Lite | ~1 week | 🟡 Code landed — OTA + cross-platform smoke | 90% |
| 5 | SLA cron + hardening + evidence | ~3–5 days | 🟡 Migration authored — apply + checks | 85% |

**Overall Progress: ~95% — Phase 5 apply + sign-off remaining**

Authority: [HELP-001_COMPREHENSIVE_PLAN.md](HELP-001_COMPREHENSIVE_PLAN.md)  
Execution checklist: [CHECKLIST.md](CHECKLIST.md)  
Mobile detail: [MOBILE-HELP-001](../../../../mobileversion/categories/help-tickets/active/MOBILE-HELP-001_EMPLOYEE_HELP_LITE_PLAN.md)

---

## Phase 1: Database Schema, RLS, RPCs, Module

**Goal:** Greenfield `help_ticket_*` backend ready for web and mobile clients.

### Deliverables
- [x] Pre-migration grep against `supabase/backups/full_metadata.sql` (no `help_ticket_*` collisions)
- [x] Tables: categories, tickets, messages, attachments, audit_log, notifications (`20260811120000_help_tickets_schema.sql`)
- [x] Category seed (Service keys)
- [x] Helpers + employee/support/notification RPCs (`20260811120100_help_tickets_rpcs.sql`)
- [x] RLS enabled; RPC-only mutation posture (REVOKE direct table access)
- [x] `modules` row `help_tickets` → `/help-tickets`
- [x] Apply migrations to target DB
- [x] Refresh `full_metadata.sql` after apply

### Success Criteria
- [ ] Linked employee can `help_ticket_create` + `help_ticket_list_mine`
- [ ] Unlinked / anon cannot create
- [ ] Employee cannot execute support-only RPCs
- [ ] Support view/modify gates enforced
- [ ] Support with modify on dealer B can work tickets raised from dealer A (org-wide)
- [x] No `my_dealer_code()` / dealer equality in `help_ticket_can_see` or `list_admin` (static review)
- [ ] Internal notes never returned to raiser in `help_ticket_get_detail`

### Evidence
- [`../evidence/HELP-001_PHASE1_MIGRATIONS.md`](../evidence/HELP-001_PHASE1_MIGRATIONS.md)

### Dependencies
- Existing helpers: `my_employee_code()`, `is_admin()`, `has_module_*` (`my_dealer_code` must not gate help tickets)

---

## Phase 2: Web Employee + Support UI + Drive

**Goal:** Full web product surface; attachments via Universal Drive.

### Deliverables
- [x] `ModuleName` / `ROUTE_MODULE_MAP` / `NAV_ITEMS` / routes in `src/App.tsx`
- [x] Update `MODULE_ROUTE_CONTRACT.md`
- [x] `GetHelpFab` + `/help/tickets*` pages
- [x] `HelpTicketsAdminPage` + `?ticketId=` deep link
- [x] `src/lib/api/helpTickets.ts` + `src/lib/helpTicketUpload.ts`
- [x] `universal-drive-upload` allow-list: `help_ticket_attachment`
- [x] Deploy updated `universal-drive-upload` edge function
- [x] Vercel web deploy
- [ ] Grant support users `can_view`/`can_modify` via Admin UI (ops — if not already done)

### Success Criteria
- [x] Web employee + support surfaces live (deployed)
- [ ] Raise ticket under 60s (happy path) — verify in prod
- [ ] Support inbox lists all tickets; employee list shows only mine — verify in prod
- [ ] Attachment ends with non-null `drive_url` and `status=uploaded` — verify in prod
- [ ] Non-support non-admin denied at `/help-tickets` — verify in prod

### Dependencies
- Phase 1 RPCs deployed

---

## Phase 3: In-App Notifications + Deep Links

**Goal:** Ticket lifecycle events visible in TopNav; correct deep links.

### Deliverables
- [x] Emit notifications from RPCs/triggers (best-effort outbox) — Phase 1 RPCs
- [x] Notification list / unread / mark-read API wrappers (`src/lib/api/helpTickets.ts`)
- [x] TopNav bell merge with complaints (combined unread + feed)
- [x] Deep links: raiser → `/help/tickets/:id`; support/assignee/admin → `/help-tickets?ticketId=`
- [ ] Vercel deploy + prod smoke

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
- [x] Expo routes under `mobile/src/app/help-tickets/`
- [x] Profile → Support entry points
- [x] `mobile/src/lib/api/helpTickets.ts` + upload helper
- [x] Employee RPC subset only (no support RPC imports)
- [ ] OTA / release notes
- [ ] Cross-platform smoke (web ↔ mobile)

### Success Criteria
- [ ] Create on mobile visible on web immediately (and reverse)
- [x] No admin/assign UI shipped
- [ ] Attachments work via Drive allow-list

### Dependencies
- Phase 1 required; Phase 2/3 recommended for notification parity

See MOBILE-HELP-001 for screen-level detail.

---

## Phase 5: SLA Cron + Hardening + Evidence

**Goal:** Support-facing SLA breach detection and production hardening.

### Deliverables
- [x] `check_help_ticket_sla_breaches` + `run_help_ticket_sla_jobs` (pg_cron */15) — pause-aware
- [x] Breach → audit + `sla_breached` notification + `tags` / breach timestamps
- [x] Auto-close resolved tickets after 7 days → `verification_status=auto_closed`
- [x] SQL checks: `supabase/sql_checks/20260811140000_help_ticket_sla_cron_and_auto_close_checks.sql`
- [x] Evidence: `../evidence/HELP-001_PHASE5_SLA.md`
- [ ] Apply migration in Supabase + run checks
- [ ] Refresh `supabase/backups/full_metadata.sql`
- [ ] Tracker → DN when signed off

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
