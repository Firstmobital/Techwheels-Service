# Customer (Mobile)

Scope: Login as Customer flows in the Expo app (`mobile/src/app/(customer)/`). This category covers customer document upload onto the existing bodyshop document row and universal Drive offload. Identity and session RPCs stay in MOBILE-011.

Subfolder purpose:
- `active/` — live execution plans
- `evidence/` — audits and test notes (create when a phase produces them)
- `inactive/` — paused plans (create when needed)

Navigation:
- Plan: [active/MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md](active/MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md)
- Drive function this plan consumes: [DRIVE-001](../../../../webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md)
- Customer login shell: [MOBILE-011](../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)
- DB truth: `supabase/backups/full_metadata.sql`

Lifecycle: keep MOBILE-013 in `active/` until a customer document is stored on `bodyshop_repair_card_documents` with `drive_url` set, and the Documents tab plus home card read that server state. Then archive under `docs/Implementation_plans/completed/mobileversion/categories/customer/`.
