# Evidence-Driven Specification Implementation Plan

**Plan ID:** DOC-SYSTEM-001  
**Status:** Active  
**Created:** 2026-06-23  
**Target Completion:** 2026-09-23 (3 months)  
**Owner:** Techwheels Documentation Team  
**Scope:** Migrate from parallel Implementation_plans + Truth docs to single Evidence-Driven Spec model

---

## 1) Problem Statement

### Current State Issues
- ❌ **Truth State Drift**: Implementation plans and truth specs can diverge during development
- ❌ **Dual Maintenance**: Two separate files track the same feature (implementation plan + spec)
- ❌ **No Phase Visibility**: Unclear which development phases are complete/tested/verified
- ❌ **Manual Tracking**: Completeness status is implicit, requires document review
- ❌ **Not Automation-Ready**: Difficult to auto-update evidence without touching immutable spec

### Example: Telecalling Feature
```
Today:
  docs/Implementation_plans/webversion/categories/telecalling/active/PLAN.md  [describes phases]
  docs/web/modules/telecalling/reference/SPEC.md  [immutable spec]
  ↓ Phase 1 completes ↓
  Q: What updates the spec? A: Nothing automatic
  Risk: Spec and implementation status can drift
```

---

## 2) Solution: Evidence-Driven Specification

### Core Concept
**Single living specification with immutable spec core + dynamic evidence tracking.**

```
docs/web/modules/feature/reference/FEATURE_SPEC.md
├── [IMMUTABLE] Architecture, API Contract, Data Model, Rules
├── [MUTABLE] Implementation Phases Table
│   ├── Phase 1: [evidence file link] → Status: ✅
│   ├── Phase 2: [evidence file link] → Status: ✅
│   └── Phase 3: [evidence file link] → Status: 🟡
└── [MUTABLE] Completeness Header: 2/3 (66%), Ready: ❌
```

### Key Properties
- ✅ **Single Source of Truth**: All info in one SPEC.md
- ✅ **Immutable Spec Core**: Business logic never drifts
- ✅ **Visible Completeness**: Header shows phase % at a glance
- ✅ **Evidence-Linked**: Each phase links to test/validation proof
- ✅ **Automation-Ready**: Evidence section can auto-update post-tests
- ✅ **Scalable**: Same pattern works for 1 feature or 100

---

## 3) Implementation Phases

### Phase 1: Governance & Discipline (2 weeks)
**Establish disciplined phase tracking before changing structure**

**Deliverables:**
- [ ] Create PHASES.md template for implementation plans
- [ ] Create Phase Evidence template for test reports
- [ ] Add to STRUCTURE_GUIDE.md: Phase-tracking requirements
- [ ] Team training: How to use phase tracking

**Evidence Required:**
- PHASES.md template documented
- STRUCTURE_GUIDE.md updated with phase tracking rules
- At least 1 feature using PHASES.md successfully

**Success Criteria:**
- Team understands phase-based development tracking
- New implementation plans include PHASES.md by default

---

### Phase 2: Pilot Evidence-Driven Spec (4 weeks)
**Adopt new model for 2-3 new features, measure effectiveness**

**Deliverables:**
- [ ] Create Evidence-Driven Spec template (TEMPLATE.md)
- [ ] Select 2-3 new features as pilot projects
- [ ] Implement pilot features using Evidence-Driven Spec
- [ ] Collect feedback from team
- [ ] Document lessons learned

**Evidence Required:**
- Pilot feature #1: SPEC.md with phases/evidence links
- Pilot feature #2: SPEC.md with phases/evidence links
- Pilot feature #3: SPEC.md with phases/evidence links
- Team feedback survey completed
- Lessons learned document

**Success Criteria:**
- All pilot features track phases in single SPEC.md
- Evidence links are maintained correctly
- Team agrees model reduces maintenance vs. current approach
- No drift detected between spec and implementation status

---

### Phase 3: Full Migration (6 weeks)
**Migrate existing features to Evidence-Driven Spec**

**Deliverables:**
- [ ] Migrate auto-evidence.md and all 4 web modules to new model
- [ ] Migrate rbac, supabase, security, uploads, wa_templates to new model
- [ ] Archive old Implementation_plans files
- [ ] Retire parallel documentation pattern
- [ ] Update STRUCTURE_GUIDE.md with new primary pattern

**Evidence Required:**
- Migration checklist for each module completed
- All module SPEC.md files updated with phase tables
- Evidence files properly linked
- Old implementation plans archived in completed/
- Zero drift detected in migrated features

**Success Criteria:**
- All 9 existing modules using Evidence-Driven Spec
- Single SPEC.md is authoritative for each module
- Phase status visible in each spec header
- No parallel documentation maintenance burden

---

### Phase 4: Automation Integration (3 weeks)
**Add CI/CD hooks to auto-update evidence section**

**Deliverables:**
- [ ] Create phase-evidence-generator.sh script
- [ ] Integrate with CI/CD pipeline (post-test trigger)
- [ ] Auto-update phase status in SPEC.md evidence table
- [ ] Update CHANGE_LOG when phases complete

**Evidence Required:**
- phase-evidence-generator.sh script tested
- CI/CD integration working in pre-prod
- Automated phase completion detection proven
- Manual verification still required before truth promotion

**Success Criteria:**
- After tests pass, evidence table auto-updates
- Phase % automatically calculated and updated in SPEC header
- No false positives in phase completion detection
- Team confidence in automated updates

---

## 4) Rollout Timeline

```
Week 1-2 (Now): Phase 1 - Governance & PHASES.md template
Week 3-6:        Phase 2 - Pilot 2-3 new features
Week 7-12:       Phase 3 - Migrate existing 9 modules
Week 13-15:      Phase 4 - Automation & CI/CD
         ↓
Full Evidence-Driven Spec model operational
Implementation_plans/ used only for pre-Phase-1 planning
Truth docs fully synchronized with implementation evidence
```

---

## 5) Resource Requirements

| Resource | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|----------|---------|---------|---------|---------|
| Team Hours | 8h | 20h | 24h | 12h |
| Template Creation | ✅ | ✅ | - | - |
| Pilot Projects | - | ✅ | - | - |
| Migration | - | - | ✅ | - |
| Scripting | - | - | - | ✅ |
| Total | 8h | 20h | 24h | 12h |
| **TOTAL: 64 hours over 15 weeks** | | | | |

---

## 6) Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Team resistance to change | Medium | High | Early training, show benefits (less maintenance) |
| Migration introduces errors | Low | High | Careful phase-by-phase migration, validation checklist |
| Evidence links become stale | Medium | Medium | Automation + quarterly audit of links |
| Phase detection false positives | Low | High | Manual verification gate before spec promotion |
| Performance (many evidence files) | Low | Low | Evidence files live in separate folders, no merge issues |

---

## 7) Success Metrics

- ✅ **Zero drift detected** between implementation status and spec
- ✅ **50% reduction** in documentation maintenance time per feature
- ✅ **100% adoption** across all modules/features
- ✅ **Completeness visible** in every spec header (X phases done)
- ✅ **Automation working** with zero manual phase status updates
- ✅ **Team satisfaction** survey shows positive feedback

---

## 8) Post-Implementation

### Permanent State (After Phase 4)
- Every module/feature lives in docs/web or docs/mobile/ with single SPEC.md
- SPEC.md contains immutable spec core + mutable evidence table
- Evidence files organized in docs/*/modules|cross-cutting/*/evidence/
- Implementation_plans/ used only for pre-implementation design discussions
- Phase completion tracked automatically via tests
- STRUCTURE_GUIDE.md documents Evidence-Driven Spec as primary pattern
- Quarterly audits verify no spec drift

### Maintenance
- Evidence files updated with each test pass (manual or automatic)
- SPEC.md phase table updated automatically or manually
- Completeness % auto-calculated
- Truth state always synchronized with phase evidence

---

## 9) Related Documents

- [PHASES.md](./PHASES.md) — Phase tracking for this implementation
- [Evidence-Driven Spec Template](./templates/EVIDENCE_DRIVEN_SPEC_TEMPLATE.md) — Template for new specs
- [Phase Evidence Template](./templates/PHASE_EVIDENCE_TEMPLATE.md) — Template for phase test reports
- [STRUCTURE_GUIDE.md](../../../../STRUCTURE_GUIDE.md) — Documentation placement rules (to be updated)

---

## 10) Approval & Sign-Off

- [ ] Engineering Lead Approval: _________ Date: _____
- [ ] Documentation Lead Approval: _________ Date: _____
- [ ] Phase 1 Kickoff: Ready to begin

---

**Next Step:** Review PHASES.md for Phase 1 phase-by-phase completion tracking.
