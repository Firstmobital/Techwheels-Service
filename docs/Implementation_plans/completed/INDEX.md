# Completed Implementation Plans Index

Last Updated: 2026-06-30
Scope: Archive index for all signed-off plans

---

## Archive Roots

- Mobile archive root: `docs/Implementation_plans/completed/mobileversion/`
- Web archive root: `docs/Implementation_plans/completed/webversion/`

Both archive roots mirror live structure:
- `categories/<category>/active/`
- `categories/<category>/evidence/`
- `categories/<category>/inactive/`

Note: `active` under completed means final active-plan authority files that are now archived.

---

## Archive Policy

A plan enters completed only after:
1. Implementation complete.
2. Testing complete.
3. Sign-off recorded.
4. Live tracker status set to `DN`.

---

## Registered Completed Plans

First migration batch completed 2026-06-29 (Repository Self-Healing Wave 1). All 9 legacy completed-plan files identified at that time were migrated into the web archive root below. The legacy paths (`completed/rbac/`, `completed/autodoc/`, `completed/security/`, `completed/auth/`, `completed/supabase/`) temporarily held "Moved" stub pointers; those stubs were removed 2026-06-30 after confirming every downstream reference had been repointed to the canonical paths below, leaving only the web archive root as the authoritative location.

**Web archive — `categories/rbac/active/`**
- `RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md`
- `RBAC-001_DAILY_STANDUP_CHECKLIST.md`

**Web archive — `categories/autodoc/active/`**
- `RC_LOOKUP_EDGE_FUNCTION_IMPLEMENTATION_PLAN.md`

**Web archive — `categories/security/active/`**
- `SECURITY_REFACTOR_SERVICE_KEY.md`
- `SEC-001_DEPLOYMENT.md`
- `SEC-001_QUICK_START.md`

**Web archive — `categories/auth/active/`**
- `AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md`
- `AUTH-001_RUNBOOK.md`

**Web archive — `categories/supabase/active/`**
- `SUPABASE-002_DB_CODE_COMPARISON_REMEDIATION_PLAN_2026-06-11.md`

No mobile-platform legacy plans were found to migrate; `mobileversion/` remains an empty mirror root until mobile plans are completed and archived.

Future completions should be written directly into the appropriate `webversion/categories/<category>/active|evidence|inactive/` or `mobileversion/...` path — no further migration batches should be needed for plans created after this date.
