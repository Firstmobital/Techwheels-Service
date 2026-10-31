# MOBILE-017 — Customer Session & Terms Resilience (No OTP)

**Plan ID:** MOBILE-017  
**Date Created:** 2026-10-31  
**Last Updated:** 2026-10-31  
**Status:** In Progress (implementation in repo 2026-10-31; production DB apply + OTA pending)  
**Owner:** Mobile Team + Platform  
**Platform:** mobile (Expo) • shared Supabase customer RPCs • web customer login (same RPCs)  
**Category:** auth  
**Parent / dependency:** [MOBILE-011](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md) (phone=phone + `customer_sessions`; **no Phase 4 OTP**)  
**Database Dump Reference:** `supabase/backups/full_metadata.sql`  

**Risk Level:** Medium (session security vs UX; must not weaken staff RLS or grant workshop tables to `anon`)  
**Estimated Duration:** 4–6 working days (Phases 1–3); Phase 4 optional cleanup  

---

## 1) Executive Summary

Customers hit **Terms & Conditions** with a valid-looking login, tap **I Accept**, and see **`Session expired.`** because the opaque `customer_session_token` failed `customer_lookup_session_row` (12h TTL, revoked, or stale AsyncStorage token). **`customer_accept_terms` never runs**, so `customer_profiles.terms_accepted_*` stays empty and **every login re-shows terms** even though the user believes they already acknowledged.

This plan fixes the **loop** without OTP, SMS, or Supabase Auth for customers. We keep **MOBILE-011 identity**: 10-digit mobile as username and password, `customer_sessions` + RPC-only portal access.

**Measurable outcomes**

- After one successful accept, the same phone does not see terms again until `customer_current_terms_version()` changes.
- Expired customer tokens never leave the user stuck on Terms with a dead accept button; app routes to customer login with clear copy and optional return to terms.
- Active customer use extends or refreshes session server-side (sliding window); idle beyond cap requires re-login (phone=phone only).
- All customer RPC surfaces share one **Session expired** handler (mobile; web customer path aligned where applicable).

---

## 2) Classification Record

| Field | Value |
|---|---|
| State | implementation plan (active) |
| Scope | `customer_sessions` policy + 1–2 RPCs + mobile session layer + terms/register-vehicle guards |
| Intent | bug fix + hardening (production customer trap) |
| Parity | Web customer login uses same RPCs; no new login method |

---

## 3) Scope

### In scope

- DB: session TTL policy, `customer_touch_session` (or extend `customer_start_session` expiry), optional revoke-other-sessions on login
- DB: no change to terms legal text; version bump process documented only
- Mobile: centralized customer session expiry handling, terms/register-vehicle focus checks, post-login onboarding path
- Mobile: OTA/store note so builds include terms redirect fix (≥ 2026-10-21 behavior)
- `supabase/sql_checks/` for new migration(s)
- Ledger row in `docs/shared/reference/DB_CHANGE_LEDGER.md` before apply
- Evidence: `evidence/MOBILE-017_TEST_MATRIX.md` (create in Phase 3)

### Out of scope (explicit)

- **OTP, SMS, WhatsApp OTP, magic links, or Supabase Auth customer users**
- **MOBILE-011 Phase 4** (`auth.users` / `app_metadata.audience = 'customer'`) — deferred indefinitely; not a dependency
- Staff JWT / refresh-token changes (staff stays on `supabase.auth` as today)
- Weakening workshop RLS or granting customer direct table access
- Changing T&C legal content (only acceptance flow + session)

---

## 4) Problem Statement (root cause summary)

| Symptom | Root cause |
|---|---|
| `Session expired.` on Accept | `customer_accept_terms` → `customer_lookup_session_row`: token missing, `expires_at <= now()`, or `revoked_at` set |
| Terms screen again | `customer_profiles.terms_accepted_at` / version never updated after failed accept; app gate is server `needs_acceptance` |
| Stuck on terms with red error | Old builds only `setError`; expired token still in memory/storage; no refresh before accept |
| Paper / job-card signature | Not stored in app; only `customer_accept_terms` persists portal acceptance |

**Authority (current DB):**

- TTL: `customer_start_session` sets `expires_at := now() + interval '12 hours'` (`full_metadata.sql`)
- Validation: `customer_lookup_session_row` / `customer_require_session`
- Terms: `customer_profile_needs_terms`, `customer_accept_terms`

---

## 5) Product Decisions (lock before coding)

| ID | Decision | Recommendation |
|---|---|---|
| PD-1 | Customer portal session lifetime | **Sliding 12h**: each successful `customer_touch_session` sets `expires_at = greatest(expires_at, now() + interval '12 hours')`, cap **7 days** from `created_at` of that session row (or single max `expires_at`); document in plan comment |
| PD-2 | Login mint | Each `customer_start_session` creates a **new** session row; optionally **revoke all other non-revoked sessions** for same `profile_id` (reduces stale-token confusion on one device) |
| PD-3 | Terms completion window | On terms screen **focus** and **immediately before accept**, call `customer_get_terms_status`; if expired → login with `returnTo=terms` (no accept attempt on dead token) |
| PD-4 | Re-prompt terms | **Only** when `customer_profile_needs_terms` (missing or version mismatch) — never from client-only state |
| PD-5 | Login method | Unchanged: **same 10-digit mobile** in username and password fields |

---

## 6) Architecture (after fix)

```
Customer login (phone=phone)
  → customer_start_session (new token, expires_at, optional revoke siblings)
  → if needs_acceptance → (customer-auth)/terms
       → on focus: customer_get_terms_status (+ customer_touch_session if valid)
       → on Accept: touch → customer_accept_terms → profile updated
  → (customer) shell; all RPCs via wrapper
       → on Session expired: customer_end_session (best effort) + clear storage + login?reason=expired

Background: AppState 'active' → customer_touch_session if token present (debounced)
```

Staff path unchanged (`supabase.auth`, `AuthContext`).

---

## 7) Implementation Phases

### Phase 1 — Database (Platform)

**Migration file (name pattern):** `supabase/migrations/YYYYMMDDHHMMSS_customer_session_touch_and_policy.sql`

**7.1 `customer_touch_session(p_session_token text) RETURNS jsonb`**

- `SECURITY DEFINER`, same `search_path` / `customer_reject_staff_jwt` as other customer RPCs (reject staff JWT on **write** paths only if consistent with `customer_start_session`; touch is customer-portal only — use `lookup` without staff reject if touch must work while… **No**: keep `reject_staff_jwt` on touch for parity with start_session).
- Validate via existing `customer_lookup_session_row` (or inline same rules).
- Update row:  
  `expires_at = least(now() + interval '7 days', greatest(expires_at, now() + interval '12 hours'))`  
  (adjust if PD-1 revised at review).
- Return `{ ok: true, expires_at }` or raise `Session expired.`
- **GRANT EXECUTE TO `anon`, `authenticated`, `service_role`** (match `customer_get_terms_status`).

**7.2 Optional: revoke sibling sessions on login**

In `customer_start_session`, after insert new session:

```sql
UPDATE public.customer_sessions
SET revoked_at = now()
WHERE profile_id = v_profile_id
  AND revoked_at IS NULL
  AND token_hash <> public.customer_hash_token(v_token);
```

**7.3 Ledger + checks**

- Add **DBL-00XX** row (PROPOSED → APPLIED) in `DB_CHANGE_LEDGER.md`
- `supabase/sql_checks/YYYYMMDDHHMMSS_customer_session_touch_checks.sql`: function exists, grants, touch extends expiry, expired token raises, revoke-on-login if enabled

**Rollback:** `DROP FUNCTION customer_touch_session`; revert `customer_start_session` body to prior version from baseline/migration copy.

---

### Phase 2 — Mobile session layer (Mobile)

**7.4 `mobile/src/lib/customer/customerSessionGuard.ts` (new)**

- `isCustomerSessionExpiredError(message: string): boolean`
- `handleCustomerSessionExpired(router, signOut): Promise<void>` — signOut, `router.replace('/(customer-auth)/login?reason=expired&returnTo=...')`
- `withCustomerRpc<T>(fn, onExpired): Promise<T>` — optional wrapper for RPC calls

**7.5 Wire guard**

- `CustomerSessionContext`: export `touchSession()` calling `customer_touch_session`
- `AppState` listener (debounce 60s): if `token` and audience customer → `touchSession()`
- Replace duplicated `Session expired` string checks in customer screens with guard where practical (minimum: `customerAuth.ts`, `customerPortal.ts`, `advisorChat.ts`)

**7.6 Terms & onboarding routes**

| File | Change |
|---|---|
| `(customer-auth)/terms.tsx` | `useFocusEffect`: status + touch; block Accept if expired; redirect via guard |
| `(customer-auth)/login.tsx` | Read `returnTo=terms`; after signIn success + needsTerms → terms; if returnTo and !needsTerms → customer |
| `(customer)/register-vehicle.tsx` | Focus: require valid session (status or touch); guard on submit |
| `CustomerSessionContext` bootstrap | After valid `getTermsStatus`, call `touchSession()` once |

**7.7 Accept path**

In `acceptTerms`: `await touchSession()` then `customerAcceptTerms` (order fixed in context).

---

### Phase 3 — Verification & release

- **`evidence/MOBILE-017_TEST_MATRIX.md`**: matrix below as checkboxes
- Manual: expired token → login message; fresh login → accept → SQL profile columns set → relogin skips terms
- Confirm production/OTA minimum build includes terms **redirect on expired accept** (commit `c72df0db` behavior)
- Update `full_metadata.sql` backup after prod apply (per team process)

---

## 8) RPC Contract (delta)

| Function | Input | Output | Notes |
|---|---|---|---|
| `customer_touch_session` | `p_session_token` | `{ ok, expires_at }` | New; extends sliding expiry |
| `customer_start_session` | unchanged | unchanged + optional sibling revoke | Behavior change only |
| `customer_accept_terms` | unchanged | unchanged | Client calls touch first |

All other `customer_*` RPCs unchanged.

---

## 9) Test Matrix (acceptance)

| ID | Steps | Expected |
|---|---|---|
| T-01 | Login → accept terms immediately | `terms_accepted_at` set; enter customer home |
| T-02 | Login → wait until DB `expires_at` past (or manipulate row) → Accept | Redirect login `reason=expired`, not silent setError-only |
| T-03 | T-01 → logout → login same phone | Terms **not** shown |
| T-04 | T-01 → kill app → reopen within TTL | No terms; vehicles load |
| T-05 | Active app 30 min → touch debounce | `expires_at` extended in DB |
| T-06 | Login device A → login device B same phone (if revoke on) | Token A invalid, A gets expired on next RPC |
| T-07 | Staff logged in + customer token (if reproducible) | Customer RPC `forbidden` or customer path isolated; document actual behavior |
| T-08 | New user: login → terms → accept → register vehicle | No `terms_acceptance_required` on register RPC |
| T-09 | Web customer login (if terms added later on web) | Same profile terms state (mobile accept → web skip) |

---

## 10) Business Rules (unchanged + new)

1. Customer identity remains **phone only** on `customer_profiles`; no `public.users` row.
2. Portal access remains **RPC-only** with `p_session_token`.
3. Terms re-display **only** for version mismatch or missing acceptance in DB.
4. **No OTP** at any step; re-auth is **phone=phone login** only.
5. Job-card / workshop signatures do not auto-set app terms flags.

---

## 11) Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Touch extends stolen token life | Keep 7-day cap; revoke siblings on login; logout sets `revoked_at` |
| Over-call touch | Debounce AppState; touch on focus of sensitive screens only |
| Migration drift vs baseline | Single migration + sql_checks; apply via linked project process |
| Old APK without guard | MOBILE-012 / OTA release note; mandatory update if needed |

---

## 12) Related Documents

- [MOBILE-011 plan](MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md) — identity baseline (**ignore Phase 4 OTP** for this plan)
- [MOBILE-016](../customer/active/MOBILE-016_CUSTOMER_BOOKING_ENTRY_ONBOARDING_PLAN.md) — new user login (already shipped)
- [MOBILE-017 CHECKLIST](MOBILE-017_CHECKLIST.md) — execution checklist
- `docs/shared/reference/DB_CHANGE_LEDGER.md` — required before migration apply

---

## 13) Sign-off

| Role | Name | Date | OK |
|---|---|---|---|
| Product | | | |
| Platform (DB) | | | |
| Mobile | | | |
