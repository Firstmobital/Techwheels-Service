# MOBILE-011 — Documentation Index

**Plan ID:** MOBILE-011  
**Status:** Not Started (plan authored 2026-09-15)  
**Created:** 2026-09-15  
**Platform:** mobile (single Expo binary) • shared Supabase (customer RPCs) • web customer login must cut over to the same RPCs  
**Category:** auth  

---

## Overview

Collapse customer (`bodyshop/`) and staff (`mobile/`) into **one** Expo app (`com.techwheels.service`) with an audience picker: **Login as Customer** / **Login as Staff**. Customers stay out of `public.users`. Workshop RLS stays staff-only. Customer data is served only through `SECURITY DEFINER` RPCs.

This is **not** a second APK, a Capacitor WebView, or a `'customer'` value on `public.users.role`.

---

## Documentation Files

### Core implementation plan
- **[MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)** — Single-source technical plan (audit, identity, RPCs, Expo routing, phases, risks)

### Implementation tracking
- **[PHASES.md](PHASES.md)** — Phase 0–5 deliverables and success criteria
- **[CHECKLIST.md](CHECKLIST.md)** — Execution checklist (secrets → DB → Expo shell → customer screens → OTP → release)

### Pre-plan audit (do not duplicate)
- **[MOBILE-011 audit](../../program/evidence/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_AUDIT_2026-09-15.md)** — What exists, what is wrongly done, DB truth

---

## Authority Sources

| Authority | Path |
|---|---|
| DB metadata (tables, RLS, functions, grants) | `supabase/backups/full_metadata.sql` |
| Program tracker | `docs/Implementation_plans/mobileversion/categories/program/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md` |
| Mobile index / tracker | `docs/Implementation_plans/mobileversion/INDEX.md`, `IMPLEMENTATION_TRACKER.md` |
| Web customer product to port | `src/pages/CustomerPortalPage.tsx`, `src/lib/api/customer.ts`, `src/pages/LoginPage.tsx` |
| Staff Expo app to keep | `mobile/` (`com.techwheels.service`) |
