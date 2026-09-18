# MOBILE-012 — Store Readiness Audit

**Date:** 2026-09-17  
**Status:** Evidence (updated 2026-09-17 after privacy copy lock)  
**Plan:** [MOBILE-012_PLAY_APP_STORE_PUBLISH_PLAN.md](../active/MOBILE-012_PLAY_APP_STORE_PUBLISH_PLAN.md)  
**Scope:** `mobile/` Expo app as of 2026-09-17, plus promotional privacy URL owned by TECHWHEELS-WEB

---

## 1) Identity (keep)

| Field | Value |
|---|---|
| Name | Techwheels Service |
| Slug | `techwheels-service` |
| Owner | `tw_admin` |
| EAS project | `54c61729-6d1f-414e-8224-18a77663ba75` |
| Android package | `com.techwheels.service` |
| iOS bundle | `com.techwheels.service` |
| ASC app id | `6774519420` |
| Version | `1.0.0` (`eas.json` `appVersionSource: remote`) |

Firebase `google-services.json` and `GoogleService-Info.plist` match this package/bundle.

---

## 2) Already ready

- Expo 54 + EAS `production` (Android **AAB**), `production-apk` (sideload), `production` iOS IPA
- OTA channel `production`, `runtimeVersion.policy: appVersion`
- Staff signup closed (`mobile/src/app/(auth)/signup.tsx`)
- Audience picker exists (`mobile/src/app/(audience)/index.tsx`) — MOBILE-011 one-binary lock
- Store artwork masters (JPEG, not yet wired into Expo):
  - `mobile/store/ios/icon-1024.jpg`
  - `mobile/store/play/icon-1024.jpg`
  - `mobile/store/play/icon-512.jpg`
  - `mobile/store/play/feature-graphic-1024x500.jpg`
- iOS submit stub: `eas.json` `submit.production.ios.ascAppId` = `6774519420`
- Export compliance already `ITSAppUsesNonExemptEncryption: false`
- Production IPA was auto-submitted 2026-05-29 (MOBILE-001). That is a binary in Connect, **not** a finished public listing.
- Privacy **copy** for Techwheels Service: live at https://www.techwheels.in/privacy (bundle `index-DxY4YcLI.js`, 17 Sep 2026). Phase 3b closed.

---

## 3) Blockers before first store binary

| ID | Finding | Why it fails review / listing | Fix in MOBILE-012 |
|---|---|---|---|
| B-01 | ~~`app.json` missing icon/splash/adaptiveIcon~~ **Closed 2026-09-17** | TW PNGs wired in `app.json` | Phase 1 done |
| B-02 | ~~Store masters JPEG only~~ **Closed 2026-09-17** | `store/ios/icon-1024.png` 1024 no alpha; `store/play/icon-512.png` | Phase 1 done |
| B-03 | ~~Background location declared~~ **Closed 2026-09-17** | Always / background flags removed; foreground geotag kept | Phase 2 done |
| B-04 | ~~Face ID / biometric declared unused~~ **Closed 2026-09-17** | Plugin and permissions removed | Phase 2 done |
| B-05 | ~~`ios.supportsTablet: true`~~ **Closed 2026-09-17** | Set `false` | Phase 2 done |
| B-06 | ~~Live privacy must show Service-app copy~~ **Closed 2026-09-17** | Production bundle includes 17 Sep Techwheels Service policy. HTML title still “Techwheels Quotation” (not a store blocker) | Phase 3b done |
| B-07 | No phone screenshots in `mobile/store/` | Listing cannot be submitted for review until captured from the new TW-icon binary | Phase 4A (listing copy filed in `mobile/store/LISTING.md`) |
| B-08 | ~~`eas.json` submit iOS-only~~ **Closed 2026-09-17** | Apple team fields + Android internal track | Phase 0 done |

---

## 4) Disclose, do not block v1

| ID | Finding | Store action |
|---|---|---|
| W-01 | AWS keys copied into `expo.extra` via `app.config.js` / logger | Data safety + privacy nutrition: device logs. Do not rewrite logger in this plan |
| W-02 | Combined customer + staff binary | Listing copy must say dealership workshop + registered customers |
| W-03 | May 2026 IPA predates icon/permission fixes | New IPA required after Phase 1–2; do not submit that old binary for public review |
| W-04 | ~~In-app Privacy / deletion links not yet in `mobile/`~~ **Closed 2026-09-17** | `LegalLinks` on audience, settings, profile, customer chrome |

---

## 5) Do not ship

| Surface | ID | Action |
|---|---|---|
| `bodyshop/` Capacitor | `com.techwheels.bodyshop` | Do not create a Play/App Store listing |
| Techwheels Customer | `com.techwheels.customer` / ASC `6807690158` | Other repo; do not submit this binary there |
| Teela | `com.teela.app` / ASC `6808128907` | Other repo |
| TECHWHEELS-WEB employee | `com.anonymous.techwheelsmobile` / ASC `6760889688` | Other repo |
