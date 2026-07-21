# SUPABASE-003: Service History Sync Queue Performance Plan

**Plan ID:** SUPABASE-003  
**Created:** 2026-07-21  
**Priority:** CRITICAL  
**Owner:** Platform Team (Supabase/Postgres)  
**Status:** Proposed (ready to implement)  
**Parent initiative:** [SUPABASE-001 P1-12](SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md) — Contain service history sync queue RPC load  

**Depends on:**
1. Migration `20260706140000` — RPC ACL restriction (applied via exec_success_migrations)
2. Migration `20260721133000` — correct EV/PV history table names in `refresh_all_service_data_from_service_history` (in repo; deploy as needed)

---

## Executive Summary

pg_cron job 5 runs `SELECT public.process_all_service_history_sync_queue(500)` and fails with **SQLSTATE 57014** (`canceling statement due to statement timeout`) while executing `refresh_all_service_data_from_service_history` for a queued chassis key. The debounce queue design is correct; the worker is too heavy per chassis and the batch size is too large for platform timeouts.

This plan delivers a **durable fix**: index-backed chassis lookups on EV/PV history tables, a leaner refresh function (no row-wide `to_jsonb`), a bounded queue worker (smaller default batch + optional time budget), and pg_cron schedule alignment. Success is measured by zero (or negligible) `57014` on this path in ranked postgres logs and stable queue drain.

**Risk Level:** 🟡 MEDIUM (index builds on large tables; function replace is low risk)  
**Estimated Duration:** 4–8 hours (migrations + verify + post-deploy audit)  
**Rollback Strategy:** Revert function bodies to prior definitions; drop new indexes if needed; restore cron command to previous batch arg (keep ACL revokes from P1-12)

---

## Authority Inputs

1. Schema metadata: `supabase/backups/full_metadata.sql` (+ manifest `supabase/evidence/authoritative_metadata_manifest.json`)
2. Master hardening tracker: `SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md` (P1-12 row)
3. Incident evidence: postgres log `57014`, `query_id=3220864789079889211`, pg_cron `process_all_service_history_sync_queue(500)`
4. Audit slow-query baseline: `docs/Implementation_plans/webversion/categories/supabase/evidence/` (snapshots referencing queryid `3220864789079889211`)
5. Governance: `docs/shared/reference/DB_CHANGE_LEDGER.md` (ledger rows before apply)

---

## 1. Purpose

### 1.1 In scope

1. Performance and reliability of **`public.process_all_service_history_sync_queue`**
2. Performance of **`public.refresh_all_service_data_from_service_history(text)`**
3. **Indexes** on `public.ev_service_history_test` and `public.pv_service_history_test` for normalized chassis lookup
4. **pg_cron** job that invokes the queue processor (currently cron job 5 in production logs)
5. Verification checklist + post-deploy audit cycle

### 1.2 Out of scope

1. Changing debounce semantics (`enqueue_all_service_history_sync`, 45s delay) unless batch tuning proves insufficient
2. Replacing trigger-driven enqueue with synchronous refresh on every history row (would increase write latency)
3. App/PostgREST code changes (queue is internal-only after P1-12 ACL fix)
4. Renaming `*_test` history tables to production names

---

## 2. Audit Snapshot (Read-Only, 2026-07-21)

### 2.1 Failure signature

| Signal | Value |
|--------|--------|
| Error | `canceling statement due to statement timeout` |
| SQLSTATE | `57014` |
| Application | `pg_cron` |
| Top query | `SELECT public.process_all_service_history_sync_queue(500);` |
| Failing inner work | CTE over EV + PV history → `UPDATE public.all_service_data` |
| Session duration at cancel | ~120s (typical statement/session timeout window) |

### 2.2 Architecture (current, correct)

```
EV/PV history DML / all_service_data INSERT
  → trg_sync_all_service_data_from_service_history
  → enqueue_all_service_history_sync(chassis, 45s)
  → all_service_history_sync_queue
  → pg_cron → process_all_service_history_sync_queue(N)
  → refresh_all_service_data_from_service_history(chassis_key)
  → UPDATE all_service_data (+ downstream triggers)
```

### 2.3 Schema facts (from full_metadata.sql)

| Object | Finding |
|--------|---------|
| `all_service_data` | Has `idx_all_service_data_chassis_no_norm` on `upper(btrim(chassis_no))` |
| `ev_service_history_test` / `pv_service_history_test` | **`contact_full_name` column exists**; refresh still uses `to_jsonb(h)` + typo key `conatct_full_name` |
| History tables | **No** expression index on `upper(btrim(chassis_no))` (PK only) |
| `process_all_service_history_sync_queue` | Default batch **500**; loop = one transaction for entire invocation |
| P1-12 ACL | `process_all_service_history_sync_queue` → **service_role only** (good) |

### 2.4 Load evidence

- `queryid=3220864789079889211` — recurring top slow query (`process_all_service_history_sync_queue`)
- Audit snapshot 14.36+: postgres role, mean ~1.9s/call, max tens of seconds — incompatible with batch 500 under timeout

### 2.5 Root cause summary

1. **O(table size)** scans on history tables per chassis refresh  
2. **Expensive row projection** (`to_jsonb`) on every candidate row during scan  
3. **Worker batch 500** — multiplies work; one slow refresh or long transaction risks timeout  
4. **Not** missing tables (addressed by `20260721133000`)

---

## 3. Target Contract (Post-Implement)

### 3.1 Per-chassis refresh

1. Lookup EV and PV rows via **index** on `upper(btrim(chassis_no))` equal to normalized queue key  
2. Contact name: `coalesce(nullif(btrim(h.contact_full_name), ''), …)` — retain typo fallback only if column still missing in prod (verify; metadata shows column present)  
3. Winner selection logic unchanged: service-priority, `service_date_time`, `created_at`, source rank, `id`  
4. Update `all_service_data` only when column values **IS DISTINCT FROM** (existing guard)

### 3.2 Queue worker

| Parameter | Current | Target (initial) | Tune using |
|-----------|---------|------------------|------------|
| Default `p_batch_size` | 500 | **50** | p95 refresh latency |
| pg_cron argument | `(500)` | **`(50)`** | same |
| Time budget | none | **Optional:** stop loop after ~60s wall time, return partial `processed_count` | cron frequency |

Do **not** rely on raising global `statement_timeout` as the primary fix.

### 3.3 Indexes (new)

On **both** `ev_service_history_test` and `pv_service_history_test`:

```sql
-- Name pattern (finalize in migration):
-- idx_ev_service_history_test_chassis_norm
-- idx_pv_service_history_test_chassis_norm
CREATE INDEX ... ON public.ev_service_history_test
  USING btree (upper(btrim(chassis_no)), service_date_time DESC, created_at DESC)
  WHERE nullif(btrim(chassis_no), '') IS NOT NULL;
```

Partial predicate matches refresh `WHERE` and keeps index smaller. PV mirror with same shape.

**Optional phase 2:** if EXPLAIN shows sort still expensive, evaluate including `id DESC` in index or simplifying `chosen` ordering — only after phase 1 measurements.

### 3.4 Observability

1. Document monitoring query for queue depth (due rows)  
2. Post-deploy: `npm run supabase:audit:cycle:postdeploy` (or project equivalent)  
3. Confirm `raw_top_postgres_errors.json` no longer ranks `57014` on this cron path  
4. Confirm `queryid=3220864789079889211` mean/max time drop

---

## 4. Migration Bundle (Planned Filenames)

Each migration gets a paired `*_checks.sql` in `supabase/migrations/` (same prefix). Add **DB_CHANGE_LEDGER** rows (`PROPOSED` → `VERIFIED`) before apply per `DB_CHANGE_LEDGER.md`.

| Order | Migration prefix | Type | Summary |
|-------|------------------|------|---------|
| 1 | `20260721150000_p1_12_service_history_chassis_indexes` | index | Partial btree indexes on normalized chassis + sort columns (EV + PV) |
| 2 | `20260721151000_p1_12_refresh_service_history_sql_opt` | function | Replace `refresh_all_service_data_from_service_history` — column reads, same semantics |
| 3 | `20260721152000_p1_12_sync_queue_worker_and_cron` | function + cron | Lower default batch; optional time budget; update pg_cron job 5 command to `(50)` |

**Apply order:** 1 → 2 → 3 (indexes before load test; cron last)

Ledger IDs (reserve when opening implementation):

| ID | Migration | Status |
|----|-----------|--------|
| DBL-0019 | `20260721150000_...` | PROPOSED |
| DBL-0020 | `20260721151000_...` | PROPOSED |
| DBL-0021 | `20260721152000_...` | PROPOSED |

After verify: update `docs/db-changes.md` and refresh `npm run db:backup:metadata`.

---

## 5. Implementation Phases

### Phase 0 — Preflight (no prod DDL)

- [ ] **0.1** Confirm `20260721133000` applied in prod (function references `ev_service_history_test` / `pv_service_history_test`, not quoted mixed-case names)
- [ ] **0.2** Capture baseline: queue depth, `cron.job` row for job 5 (command, schedule, active)
- [ ] **0.3** Pick sample chassis keys: one with few history rows, one with many (from queue or manual query)
- [ ] **0.4** Run `EXPLAIN (ANALYZE, BUFFERS)` on history SELECT for sample keys **before** indexes (save in evidence folder)

### Phase 1 — Indexes (DBL-0019)

- [ ] **1.1** Author migration + checks (index existence, valid definitions, no duplicate index names)
- [ ] **1.2** Apply in prod (prefer low-traffic window; `CREATE INDEX CONCURRENTLY` if policy requires — note: CONCURRENTLY cannot run inside transaction block; adjust migration style per deploy tool)
- [ ] **1.3** Re-run EXPLAIN on same sample keys; expect Index Scan / Bitmap Index Scan on new indexes
- [ ] **1.4** Update ledger → VERIFIED; metadata backup

### Phase 2 — Refresh function (DBL-0020)

- [ ] **2.1** Replace function body: remove `to_jsonb(h)` path where column exists; keep behavior parity checks
- [ ] **2.2** Checks: smoke `refresh_all_service_data_from_service_history('__CHECK_NO_MATCH__')`; spot-check one known chassis against pre-migration row snapshot (registration, last_service_* fields)
- [ ] **2.3** Apply + ledger + metadata backup

### Phase 3 — Worker + cron (DBL-0021)

- [ ] **3.1** Change default batch 500 → 50; implement optional `v_max_ms` / clock guard (document constant in function comment)
- [ ] **3.2** Update pg_cron: `SELECT public.process_all_service_history_sync_queue(50);` (resolve job by command pattern, not hard-coded id if job id differs across envs)
- [ ] **3.3** Checks: function default via `pg_get_functiondef`; cron job active; one manual `SELECT process_all_service_history_sync_queue(5)` completes without timeout
- [ ] **3.4** Apply + ledger + metadata backup

### Phase 4 — Verification & close P1-12

- [ ] **4.1** Run evidence checklist (Section 6)
- [ ] **4.2** Post-deploy audit cycle; attach snapshot id to this plan’s Activity Tracker
- [ ] **4.3** Update SUPABASE-001 P1-12 row → Done when success criteria met
- [ ] **4.4** Mark SUPABASE-003 status Completed; keep plan in `active/` until sign-off, then archive per STRUCTURE_GUIDE §6

---

## 6. Verification Checklist

Evidence file (create during Phase 4):

`docs/Implementation_plans/webversion/categories/supabase/evidence/P1_12_SERVICE_HISTORY_SYNC_VERIFICATION_2026-07-21.md`

| # | Check | Pass criteria |
|---|--------|----------------|
| V1 | Indexes present | Both EV/PV partial chassis norm indexes exist (`pg_indexes`) |
| V2 | Plan change | Sample chassis EXPLAIN shows index usage, execution ms ≪ pre-index |
| V3 | Function | No `to_jsonb(h)` in `pg_get_functiondef` for refresh (unless documented exception) |
| V4 | Cron | Job command uses batch ≤ 50; job active |
| V5 | Runtime | Manual `process_all_service_history_sync_queue(50)` succeeds |
| V6 | Logs | No new `57014` on this query in 24–48h post-deploy window |
| V7 | Queue | Due count trends down after bulk imports (not unbounded growth) |
| V8 | Parity | Spot-check N chassis: `all_service_data` robot fields match expected history winner |

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Index build IO on free tier | Medium | Medium | Apply off-peak; monitor disk; partial indexes |
| Index build locks (non-concurrent) | Low | High | Use CONCURRENTLY if deploy pipeline supports it |
| Behavior drift in refresh | Low | High | Parity spot-checks; keep ordering logic identical |
| Queue backlog after batch cut | Medium | Low | More frequent cron or temporarily run `(100)` after indexes ship |
| Long transaction still hits timeout | Low | Medium | Phase 3 time budget; future: PROCEDURE with per-chassis COMMIT (defer unless needed) |

---

## 8. Rollback Runbook

1. **Cron:** Restore previous command `process_all_service_history_sync_queue(500)` (only if emergency — prefer fixing forward)
2. **Functions:** Re-deploy prior definitions from metadata dump/git history
3. **Indexes:** `DROP INDEX CONCURRENTLY IF EXISTS ...` (indexes are safe to drop; performance regresses only)

Do **not** rollback P1-12 ACL revokes.

---

## 9. Activity Tracker

### Legend

- ✅ COMPLETED · 🔄 IN PROGRESS · ⏳ PENDING · ❌ BLOCKED

```
⏳ 0.1 | Confirm 20260721133000 in prod | Platform | — | — | —
⏳ 0.2 | Baseline queue + cron.job capture | Platform | — | — | —
⏳ 0.3 | Sample chassis keys | Platform | — | — | —
⏳ 0.4 | Pre-index EXPLAIN artifacts | Platform | — | — | evidence/
⏳ 1.1 | Index migration + checks | Platform | — | — | DBL-0019
⏳ 1.2 | Apply indexes | Platform | — | — | —
⏳ 2.1 | Refresh function migration | Platform | — | — | DBL-0020
⏳ 3.1 | Worker + cron migration | Platform | — | — | DBL-0021
⏳ 4.1 | Verification checklist | Platform | — | — | evidence/
⏳ 4.2 | Post-deploy audit | Platform | — | — | queryid 3220864789079889211
⏳ 4.3 | Close SUPABASE-001 P1-12 | Platform | — | — | —
```

---

## 10. Related Documentation

- `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md` (P1-12)
- `supabase/migrations/20260721133000_fix_service_history_refresh_table_names.sql`
- `supabase/exec_success_migrations/sql/20260706140000_p1_12_restrict_sync_queue_rpc_access.sql`
- `docs/shared/reference/DB_CHANGE_LEDGER.md`
- `docs/db-changes.md` (post-apply entries)

---

**Last Updated:** 2026-07-21  
**Status:** 🟡 Proposed — awaiting Phase 0 kickoff
