# Customer (Mobile)

Scope: Login as Customer flows in the Expo app (`mobile/src/app/(customer)/`). This category covers customer document upload onto the existing bodyshop document row and universal Drive offload, the in-app advisor chat screen, and the mechanical (Floor Incharge) customer screens. Identity and session RPCs stay in MOBILE-011. The chat tables and web inbox are owned by CHAT-001. Accident screens stay on MOBILE-013.

Subfolder purpose:
- `active/` — live execution plans
- `evidence/` — audits and test notes (create when a phase produces them)
- `inactive/` — paused plans (create when needed)

Navigation:
- Documents: [active/MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md](active/MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md)
- Advisor chat screen: [active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md](active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)
- Mechanical customer screens: [active/MOBILE-015_MECHANICAL_CUSTOMER_SCREENS_PLAN.md](active/MOBILE-015_MECHANICAL_CUSTOMER_SCREENS_PLAN.md)
- Shared chat backend: [CHAT-001](../../../webversion/categories/chat/active/CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)
- Drive function this plan consumes: [DRIVE-001](../../../webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md)
- Customer login shell: [MOBILE-011](../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)
- DB truth: `supabase/backups/full_metadata.sql`

Lifecycle: keep MOBILE-013 in `active/` until a customer document is stored on `bodyshop_repair_card_documents` with `drive_url` set, and the Documents tab plus home card read that server state. Keep MOBILE-014 in `active/` until Home Chat stays in the app and a workshop reply shows on that screen. Keep MOBILE-015 in `active/` until a Floor Incharge customer sees mechanical Home, Documents, Journey, and Payments, and an Accident login still sees the bodyshop screens. Then archive each plan under `docs/Implementation_plans/completed/mobileversion/categories/customer/`.
