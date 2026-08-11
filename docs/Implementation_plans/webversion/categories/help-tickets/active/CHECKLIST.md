# HELP-001 — Implementation Execution Checklist

**Project:** Employee Help Tickets (Get Help)  
**Plan:** [HELP-001_COMPREHENSIVE_PLAN.md](HELP-001_COMPREHENSIVE_PLAN.md)  
**Created:** 2026-08-11  
**Status:** 🟡 Phase 2 web surfaces landed — deploy edge + grant support perms  

Legend: `[ ]` pending · `[x]` done · `N/A` skipped with note

---

## PHASE 0: PRE-FLIGHT AUDIT

- [x] **0.1** Grep DB truth for collisions  
  `rg -n "help_ticket|admin\\.help-tickets" supabase/backups/full_metadata.sql`  
  Expected: no `help_ticket_*` tables/functions (complaints-only ticket hits OK)

- [x] **0.2** Confirm helpers exist: `my_employee_code`, `is_admin`, `has_module_view`, `has_module_modify`, `has_module_delete`, `get_all_my_permissions` (`my_dealer_code` exists but must **not** be used for help-ticket ACL)

- [x] **0.3** Confirm identity tables: `employee_master.employee_code`, `user_employee_links`, `users.id`

- [x] **0.4** Confirm `complaint_*` remains customer-only — do not alter for this feature; do **not** copy complaints dealer-scoped RLS onto help tickets

- [x] **0.4b** Lock design: help tickets are **dealer-agnostic** — `has_module_modify('help_tickets')` works any ticket org-wide

- [x] **0.5** Confirm Drive edge allow-list location in `supabase/functions/universal-drive-upload/index.ts` (Phase 2 change)

- [x] **0.6** Confirm App RBAC pattern in `src/App.tsx` (`ModuleName`, `ROUTE_MODULE_MAP`, `RequireAccess`) (Phase 2 wiring)

---

## PHASE 1: DATABASE

### Schema
- [x] **1.1** Create migration `20260811120000_help_tickets_schema.sql`
  - [x] `help_ticket_categories` + seed
  - [x] `help_tickets` (optional `raiser_dealer_code` snapshot only — not `dealer_code` ACL column)
  - [x] `help_ticket_messages`
  - [x] `help_ticket_attachments`
  - [x] `help_ticket_audit_log`
  - [x] `help_ticket_notifications` (**no** dealer_code column)
  - [x] Indexes per HELP-001 §7
  - [x] Prefer `help_ticket_number_seq` for ticket numbers

### Module
- [x] **1.2** `INSERT INTO public.modules (... name='help_tickets', route='/help-tickets' ...) ON CONFLICT (name) DO NOTHING`

### RPCs & helpers
- [x] **1.3** Helpers: `help_ticket_require_employee`, `help_ticket_require_support_view/modify`, `help_ticket_can_see` (**no dealer predicate**), `help_ticket_next_number`, `help_ticket_next_sequence_number`, `help_ticket_calculate_sla_targets`, `help_ticket_emit_notification`
- [x] **1.4** Employee RPCs (create, list_mine, get_detail, send_message, verify, categories, attachment create/fail)
- [x] **1.5** Support RPCs (list_admin, assign, status, priority, hold, escalate, mark_duplicate, audit, list_assignees, list_assigned_to_me)
- [x] **1.6** Notification RPCs (list, unread count, mark read / mark all)
- [x] **1.7** GRANT EXECUTE to `authenticated` (and service_role as needed); revoke direct DML from authenticated if using RPC-only posture

### RLS
- [x] **1.8** `ENABLE ROW LEVEL SECURITY` on all `help_ticket_*` tables
- [x] **1.9** Policies match chosen posture (RPC-only preferred)

### Verify
- [x] **1.10** Apply migrations cleanly
- [ ] **1.11** Manual SQL smoke: create → list_mine → support list → internal note hidden from raiser
- [ ] **1.11b** Cross-dealer smoke: raiser linked to dealer A; support user linked to dealer B with `can_modify` on `help_tickets` can `list_admin` + `assign` + `update_status` that ticket
- [x] **1.11c** Grep migration SQL: no `my_dealer_code()` in ACL paths; `list_admin` optional `raiser_dealer_code` is display filter only
- [x] **1.12** Refresh `supabase/backups/full_metadata.sql`
- [x] **1.13** Evidence note in `../evidence/HELP-001_PHASE1_MIGRATIONS.md`

---

## PHASE 2: WEB UI + DRIVE

### Contract / RBAC shell
- [ ] **2.1** Add `'help_tickets'` to `ModuleName` in `src/App.tsx`
- [ ] **2.2** Add `'/help-tickets'` to `AppRoute` + `ROUTE_MODULE_MAP`
- [ ] **2.3** `canAccessPath` + `RequireAccess` for `/help-tickets`
- [ ] **2.4** `NAV_ITEMS` entry for support
- [ ] **2.5** Auth-only routes for `/help/tickets`, `/help/tickets/new`, `/help/tickets/:id`
- [ ] **2.6** Update `docs/shared/reference/MODULE_ROUTE_CONTRACT.md`
- [ ] **2.7** Grant support users module permissions (Admin UI or seed)

### API / upload
- [ ] **2.8** `src/lib/api/helpTickets.ts`
- [ ] **2.9** `src/lib/helpTicketUpload.ts`
- [ ] **2.10** Edge: add `help_ticket_attachment` to `resource_type` union + validation
- [ ] **2.11** Deploy edge function

### Pages
- [ ] **2.12** `GetHelpFab` (linked employees only)
- [ ] **2.13** My tickets / Raise / Detail pages
- [ ] **2.14** `HelpTicketsAdminPage` with filters, assign, status, hold, escalate, internal notes, audit
- [ ] **2.15** Deep link `?ticketId=`

### Verify
- [ ] **2.16** Employee raise < 60s
- [ ] **2.17** Support denied without module (non-admin)
- [ ] **2.18** Attachment → Drive URL persisted
- [ ] **2.19** Names shown; no raw UUIDs in UI

---

## PHASE 3: NOTIFICATIONS

- [ ] **3.1** Emit outbox rows on raise / assign / message / resolve / reopen / escalate / hold
- [ ] **3.2** Wire list + unread + mark-read in TopNav (or extracted bell)
- [ ] **3.3** Deep links for raiser vs support
- [ ] **3.4** Verify badge clears after mark-read
- [ ] **3.5** Evidence: notification event matrix

---

## PHASE 4: MOBILE HELP LITE

Follow [MOBILE-HELP-001](../../../../mobileversion/categories/help-tickets/active/MOBILE-HELP-001_EMPLOYEE_HELP_LITE_PLAN.md).

- [ ] **4.1** Routes: list / new / `[ticketId]`
- [ ] **4.2** Profile → Support entry
- [ ] **4.3** API wrappers (employee RPC subset only)
- [ ] **4.4** Upload helper
- [ ] **4.5** Cross-platform visibility smoke (web ↔ mobile)
- [ ] **4.6** Confirm no admin screens / no support RPC imports
- [ ] **4.7** OTA / release notes

---

## PHASE 5: SLA + HARDENING

- [ ] **5.1** SLA breach checker (pause-aware for `on_hold` / `waiting_raiser`)
- [ ] **5.2** Auto-close resolved after 7 days → `verification_status=auto_closed`
- [ ] **5.3** SQL/pgTAP or scripted gate tests
- [ ] **5.4** Final metadata refresh
- [ ] **5.5** Evidence pack complete; tracker → DN when signed off

---

## GUARDRAILS (do not skip)

- [ ] **G.1** No WEB `admin_menu_modules` / `admin.help-tickets` / `useRightGate` / `role_permission_rights`
- [ ] **G.2** No reuse of `complaint_*` tables for employee help
- [ ] **G.3** No permanent Storage URLs as attachment truth
- [ ] **G.4** Mobile never calls support-only RPCs
- [ ] **G.5** Additive migrations only; seeds use `ON CONFLICT DO NOTHING`
- [ ] **G.6** Dealer-agnostic: no `dealer_code` / `my_dealer_code()` security filters on help-ticket visibility or modify rights

---

## SIGN-OFF

| Role | Name | Date | Notes |
|------|------|------|-------|
| Backend | | | |
| Web | | | |
| Mobile | | | |
| QA | | | |
