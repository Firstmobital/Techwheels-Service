# Help Tickets — Documentation Index

**Plan ID:** HELP-001  
**Status:** ✅ DONE — HELP-001 complete (web + mobile + SLA)  
**Created:** 2026-08-11  
**Platform:** web (employee + support) • mobile (employee Help Lite) • shared Supabase backend  
**Repository:** Firstmobital/Techwheels-Service  

---

## Overview

Employee **Get Help** ticketing for Techwheels Service. Authenticated employees raise support tickets (category, description, attachments). Support staff manage tickets on **web only** (`/help-tickets`). Mobile exposes employee raise/list/reply/verify only.

**Dealer-agnostic:** anyone with `help_tickets` **view** sees all tickets; anyone with **modify** (edit) can work any ticket — `dealer_code` is not a visibility or work-rights gate (unlike customer complaints).

This is **not** the customer `complaint_tickets` system. Do not reuse complaint tables, RPCs, or portal routes.

---

## Documentation Files

### Core Implementation Plan
- **[HELP-001_COMPREHENSIVE_PLAN.md](HELP-001_COMPREHENSIVE_PLAN.md)** — Single-source technical plan (audit, RBAC, DDL, RPCs, Drive, UI, phases, risks)

### Implementation Tracking
- **[PHASES.md](PHASES.md)** — Phase breakdown (1–5), deliverables, success criteria
- **[CHECKLIST.md](CHECKLIST.md)** — Execution checklist (audit → migration → web → mobile → evidence)

### Mobile Companion
- **[MOBILE-HELP-001](../../../../mobileversion/categories/help-tickets/active/MOBILE-HELP-001_EMPLOYEE_HELP_LITE_PLAN.md)** — Employee Help Lite screens and RPC subset (shared backend owned by HELP-001)

---

## Authority Sources

| Authority | Path |
|---|---|
| DB metadata (tables, RLS, functions) | `supabase/backups/full_metadata.sql` |
| Module-route contract | `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` |
| Closest peer module (patterns only) | `docs/Implementation_plans/webversion/categories/complaints/active/01_COMPREHENSIVE_PLAN.md` |
| Complaints API pattern | `src/lib/api/complaints.ts` |
| App RBAC / routes | `src/App.tsx` |
| Universal Drive | `supabase/functions/universal-drive-upload/index.ts` |
| Drive plan | `docs/Implementation_plans/webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md` |
| WEB product reference (do not port RBAC) | `/Users/vkbin/TECHWHEELS-WEB/docs/Implementation_plans/webversion/categories/help-tickets/active/HELP_TICKETS_IMPLEMENTATION_PLAN.md` |

---

## Quick Start

1. Read **[HELP-001_COMPREHENSIVE_PLAN.md](HELP-001_COMPREHENSIVE_PLAN.md)** (executive summary + Service adaptations).
2. Execute via **[PHASES.md](PHASES.md)** + **[CHECKLIST.md](CHECKLIST.md)**.
3. Mobile UI after Phase 1–3 backend/web: **[MOBILE-HELP-001](../../../../mobileversion/categories/help-tickets/active/MOBILE-HELP-001_EMPLOYEE_HELP_LITE_PLAN.md)**.
4. Drop phase evidence under `../evidence/`.

---

## Explicit Non-Goals

- Porting TECHWHEELS-WEB `syncAdminModules.js`, `admin.help-tickets`, `useRightGate`, or `visibility_core_pass`
- Extending or renaming `complaint_tickets` for employee help
- Mobile support/admin console
