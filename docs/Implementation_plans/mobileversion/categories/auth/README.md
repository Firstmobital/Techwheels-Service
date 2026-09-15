# Auth — Implementation Plans (Mobile)

**Scope:** Customer vs staff identity, login shells, session routing, and customer-scoped RPCs for the single Expo binary in `mobile/`.

**Subfolders:**
- `active/` — live execution plans
- `evidence/` — phase evidence, test matrices (create when a phase produces evidence)
- `inactive/` — paused plans (create when needed)

**Lifecycle:** when a plan is verified complete, archive under `docs/Implementation_plans/completed/mobileversion/categories/auth/` and promote durable rules to `docs/mobile/` or `docs/shared/` if that truth path exists.

**DB truth:** `supabase/backups/full_metadata.sql`

**Related live surfaces:**
- Staff: `mobile/src/app/(auth)/login.tsx`, `mobile/src/app/(tabs)/`
- Web dual login (must share RPCs): `src/pages/LoginPage.tsx`, `src/pages/CustomerPortalPage.tsx`
- Do not ship: `bodyshop/` (Capacitor prototype)

**Active plans:**
- `MOBILE-011` — One Expo app, Login as Customer / Login as Staff
