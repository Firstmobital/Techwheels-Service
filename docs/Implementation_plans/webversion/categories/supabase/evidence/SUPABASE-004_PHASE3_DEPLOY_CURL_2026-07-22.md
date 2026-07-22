# SUPABASE-004 — Phase 3 Deploy and Verify Evidence

**Plan ID:** SUPABASE-004  
**Phase:** 3 — Deploy and verify  
**Verified:** 2026-07-22 (IST)  
**Environment:** Production (`IDSPAY_ENV=prod`)  
**Project ref:** `jmdndcphkmaljhwgzqxq`  
**Function:** `invoke-rc-provider`  
**Table:** `public.rto_idspay`

---

## Deploy

| Step | Result |
|------|--------|
| Edge secrets (`IDSPAY_*`, `RTO_CACHE_TTL_HOURS`) | Set via `supabase secrets set` |
| Migration `20260722162000_create_rto_idspay.sql` | Applied (`supabase db push`) |
| `supabase functions deploy invoke-rc-provider` | Success (bundled `_shared/idspayRcFields.ts`, `cors.ts`) |

---

## curl verification (repo `.env.local` — keys not recorded here)

Command pattern:

```bash
set -a && source .env.local && set +a
curl -s -X POST "${VITE_SUPABASE_URL}/functions/v1/invoke-rc-provider" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"reg_no":"RJ14CR1912"}'
```

### Run 1 — live IDSPay

| Check | Result |
|-------|--------|
| HTTP status | 200 |
| `provider` | `idspay` |
| `source` | `live` |
| `fromCache` | `false` |
| `data.reg_no` | `RJ14CR1912` |
| `data` keys | IDSPay names (`chassis`, `vehicle_colour`, `owner_name`, …) |
| `rto_idspay` row | Inserted; `verified` true |
| Upstream latency | ~1622 ms (`last_api_call_duration_ms`) |

### Run 2 — cache hit

| Check | Result |
|-------|--------|
| HTTP status | 200 |
| `source` | `rto_idspay` |
| `fromCache` | `true` |
| `access_count` | Incremented (2) |
| IDSPay call | None (TTL valid until `expires_at`) |

---

## Validation checklist (Phase 3 scope)

| ID | Status | Notes |
|----|--------|-------|
| V1 | Pass | Valid `reg_no` |
| V8 | Pass | Row in `rto_idspay`; `provider_response` holds full §1.7 JSON |
| V9 | Pass | Columns populated with IDSPay field names |

Not exercised in this cycle: V3–V7, V2, V5 (UAT), intentional §1.8 failure trace (§12 G3/G4).

---

## Out of scope (Phase 4)

- AutoDoc still uses `invoke-ocean025` (option A).
- `api_provider_config` not created.

**Phase 3 exit criteria:** Met for v1 Edge + `rto_idspay` cache path.
