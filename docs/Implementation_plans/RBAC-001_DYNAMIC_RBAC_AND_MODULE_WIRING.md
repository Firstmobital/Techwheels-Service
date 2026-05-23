# RBAC-001: Dynamic RBAC and Module Wiring Hardening

**Plan ID:** RBAC-001  
**Created:** 2026-05-23  
**Priority:** CRITICAL  
**Owner:** Techwheels Admin + Dev Team + GitHub Copilot  

---

## Executive Summary

This plan tracks end-to-end RBAC hardening so users only see modules and routes they are explicitly allowed to view. The immediate frontend leak has been patched by introducing deny-by-default permission checks in app navigation and routing. Remaining work focuses on backend policy hardening, module-route contract alignment, and operational controls for new user onboarding.

The authoritative source for schema and policy validation is local_folder/backups/full_database.sql. Work under this plan must never downgrade authority from this dump.

**Risk Level:** 🔴 CRITICAL  
**Estimated Duration:** 2-4 days (implementation + validation + rollout)  
**Rollback Strategy:** Revert frontend RBAC guard commit and redeploy previous build; backend policy changes must ship via reversible migrations.

---

## Objectives

1. Enforce deny-by-default access for all frontend routes and navigation.
2. Align module permission model with real route behavior and onboarding flow.
3. Remove backend overexposure risks that bypass frontend checks.
4. Establish trackable execution so done vs pending is visible at all times.

---

## Context & Background

Observed issue: new signup users could see all modules/pages despite no explicit permission assignment. Root causes identified:
- Frontend app shell previously lacked global RBAC checks.
- Module route definitions in DB and frontend paths were not strictly mapped.
- Backend RLS includes permissive policies on several data tables, so frontend-only checks are insufficient for full security.

---

## Implementation Tasks

### Phase 1: Frontend Access Enforcement
- [x] **Task 1.1:** Add centralized permission loading from get_all_my_permissions().
- [x] **Task 1.2:** Add deny-by-default route guards for all app modules.
- [x] **Task 1.3:** Filter sidebar and mobile nav by allowed modules.
- [x] **Task 1.4:** Add safe fallback UI when user has zero module access.
- [x] **Task 1.5:** Build validation for TypeScript and production bundle.

### Phase 2: Module Contract Normalization
- [ ] **Task 2.1:** Define canonical mapping between DB module names/routes and frontend routes.
- [ ] **Task 2.2:** Decide whether frontend paths should migrate to DB routes or keep explicit mapping layer.
- [ ] **Task 2.3:** Document contract in handbook and developer docs.

### Phase 3: Backend RBAC Hardening
- [x] **Task 3.1:** Audit permissive RLS policies for authenticated and anon roles.
- [x] **Task 3.2:** Create SQL migration plan foundation to restrict read/write per role/module/dealer scope.
- [ ] **Task 3.3:** Validate critical tables cannot be queried without intended access.

### Phase 4: New User Onboarding Controls
- [ ] **Task 4.1:** Confirm desired behavior for is_active default on signup.
- [ ] **Task 4.2:** Enforce onboarding state (inactive or no-module-access until admin assignment).
- [ ] **Task 4.3:** Update signup/admin UX copy to match true behavior.

### Phase 5: QA and Rollout
- [ ] **Task 5.1:** Execute role matrix tests (admin, manager, staff, viewer, new signup).
- [ ] **Task 5.2:** Verify direct URL access is blocked for unauthorized modules.
- [ ] **Task 5.3:** Publish operator checklist for permission assignment and validation.
- [x] **Task 5.4:** Create compact daily standup tracker with ownership and update conditions.

---

## Activity Tracker

> Update this section in real-time as work progresses.

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1
```
✅ 1.1 | Centralized permission loading in app shell | GitHub Copilot | 2026-05-23 | 2026-05-23 | Implemented using get_all_my_permissions()
✅ 1.2 | Route-level deny-by-default guard | GitHub Copilot | 2026-05-23 | 2026-05-23 | Added guard wrapper for protected routes
✅ 1.3 | Navigation filtering by module access | GitHub Copilot | 2026-05-23 | 2026-05-23 | Sidebar + mobile nav now permission-aware
✅ 1.4 | Access denied fallback state | GitHub Copilot | 2026-05-23 | 2026-05-23 | Added no-access screen and safe redirects
✅ 1.5 | Build validation | GitHub Copilot | 2026-05-23 | 2026-05-23 | npm run build passed
```

### Phase 2
```
🔄 2.1 | Canonical module-route contract definition | Dev Team | 2026-05-23 | - | In progress (explicit mapping active in frontend)
⏳ 2.2 | Route strategy decision (migrate vs map) | Techwheels Admin + Dev Team | - | - | Pending product/engineering decision
⏳ 2.3 | Contract documentation updates | Dev Team | - | - | Pending after strategy finalization
```

### Phase 3
```
✅ 3.1 | RLS policy deep audit | GitHub Copilot | 2026-05-23 | 2026-05-23 | Authoritative dump reviewed and permissive policy risk documented
✅ 3.2 | Restrictive RBAC migration SQL design foundation | GitHub Copilot | 2026-05-23 | 2026-05-23 | Added helper permission migration: 20260523120000_add_module_permission_helper_functions.sql (DBL-0002 PROPOSED)
⏳ 3.3 | Unauthorized query validation tests | QA + Dev Team | - | - | Pending
```

### Phase 4
```
⏳ 4.1 | Onboarding state policy decision | Techwheels Admin | - | - | Pending
⏳ 4.2 | Enforce onboarding gating | Dev Team | - | - | Pending
⏳ 4.3 | UX copy and operator flow alignment | Product + Dev Team | - | - | Pending
```

### Phase 5
```
⏳ 5.1 | Role matrix regression testing | QA | - | - | Pending
⏳ 5.2 | Direct URL bypass testing | QA | - | - | Pending
⏳ 5.3 | Operations runbook publication | Dev Team | - | - | Pending
✅ 5.4 | Compact daily checklist creation | GitHub Copilot | 2026-05-23 | 2026-05-23 | Created RBAC-001_DAILY_STANDUP_CHECKLIST.md with ownership and mandatory update conditions
```

---

## Dependencies & Prerequisites

- [x] Authoritative schema available: local_folder/backups/full_database.sql
- [x] Frontend build pipeline operational
- [ ] Backend policy change window approved
- [ ] QA test matrix approved by stakeholders

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Frontend-only RBAC gives false security confidence | High | High | Harden backend RLS in Phase 3 before closure |
| Module route contract drift reintroduces leaks | Medium | High | Freeze canonical mapping and document ownership |
| Onboarding behavior mismatch causes accidental access | Medium | Medium | Explicit onboarding state policy and automated checks |

---

## Success Criteria

- ✅ Unauthorized users do not see unauthorized nav entries.
- ✅ Unauthorized direct URL navigation is blocked in frontend.
- [ ] Backend table access is restricted per finalized RBAC policy.
- [ ] New signup users stay restricted until explicit admin assignment.
- [ ] Role matrix QA passes for all supported roles.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Techwheels Admin: _______________ (Signature) (Date)
- [ ] Engineering Lead: _______________ (Signature) (Date)
- [ ] QA Lead: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

### 2026-05-23 - Kickoff
- Frontend leak fixed by centralized RBAC checks in app shell.
- Authoritative dump confirms permission RPC functions exist and can drive frontend gating.
- Remaining security risk is backend policy permissiveness; frontend fix is necessary but not sufficient.

---

## Related Documentation

- docs/Implementation_plans/INDEX.md
- docs/Implementation_plans/TEMPLATE.md
- docs/Implementation_plans/RBAC-001_DAILY_STANDUP_CHECKLIST.md
- docs/Implementation_plans/AUTODOC_EXECUTION_STATUS_2026-05-22.md
- docs/Project_Handbook/CURRENT_STATE.md
- docs/Project_Handbook/DB_CHANGE_LEDGER.md
- docs/Project_Handbook/DB_CHANGE_PROTOCOL.md
- local_folder/backups/full_database.sql

---

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS  
**Progress:** 55%
