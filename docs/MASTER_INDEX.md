# Techwheels Service - Master Docs Index

Last Updated: 2026-06-29

---

## Primary Categories

1. [README.md](README.md) - docs root overview
2. [STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md) - canonical placement rules
3. [shared/reference/CURRENT_STATE.md](shared/reference/CURRENT_STATE.md) - audited current web/mobile/database snapshot
4. [Implementation_plans](Implementation_plans) - execution plans and trackers
5. [shared](shared/) - durable governance and architecture docs
6. [../.instructions.md](../.instructions.md) - AI-agent operating contract
7. [web/modules/autodoc](web/modules/autodoc) - autodoc operations docs
8. [web/modules/complaints](web/modules/complaints) - complaints authority/reference docs
9. [web/modules/telecalling](web/modules/telecalling) - telecalling operations docs
10. [web/modules/warranty](web/modules/warranty) - warranty evidence and audits
11. [web/cross-cutting/rbac](web/cross-cutting/rbac) - RBAC operations and evidence
12. [web/cross-cutting/security](web/cross-cutting/security) - security references
13. [web/cross-cutting/supabase](web/cross-cutting/supabase) - Supabase operations and evidence
14. [web/cross-cutting/uploads](web/cross-cutting/uploads) - upload feature guides and runbooks
15. [web/cross-cutting/wa_templates](web/cross-cutting/wa_templates) - WhatsApp template catalog

---

## Implementation Plans

Primary entry points:

1. [Implementation_plans/INDEX.md](Implementation_plans/INDEX.md)
2. [Implementation_plans/IMPLEMENTATION_TRACKER.md](Implementation_plans/IMPLEMENTATION_TRACKER.md)
3. [Implementation_plans/STRUCTURE_AND_WORKFLOW.md](Implementation_plans/STRUCTURE_AND_WORKFLOW.md)

Platform indexes:

1. [Implementation_plans/mobileversion/INDEX.md](Implementation_plans/mobileversion/INDEX.md)
2. [Implementation_plans/mobileversion/IMPLEMENTATION_TRACKER.md](Implementation_plans/mobileversion/IMPLEMENTATION_TRACKER.md)
3. [Implementation_plans/webversion/INDEX.md](Implementation_plans/webversion/INDEX.md)
4. [Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md](Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md)
5. [Implementation_plans/completed/INDEX.md](Implementation_plans/completed/INDEX.md)

---

## Category-Level READMEs

1. [shared/README.md](shared/README.md)
2. [web/modules/autodoc/README.md](web/modules/autodoc/README.md)
3. [web/modules/complaints/README.md](web/modules/complaints/README.md)
4. [web/modules/telecalling/README.md](web/modules/telecalling/README.md)
5. [web/modules/warranty/README.md](web/modules/warranty/README.md)
6. [web/cross-cutting/rbac/README.md](web/cross-cutting/rbac/README.md)
7. [web/cross-cutting/security/README.md](web/cross-cutting/security/README.md)
8. [web/cross-cutting/supabase/README.md](web/cross-cutting/supabase/README.md)
9. [web/cross-cutting/uploads/README.md](web/cross-cutting/uploads/README.md)
10. [web/cross-cutting/wa_templates/README.md](web/cross-cutting/wa_templates/README.md)

---

## Key Guidance Documents

1. [STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md) - Complete placement authority and decision tree
2. [../.instructions.md](../.instructions.md) - AI-agent operating contract (single entry point for agent behavior)
3. [shared/reference/CURRENT_STATE.md](shared/reference/CURRENT_STATE.md) - Audited current-state authority
4. [shared/reference/DATABASE_TRUTH.md](shared/reference/DATABASE_TRUTH.md) - Database authority hierarchy
5. [DOCS_DEDUP_CONFLICT_MATRIX_2026-06-18.md](DOCS_DEDUP_CONFLICT_MATRIX_2026-06-18.md) - Non-Implementation_plans overlap matrix and authority mapping (point-in-time snapshot, dated)
6. [README.md](README.md) - Top-level docs overview

---

## Notes

1. Markdown files should not be left in `docs/` root except authority/index files.
2. Every move should include link-fix and validation in the same change.
3. For placement workflow, follow [STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md).
4. For web/mobile/database factual status, treat [shared/reference/CURRENT_STATE.md](shared/reference/CURRENT_STATE.md) as the single snapshot authority.
