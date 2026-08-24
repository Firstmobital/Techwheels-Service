# Parts — Implementation Plans

**Scope:** Service Advisor Parts module (advisor / SPM / admin), Parts Reports uploads, and order/stock matching.

**Subfolders:**
- `active/` — live execution plans
- `evidence/` — audits, source-file contracts, test matrices
- `inactive/` — paused plans (create when needed)

**Lifecycle:** when a plan is verified complete, archive under `docs/Implementation_plans/completed/webversion/categories/parts/` and promote durable rules to `docs/web/modules/` if that truth path exists.

**Related live surfaces:** `/service-advisor`, `/parts-spm`, `/import` (Parts Reports group).
