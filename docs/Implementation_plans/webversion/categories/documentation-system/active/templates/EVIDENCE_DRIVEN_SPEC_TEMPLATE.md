# Evidence-Driven Specification Template

**Use this template for any new feature/module/cross-cutting documentation.**

---

# [FEATURE_NAME] Specification

**Last Updated:** [DATE]  
**Status:** [DRAFT | IN_DEVELOPMENT | READY]  
**Owner:** [TEAM]  
**Implementation Progress:** [X]/[Y] phases complete

---

## IMMUTABLE SPECIFICATION CORE
*(This section defines what the feature IS. It does not change during implementation.)*

### 1) Purpose & Goals
[High-level purpose. What problem does this solve?]

Example:
> Telecalling enables date-range based lead campaigns with automated assignment, outcome tracking, and performance analytics.

### 2) Feature Scope
[What is included? What is explicitly OUT of scope?]

### 3) Architecture Overview
[High-level system design with layers/components]

```
[ASCII diagram or link to docs]
```

### 4) Data Model
[Core tables/entities]

```sql
[Entity definitions]
```

### 5) API Contract
[Public functions/endpoints if applicable]

| Endpoint/Function | Method | Input | Output | Purpose |
|---|---|---|---|---|
| get_campaigns | RPC | date_range | campaigns[] | Fetch active campaigns |

### 6) Business Rules
[Non-negotiable constraints]

1. A campaign cannot start before today
2. Lead assignment must respect skill matching
3. Outcomes are immutable once recorded

---

## DYNAMIC IMPLEMENTATION TRACKING
*(This section tracks implementation progress. Update as phases complete.)*

### Implementation Status
- **Overall Progress:** [X]/[Y] phases (XX%)
- **Ready for Production:** [YES | NO]
- **Last Status Update:** [DATE]

### Phase Tracking

| Phase | Description | Evidence File | Status | Completion | Verified Date |
|-------|-------------|---|--------|-----------|---|
| 1 | Schema design & validation | [evidence/PHASE_1_SCHEMA_TESTING.md](LINK) | ✅ Done | 100% | 2026-06-20 |
| 2 | RPC function implementation | [evidence/PHASE_2_RPC_TESTING.md](LINK) | ✅ Done | 100% | 2026-06-21 |
| 3 | Edge function actions | [evidence/PHASE_3_EDGE_TESTING.md](LINK) | 🟡 In Progress | 60% | - |
| 4 | Web UI component | [evidence/PHASE_4_UI_TESTING.md](LINK) | ⏳ Not Started | 0% | - |
| 5 | Mobile UI parity | [evidence/PHASE_5_MOBILE_TESTING.md](LINK) | ⏳ Not Started | 0% | - |
| 6 | Production validation | [evidence/PHASE_6_PROD_VALIDATION.md](LINK) | ⏳ Not Started | 0% | - |

### Phase Completion Checklist

**Phase 1: Schema Design** ✅
- [x] Database schema created and tested
- [x] Migrations run successfully
- [x] Schema validated against business rules
- [x] Evidence: [Phase 1 Testing Report](LINK)

**Phase 2: RPC Function** ✅
- [x] RPC function implemented
- [x] All parameters validated
- [x] Return values tested
- [x] Evidence: [Phase 2 Testing Report](LINK)

**Phase 3: Edge Functions** 🟡 (60% Complete)
- [x] create_campaign action implemented
- [x] get_campaigns action implemented
- [ ] update_status action implemented (IN PROGRESS)
- [ ] my_queue action implemented
- [ ] my_summary action implemented
- [x] Evidence: [Phase 3 Testing Report - Partial](LINK)

**Phase 4: Web UI** ⏳ (0% Complete)
- [ ] Campaign list component
- [ ] Campaign creation form
- [ ] Queue view component
- [ ] Performance dashboard

**Phase 5: Mobile UI** ⏳ (0% Complete)
- [ ] Mobile campaign list
- [ ] Mobile queue view
- [ ] Outcome capture UI

**Phase 6: Production Validation** ⏳ (0% Complete)
- [ ] Performance testing
- [ ] Security audit
- [ ] Production readiness sign-off

---

## Implementation Phase Details

### [PHASE_N]: [PHASE_NAME]

**Status:** [✅ Complete | 🟡 In Progress | ⏳ Blocked | ❌ On Hold]  
**Target Completion:** [DATE]  
**Evidence Location:** [evidence/PHASE_N_*.md](LINK)  

**Description:**  
[What is this phase doing? What are the success criteria?]

**Expected Outcomes:**
- [Outcome 1]
- [Outcome 2]
- [Outcome 3]

**Testing:**
- [Test 1 result](LINK)
- [Test 2 result](LINK)

**Known Issues:**
- [Issue 1 - Status](LINK)
- [Issue 2 - Status](LINK)

**Approval:**
- [ ] Code review passed
- [ ] Tests passed (X/X)
- [ ] Security review completed
- [ ] Ready to promote

---

## Integration Points

[Which other modules/systems does this depend on?]

| System | Dependency | Status |
|--------|-----------|--------|
| RBAC | Permission model | ✅ Ready |
| Supabase | Auth, DB, Storage | ✅ Ready |
| [Other] | [Dependency] | [Status] |

---

## Known Limitations

[Constraints or deferred work]

- v1: Manual campaign creation only (future: CSV import)
- v1: No historical outcome analytics (planned v2)
- Mobile: iOS only (Android support planned Q3)

---

## Related Documentation

- **Implementation Plan:** [Link to Implementation_plans/PLAN.md](LINK)
- **Phase Tracking:** [Link to PHASES.md](LINK)
- **Source Code:** [Link to codebase](LINK)
- **Architecture Decision:** [Link to shared/reference/](LINK)

---

## Appendix: Evidence Files

All testing and validation evidence stored in `evidence/` subfolder:

```
evidence/
├── PHASE_1_SCHEMA_TESTING.md          [Schema validation tests]
├── PHASE_2_RPC_TESTING.md             [RPC function tests]
├── PHASE_3_EDGE_TESTING.md            [Edge function tests]
├── PHASE_4_UI_TESTING.md              [Web UI tests]
├── PHASE_5_MOBILE_TESTING.md          [Mobile UI tests]
└── PHASE_6_PROD_VALIDATION.md         [Production validation]
```

Each file contains:
- Test cases executed
- Results (pass/fail)
- Issues discovered
- Validation proof

---

## Update Frequency

- Update phase status: After each phase completes testing
- Update evidence links: Immediately after evidence files created
- Update overall progress %: Automatically calculated from phase completion
- Update CHANGE_LOG: When promotion to truth happens

---

**Template Version:** 1.0  
**Last Updated:** 2026-06-23  
**Owner:** Documentation Team  

*This template ensures specs remain immutable while tracking implementation progress transparently.*
