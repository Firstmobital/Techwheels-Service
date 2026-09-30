# SUPABASE-006 — Performance & Caching Audit Implementation Plan

**Priority:** P0–P3 (phased)  
**Created:** 2026-09-30  
**Source:** Deep codebase audit, Sep 2026

---

## Summary of Findings

| ID | Priority | Finding | Effort |
|----|----------|---------|--------|
| S-001 | P0 | Hardcoded dealer code `3000840` in `dealerSettings.ts` | 1 hr |
| S-002 | P1 | `getDealerScopeContext()` uncached — 2 DB hits × 15+ call sites per action | 2–3 hr |
| S-003 | P1 | Notification polling (3 DB queries/30s + every navigation) — no Realtime | 2–4 hr |
| S-004 | P1 | Double `onAuthStateChange` listener in `AuthGate` + `AppInner` | 3 hr |
| S-005 | P2 | `getEmployeeNameByCode` called on every reception create/update (UI already has data) | 1–2 hr |
| S-006 | P2 | Admin permission load: 3 sequential DB calls instead of 1 | 2 hr |
| S-007 | P2 | Mobile app re-loads permissions on every screen mount — no cache | 2–3 hr |
| S-008 | P3 | Employee enrichment re-fetched on every reception list load | 1 hr |
| S-009 | P3 | `ttlCache.ts` and `circuitBreaker.ts` are dead code (never imported) | — |

Note: **SUPABASE-005** covers the P0 security finding (`get_permissions_for_user` anon grant).

---

## Implementation Phases

### Phase 1 — P0: Data isolation fix (this sprint)

**S-001 — Fix hardcoded dealer code in `dealerSettings.ts`**

File: `src/lib/api/dealerSettings.ts:7`

```
// Remove:
const DEALER_CODE = '3000840'

// Replace getDealerSettings / saveDealerSetting to call:
const { dealerCode } = await getDealerScopeContext()
```

Also document `EvBackOrderImportSection.tsx:51` (`TARGET_DEALER_CODE = '500A841'`) — likely intentional for EV-only import but should have a comment.

---

### Phase 2 — P1: Dealer context caching (highest ROI)

**S-002 — Wire `ttlCache` to `getDealerScopeContext()`**

The `ttlCache` utility at `src/lib/cache/ttlCache.ts` is complete and working but **never imported anywhere**.

File: `src/lib/api/auth.ts`

```typescript
import { ttlCache } from '../cache/ttlCache'

export async function getDealerScopeContext() {
  const userId = (await supabase.auth.getSession())
    .data.session?.user.id
  if (!userId) throw new Error('Not authenticated')

  return ttlCache.getOrFetch(
    `dealer_scope_${userId}`,
    8 * 60 * 60 * 1000,  // 8-hour session lifetime
    () => _fetchDealerScopeContext(userId)
  )
}
```

Call sites (all eliminated with this one change):
- `src/lib/api/reception.ts:1409, 1457`
- `src/lib/api/documents.ts:234`
- `src/lib/api/vehicles.ts:57`
- `src/lib/api/insuranceRenewalTelecalling.ts:29`
- `src/pages/BodyshopFloorPage.tsx:1974`
- `src/pages/BodyshopRepairPage.tsx:2692, 3005, 4196`
- `src/pages/ServiceAdvisorPage.tsx:1223`
- `src/pages/ImportPage.tsx:2949`
- `src/pages/reports/warranty/WarrantyOverviewReport.tsx:636`

---

### Phase 3 — P1: Consolidate auth subscription

**S-004 — Merge double `onAuthStateChange` listeners**

Files: `src/App.tsx:1049` (`AuthGate`) and `src/App.tsx:1240` (`AppInner`)

Both components independently call `supabase.auth.getSession()` on mount and register `onAuthStateChange`. Lift auth state to a single React context consumed by both.

This is prerequisite cleanup before the Realtime notification work.

---

### Phase 4 — P1: Replace notification polling with Realtime

**S-003 — Supabase Realtime subscriptions for notifications**

File: `src/App.tsx:311–384`

Current: `refreshNotificationCount()` runs every 30s and on every route change → 3 DB queries per fire.

Replace with Realtime subscriptions on `complaint_notifications` and `help_ticket_notifications` filtered by `user_id = auth.uid()`. Reference pattern already in codebase: `src/components/PartsRequirementSection.tsx:439`.

Keep the 30s poll as a fallback only.

---

### Phase 5 — P2: Write-path and mobile fixes

**S-005 — Remove `getEmployeeNameByCode` from reception write paths**

Files: `src/lib/api/reception.ts:1063` (`createReceptionEntry`), `reception.ts:1212` (`updateReceptionEntry`)

The SA name is already known in the calling UI component. Pass it as a parameter instead of fetching it inside the API function.

**S-006 — Consolidate admin permissions query**

File: `src/App.tsx:1330–1346`

Extend the `get_all_my_permissions` RPC to return active module names in its result set, eliminating the third sequential query for admin users.

**S-007 — Mobile permissions caching**

File: `mobile/home.tsx:82–120`

Cache the `users.role + get_all_my_permissions` result in a module-level variable keyed to the session ID. Also fix `mobile/reception.tsx:385` which calls `has_module_delete` as a separate RPC instead of checking the already-loaded permissions object.

---

### Phase 6 — P3: Cleanup

**S-008 — Cache employee enrichment**

File: `src/lib/api/reception.ts:400–456`

Wrap the employee code → branch/fuel_type map in `ttlCache` with a 15-minute TTL keyed to dealer code.

**S-009 — Resolve dead code**

- `src/lib/cache/ttlCache.ts` — resolved by S-002
- `src/lib/circuitBreaker.ts` — either wire to Supabase client for resilience on edge function calls, or delete

---

## Caching Reference

| Data | Fetch frequency now | Fix |
|------|---------------------|-----|
| Dealer code (per user) | 2 DB hits × every action | S-002: session TTL via ttlCache |
| Notification counts | 3 DB hits/30s + per navigation | S-003: Realtime subscription |
| Employee branch map | Every reception list load (8 fns) | S-008: 15 min TTL per dealer |
| Dealer settings | Every read | S-001: resolve dealer code, then add ttlCache |
| Active modules (admin) | Every permission reload | S-006: merge into permissions RPC |
