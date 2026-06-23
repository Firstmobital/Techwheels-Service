# Phase Tracking Template for Implementation Plans

**Use this template in any implementation plan (in docs/Implementation_plans/) to track phase completion.**

---

# [FEATURE_NAME] - Phase Tracking

**Implementation Plan:** [PLAN_ID]  
**Created:** [DATE]  
**Last Updated:** [DATE]  
**Total Phases:** [N]  
**Current Progress:** [X]/[N] (XX%)  
**Status:** [⏳ Not Started | 🟡 In Progress | ✅ Complete]

---

## Quick Status

| Phase | Name | Target End | Status | Completion | Evidence |
|-------|------|-----------|--------|-----------|----------|
| 1 | [Name] | [DATE] | [Status] | [%] | [Link] |
| 2 | [Name] | [DATE] | [Status] | [%] | [Link] |
| 3 | [Name] | [DATE] | [Status] | [%] | [Link] |

**Overall Progress: [X]/[N] phases — [DATE of last update]**

---

## Phase Details

### Phase 1: [PHASE_NAME]

**Goal:**  
[What is this phase trying to accomplish?]

**Target Start:** [DATE]  
**Target End:** [DATE]  
**Status:** [⏳ Not Started | 🟡 In Progress | ✅ Complete]  
**Owner:** [TEAM_MEMBER]  

**Deliverables:**

| # | Deliverable | Owner | Status | Evidence | Verified |
|---|-------------|-------|--------|----------|----------|
| 1.1 | [Deliverable name] | - | ⏳ | [Link] | - |
| 1.2 | [Deliverable name] | - | ⏳ | [Link] | - |
| 1.3 | [Deliverable name] | - | ⏳ | [Link] | - |

**Completion Checklist:**
- [ ] Deliverable 1 completed
- [ ] Tests written and passing
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Ready for Phase 2

**Blockers:**
- [Blocker 1 - status]
- [Blocker 2 - status]

**Notes:**
[Any additional context for this phase]

---

### Phase 2: [PHASE_NAME]

**Goal:**  
[What is this phase trying to accomplish?]

**Target Start:** [DATE]  
**Target End:** [DATE]  
**Status:** [⏳ Not Started | 🟡 In Progress | ✅ Complete]  
**Owner:** [TEAM_MEMBER]  
**Depends On:** Phase 1

**Deliverables:**

| # | Deliverable | Owner | Status | Evidence | Verified |
|---|-------------|-------|--------|----------|----------|
| 2.1 | [Deliverable name] | - | ⏳ | [Link] | - |
| 2.2 | [Deliverable name] | - | ⏳ | [Link] | - |

**Completion Checklist:**
- [ ] Deliverable 1 completed
- [ ] Tests written and passing
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Ready for Phase 3

**Blockers:**
- [Blocker 1 - status]

**Notes:**
[Any additional context]

---

### Phase 3: [PHASE_NAME]

**Goal:**  
[What is this phase trying to accomplish?]

**Target Start:** [DATE]  
**Target End:** [DATE]  
**Status:** [⏳ Not Started | 🟡 In Progress | ✅ Complete]  
**Owner:** [TEAM_MEMBER]  
**Depends On:** Phase 2

**Deliverables:**

| # | Deliverable | Owner | Status | Evidence | Verified |
|---|-------------|-------|--------|----------|----------|
| 3.1 | [Deliverable name] | - | ⏳ | [Link] | - |

**Completion Checklist:**
- [ ] All deliverables completed
- [ ] Tests written and passing
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Ready for production

**Blockers:**
- None

**Notes:**
[Any additional context]

---

## Timeline

```
Phase 1: |████░░░░░░░░░░░░| [##%] (Jan 1-15)
         Complete

Phase 2: |░░░░░░░░░░░░░░░░| [0%]  (Jan 16-30)
         Not Started

Phase 3: |░░░░░░░░░░░░░░░░| [0%]  (Jan 31-Feb 14)
         Not Started

Overall: |███░░░░░░░░░░░░░| [##%] — [X] days until completion
```

---

## Critical Path

```
Phase 1 (2 weeks)
    ↓ [depends on]
Phase 2 (2 weeks)
    ↓ [depends on]
Phase 3 (1 week)
    ↓ [depends on]
PRODUCTION ✓
```

**Estimated Total Duration:** [N weeks]  
**Estimated Completion:** [DATE]  

---

## Risk Tracking

| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|-----------|--------|
| [Risk 1] | Low | Medium | [Action] | 🟢 Mitigated |
| [Risk 2] | Medium | High | [Action] | 🟡 Monitoring |

---

## Success Criteria

**Phase 1 Success:**
- [ ] Criteria 1 met
- [ ] Criteria 2 met
- [ ] All tests passing

**Phase 2 Success:**
- [ ] Criteria 1 met
- [ ] Criteria 2 met
- [ ] Integration tests passing

**Phase 3 Success:**
- [ ] Criteria 1 met
- [ ] Production validation complete
- [ ] Ready for release

---

## Evidence Files

All test reports, validation results, and evidence stored in `evidence/` subfolder:

```
evidence/
├── PHASE_1_TESTING_REPORT.md         [Phase 1 test results]
├── PHASE_2_TESTING_REPORT.md         [Phase 2 test results]
└── PHASE_3_TESTING_REPORT.md         [Phase 3 test results]
```

**Link to Evidence Folder:** [Link to evidence/](../evidence/)

---

## Dependencies

**Blocked By:**
- [ ] [Other feature/phase]

**Blocks:**
- [ ] [Other feature/phase]

**Related Implementation Plans:**
- [Link to related plan 1](LINK)
- [Link to related plan 2](LINK)

---

## Team & Assignments

| Role | Assigned To | Contact |
|------|-------------|---------|
| Phase Lead | [Name] | [Email] |
| QA Lead | [Name] | [Email] |
| Code Review | [Name] | [Email] |

---

## Update Log

| Date | Update | Made By |
|------|--------|---------|
| 2026-06-23 | Created phase tracking | [Name] |
| [DATE] | Phase 1 started | [Name] |
| [DATE] | Phase 1 complete | [Name] |

---

## Sign-Off

**Phase 1 Sign-Off:**
- [ ] Phase Lead Approval: _________ Date: _____
- [ ] QA Lead Approval: _________ Date: _____

**Phase 2 Sign-Off:**
- [ ] Phase Lead Approval: _________ Date: _____
- [ ] QA Lead Approval: _________ Date: _____

**Phase 3 Sign-Off:**
- [ ] Phase Lead Approval: _________ Date: _____
- [ ] QA Lead Approval: _________ Date: _____

**Production Ready Sign-Off:**
- [ ] Engineering Lead: _________ Date: _____
- [ ] Product Lead: _________ Date: _____

---

## How to Use This Template

1. **Copy this file** to your implementation plan folder
2. **Fill in phase details** for your specific feature
3. **Update status regularly** as phases progress
4. **Link to evidence files** created during each phase
5. **Use this as single source** of phase completion truth

---

**Template Version:** 1.0  
**Last Updated:** 2026-06-23  
**Owner:** Documentation Team  

*This template ensures transparent, trackable phase completion across all implementations.*
