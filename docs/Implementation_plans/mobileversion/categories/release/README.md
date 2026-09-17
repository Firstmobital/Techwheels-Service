# Release (Mobile Store)

Scope: First public Google Play and Apple App Store listing for the Expo binary in `mobile/` (`com.techwheels.service`). This category does not cover product features, MOBILE-011 identity, or the Capacitor `bodyshop/` folder.

Subfolder purpose:
- `active/` — store publish implementation plan
- `evidence/` — store-readiness audits (icons, permissions, listing blockers)
- `inactive/` — unused

Navigation:
- Plan: [active/MOBILE-012_PLAY_APP_STORE_PUBLISH_PLAN.md](active/MOBILE-012_PLAY_APP_STORE_PUBLISH_PLAN.md)
- Audit: [evidence/MOBILE-012_STORE_READINESS_AUDIT_2026-09-17.md](evidence/MOBILE-012_STORE_READINESS_AUDIT_2026-09-17.md)
- Binary: `mobile/` (Expo 54, EAS). Do not ship `bodyshop/`.
- Privacy URL (sales + service): [https://www.techwheels.in/privacy](https://www.techwheels.in/privacy) — source `TECHWHEELS-WEB/src/pages/PrivacyPolicyPage.jsx`. This repo does not own the promotional site.

Operator pattern (other repos, do not reuse their bundles):
- Techwheels Customer: `/Users/vkbin/TECHWHEELS-WEB/customer-mobile` — `com.techwheels.customer` / ASC `6807690158`
- Teela: `/Users/vkbin/teela-resort/mobile/apps/teela` — `com.teela.app` / ASC `6808128907`

Lifecycle: Keep MOBILE-012 in `active/` until Play production and App Store Ready for Distribution (or Ready for Sale) are recorded. Then archive under `docs/Implementation_plans/completed/mobileversion/categories/release/`.
