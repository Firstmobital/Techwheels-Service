# Current Project State Snapshot

Snapshot Date: 2026-06-18
Snapshot Basis: Code and dump audit only (no inferred/assumed behavior)

## Audit Source Set

- Web app runtime and route contract:
	- `src/App.tsx`
	- `package.json`
- Mobile runtime and route contract:
	- `mobile/src/app/_layout.tsx`
	- `mobile/src/app/index.tsx`
	- `mobile/src/app/(tabs)/_layout.tsx`
	- `mobile/src/app/job-cards/_layout.tsx`
	- `mobile/package.json`
- Database authority:
	- `local_folder/backups/full_database.sql` (authoritative schema + data dump)
	- `local_folder/backups/chunks/full_database.sql.part_*` (access mirror for large-file reads)

## Web Version (Audited)

### Stack and Runtime

- App framework: React 19 + TypeScript + Vite 8.
- Router: react-router-dom 7.
- Backend client: @supabase/supabase-js 2.103.3.

### Auth and Access Model

- App shell uses authenticated gating and permission loading before protected views.
- Protected routes use module-gated checks through `RequireAccess` and `ROUTE_MODULE_MAP`.
- Permission scope is evaluated per route module key.

### Public and Auth-Flow Routes

- `/` (login entry flow)
- `/signup`
- `/forgot-password`
- `/auth/callback`
- `/reset-password`
- `/verify-preview`
- `/c/:token` (complaint customer portal)

### Protected Route Surface

- `/home`
- `/import`
- `/reports`
- `/reports/:categoryId`
- `/reports/:categoryId/:reportId`
- `/settings`
- `/admin`
- `/reception`
- `/service-advisor`
- `/floor-incharge`
- `/sa-tracker`
- `/bodyshop-tracker`
- `/bodyshop-floor`
- `/technician`
- `/autodoc`
- `/autodoc/:id`
- `/complaints`
- `/bodyshop-repair`
- `/ew-reminder`
- `/service-booking`
- `/wa-agent`

### Module Keys Used by Web Route Gating

- `job_cards`
- `reports`
- `employees`
- `admin`
- `autodoc`
- `reception`
- `service_advisor`
- `floor_incharge`
- `sa_tracker`
- `bodyshop_tracker`
- `bodyshop_floor`
- `technician`
- `complaints`
- `bodyshop_repair`
- `ew_reminder`
- `service_booking`
- `wa_agent`

## Mobile Version (Audited)

### Stack and Runtime

- Expo SDK: 54.0.35.
- React Native: 0.81.5.
- Router: expo-router 6.
- Backend client: @supabase/supabase-js 2.103.3.

### Root Navigation Containers

- Auth stack: `mobile/src/app/(auth)/...`
- Main tabs stack: `mobile/src/app/(tabs)/...`
- Job cards stack: `mobile/src/app/job-cards/...`

### Session Redirect Logic

- Authenticated users redirect from index to `/(tabs)/home`.
- Unauthenticated users redirect from index to `/(auth)/login`.

### Visible Bottom Tabs

- `home`
- `search`
- `new`
- `alerts`
- `profile`

### Additional Registered Tab Screens (Hidden From Bottom Tab)

- `import`
- `reports`
- `autodoc`
- `settings`
- `admin`
- `floor-incharge`
- `reception`

### Job Card Flow Routes

- `job-cards/create`
- `job-cards/[id]`
- `job-cards/[id]/jobcard`
- `job-cards/[id]/edit`
- `job-cards/[id]/damage`
- `job-cards/[id]/capture-photo`
- `job-cards/[id]/panel-selector`
- `job-cards/[id]/panel-photos`
- `job-cards/[id]/estimate`
- `job-cards/[id]/submit`
- `job-cards/photos`

## Database Authority Snapshot (Audited From full_database.sql)

### Dump Authority and Access Mirror

- Canonical authority: `local_folder/backups/full_database.sql`.
- Access mirror: `local_folder/backups/chunks/full_database.sql.part_*`.
- Observed dump size: ~85 MB total (chunked into five parts).

### Object Counts in Authority Dump

- `CREATE TABLE`: 120
- `CREATE VIEW`: 3
- `CREATE FUNCTION`: 126
- `CREATE TABLE public.*`: 78

### Module and Navigation Seed Data

- `public.modules` seeded rows: 21
- `public.nav_groups` seeded rows: 5
- Nav groups in seed data:
	- Mechanical
	- Bodyshop
	- CRM
	- Reports
	- Admin

### Confirmed Public Domain Tables (Key Surface)

- Access and governance: `users`, `modules`, `nav_groups`, `user_module_permissions`, `user_employee_links`, `audit_logs`, `income_role_scope`.
- Reception/service flow: `service_reception_entries`, `service_bookings`, `service_booking_followups`.
- Core import/reporting data: `job_cards`, `open_job_cards`, `job_card_closed_data`, `service_invoice_data`, `service_invoice_order_data`, `service_vas_jc_data`.
- Parts domain: `part_master`, `service_parts_order_data`, `service_parts_consumption_data`, `service_parts_stock_snapshot_data`, `service_jc_parts_data`.
- AutoDoc domain: `vehicles`, `panels`, `panel_photos`, `documents`, `estimate_rows`, `autodoc_panel_master`, `autodoc_rate_cards`, `autodoc_rate_rows`.
- Complaints domain: `complaint_tickets`, `complaint_activity`, `complaint_messages`, `complaint_attachments`, `complaint_notifications`, `complaint_access_links`, `complaint_sla_policies`.
- Bodyshop domain: `bodyshop_repair_cards`, `bodyshop_assignments`, `bodyshop_floor_support_assignments`, `bodyshop_intake_vehicle_photos`, `bodyshop_repair_card_documents`, `settings_bodyshop_surveyors`.
- Technician domain: `technician_assignments`, `technician_earnings_settings`, `sa_earnings_settings`.
- Warranty domain: `warranty_amc_data`, `warranty_claim_settlement_report_data`, `warranty_fsb_data`, `warranty_goodwill_data`, `warranty_part_wc_data`, `warranty_updation_claim_data`, `warranty_wc_data`.
- WhatsApp domain: `wa_templates`, `wa_messages`, `wa_campaigns`, `wa_campaign_contacts`, `wa_followup_queue`, `wa_followup_steps`, `wa_conversations`, `wa_agent_config`.

## Change Control Notes

- This file is the current-state snapshot authority for runtime surface and DB object baseline.
- Do not infer behavior that is not visible in code or dump artifacts.
- Keep detailed route/module/schema facts here; avoid duplicating them in docs root indexes.
