# Shared Truth State Documentation

**Scope:** Shared specifications, policies, and decisions that apply to both web and mobile platforms.

**Last Updated:** 2026-06-23  
**Owner:** Techwheels Development Team  
**Status:** Active - Truth State (applies to both platforms)

## Structure

### reference/
Authoritative specifications and decisions that govern both platforms:
- Architectural decisions and rationale
- Database change protocols and procedures
- Sync contracts and data consistency rules
- Module and route architecture specifications
- Onboarding policies and rules

### runbooks/
Operational procedures shared across both web and mobile:
- Enforcement procedures (e.g., onboarding gating)
- Troubleshooting guides
- Admin procedures

### active/
Live tracking and ongoing documentation shared by both platforms:
- Change log tracking all state transitions
- Live policies in effect

### catalog/
Reusable templates and standards:
- Update templates
- Common documentation templates

---

## Subcategories Guide

- `reference/` → Specifications, decisions, policies (immutable authority)
- `runbooks/` → Procedures, operational guides
- `active/` → Live tracking, changelogs
- `catalog/` → Reusable templates and libraries

---



- Docs conflict matrix (non-Implementation_plans): `DOCS_DEDUP_CONFLICT_MATRIX_2026-06-18.md`

## 1. Purpose

This handbook explains the real project state: architecture, business flows, functions, role/access model, database controls, and operational rules.

This is a living document and must be updated with every meaningful code/schema/flow change.

## 2. Product Summary

Techwheels Service is a React + TypeScript + Vite application using Supabase (Auth, Postgres, Storage) to support:

- Multi-branch data import (job cards, invoices, VAS, parts).
- Analytics and operational reporting.
- AutoDoc flow for body-and-paint claim documentation.
- Admin panel for users, dealer assignment, and module permissions.

## 3. Tech Stack

- Frontend: React 19, TypeScript, React Router.
- Data/Auth/Storage: Supabase JS v2.
- File parsing: `xlsx`, `papaparse`.
- Exports: `exceljs`, `pptxgenjs`.
- Build: Vite + TypeScript compiler.

## 4. High-Level Architecture

### 4.1 Entry and routing

- App entry: `src/main.tsx`
- Main shell + routing + auth gate: `src/App.tsx`

Main routes:

- `/import` -> data import center.
- `/reports/:categoryId/:reportId` -> report workspace.
- `/autodoc` and `/autodoc/:id` -> job card docs and detail.
- `/admin` -> user/module administration.
- `/settings` -> support and setup utilities.

### 4.2 API/service boundaries

`src/lib/api/` is the service layer for domain operations:

- `auth.ts`: dealer context from user/app metadata.
- `vehicles.ts`: read/upsert vehicle with dealer scoping.
- `jobCards.ts`: list/create job cards.
- `panels.ts`, `photos.ts`, `estimate.ts`, `documents.ts`: AutoDoc sub-resources.

### 4.3 Database and RLS

Core dealership isolation is enforced in SQL policies, not in frontend-only role checks.

- RLS helper function: `public.my_dealer_code()`
- RLS-enabled tables: `vehicles`, `job_cards`, `panels`, `panel_photos`, `estimate_rows`, `documents`
- Policies constrain access to rows matching dealer context in JWT metadata.

Primary policy source:

- `supabase/migrations/001_autodoc_schema.sql`

## 5. Business Domains and Core Logic

## 5.1 Import Domain

Main file:

- `src/pages/ImportPage.tsx`

Capabilities:

- Multi-table import cards for closed JC, invoice, VAS, parts consumption/order/stock.
- Branch-wise file slots.
- CSV/XLSX parsing with encoding fallback and TSV support for parts formats.
- Header mapping and row transformation using mapper modules.
- Validation and parse-error formatting.
- Duplicate-safe insert strategy with conflict handling/chunking fallback.

Supporting modules:

- `src/lib/vasColumnMapper.ts`
- `src/lib/invoiceColumnMapper.ts`
- `src/lib/jcClosedColumnMapper.ts`
- `src/lib/partsConsumptionColumnMapper.ts`
- `src/lib/partsOrderColumnMapper.ts`
- `src/lib/partsStockColumnMapper.ts`
- `src/lib/employeeMatcher.ts`

## 5.2 Reports Domain

Main files:

- `src/pages/ReportsPage.tsx`
- `src/pages/reports/index.ts`
- `src/pages/reports/types.ts`
- `src/lib/reportQueries.ts`
- `src/lib/partsReportQueries.ts`

Capabilities:

- Category + report-id routing and validation.
- Branch/date range filtering and custom date validation.
- Labour, performance, revenue, and parts report sets.
- Aggregated query-based report generation with typed outputs.

## 5.3 AutoDoc Domain

Main files:

- `src/pages/AutoDocPage.tsx`
- `src/pages/JobCardPage.tsx`
- `src/lib/api/jobCards.ts`
- `src/lib/api/photos.ts`
- `src/lib/generators/generatePPT.ts`
- `src/lib/generators/generateExcel.ts`

Capabilities:

- Job card list/detail and creation.
- Vehicle lookup + upsert.
- Panel and estimate row management.
- Document and photo upload with progress.
- Signed URL retrieval for secure viewing.
- PPT/Excel generation.

## 5.4 Admin Domain

Main file:

- `src/pages/AdminPage.tsx`

Capabilities:

- Create users and write to `public.users`.
- Activate/deactivate users.
- Assign/update dealer code and dealer name.
- Sync dealer metadata to Supabase auth user metadata (when service key is configured).
- Manage module-level permissions records.

Migration references:

- `supabase/migrations/002_add_dealer_code_to_users.sql`
- `supabase/migrations/20260521163400_auto_confirm_on_activate.sql`

## 6. Access Control Model (RBAC + RLS)

## 6.1 What exists

Application role labels currently used in UI/user records:

- `admin`, `manager`, `staff`, `viewer`

Dealer-based data access isolation:

- Enforced by SQL RLS policies using JWT metadata dealer code.

## 6.2 Practical enforcement layers

- Frontend/UI level: role and permission-driven controls in admin and navigation.
- Database level: dealer-code-based row policies for AutoDoc core tables.

## 6.3 Important design implication

If a control is only in UI, it is not a security boundary. Actual hard boundaries come from DB policy enforcement.

## 7. Function Conditions and Validation Highlights

- Vehicle year bounded validation in AutoDoc create flow.
- KM reading non-negative checks.
- Missing dealer context blocks vehicle upsert.
- Custom report range requires `from <= to`.
- Import parsing performs encoding and delimiter fallbacks.
- Metadata sync degrades gracefully if service key is unavailable.

## 8. Data Entities (Conceptual)

AutoDoc relationship chain:

- `vehicles` -> `job_cards` -> (`panels`, `panel_photos`, `estimate_rows`, `documents`)

Reporting sources include service and parts tables/views:

- `job_card_closed_data`
- `service_invoice_data`
- `service_vas_jc_data`
- `service_parts_consumption_data`
- `service_parts_order_data`
- `service_parts_stock_snapshot_data`
- supporting views used by report query modules

## 9. Operational Runbook

## 9.1 Local development

- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

Required env vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional/admin-sensitive:

- `VITE_SUPABASE_SERVICE_KEY` (used for auth metadata admin sync)

## 9.2 Migrations discipline

- Keep only incremental migrations in `supabase/migrations/`.
- Keep full dumps in backup folders, not migrations.

## 10. Known Risks and Gaps (Current)

- Role/module controls are partly UI-managed; verify hard enforcement where needed.
- Dealer metadata updates may require user re-login to refresh JWT claims.
- Large import duplicate handling can become expensive for heavily duplicated files.
- Ensure module-permission schema remains present and consistent across environments.

## 11. Documentation Governance

All documentation sync rules are defined in:

- `docs/shared/reference/SYNC_PROTOCOL.md`
- `docs/DOCS_IMPACT_MATRIX.md`
- `docs/shared/active/CHANGE_LOG.md`
- `docs/shared/reference/CURRENT_STATE.md`
- `docs/shared/reference/DB_CHANGE_LEDGER.md`
- `docs/shared/reference/DB_CHANGE_PROTOCOL.md`

Any change to business logic, function contracts, schema, access rules, or route behavior must update those docs in the same change set.
