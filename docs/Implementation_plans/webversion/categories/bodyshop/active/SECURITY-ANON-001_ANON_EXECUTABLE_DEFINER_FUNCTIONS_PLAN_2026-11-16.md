# Anonymous-Executable SECURITY DEFINER Functions Plan

**Plan ID:** SECURITY-ANON-001
**Created:** 2026-11-16
**Priority:** HIGH
**Owner:** Platform Team
**Status:** Phase 1 migration written, NOT applied (DBL-0097 PROPOSED).

---

## Executive Summary

The Supabase `anon` key is public (it ships in the web and mobile apps). Any function in the `public` schema that `anon` can execute can be called by anyone on the internet through the REST API. A `SECURITY DEFINER` function runs with the owner's rights, so without a caller check it exposes whatever it touches.

`supabase/backups/full_metadata.sql` shows **247** SECURITY DEFINER functions executable by `anon`. **160** show a recognisable caller check. **87 (85 distinct names) show none.** Most were never intended to be public: Supabase's default privileges grant EXECUTE to `anon` on every new function, and migrations that only `REVOKE ... FROM PUBLIC` do not remove that grant.

**Risk Level:** MEDIUM for the migration (revoking `anon` only), HIGH if nothing is done.
**Rollback Strategy:** re-grant EXECUTE to `anon` on the same functions (command in the migration header).

---

## Findings (2026-11-16)

Method: `scripts/audit_anon_definer_functions.py` (read-only, heuristic: looks for a caller-check marker in the body), then a manual read of the highest-risk bodies, then a map of every caller (client code, edge functions, other SQL functions, RLS policies, cron).

**Confirmed data exposure (anonymous callers, no session check):**
- `customer_collect_vehicles(p_phone)` returns a customer's vehicles and records for any phone number.
- `lookup_customer_phone_from_contact_details(p_chassis_key)` returns a customer's phone number for any chassis number.
- Together these allow enumeration of customer vehicles and phone numbers.

**Confirmed abuse surface (no caller check, internal-only):**
- Scheduler and job controls: `invoke_*_daily` (7), `reschedule_*_cron` (5), `refresh_all_service_data_*`, `reconcile_all_service_data_*` (heavy jobs; the `reschedule_*` family edits `cron.job`).
- Push: `claim_customer_push_outbox` (returns device tokens), `enqueue_customer_push` (queues a notification to a customer's devices).
- Imports: `process_psf_import_run`, `process_next_psf_import_run`, `enqueue_psf_import_run`, `run_psf_import_via_staging`, `run_psf_revenue_dms_import_batch`.
- `recalc_bodyshop_settlement(p_settlement_id)` (recomputes any settlement), plus read helpers such as `psf_get_today_productivity`, `get_distinct_dealers`, `get_reception_*_context`.

**Callers verified (so revoking `anon` is safe):**
- Edge functions that call these RPCs use the **service-role key**: `insurance-renewal-telecalling` (all RPC clients), `send-chat-push`, `psf-import-worker`, `booking-source-sync`, `wa-updation-reminder`.
- Cron jobs run as `postgres`.
- Staff screens are logged in, so they use the `authenticated` role, not `anon`.
- The customer portal and complaint pages use `anon` plus a session or link token, and call only the entry points listed under "Kept".
- Functions used inside RLS policies are boolean scope helpers; harmless for `anon` and left alone.

---

## Objectives

1. Remove anonymous execution from every internal function with no caller check.
2. Keep the customer portal and complaint-link pages working.
3. Prevent the problem recurring on new functions.

---

## Implementation Tasks

### Phase 1: Revoke anon (migration `20261116210000_security_anon_revoke_internal_definer_functions.sql`)
- [x] **1.1** Written: REVOKE EXECUTE FROM PUBLIC and `anon` on **73** functions (every overload), via a name list in a DO block. `authenticated` and `service_role` are untouched.
- [x] **1.2** Kept for `anon` on purpose (12): `customer_start_session`, `add_customer_message`, `get_complaint_by_token`, `raise_complaint`, `reopen_complaint`, `submit_csat`; and RLS scope helpers `dealer_code_in_scope`, `bodyshop_job_card_in_dealer_scope`, `bodyshop_floor_work_user_assigned_to_jc`, `user_has_service_floor_incharge_scope_for_sa_code`, `user_is_linked_bodyshop_floor_incharge`, `user_sa_owns_job_card_number`.
- [x] **1.3** Paired checks written (`supabase/sql_checks/20261116210000_..._checks.sql`).
- [ ] **1.4** Apply in the SQL Editor, run the checks.
- [ ] **1.5** Smoke test, same day (see below).
- [ ] **1.6** Ledger DBL-0097 to APPLIED then VERIFIED; refresh `full_metadata.sql` with the team script.

**Smoke test after apply (all must still work):**
1. Customer portal: log in with phone and OTP, open the tracker, open documents, open the floor-work gallery.
2. Complaint link: open a complaint by token, add a message, submit CSAT.
3. Staff web: Accounts lists, Bodyshop repair tracker, Reception list, PSF dashboard, Fuel screens.
4. Edge/cron: next scheduled reminder and push run (check function logs the next morning); one PSF import.
5. Mobile staff app: bodyshop floor and repair screens.

### Phase 2: Caller checks for logged-in users (separate, after Phase 1)
- [ ] **2.1** Functions staff call but that check nobody: `recalc_bodyshop_settlement`, `enqueue_psf_import_run`, `run_psf_import_via_staging`, `run_psf_revenue_dms_import_batch`, `refresh_job_card_closed_dms_revenue_batch`, `get_reception_*_context`, `psf_get_today_productivity`, `insurance_renewal_rc_fetch_pending_counts`. Add module-permission checks inside, matching the existing helpers (`bodyshop_settlement_can_modify`, `accounts_can_access`, etc.).
- [ ] **2.2** For the internal-only group (cron, edge, push, imports) also revoke `authenticated` once every SQL caller is confirmed SECURITY DEFINER or a trigger.

### Phase 3: Stop it recurring
- [ ] **3.1** Decide: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;` New functions then get no anonymous access unless a migration grants it explicitly. Customer-portal functions in migrations already use explicit GRANTs; confirm before applying.
- [ ] **3.2** Add the audit script to the pre-release checklist; run it after each metadata refresh and review new flags.
- [ ] **3.3** Re-run the 160 "has a check" group review: heuristic markers can be satisfied by an unused call.

---

## Risks

| Risk | Mitigation |
|---|---|
| A page that runs as `anon` and calls a revoked function breaks | Caller map found none; smoke test list; rollback re-grants in one statement |
| Table policy for `anon` referencing a revoked helper | Helpers referenced by policies are in the kept list |
| Heuristic missed a real caller check (false positive) or a hole (false negative) | Manual read of the highest-risk bodies; Phase 2 re-reviews; rollback is trivial |

---

## Success criteria

- [ ] None of the 73 listed functions is executable by `anon`.
- [ ] Customer portal, complaint link, staff screens and scheduled jobs work after apply.
- [ ] `customer_collect_vehicles` and `lookup_customer_phone_from_contact_details` return a permission error for anonymous calls.
- [ ] Audit script output has no unreviewed flags.
