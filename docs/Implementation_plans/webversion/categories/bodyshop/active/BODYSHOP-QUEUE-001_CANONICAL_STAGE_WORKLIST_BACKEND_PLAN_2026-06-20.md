# Canonical Stage Worklist Backend Plan

**Plan ID:** BODYSHOP-QUEUE-001  
**Created:** 2026-06-20  
**Priority:** CRITICAL  
**Owner:** Bodyshop Team + Platform Team  

---

## Executive Summary

This plan moves Bodyshop Stage Queue truth from client-side predicates to a backend-owned workflow projection so all clients consume one canonical stage worklist model. It removes rule drift between pages and creates an auditable contract for long-running operations.

The implementation is staged for safe rollout: define canonical rules, publish read-only projection, run shadow parity checks, switch UI reads, and retire duplicated client logic only after parity and sign-off.

**Risk Level:** 🔴 HIGH  
**Estimated Duration:** 8-12 working days  
**Rollback Strategy:** Keep existing frontend rule path behind feature flag and fall back to it instantly if projection parity drops below threshold.

---

## Objectives

1. Establish one canonical backend definition for stage worklist membership.
2. Expose stage pending state and reason codes through a stable read contract.
3. Migrate web and mobile to consume backend projection without behavior regressions.

---

## Context & Background

Current Stage Queue behavior is derived in frontend logic from card fields and gating predicates. This has worked for rapid iteration but creates long-term risk because:

1. Rules can drift across screens and platforms.
2. Debugging is expensive when queue count and card state disagree.
3. Business ownership needs auditability for stage membership decisions.

Authoritative schema audit confirms there is no existing database function/view that computes Stage Queue or stage9Done/stage10And11Ready, so backend workflow projection must be introduced as an explicit capability.

---

## Implementation Tasks

### Phase 1: Rule Canonicalization
- [ ] **Task 1.1:** Freeze current stage rules into a formal rule spec with inputs, outputs, and reason codes.
- [ ] **Task 1.2:** Define stage semantics contract: stage pointer vs stage pending worklist.
- [ ] **Task 1.3:** Publish rule versioning strategy and compatibility policy.
- [ ] **Task 1.4:** Review and approve rule spec with Bodyshop owner, ops, and engineering.

### Phase 2: Backend Projection Design
- [ ] **Task 2.1:** Define projection shape with fields: repair_card_id, stage_no, is_pending, is_done, is_ready, reason_codes, rule_version, computed_at.
- [ ] **Task 2.2:** Define aggregation shape for queue counts grouped by stage.
- [ ] **Task 2.3:** Create migration SQL file to add projection objects and indexes.
- [ ] **Task 2.4:** Add read API contract and response examples for web and mobile consumption.

### Phase 3: Backend Implementation
- [x] **Task 3.1:** Implement projection computation in backend layer.
- [ ] **Task 3.2:** Implement read endpoint/query path for stage queue counts and per-card stage state.
- [ ] **Task 3.3:** Add observability fields and structured logs for projection generation.
- [ ] **Task 3.4:** Add access-control validation for projected data reads.

### Phase 4: Shadow Validation
- [ ] **Task 4.1:** Run projection in shadow mode while UI still uses legacy client logic.
- [ ] **Task 4.2:** Build parity report comparing legacy and projection outputs per stage and card.
- [ ] **Task 4.3:** Resolve rule mismatches and update reason-code taxonomy.
- [ ] **Task 4.4:** Gate release only after parity target is met for agreed window.

### Phase 5: Client Cutover
- [ ] **Task 5.1:** Add feature flag for web Stage Queue source selection.
- [ ] **Task 5.2:** Switch web Stage Queue and pipeline counts to backend projection.
- [ ] **Task 5.3:** Switch mobile Stage Queue reads to same backend contract.
- [ ] **Task 5.4:** Keep fallback path for one release cycle with monitoring.

### Phase 6: Legacy Retirement And Hardening
- [ ] **Task 6.1:** Remove duplicate client-side stage-rule engine after stable run.
- [ ] **Task 6.2:** Lock rule docs, reason-code dictionary, and operational runbook.
- [ ] **Task 6.3:** Complete sign-off and move plan to completed archive path.

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1
```text
🔄 1.1 | Freeze rule spec from current behavior | Bodyshop Team | 2026-06-20 | - | Rule spec embedded in this plan (single-file authority)
⏳ 1.2 | Define pointer vs worklist semantics | Platform Team | - | - | Pending kickoff
⏳ 1.3 | Define rule versioning contract | Platform Team | - | - | Pending kickoff
⏳ 1.4 | Approve rule spec with stakeholders | Product + Ops + Eng | - | - | Pending review
```

### Phase 2
```text
✅ 2.1 | Define projection schema and fields | Platform Team | 2026-06-20 | 2026-06-20 | Projection table column/key/index contract embedded below in this single plan file
✅ 2.2 | Define stage count aggregation contract | Platform Team | 2026-06-20 | 2026-06-20 | Contract embedded below in this single plan file
✅ 2.3 | Draft migration SQL for projection objects | Platform Team | 2026-06-20 | 2026-06-20 | Executable migration draft prepared in scripts/25_bodyshop_canonical_stage_worklist_projection_skeleton.sql
✅ 2.4 | Draft API contract for clients | Platform Team | 2026-06-20 | 2026-06-20 | API contract embedded below in this single plan file
```

### Phase 3
```text
✅ 3.1 | Implement projection computation | Platform Team | 2026-06-20 | 2026-06-20 | Canonical S9-S12 predicates implemented in recompute function (including S9 floor-send gate) with compatibility behavior for other stages
⏳ 3.2 | Implement read path for counts and reasons | Platform Team | - | - | Pending phase 2
⏳ 3.3 | Add projection observability | Platform Team | - | - | Pending phase 2
⏳ 3.4 | Validate data access controls | Platform Team | - | - | Pending phase 2
```

### Phase 4
```text
⏳ 4.1 | Enable shadow mode projection run | Platform Team | - | - | Pending phase 3
🔄 4.2 | Build parity diff report | Bodyshop + Platform Team | 2026-06-20 | - | Checklist scaffold created in docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-QUEUE-001_PARITY_CHECKLIST_2026-06-20.md
⏳ 4.3 | Resolve mismatches and refine reason codes | Bodyshop + Platform Team | - | - | Pending phase 3
⏳ 4.4 | Approve parity gate | Product + Ops + Eng | - | - | Pending validation window
```

### Phase 5
```text
⏳ 5.1 | Add web feature flag for queue source | Web Team | - | - | Optional hardening; direct cutover applied first
✅ 5.2 | Switch web Stage Queue to projection | Web Team | 2026-06-20 | 2026-06-20 | BodyshopRepairPage now reads pending stages from bodyshop_stage_worklist_projection with legacy fallback on projection read failure
⏳ 5.3 | Switch mobile to same projection contract | Mobile Team | - | - | Pending phase 4
🔄 5.4 | Monitor one release cycle with fallback | Web + Mobile + Platform | 2026-06-20 | - | Code cutover complete; production deploy pending valid Vercel auth token
```

### Phase 6
```text
⏳ 6.1 | Retire duplicated client rule engine | Web + Mobile Team | - | - | Pending stable cycle
⏳ 6.2 | Finalize runbook and rule documentation | Platform Team | - | - | Pending stable cycle
⏳ 6.3 | Sign-off and archive plan | Product + Ops + Eng | - | - | Pending final review
```

---

## Dependencies & Prerequisites

- [ ] Approved canonical rule specification for all 18 stages.
- [ ] Backend object design approved against authoritative schema.
- [ ] Feature flag support in web and mobile clients.
- [ ] Parity-reporting script or dashboard available.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Rule mismatch during cutover | Medium | High | Mandatory shadow run and parity gate before switch |
| Performance overhead from projection compute | Medium | High | Add indexing and monitor query latencies under production load |
| Client contract drift over time | Medium | High | Versioned contract and compatibility tests in CI |
| Hidden edge cases in legacy cards | High | Medium | Use reason codes and staged rollout by branch/dealer scope |

---

## Success Criteria

- ✅ Stage queue counts come from one backend contract for web and mobile.
- ✅ Per-card stage membership can be explained by reason codes.
- ✅ Zero Sev-1 incidents during and after cutover window.
- ✅ Legacy client stage-rule engine is removed after stable period.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Product Owner: _______________ (Signature) (Date)
- [ ] Bodyshop Operations Lead: _______________ (Signature) (Date)
- [ ] Platform Engineering Lead: _______________ (Signature) (Date)
- [ ] Web Engineering Lead: _______________ (Signature) (Date)
- [ ] Mobile Engineering Lead: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

> Add notes here as work progresses.

### 2026-06-20 - Kickoff
- Frontend currently computes stage worklist membership.
- Authoritative dump audit shows no DB object currently computing Stage Queue.
- Plan approved for backend canonicalization path.
- Started execution artifacts:
	- scripts/25_bodyshop_canonical_stage_worklist_projection_skeleton.sql
	- docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-QUEUE-001_PARITY_CHECKLIST_2026-06-20.md
	- event-to-stage recompute matrix for trigger-driven upsert (embedded section below + SQL skeleton mapping block)
	- projection table column/key/index contract v1 (embedded section below)
	- stage count aggregation contract v1 (embedded section below)
	- API contract v1 for web/mobile read paths (embedded section below)
	- executable migration SQL draft for projection infra (manual run)

### 2026-06-20 - Migration Execution Validation
- Executed projection migration draft successfully in SQL editor after syntax fix.
- Projection seed count validated: 216 rows.
- Per-card stage row coverage validated: 12 cards x 18 rows each.
- Queue-count view validated and returning stage-wise aggregates.
- Trigger registration validated for both card and document change paths.
- Card 382 snapshot validated with 18 stage rows and rule_version BODYSHOP-QUEUE-RULES-v1.
- Observed behavior is expected for draft logic: pointer-aligned pending states are active; full canonical stage computation remains Phase 3.1 implementation scope.

---

## Embedded Rule Specification (v1)

### Purpose

Define canonical backend-owned rules for stage worklist membership so web and mobile consume one source of truth for stage pending work.

### Canonical Inputs

Primary record source:
1. public.bodyshop_repair_cards

Auxiliary inputs used in existing frontend behavior:
1. Intake photo presence by reception entry.
2. KM reading presence by reception entry.
3. Floor work started lookup.
4. Floor stage completed lookup.

Output scope:
1. Active cards only (overall_status = active).

### Output Contract (per card per stage)

For each repair_card_id and stage_no (1..18), projection output includes:
1. is_ready
2. is_done
3. is_pending
4. reason_codes
5. rule_version
6. computed_at

Queue counts are derived only from rows where is_pending = true.

### Rule Version

Rule version identifier:
1. BODYSHOP-QUEUE-RULES-v1

### Canonical Stage Rules (v1)

Notation:
1. done(Sn) means stage n completion predicate is true.
2. pending(Sn) means stage n appears in stage queue for the card.

Global gate:
1. If overall_status != active, pending(S1..S18) = false.

Stage 1-8 baseline:
1. Preserve existing intake and SA-stage completion predicates.
2. pending(S1..S4) = not done(S1..S4) respectively.
3. pending(S5) = done(S1,S2,S3,S4) and not done(S5).
4. pending(S6) = done(S1,S2,S3,S4,S5) and not done(S6).
5. pending(S7) = done(S1,S2,S3,S4,S5,S6) and not done(S7).
6. pending(S8) = done(S1,S2,S3,S4,S5,S6,S7) and not done(S8).

Stage 9 (Survey):
1. done(S9) = survey_date present AND survey_status in {hold, approved} AND (survey_status != hold OR survey_hold_reason present) AND bodyshop_floor in {'Floor 2', 'Floor 3'}.
2. pending(S9) = done(S1..S8) and not done(S9).

Stage 10 (Parts Status):
1. survey_approved = (survey_status = approved).
2. survey_approval_evidence = doc_survey_approval present OR effective_current_stage >= 10.
3. approved_parts_finalized from approved_parts parser.
4. ready_10_11 = done(S1..S9) AND survey_approved AND survey_approval_evidence.
5. done(S10) = survey_approved AND survey_approval_evidence AND approved_parts_finalized.
6. pending(S10) = ready_10_11 and not done(S10).

Stage 11 (Floor Assignment / Floor Work Completion Gate):
1. additional_approval_requested from additional_approval parser.
2. done(S12) from additional approval resolution predicate.
3. floor_completed from floor-stage completion lookup.
4. done(S11) = floor_completed AND done(S10) AND (not additional_approval_requested OR done(S12)).
5. pending(S11) = ready_10_11 and not done(S11).

Stage 12 (Additional Approval):
1. done(S12) when part states exist and pending_count = 0, OR no part states and status in {approved, rejected}, OR effective_current_stage > 12.
2. pending(S12) = ready_10_11 and additional_approval_requested and not done(S12).

Stage 13-18 compatibility (v1):
1. pending(Sn) = (effective_current_stage = n) for n in [13..18].

### Concurrency Semantics

1. S10 and S11 may both be pending simultaneously.
2. S12 may be pending concurrently with S10/S11 when additional approval is requested.
3. S9 cannot be pending together with S10/S11/S12 because ready_10_11 requires done(S9).

### Reason Code Contract

Rules:
1. reason_codes are stable machine-readable identifiers.
2. reason_codes may contain multiple values for one stage row.
3. UI label mapping remains external to core predicates.

Initial reason code dictionary:
1. survey_date_missing
2. survey_status_invalid
3. survey_hold_reason_missing
4. survey_floor_not_assigned
5. survey_not_approved
6. survey_approval_evidence_missing
7. approved_parts_not_finalized
8. floor_not_completed
9. stage10_not_done
10. additional_approval_pending
11. additional_approval_part_pending
12. additional_approval_decision_missing

### Validation Requirements

Before cutover:
1. Stage count parity by stage 1..18.
2. Per-card stage membership parity.
3. Critical gating parity for S9/S10/S11/S12.
4. Signed GO decision using parity checklist.

### Event List For Upsert Triggers (v1)

Event-driven projection upsert recomputes only impacted stage rows where possible, with safe fallback to full-card recompute.

| Event Source | Changed Field(s) | Recompute Stage Rows | Notes |
|---|---|---|---|
| bodyshop_repair_cards INSERT | new card row | 1-18 | Seed all stage rows for new card. |
| bodyshop_repair_cards UPDATE | overall_status | 1-18 | Active/inactive gate affects all stage pending states. |
| bodyshop_repair_cards UPDATE | current_stage, current_stage_name | 1-18 | Pointer shifts can affect done shortcuts and late-stage compatibility behavior. |
| bodyshop_repair_cards UPDATE | customer_type, doc_claim_form, doc_rc, doc_insurance, doc_dl, doc_aadhaar, doc_pan, doc_kyc, doc_gst, doc_company_pan, doc_bank_detail | 5-12 | Stage 5 completion gate affects downstream readiness through stage 12. |
| bodyshop_repair_cards UPDATE | estimated_amount | 6-12 | Stage 6 gate and downstream readiness. |
| bodyshop_repair_cards UPDATE | estimation_approved_by | 7-12 | Stage 7 gate and downstream readiness. |
| bodyshop_repair_cards UPDATE | claim_intimation_no | 8-12 | Stage 8 gate and downstream readiness. |
| bodyshop_repair_cards UPDATE | survey_date, survey_status, survey_hold_reason | 9-12 | Stage 9 done and S10/S11 readiness. |
| bodyshop_repair_cards UPDATE | approved_parts | 10-12 | Stage 10 done and Stage 11 dependency. |
| bodyshop_repair_cards UPDATE | additional_approval | 11-12 | Stage 12 and Stage 11 dependency on S12 when requested. |
| bodyshop_repair_cards UPDATE | bodyshop_floor, floor_status, floor_hold_reason | 9-12 | Floor assignment is required to complete Stage 9 and also affects Stage 11. |
| bodyshop_repair_card_documents INSERT/UPDATE/DELETE | doc_key = doc_survey_approval for card | 10-12 | Survey approval evidence gate drives S10/S11/S12 readiness. |
| intake photos source UPDATE | photo presence/count by reception_entry_id | 1-12 | Intake milestones feed effective progression and readiness to S12. |
| reception/km source UPDATE | km presence by reception_entry_id | 1-12 | Intake milestones feed effective progression and readiness to S12. |
| floor completion source UPDATE | floor completed lookup for card | 11 | Affects Stage 11 done state. |

Upsert procedure rules:
1. Primary key for projection row: (repair_card_id, stage_no).
2. On each event, recompute only mapped stage set from matrix above.
3. On unknown or unclassified field-change event, fallback to recompute stages 1-18 for the card.
4. If card becomes non-active, set is_pending = false for rows 1-18 (retain rows for audit) or soft-retire per approved policy.
5. Every recompute stamps rule_version and computed_at.

Batching and ordering:
1. Coalesce rapid updates for same repair_card_id in a short debounce window before recompute.
2. Ensure in-order processing per repair_card_id.
3. Run periodic reconciliation job for full 1-18 recompute on recently changed cards.

### Projection Table Column/Key/Index Contract (v1)

This section is the delivery artifact for Phase 2 Task 2.1.

Canonical table name (proposed):
1. public.bodyshop_stage_worklist_projection

Column contract:
1. repair_card_id bigint not null
2. stage_no integer not null
3. is_ready boolean not null
4. is_done boolean not null
5. is_pending boolean not null
6. reason_codes jsonb not null default '[]'::jsonb
7. rule_version text not null
8. computed_at timestamptz not null
9. source_hash text null
10. dealer_code text null
11. branch text null
12. advisor_key text null
13. created_at timestamptz not null default now()
14. updated_at timestamptz not null default now()

Key contract:
1. Primary key: (repair_card_id, stage_no)
2. Stage domain check: stage_no between 1 and 18
3. Foreign key: repair_card_id -> public.bodyshop_repair_cards(id) on delete cascade

Index contract:
1. idx_bswp_stage_pending on (stage_no, is_pending)
2. idx_bswp_scope_pending on (dealer_code, branch, advisor_key, stage_no, is_pending)
3. idx_bswp_rule_version on (rule_version)
4. idx_bswp_computed_at_desc on (computed_at desc)
5. idx_bswp_repair_card on (repair_card_id)

Uniqueness and integrity rules:
1. Exactly one row per (repair_card_id, stage_no).
2. reason_codes must be a json array.
3. updated_at must be refreshed on every upsert.

Write behavior contract:
1. Upsert target key: (repair_card_id, stage_no).
2. On conflict, update all mutable fields: is_ready, is_done, is_pending, reason_codes, rule_version, computed_at, source_hash, dealer_code, branch, advisor_key, updated_at.
3. If card becomes inactive, retain rows and set is_pending=false for all stage_no 1..18.

RLS and access contract:
1. Projection rows must inherit existing bodyshop module scope restrictions (dealer/branch/advisor visibility rules).
2. Read access only for authorized scopes; no cross-scope leakage via counts.

### Stage Count Aggregation Contract (v1)

This section is the delivery artifact for Phase 2 Task 2.2.

Aggregation source:
1. Source of truth is projection rows (one row per repair_card_id + stage_no).
2. Only active-card rows participate in queue counts.

Aggregation keys:
1. Primary grouping key: stage_no (1..18).
2. Optional scope keys applied before grouping: dealer_code, branch, advisor scope, status scope.

Aggregation metrics returned per stage_no:
1. pending_count: count where is_pending = true.
2. ready_count: count where is_ready = true.
3. done_count: count where is_done = true.
4. card_count: distinct repair_card_id count in that stage bucket.
5. computed_at_max: max(computed_at) across contributing rows.
6. rule_version: projection rule version used by contributing rows.

Count semantics:
1. One card may contribute to multiple stage buckets concurrently.
2. Stage queue badges must use pending_count only.
3. No stage-pointer shortcut is permitted for pending_count derivation.

Output shape contract:

```json
{
	"rule_version": "BODYSHOP-QUEUE-RULES-v1",
	"computed_at": "2026-06-20T00:00:00Z",
	"scope": {
		"dealer_code": "optional",
		"branch": "optional",
		"advisor": "optional",
		"status": "active"
	},
	"stages": [
		{
			"stage_no": 1,
			"pending_count": 0,
			"ready_count": 0,
			"done_count": 0,
			"card_count": 0
		}
	]
}
```

Validation rules:
1. Response must include exactly 18 stage rows in deterministic order 1..18.
2. Missing stage buckets must return zeros; never omit stage rows.
3. All rows in one response must represent one rule_version.
4. If mixed rule_version rows are detected in a scoped response, fail fast with a contract error.

Performance guardrails:
1. Apply scope filters before aggregation.
2. Keep aggregation p95 latency within SLA for operational filters.
3. Use projection-table strategy to avoid runtime heavy predicate recomputation.

### API Contract (v1)

This section is the delivery artifact for Phase 2 Task 2.4.

Contract goals:
1. One read contract for web and mobile.
2. Deterministic stage counts and per-card stage state.
3. Explicit rule_version and freshness metadata on every response.

Read endpoints (logical contract):
1. GET /api/bodyshop/stage-worklist/counts
2. GET /api/bodyshop/stage-worklist/cards
3. GET /api/bodyshop/stage-worklist/cards/{repair_card_id}

#### 1) Counts Endpoint

Route:
1. GET /api/bodyshop/stage-worklist/counts

Query parameters:
1. dealer_code (optional)
2. branch (optional)
3. advisor (optional)
4. status (optional, default active)
5. from_date (optional)
6. to_date (optional)

Success response shape:

```json
{
	"rule_version": "BODYSHOP-QUEUE-RULES-v1",
	"computed_at": "2026-06-20T00:00:00Z",
	"scope": {
		"dealer_code": "3000840",
		"branch": "Sitapura",
		"advisor": "all",
		"status": "active",
		"from_date": null,
		"to_date": null
	},
	"stages": [
		{
			"stage_no": 1,
			"pending_count": 0,
			"ready_count": 0,
			"done_count": 0,
			"card_count": 0
		}
	]
}
```

Counts endpoint rules:
1. Always return exactly 18 stage rows in order 1..18.
2. Empty buckets return zeros.
3. Mixed rule_version rows must return contract error.

#### 2) Cards Endpoint

Route:
1. GET /api/bodyshop/stage-worklist/cards

Query parameters:
1. dealer_code (optional)
2. branch (optional)
3. advisor (optional)
4. stage_no (optional, integer 1..18)
5. pending_only (optional, default true)
6. search (optional, job card, reg number, customer)
7. page (optional, default 1)
8. page_size (optional, default 50, max 200)

Success response shape:

```json
{
	"rule_version": "BODYSHOP-QUEUE-RULES-v1",
	"computed_at": "2026-06-20T00:00:00Z",
	"page": 1,
	"page_size": 50,
	"total": 1,
	"items": [
		{
			"repair_card_id": 382,
			"job_card_no": "JC-MBTPLT-JP2-2627-002819",
			"reg_number": "RJ60CH2388",
			"branch": "Sitapura",
			"stage_rows": [
				{
					"stage_no": 10,
					"is_ready": true,
					"is_done": false,
					"is_pending": true,
					"reason_codes": ["approved_parts_not_finalized"],
					"computed_at": "2026-06-20T00:00:00Z"
				}
			]
		}
	]
}
```

Cards endpoint rules:
1. If stage_no is provided and pending_only=true, include cards pending that stage only.
2. If stage_no is omitted, return cards with any pending stage rows in scope.
3. stage_rows must include only rows matching current filters.

#### 3) Card Detail Endpoint

Route:
1. GET /api/bodyshop/stage-worklist/cards/{repair_card_id}

Success response shape:

```json
{
	"rule_version": "BODYSHOP-QUEUE-RULES-v1",
	"computed_at": "2026-06-20T00:00:00Z",
	"repair_card_id": 382,
	"stage_rows": [
		{
			"stage_no": 1,
			"is_ready": true,
			"is_done": true,
			"is_pending": false,
			"reason_codes": []
		}
	]
}
```

Card detail endpoint rules:
1. Return full stage_rows 1..18 for the card.
2. Not found returns 404 contract error.

#### Error Contract

All non-2xx responses must follow:

```json
{
	"error_code": "CONTRACT_ERROR",
	"message": "Human-readable message",
	"details": {
		"rule_version": "BODYSHOP-QUEUE-RULES-v1",
		"cause": "optional"
	}
}
```

Standard error codes:
1. INVALID_SCOPE
2. INVALID_STAGE
3. MIXED_RULE_VERSION
4. CARD_NOT_FOUND
5. INTERNAL_ERROR

#### Compatibility Rules

1. Clients must treat unknown fields as forward-compatible.
2. Server must not remove existing fields in v1 responses.
3. Breaking changes require new version tag and dual-run window.

#### Security and Access Rules

1. Apply existing dealer-scope and module-view guards.
2. Counts and cards endpoints must only include rows authorized for requester scope.
3. Do not leak out-of-scope card identifiers in totals.

#### Operational Freshness

1. computed_at represents projection freshness for returned dataset.
2. If freshness exceeds agreed SLA window, response should include warning metadata or fail based on policy.

### Open Decisions

1. Projection physical strategy: preliminary recommendation is projection table with event-driven upsert plus periodic reconciliation; final approval pending Phase 1 Task 1.4.
2. Refresh cadence and recompute trigger points.
3. Whether stages 13-18 need decomposed gates in v2.

---

## Related Documentation

- docs/Implementation_plans/STRUCTURE_AND_WORKFLOW.md
- docs/Implementation_plans/webversion/INDEX.md
- docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md
- docs/Implementation_plans/webversion/categories/bodyshop/active/Bodyshop-Flow.md
- scripts/25_bodyshop_canonical_stage_worklist_projection_skeleton.sql
- docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-QUEUE-001_PARITY_CHECKLIST_2026-06-20.md

---

**Last Updated:** 2026-06-20 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS
