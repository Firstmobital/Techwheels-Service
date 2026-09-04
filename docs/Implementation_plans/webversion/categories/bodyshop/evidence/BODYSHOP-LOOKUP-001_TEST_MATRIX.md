# BODYSHOP-LOOKUP-001 — Manual Test Matrix

**Plan:** `BODYSHOP-LOOKUP-001_REPAIR_TRACKER_GLOBAL_SEARCH_PLAN_2026-09-04.md`  
**Created:** 2026-09-04  
**Purpose:** Confirm Repair Tracker search is a global lookup, then filters apply only to the hit set.  
**Golden case:** `RJ52UA9900` / `JC-MBTPLT-JP1-2627-005071` (received/billed August 2026; search run in September).

---

## Preconditions

- [ ] Tester can open `/bodyshop-repair`
- [ ] Golden card exists (or a known prior-month VRN)
- [ ] Default landing filters: Period = This Month, Status = Active

---

## Lookup vs browse

| ID | Steps | Expected | Pass |
|----|--------|----------|------|
| L1 | Land on Repair Tracker. Do not type search. | This Month active cards only. Stage queue counts match that set. | [ ] |
| L2 | Type `RJ52UA9900` (Period still This Month / Status Active). | After ~300ms, chip “Searching all records”. Period/Status/Branch/Advisor reset to All. Golden card visible. | [ ] |
| L3 | Type JC fragment `005071`. | Same card visible. | [ ] |
| L4 | Type `RJ-52-UA-9900` if the stored VRN has no hyphens. | Same card visible (compact VRN). | [ ] |
| L5 | With lookup results showing, set Period = This Month. | August golden card disappears. Chip still lookup; period is applied on hits. | [ ] |
| L6 | Set Period = Last Month (or All). | Golden card returns if `received_at` is in that range. | [ ] |
| L7 | Set Status = Active only, on a delivered lookup hit. | Delivered card hidden. Status = All shows it again. | [ ] |
| L8 | Clear the search box. | Chip gone. Prior browse Period (This Month) and Status=Active restored. Queue is browse again. | [ ] |
| L9 | Type 1–2 characters only. | Stay in browse; no global fetch. | [ ] |
| L10 | Search a VRN the SA/SSA/Survey user must not see. | Empty or out-of-scope; no other dealers’ cards. | [ ] |

---

## Copy / empty

| ID | Steps | Expected | Pass |
|----|--------|----------|------|
| C1 | Lookup with no matches. | Empty state names the query, not the generic browse empty. | [ ] |
| C2 | Header while lookup has hits. | Count is lookup matches, not “this month’s 28 cards”. | [ ] |

---

## Non-goals (do not fail this plan)

- Mobile Repair Tracker Period lookup (mobile loads without Period today).
- Trigram indexes / RPC (v1 is PostgREST `or` + limit 50).
