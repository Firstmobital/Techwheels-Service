# Current Project State Snapshot

Snapshot Date: 2026-05-22
Version Context: Techwheels Service v1.0 (current workspace state)

## Product Scope

- Domains: Import, Reports, AutoDoc, Admin, Settings.
- Backend platform: Supabase Auth + Postgres + Storage.
- UI framework: React + TypeScript + Vite.

## Active Route Surface

- `/import`
- `/reports/:categoryId/:reportId`
- `/settings`
- `/admin`
- `/autodoc`
- `/autodoc/:id`
- `/auth/callback`

## Reporting Surface

- Report categories include labour/revenue, performance, revenue, parts.
- Report registry is centrally managed under `src/pages/reports/`.
- Query engines split by general service reports and parts-focused reports.

## Access Control State

- Auth gate enforced at app shell level.
- Frontend navigation and route access now use deny-by-default module permission checks.
- Dealer code is resolved from user/app metadata in session JWT.
- RLS policies enforce dealership row scoping for AutoDoc core data tables.
- UI-level role labels exist (`admin`, `manager`, `staff`, `viewer`).
- Module permissions are managed in admin workflow.

## DB Governance State

- Authoritative schema reference: `local_folder/backups/full_database.sql`.
- DB change tracking file introduced: `docs/Project_Handbook/DB_CHANGE_LEDGER.md`.
- Mandatory DB workflow file introduced: `docs/Project_Handbook/DB_CHANGE_PROTOCOL.md`.
- RBAC daily execution tracking file introduced: `docs/Implementation_plans/RBAC-001_DAILY_STANDUP_CHECKLIST.md`.

## Module-Route Contract

- Canonical module-route mapping defined in: `docs/Project_Handbook/MODULE_ROUTE_CONTRACT.md`.
- Route strategy decision (explicit mapping vs. DB route migration) finalized in: `docs/Project_Handbook/ROUTE_STRATEGY_DECISION.md`.
- **Strategy**: Frontend maintains explicit `ROUTE_MODULE_MAP` (not DB-synced) to enable semantic frontend workflows independent of DB data entity routes.
- **Authority**: `public.modules` table is authoritative for module names; `ROUTE_MODULE_MAP` in `src/App.tsx` is authoritative for route assignments.

## Import State

- Multi-file branch-wise ingest supported for core service and parts datasets.
- Header mapping + row parse validation pipeline exists for each specialized source.
- Duplicate-safe insertion and fallback conflict handling are implemented.

## AutoDoc State

- Job card list and detail views active.
- Vehicle lookup/upsert integrated.
- Panel/photo/document/estimate subsystems active.
- PPT and Excel generation features active.

## Admin State

- User create/activate/deactivate features present.
- Dealer assignment and metadata sync flow present.
- Module and permission management flow present.

## Open Risk Notes

- Ensure module permission schema consistency across all environments.
- Keep role controls and DB enforcement assumptions aligned.
- Keep dealer metadata and JWT refresh expectations clear to users.

## How to Update This Snapshot

When state changes, update:

1. Route surface changes.
2. Domain capability changes.
3. Access control enforcement changes.
4. Schema/report/import behavior changes.
5. Risks and current assumptions.
