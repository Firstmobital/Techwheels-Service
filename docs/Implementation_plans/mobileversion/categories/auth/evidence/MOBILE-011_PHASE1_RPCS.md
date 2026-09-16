# MOBILE-011 Phase 1 — RPCs + web cutover

Date: 2026-09-16

## Written
- Migration: `supabase/migrations/20260916120000_mobile_011_customer_sessions.sql`
- Checks: `supabase/sql_checks/20260916120000_mobile_011_customer_sessions_checks.sql`
- Web login: `authenticateCustomer` → `customer_start_session`
- `?reg=` / `?phone=` auto-login removed

## Apply before the next prod APK/iOS
`supabase db push` failed: remote migration versions exist that are not in the local folder. Do **not** repair history blindly. Run this one SQL file on the linked project (`jmdndcphkmaljhwgzqxq`) in the Supabase SQL editor, then mark CHECKLIST 1.16 / 1.17.

Customer login on the new binary will fail until that file is applied.
