# Parts — Implementation Plans

**Scope:** Service Advisor Parts module (advisor / SPM / admin), Parts Reports uploads, order/stock matching, and Settings **Estimate & Parts Master** (customer estimate catalogue).

**Subfolders:**
- `active/` — live execution plans
- `evidence/` — audits, source-file contracts, test matrices
- `inactive/` — paused plans (create when needed)

**Lifecycle:** when a plan is verified complete, archive under `docs/Implementation_plans/completed/webversion/categories/parts/` and promote durable rules to `docs/web/modules/` if that truth path exists.

**Related live surfaces:** `/service-advisor`, `/parts-spm`, `/import` (Parts Reports group), `/settings#estimate-parts-master`.

**Active plans:**
- `PARTS-001` — Advisor/SPM order-date guard + GGN Stock
- `PARTS-002` — Estimate & Parts Master unique identity + `settings_service_parts_pricing` (DBL-0062 APPLIED); Required/Optional (DBL-0065); SA Create Estimate (DBL-0064)
