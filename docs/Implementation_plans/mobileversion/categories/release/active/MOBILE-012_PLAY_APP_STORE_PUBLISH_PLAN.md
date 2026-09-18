# MOBILE-012 — Play Store and App Store Publish

**Plan ID:** MOBILE-012  
**Date Created:** 2026-09-17  
**Last Updated:** 2026-09-18 (App Store listing paste + Connect checklist; IPA 13 already in Connect — next is Add for Review, not another IPA)  
**Status:** In Progress (complete ASC 6774519420 listing + Add for Review; Play still needs AAB 12+)  
**Owner:** Mobile + Platform  
**Platform:** mobile (Expo store binary + Play / App Store listings)  
**Category:** release  
**Database Dump Reference:** `supabase/backups/full_metadata.sql`  
**Schema change:** none  
**Pre-plan audit:** [MOBILE-012_STORE_READINESS_AUDIT_2026-09-17.md](../evidence/MOBILE-012_STORE_READINESS_AUDIT_2026-09-17.md)  
**Risk Level:** High (review rejection if unused Always location, missing privacy URL, or wrong bundle)  
**Estimated Duration:** 2–5 days repo + listing; Play/Apple review extra  

**Operator pattern (other repos — copy process, never copy bundle IDs):**

- Techwheels Customer (App Store 1.0 Ready for Distribution 2026-09-06): `/Users/vkbin/TECHWHEELS-WEB/docs/Implementation_plans/mobileversion/categories/customer-portal/active/CUSTOMER_PORTAL_MOBILE_APK_PLAN.md` Phases 6–7
- Teela store builds: `/Users/vkbin/teela-resort/docs/Implementation_plans/mobileversion/categories/release/active/EAS_OTA_AND_STORE_BUILDS_PLAN.md`

---

## 1) Executive Summary

Publish the existing Expo app in `mobile/` as **one public listing**: **Techwheels Service**. Workshop staff and registered customers already share this binary behind the MOBILE-011 audience picker. Sideload APK and earlier TestFlight/IPA uploads are not a store listing.

EAS, signing, Firebase, and App Store Connect app **6774519420** already exist. A production IPA was uploaded 2026-05-29; that only puts a binary in Connect. Google Play has no AAB wired in `mobile/eas.json` submit yet.

This plan does **not** change MOBILE-011 identity, RPCs, or screens. It makes the current binary store-legal: TW icons, unused-permission strip, live privacy URL, listing copy, then AAB + IPA submit.

**Privacy lock (2026-09-17):** One promotional site for sales **and** service: [https://www.techwheels.in](https://www.techwheels.in), deployed from `/Users/vkbin/TECHWHEELS-WEB/`. Store privacy URL is **only** [https://www.techwheels.in/privacy](https://www.techwheels.in/privacy). Do not add a competing policy on Techwheels-Service Vercel. Policy **copy** for Techwheels Service was added in TECHWHEELS-WEB `src/pages/PrivacyPolicyPage.jsx` on 2026-09-17. Operator deploys that project; then confirm the live page in a logged-out browser before Play/App Store submit.

### Measurable outcomes
- Customers and staff can install **Techwheels Service** from Google Play and the App Store (`com.techwheels.service`)
- Launcher and store icons are the TW mark from `mobile/store/` (not the Expo default)
- [https://www.techwheels.in/privacy](https://www.techwheels.in/privacy) opens without login and names Techwheels Service data types (job photos, foreground GPS, customer mobile login, device logs, deletion via `service@techwheels.in`)
- `bodyshop/` (`com.techwheels.bodyshop`) is not on either store
- Techwheels Customer (`com.techwheels.customer`) and Teela (`com.teela.app`) listings are untouched

---

## 2) Classification Record

- **State:** implementation plan (active)
- **Scope:** Expo store binary + listing metadata for `mobile/`. Privacy **copy** lives in TECHWHEELS-WEB (promotional site), not in this repo.
- **Intent:** first public Google Play + Apple App Store release of Techwheels Service
- **Product lock:** MOBILE-011 — one binary, Login as Customer / Login as Staff. Do not ship `bodyshop/`
- **Parity reference:** store process from CUSTOMER-APK-001 and EAS-OTA-001; not their packages or ASC ids

---

## 3) Scope

### In scope
- Wire TW store artwork into Expo (`icon`, `splash`, `android.adaptiveIcon`) from `mobile/store/`
- Convert JPEG masters to PNG where Apple/Play require PNG
- Strip unused background location and unused Face ID / biometric declarations
- Set `ios.supportsTablet: false` for v1 (phone screenshots only)
- Play/App Store privacy field = `https://www.techwheels.in/privacy` (TECHWHEELS-WEB promotional site; copy already updated 2026-09-17)
- Confirm that URL after TECHWHEELS-WEB deploy; then in-app Privacy / Support / Delete links in `mobile/` that open the same host
- `eas.json` submit: Apple team fields + Android internal track
- Play Console listing + first AAB on **internal testing**, then production (India)
- App Store Connect listing completion + review for ASC `6774519420`
- Reviewer demo accounts (one staff, one customer mobile=mobile) in review notes

### Out of scope
- A second Play/App Store app (customer-only or staff-only)
- Publishing `bodyshop/` (`com.techwheels.bodyshop`)
- Rewriting S3 logger off `EXPO_PUBLIC_` AWS keys
- iPad layout / iPad screenshots
- Changing MOBILE-011 login, RPCs, or customer/staff shells
- Touching Customer or Teela EAS projects, bundles, or listings
- A second privacy policy on Techwheels-Service (`techwheels-service.vercel.app/privacy` or similar) as the store URL
- Rewriting TECHWHEELS-WEB privacy copy again unless Apple/Google review asks
- Preview / development-client quota burns for store (use `production` / `production-apk` only)

---

## 4) Authority Sources

| Authority | Path |
|---|---|
| This plan | `docs/Implementation_plans/mobileversion/categories/release/active/MOBILE-012_PLAY_APP_STORE_PUBLISH_PLAN.md` |
| Store-readiness audit | `docs/Implementation_plans/mobileversion/categories/release/evidence/MOBILE-012_STORE_READINESS_AUDIT_2026-09-17.md` |
| One-binary product lock | `docs/Implementation_plans/mobileversion/categories/auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md` |
| Program tracker | `docs/Implementation_plans/mobileversion/categories/program/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md` |
| Expo / EAS config | `mobile/app.json`, `mobile/app.config.js`, `mobile/eas.json`, `mobile/package.json` |
| Store artwork masters | `mobile/store/play/`, `mobile/store/ios/` |
| DB dump (no schema change) | `supabase/backups/full_metadata.sql` |
| Placement rules | `docs/STRUCTURE_GUIDE.md` §2.5 |
| Promotional site (sales + service) | `/Users/vkbin/TECHWHEELS-WEB/` deploys `https://www.techwheels.in` |
| Privacy policy source | `/Users/vkbin/TECHWHEELS-WEB/src/pages/PrivacyPolicyPage.jsx` (public `/privacy`, no login) |
| Customer store playbook (process only) | `/Users/vkbin/TECHWHEELS-WEB/docs/Implementation_plans/mobileversion/categories/customer-portal/active/CUSTOMER_PORTAL_MOBILE_APK_PLAN.md` |
| Teela store playbook (process only) | `/Users/vkbin/teela-resort/docs/Implementation_plans/mobileversion/categories/release/active/EAS_OTA_AND_STORE_BUILDS_PLAN.md` |

---

## 5) Identity lock (never mix with the other apps)

Same operator, **different apps**. Reuse Apple team and Play org. Do **not** reuse their bundles or ASC ids.

| App | Folder | Package / bundle | ASC | Expo slug / project |
|---|---|---|---|---|
| **This plan** | `mobile/` | `com.techwheels.service` | **6774519420** | `techwheels-service` / `54c61729-6d1f-414e-8224-18a77663ba75` |
| Techwheels Customer (live) | `/Users/vkbin/TECHWHEELS-WEB/customer-mobile` | `com.techwheels.customer` | 6807690158 | `techwheels-customer` |
| TECHWHEELS-WEB employee (not this listing) | TECHWHEELS-WEB `mobile/` | `com.anonymous.techwheelsmobile` | 6760889688 | do not touch |
| Teela (live) | `/Users/vkbin/teela-resort/mobile/apps/teela` | `com.teela.app` | 6808128907 | `teela` |
| Do not ship | `bodyshop/` | `com.techwheels.bodyshop` | — | — |

### Shared operator facts (copy from shipped apps)

- Expo owner: `tw_admin`
- Apple ID: `admin@firstmobital.com`
- Apple Team ID: `LTSQS2N52R`
- Copyright: First Mobital Private Limited
- Play: organization account (First Mobital). Customer plan recorded org `6302602821883707761` / `admin@techwheels.in`. Confirm on the dashboard. Org accounts are typically exempt from the 12-tester × 14-day personal-account rule
- Promotional website (sales + service): `https://www.techwheels.in` — TECHWHEELS-WEB, not this repo
- Privacy canonical URL (both store listings): `https://www.techwheels.in/privacy`
- Support: `info@techwheels.in` / `service@techwheels.in` / +91 97823 88882 / `https://www.techwheels.in`
- India first, free, no ads, no IAP, advertising ID **No**
- Export: `ITSAppUsesNonExemptEncryption: false` (already in `mobile/app.json`)

---

## 6) Locked decisions

1. One public listing: **Techwheels Service**. Customer + staff in this binary (MOBILE-011).
2. Package stays `com.techwheels.service`. Never `com.techwheels.customer`, `com.teela.app`, `com.techwheels.bodyshop`, or `com.anonymous.techwheelsmobile`.
3. **TW launcher icon is mandatory on every new store binary.** Source: `mobile/store/play/icon-1024.jpg` and `mobile/store/ios/icon-1024.jpg`. Expo must use `mobile/assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` (white splash / adaptive background). OTA cannot change icons.
4. Play uploads an **Android App Bundle** (`npm run build:prod:android`, profile `production`). Sideload APK stays `npm run build:prod:apk`. **Do not upload an APK to Play Console.**
5. First Play track is **internal testing**. Production after listing + Data safety. If the Play account is a personal account created after 13 Nov 2023, budget 12 testers × 14 days closed testing. First Mobital org is typically exempt — confirm on the dashboard.
6. **One privacy URL for both store apps:** `https://www.techwheels.in/privacy`. TECHWHEELS-WEB owns the page. Copy updated 2026-09-17 to cover Techwheels Service (staff job photos, foreground GPS geotag, customer 10-digit mobile login, device logs, deletion via `service@techwheels.in`) as well as Techwheels Customer. Do not host a second policy in this repo. Live page must show that copy after deploy (Play rejects a stub/blank shell).
7. Demo accounts in App Review / Play App access: one staff email/password and one customer 10-digit mobile (same value in both fields). No live customer PII in screenshots.
8. `bodyshop/` is do-not-ship.
9. The May 2026 production IPA is **not** valid for public review after Phase 1–2 native changes. Cut a new IPA.
10. First AAB may be uploaded **by hand** in Play Console. Optional later: `eas submit` with gitignored `mobile/play-service-account.json`.

---

## 7) What to copy vs not copy

### Copy from Teela (`mobile/apps/teela`)

- `icon`, `splash` (`contain`, `#FFFFFF`), `android.adaptiveIcon`
- Location plugin: `isIosBackgroundLocationEnabled: false`, `isAndroidBackgroundLocationEnabled: false`
- `production.android.buildType: app-bundle`; sideload is `production-apk`
- `submit.production.ios`: `appleId` + `appleTeamId` + `ascAppId`
- Block `com.google.android.gms.permission.AD_ID` if unused
- OTA cannot change icons; new binary after icon/permission/splash

### Copy from Techwheels Customer (`customer-mobile` + CUSTOMER-APK-001 Phases 6–7)

- AAB vs APK split (this repo already has `production` = AAB and `production-apk`)
- `submit.production.android.track: "internal"`, `releaseStatus: "completed"`
- TW icon pipeline: store JPEG → `assets/*.png`
- Play App content table, Data safety, listing paste, reviewer login
- App Store name/subtitle/category/age/privacy nutrition/review notes; **manually release**

### Do not copy from Customer

- WebView-only permission set
- `blockedPermissions` of all photo/video library access (this app **does** capture walkaround video and job photos)
- Invite-only buyer listing copy
- ASC `6807690158` / package `com.techwheels.customer`

---

## 8) Activity Tracker (Mandatory)

Status values: targeted | in-progress | blocked | completed

| Task | Status | Evidence | Owner | Updated |
|---|---|---|---|---|
| File this plan + category README + index/tracker sync | completed | this file; `release/README.md`; mobile INDEX + TRACKER; MOBILE-010 M10-008 | Engineering | 2026-09-17 |
| Phase 0 — identity + EAS submit fields | completed | `mobile/eas.json` submit.production: appleId `admin@firstmobital.com`, appleTeamId `LTSQS2N52R`, ascAppId `6774519420`; android track `internal` + `releaseStatus` completed. Play service-account JSON gitignored, path not wired until the key exists (first AAB may be uploaded by hand). | Engineering | 2026-09-17 |
| Phase 1 — TW PNG icons wired into Expo | completed | `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`; `store/ios/icon-1024.png` (1024 PNG, no alpha); `store/play/icon-512.png`. `app.json` icon/splash/adaptiveIcon. Feature graphic JPG kept. | Engineering | 2026-09-17 |
| Phase 2 — permission strip + `supportsTablet: false` | completed | Background location and Face ID plugin removed. When-in-use location, camera, photos, mic kept. AD_ID blocked. | Engineering | 2026-09-17 |
| Phase 3a — privacy **copy** on promotional site | completed | `/Users/vkbin/TECHWHEELS-WEB/src/pages/PrivacyPolicyPage.jsx` — Techwheels Service section, `service@techwheels.in` deletion, staff-app “not covered” line removed. Last updated 17 Sep 2026 | Engineering | 2026-09-17 |
| Phase 3b — deploy + browser check of `https://www.techwheels.in/privacy` | completed | 2026-09-17 live bundle `https://www.techwheels.in/assets/index-DxY4YcLI.js` contains H1 Privacy Policy, Last updated 17 September 2026, Techwheels Service workshop section, no-public-staff-signup, foreground geotag / no background location, `service@techwheels.in` deletion. Old “employee app is not covered” absent. HTML shell title remains “Techwheels Quotation” (index.html) — cosmetic only. | Operator + Engineering | 2026-09-17 |
| Phase 3c — in-app Privacy / Support / Delete links in `mobile/` | completed | `LegalLinks` on audience, staff settings, staff profile, customer chrome/menu. Opens https://www.techwheels.in/privacy, https://www.techwheels.in, mailto:service@techwheels.in | Engineering | 2026-09-17 |
| Phase 4A — screenshots from TW-icon binary | in-progress | TestFlight IPA build 13 installed. Capture 6.7" shots (no live PII) into `mobile/store/ios/screenshots/`. Android shots after Play internal install or matching AAB sideload. Shot list in `mobile/store/LISTING.md`. | Operator | 2026-09-17 |
| Phase 4B–4D — listing paste | completed | Paste-ready Play + App Store copy in `mobile/store/LISTING.md` (demo accounts still operator fill-in before Add for Review). | Engineering | 2026-09-17 |
| Phase 5 — Play AAB internal testing then production | in-progress | AAB 11 blocked by Play photo-picker policy. New AAB **versionCode 12** queued: https://expo.dev/accounts/tw_admin/projects/techwheels-service/builds/c58fbda2-2945-4873-87d8-6348b3122ab3 (`READ_MEDIA_*` blocked, CAMERA kept). Replace the production draft with this AAB. Advertising ID = No. Ignore R8 warning. | Operator + Engineering | 2026-09-17 |
| Phase 6 — App Store listing + review for `6774519420` | in-progress | IPA 1.0.0 (13) is in Connect / TestFlight. Do **not** cut another IPA. Operator: paste listing + privacy nutrition from `mobile/store/LISTING.md`, 1024 PNG, 6.7" screenshots, demo accounts, India + **manually release**, then **Add for Review**. | Operator + Engineering | 2026-09-18 |

---

## 9) Implementation Phases

Phases 0–3c done. IPA 13 is in App Store Connect. **App Store next (this session):** finish the 1.0 listing in ASC `6774519420` and **Add for Review** — see `mobile/store/LISTING.md`. Do not upload a new IPA. **Play** still needs AAB 12+ (picker policy). Do not run `ota:prod` for store listing.

### Phase 0 — Identity and EAS submit

**Goal:** Submit config matches Customer/Teela; Play app is created for **this** package only.

**Steps:**

1. In `mobile/eas.json` `submit.production.ios`, keep `ascAppId: "6774519420"`. Add:
   - `appleId`: `admin@firstmobital.com`
   - `appleTeamId`: `LTSQS2N52R`
2. Add `submit.production.android`:
   - `track`: `"internal"`
   - `releaseStatus`: `"completed"`
   - optional `serviceAccountKeyPath`: `./play-service-account.json` (gitignored; never commit)
3. Confirm Play Console app for Techwheels Service does **not** already use another package. Package name comes from the first AAB (`com.techwheels.service`).
4. Never point submit at ASC `6807690158`, `6808128907`, or `6760889688`.

**Validation:** `eas.json` submit block has iOS team + Android internal track. `play-service-account.json` is gitignored if created.

### Phase 1 — TW icons

**Goal:** Every new store binary shows the TW mark. Source files already in `mobile/store/`.

**Steps:**

1. Convert (do not redesign):
   - `store/ios/icon-1024.jpg` → `store/ios/icon-1024.png` (1024×1024 PNG, **no alpha**)
   - `store/play/icon-512.jpg` → `store/play/icon-512.png`
   - `store/play/icon-1024.jpg` → `assets/icon.png` (1024 PNG, flatten alpha)
2. Create `assets/adaptive-icon.png` from the same mark with extra padding so Android’s 66% safe zone does not crop the wordmark. Background `#FFFFFF`.
3. Create `assets/splash-icon.png` — TW mark on `#FFFFFF`.
4. Keep `store/play/feature-graphic-1024x500.jpg` for Play listing.
5. In `mobile/app.json`:
   - `icon`: `./assets/icon.png`
   - `splash`: `{ image: "./assets/splash-icon.png", resizeMode: "contain", backgroundColor: "#FFFFFF" }`
   - `android.adaptiveIcon`: `{ foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#FFFFFF" }`
6. Do not use `mobile/assets/expo.icon/` (Expo default).

**Validation:** `app.json` points at PNG paths. Apple 1024 PNG has no alpha. OTA is **not** a substitute.

### Phase 2 — Permission strip

**Goal:** Declared permissions match real use (Teela location flags). Avoid Apple 5.1.4.

**Steps:**

1. Remove Android `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION`.
2. Set `expo-location` `isAndroidBackgroundLocationEnabled` and `isIosBackgroundLocationEnabled` to **false**. Remove `NSLocationAlwaysAndWhenInUseUsageDescription` and `locationAlwaysAndWhenInUsePermission`.
3. Keep when-in-use location (staff geotag in `mobile/src/utils/locationService.ts`).
4. Keep camera, photos, mic (walkaround video is real), `POST_NOTIFICATIONS`.
5. Remove unused Face ID: `expo-local-authentication` plugin, `NSFaceIDUsageDescription`, Android `USE_BIOMETRIC` / `USE_FINGERPRINT`.
6. Set `ios.supportsTablet` to **false**.
7. Optionally `android.blockedPermissions` include `com.google.android.gms.permission.AD_ID` (Teela). Do **not** block `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` — job media needs them.

**Validation:** `app.json` has no Always location and no Face ID plugin. `supportsTablet` is false.

### Phase 3 — Legal URLs

**Goal:** Both stores point at one live HTTPS policy on the promotional site (Customer lesson: Play rejects a stub).

**Canonical URLs (do not replace):**

| Use | URL |
|---|---|
| Privacy (Play + App Store + in-app) | https://www.techwheels.in/privacy |
| Marketing / support | https://www.techwheels.in |
| Workshop deletion / service privacy | mailto:service@techwheels.in |
| Sales / booking privacy | mailto:sales@techwheels.in / mailto:info@techwheels.in |

**3a — Copy (completed 2026-09-17)**  
Source: `/Users/vkbin/TECHWHEELS-WEB/src/pages/PrivacyPolicyPage.jsx` (public route `/privacy` in `src/App.jsx`). The page now names Techwheels Service as well as Techwheels Customer: staff email (no public signup), customer 10-digit mobile=mobile, job photos/video, foreground-only location, device logs, deletion via `service@techwheels.in`. The old “employee app is not covered” sentence is removed. Do not rewrite unless review asks.

**3b — Deploy (completed 2026-09-17)**  
Live production JS (`/assets/index-DxY4YcLI.js` on www.techwheels.in) includes the 17 Sep copy. Recheck after any later TECHWHEELS-WEB deploy. Do not rewrite the policy unless review asks.

**3c — In-app links (`mobile/`, not a second policy)**  
1. Audience screen and staff settings: Privacy opens `https://www.techwheels.in/privacy`. Support can open `https://www.techwheels.in` or helpdesk emails already in the app.
2. Account-deletion path: mailto `service@techwheels.in` (policy already describes this). Do **not** add `/privacy` on Techwheels-Service Vercel as the store URL.

**Validation:** Live `/privacy` names this app. Play Console and App Store Connect privacy fields are exactly `https://www.techwheels.in/privacy`.

### Phase 4 — Listing pack

**Goal:** Paste-ready copy and screenshots. Capture screenshots **after** the 17 Sep production AAB/IPA (TW icon on device). Copy is already in `mobile/store/LISTING.md`.

#### 4A — Screenshot shot list (no live customer PII)

| # | Screen | Why |
|---|---|---|
| 1 | Audience picker | Shows Customer vs Staff |
| 2 | Customer tracker (demo phone) | Customer value |
| 3 | Staff home | Workshop value |
| 4 | Job card / AutoDoc (demo) | Camera/location justification |
| 5 | Reports (demo) | Staff depth |

Store under `mobile/store/ios/screenshots/` and `mobile/store/play/screenshots/`. iPhone 6.7" (1290×2796 or 1320×2868). Android phone, at least 2.

#### 4B — Play listing paste

- **App name:** Techwheels Service
- **Short description (80, 76 used):** Workshop app for staff and customers: job cards, service tracker, and bills.
- **Full description:**

```
Techwheels Service is the official workshop app for Techwheels (authorized Tata Motors dealership).

Workshop staff sign in with their work email to run reception, floor, body & paint job cards, reports, and telecalling.

Registered customers sign in with the 10-digit mobile number used at reception (same number as username and password) to see live service status, estimates, bills, gate pass, and helpdesk for vehicles on that number.

There is no public staff sign-up. Camera and photos are used for job-card and walkaround documentation. Location is used only while staff geotag job activity (not in the background).

Need help? Email service@techwheels.in or visit https://www.techwheels.in
```

- **Category:** Business (secondary Auto & Vehicles if offered)
- **Contact email:** info@techwheels.in
- **Phone:** +91 97823 88882
- **Website:** https://www.techwheels.in
- **Graphics:** `mobile/store/play/icon-512.png`, `mobile/store/play/feature-graphic-1024x500.jpg`, ≥2 phone screenshots

#### 4C — Play App content (paste 2026-09-17)

Full operator paste also lives in `mobile/store/LISTING.md`. Package name is **`com.techwheels.service`** (from the AAB; do not type a different package).

| Section | Fill with |
|---|---|
| Privacy policy | https://www.techwheels.in/privacy |
| Delete data URL | https://www.techwheels.in/privacy |
| Ads | **No** |
| Advertising ID | **No** (App content → Advertising ID). `AD_ID` is blocked in `app.json`. Incomplete ads-ID declaration blocks send-for-review. |
| User content sharing / UGC | **No** (no in-app chat/voice/social feed; helpdesk opens phone/email/WhatsApp) |
| Target age | **18 and over** only |
| News app | **No** |
| Account creation | **My app does not allow users to create an account** |
| Log in with accounts created outside the app | **Yes** (admin-created staff email; reception-registered 10-digit mobile) |
| Sign-in details / App access | **Yes, restricted.** Two sets: Staff account (email/password) + Customer account (10-digit mobile in **both** fields, no `+91`). Full-access checkbox **unchecked**. Other-info paste in `LISTING.md`. |
| Content ratings | IARC. No violence, no public UGC social, no location for ads |
| Data safety | Collects required types = **Yes**. Badges (independent security review, UPI) **off**. See §5B. |
| Photos and videos (Data safety) | Job-card / walkaround documentation. Play **permission** policy: system picker; AAB 11 rejected; next AAB blocks `READ_MEDIA_*` (§5E). |
| Location | Approximate + precise, **app functionality**, not background, **users can choose** |
| R8 / deobfuscation warning on AAB 11 | **Ignore.** Not a store blocker. Do not rebuild. |

#### 4D — App Store listing paste

| Field | Value |
|---|---|
| Name | Techwheels Service |
| Subtitle (30) | Workshop and customer portal |
| Bundle ID | `com.techwheels.service` |
| Primary category | Business |
| Age rating | 18+ / no unrestricted public UGC / no gambling |
| Copyright | 2026 First Mobital Private Limited |
| Price | Free |
| Availability | Start with **India**; **manually release** |
| Support URL | https://www.techwheels.in |
| Privacy URL | https://www.techwheels.in/privacy |
| Keywords | dealership,workshop,service,tata,jobcard,vehicles,bodyshop |

**Description:**

```
Techwheels Service is the official app for Techwheels, an authorized Tata Motors dealership.

Staff use a work email for job cards, photos, reports, and floor operations.
Customers use the 10-digit mobile number registered at reception (the same number in both sign-in fields) to track service, estimates, bills, and gate pass.

There is no public staff sign-up. Camera and photos document jobs. Location geotags staff job activity while the app is in use.

Help: service@techwheels.in · https://www.techwheels.in
```

**Review notes (paste, fill demo accounts):**

```
Techwheels Service is a dealership workshop app (staff + registered customers) for Techwheels, an authorized Tata Motors dealership. First screen: Login as Customer / Login as Staff.

Staff demo: <email> / <password> → Home.
Customer demo: username and password both <10-digit mobile> → customer tracker.

Camera/photos: staff job-card and walkaround video only.
Location: foreground geotag of job activity only; not background.
No public staff sign-up, no ads, no IAP.

Do not review Techwheels Customer (com.techwheels.customer) or Teela.
```

### Phase 5 — Google Play

**Goal:** `com.techwheels.service` on Play: internal testers first, then production. Process from CUSTOMER-APK-001 6B–6H.

#### 5A — Create the app (once)

1. Play Console → Create app.
2. Name: `Techwheels Service`. App. Free.
3. Accept privacy / export / Play policies.
4. Package name is **not** typed here; it comes from the first AAB.

#### 5B — Data safety (5F)

Does the app collect required user data types? **Yes**. Independent security review / UPI badges: **off**.

Play “Shared” = third party. Do **not** check Shared (no advertisers; Supabase/AWS process on our behalf). All types: **Collected**, **not ephemeral**. Never Advertising or Personalisation.

| Data type | Collected / Shared | Ephemeral | Required on listing | Why |
|---|---|---|---|---|
| Name | Collected | No | Required | App functionality + Account management |
| Email address | Collected | No | Required | Account management |
| User IDs | Collected | No | Required | Account management |
| Address | Collected | No | Users can choose | App functionality |
| Phone number | Collected | No | Required | Account management + App functionality |
| Approximate location | Collected | No | Users can choose | App functionality (same as precise) |
| Precise location | Collected | No | Users can choose | App functionality (job geotag, not ads) |
| Photos | Collected | No | Users can choose | App functionality |
| Videos | Collected | No | Users can choose | App functionality |
| Files and docs | Collected | No | Users can choose | App functionality |
| Other user-generated content | Collected | No | Users can choose | App functionality |
| Crash logs | Collected | No | Users can choose | Analytics |
| Diagnostics | Collected | No | Users can choose | Analytics |
| Device or other IDs | Collected | No | Users can choose | Analytics |

Not collected: contacts, SMS, calendar, health, financial, ads, **background** location, standalone voice recordings (walkaround mic is part of **Videos**).

Encrypted in transit: **Yes**. Deletion: **Yes** — URL https://www.techwheels.in/privacy (`service@techwheels.in`).

#### 5C — Build and upload

```bash
cd mobile
npm run build:prod:android
# then either (after the AAB finishes — not OTA):
npx eas-cli submit -p android --profile production --id <build-id>
# or download the AAB from expo.dev and upload:
# Play Console → Testing → Internal testing → Create new release
```

- Profile `production` produces **.aab**, not APK. `versionCode` auto-increments remotely.
- `npm run ota:prod` is **not** a substitute for this AAB. Latest EAS Android as of 2026-09-17 is `production-apk` only (sideload).
- Enroll Play App Signing on first upload. Sideload APK and Play install will not update each other in place once Play App Signing is on. Testers uninstall the old APK first.
- Do not start a second AAB unless this one fails.
- `eas submit` for Play needs `mobile/play-service-account.json` (gitignored). Until that JSON exists, upload the AAB by hand. Do not add `serviceAccountKeyPath` until the file is on disk.

#### 5D — Release tracks

1. **Internal testing** — workshop emails. Confirm Customer + Staff login + one job photo path.
2. **Closed testing** — only if the dashboard requires 12 testers / 14 days.
3. **Production** — India. Rollout 20% then 100% if needed.

**Validation:** Internal testers install from Play, see TW icon, both audiences work. No policy warnings.

#### 5E — Photo and video permissions (Play policy)

**2026-09-17:** Play blocked send-for-review on AAB 11 with *Use alternative system pickers for photos / videos*. Staff only attach **selected** job photos/videos. This is not a gallery app. Do **not** declare broad `READ_MEDIA_*` access.

**Fix (in repo, needs a new AAB — OTA cannot change the manifest):**

- `android.blockedPermissions`: `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (plus existing `AD_ID`)
- Keep `CAMERA` and `RECORD_AUDIO` (camera capture + walkaround video)
- Android gallery uses `ImagePicker.launchImageLibraryAsync` (system picker) and does **not** call `requestMediaLibraryPermissionsAsync`
- iOS still requests photo library (Apple, not this Play policy)

Replace the production/internal draft with the new AAB (versionCode 12+). After Play sees no `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` in the bundle, the picker policy row should clear. Leave the photo-and-video **declaration** empty / not claiming gallery core.

#### 5F — Advertising ID declaration

App content → Advertising ID → **No**. Incomplete declaration blocks send-for-review. Matches `blockedPermissions` `AD_ID`. No ads, no ads measurement.

### Phase 6 — Apple App Store

**Goal:** Public listing for ASC **6774519420**, bundle `com.techwheels.service`. Process from CUSTOMER-APK-001 7A–7F.

**Do not reuse** Customer ASC `6807690158` or Teela `6808128907`.

**Do not submit the May 2026 IPA or the 2026-09-16 IPA (build 12)** after Phase 1–2. Cut a new production IPA. `--auto-submit` uploads that IPA to App Store Connect / TestFlight; it does **not** click Add for Review. This round queued the IPA **without** auto-submit (buildNumber 13); submit after the build finishes.

```bash
cd mobile
npm run build:prod:ios -- --non-interactive --no-wait
# after https://expo.dev/.../builds/7ef042cd-f3fc-4a17-813d-5d5625e7df69 finishes:
npx eas-cli submit -p ios --profile production --id 7ef042cd-f3fc-4a17-813d-5d5625e7df69
```

Open [App Store Connect → app 6774519420](https://appstoreconnect.apple.com/apps/6774519420/appstore).

1. App Information + Version listing from Phase 4D.
2. 1024 PNG from `mobile/store/ios/icon-1024.png`. iPhone screenshots only (tablet off).
3. Privacy nutrition labels: name/email/phone, photos, precise location (app function, linked to identity for geotagged jobs), user ID, diagnostics. Not used for tracking/ads.
4. Export compliance: **No** (already in Info.plist).
5. Sign-in required: Yes. Paste reviewer accounts (same two sets as Play: staff email + customer 10-digit mobile in both fields).
6. Select build **1.0.0 (13)**. **Add for Review**. **Manually release** after approval. Do not click Release Automatically.

**After approval:** JS-only changes via `npm run ota:prod` / `ota:prod:ios` (`runtimeVersion` follows `appVersion`). Icon, splash, and permission changes require a **new store binary**.

---

## 10) Explicitly Wrong Approaches (do not implement)

| Approach | Why forbidden |
|---|---|
| Submit this binary to ASC `6807690158` / `6808128907` / `6760889688` | Those ids are other apps |
| Upload `production-apk` to Play | Play requires AAB; Teela/Customer locked this |
| Ship `bodyshop/` / `com.techwheels.bodyshop` | MOBILE-011 do-not-ship; Capacitor, Android-only, service-role risk |
| Leave Always location on | Apple 5.1.4; code is foreground-only |
| OTA the TW icon | Icons are native; Customer locked decision 11 |
| Public staff signup on the store binary | MOBILE-011; customers would create workshop users |
| Split into two store apps in this plan | Product lock: one listing |
| Copy Customer `blockedPermissions` for **all** media (including CAMERA) | Walkaround video and job photos are real; keep CAMERA |
| Declare Advertising ID = Yes, or skip the ads-ID form | App does not use AD_ID; incomplete form blocks send-for-review |
| Claim the app is a gallery / needs broad `READ_MEDIA_*` as core product | Staff only pick job photos; Photo Picker is enough. Declaration explains attach-to-job, not library management |
| Rebuild AAB 11 to fix the R8 deobfuscation warning | Warning only; ignore |
| Use Expo default `assets/expo.icon` | TW mark is mandatory |
| Host a second privacy policy on Techwheels-Service Vercel as the store URL | Promotional site is the legal URL for sales **and** service; two policies confuse review |
| Point stores at a stub/blank `/privacy` before TECHWHEELS-WEB deploy | Play already rejected a placeholder on Customer |

---

## 11) Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Apple rejects Always location | High if Phase 2 skipped | High | Strip unused background location before the new IPA |
| Play/Apple see blank or Customer-only `/privacy` | Low (17 Sep copy is live in production JS) | High | Recheck URL after future TECHWHEELS-WEB deploys; no rewrite unless review asks |
| Reviewer cannot log in | Medium | High | Put working staff + customer demos in review notes |
| Wrong ASC / Play package | Low | Critical | Identity lock table; never submit to other apps |
| Combined app confused as a generic website | Medium | Medium | Listing names dealership workshop + both audiences; native screens, not a marketing WebView |
| AWS keys in extra | Already true | Medium | Disclose logs in Data safety; logger rewrite is out of scope |
| Play personal-account 12×14 testing | Low if First Mobital org | Medium | Confirm org vs personal on dashboard before promising production date |
| Play rejects `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` on AAB 11 | Happened 2026-09-17 | High | New AAB blocks those permissions; keep CAMERA + system picker. Do not declare gallery core. |
| Incomplete Advertising ID declaration | High if skipped | High | App content → Advertising ID = **No** |
| Old May 2026 IPA submitted | Low (build 13 is on TestFlight) | High | New IPA after Phase 1–2 is already submitted |

---

## 12) Success Criteria (plan done)

1. Phase 0–6 tracker rows completed with evidence notes.
2. Play internal (then production) install of `com.techwheels.service` shows the TW icon.
3. App Store listing submitted or Ready for Distribution / Ready for Sale for ASC `6774519420` with TW 1024 PNG.
4. https://www.techwheels.in/privacy opens without login, shows the 17 Sep 2026 Techwheels Service subsection, and is the URL in both store consoles.
5. `com.techwheels.customer` and `com.teela.app` listings unchanged.
6. `bodyshop/` not in any store listing.

---

## 13) Resume Protocol

1. Read this file + [README.md](../README.md) + the [2026-09-17 audit](../evidence/MOBILE-012_STORE_READINESS_AUDIT_2026-09-17.md).
2. Read [MOBILE-010](../../program/active/MOBILE-010_MOBILE_PROGRAM_MASTER_TRACKER.md) for program status.
3. Native rebuild for this round is **done** (AAB 11 + IPA 13). Do not `ota:prod` expecting those native changes on older binaries.
4. Play: AAB 11 failed photo-picker policy. Upload the **new** AAB (12+) with `READ_MEDIA_*` blocked. Advertising ID = **No**. Ignore R8 warning. Package `com.techwheels.service`.
5. App Store now: [ASC 6774519420](https://appstoreconnect.apple.com/apps/6774519420/appstore) → paste `LISTING.md` → 6.7" screenshots → demo accounts → build 13 → **Add for Review** → **manually release**. No new IPA.
6. Never `eas submit` to `6807690158` / `6808128907` / `6760889688`.

---

## 14) Daily command table (from `mobile/`)

Scripts are unchanged since May 2026 (`ota:prod` is an alias of `ota:prod:all`). What changed for MOBILE-012 is **which command this round requires**.

| Need | Command | Ships | Does not ship |
|---|---|---|---|
| **This round — Play binary** | `npm run build:prod:android` | New **AAB** (`production`, `buildType: app-bundle`). TW icon, permission strip, LegalLinks JS baked in. | APK. Not an OTA. |
| **This round — App Store binary** | `npm run build:prod:ios -- --non-interactive --no-wait` then `eas submit` after finish | New **IPA**. Same native + JS as the AAB. This round: build `7ef042cd-f3fc-4a17-813d-5d5625e7df69` (buildNumber 13), submit separately. | “Add for Review”. Not an OTA. |
| Sideload / workshop APK | `npm run build:prod:apk` | APK (`production-apk`) | Play Console. Do not upload this file to Play. |
| Daily JS/UI after a store binary with this runtime is **already installed** | `npm run ota:prod` | Same as `ota:prod:all`: JS/TS on channel `production`, both platforms | Icons, splash, plugins, permissions, `supportsTablet`, native deps, versionCode/buildNumber |
| iOS-only JS after that store binary is live | `npm run ota:prod:ios` | iOS JS on `production` | Android, anything native |

**OTA vs native (this plan):** Phase 1 icon/splash/adaptiveIcon and Phase 2 permission/`supportsTablet` changes live in `app.json` / native plugins. Expo Updates cannot apply them. The Sept 15 APK, Sept 16 IPA (build 12), and May IPA all predate those native edits. Queue AAB + IPA now. After that binary is on devices, later JS-only fixes use `ota:prod`.

**Play vs APK:** `build:prod:android` → AAB for Play. `build:prod:apk` → sideload only. They do not update each other in place once Play App Signing is on.

---

## 15) Rollback Plan

1. Bad OTA: publish another OTA on `production`.
2. Bad store binary: fix in repo, new AAB/IPA, new store version (review again).
3. Do not revert assets to the Expo default icon.
4. Do not halt Customer or Teela listings to fix this app.

---

## 16) Sync Checklist (Mandatory)

- [x] Added to `docs/Implementation_plans/mobileversion/INDEX.md`
- [x] Added to `docs/Implementation_plans/mobileversion/IMPLEMENTATION_TRACKER.md`
- [x] Linked from `MOBILE-010` (M10-008)
- [x] Category README filed
- [x] Evidence audit filed
- [ ] Passed docs validation if/when `npm run docs:validate` exists in this repo
