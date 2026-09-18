# Techwheels Service — store listing paste

Source of truth for copy: MOBILE-012 Phase 4. Privacy URL is always https://www.techwheels.in/privacy.

Identity: package/bundle `com.techwheels.service`, ASC `6774519420`. Do not paste this into Customer (`com.techwheels.customer` / `6807690158`) or Teela (`com.teela.app` / `6808128907`).

## Graphics

| Store | File |
|---|---|
| Play icon | `play/icon-512.png` |
| Play feature graphic | `play/feature-graphic-1024x500.jpg` |
| App Store 1024 | `ios/icon-1024.png` (PNG, no alpha) |
| Screenshots | `play/screenshots/` and `ios/screenshots/` — capture **after** the 17 Sep production AAB/IPA (TW launcher icon on device) |

## Play — short description (80)

Workshop app for staff and customers: job cards, service tracker, and bills.

## Play — full description

```
Techwheels Service is the official workshop app for Techwheels (authorized Tata Motors dealership).

Workshop staff sign in with their work email to run reception, floor, body & paint job cards, reports, and telecalling.

Registered customers sign in with the 10-digit mobile number used at reception (same number as username and password) to see live service status, estimates, bills, gate pass, and helpdesk for vehicles on that number.

There is no public staff sign-up. Camera and photos are used for job-card and walkaround documentation. Location is used only while staff geotag job activity (not in the background).

Need help? Email service@techwheels.in or visit https://www.techwheels.in
```

## Play — first internal release (AAB versionCode 11)

**Release name**

```
1.0.0 (11)
```

**Release notes** (English — default)

```
First Play release of Techwheels Service.

Workshop staff: sign in with work email for job cards, reports, and floor operations.
Registered customers: enter the 10-digit reception mobile number in both fields to track service, estimates, bills, and gate pass.

There is no public staff sign-up.
```

## Play — listing fields

- **App name:** Techwheels Service
- **Category:** Business (secondary Auto & Vehicles if offered)
- **Contact email:** info@techwheels.in
- **Phone:** +91 97823 88882
- **Website:** https://www.techwheels.in
- **Privacy policy:** https://www.techwheels.in/privacy
- **Ads / Advertising ID / News app:** No
- **Target audience:** Age 18 and over only
- **Account creation:** App does not allow users to create an account
- **Log in with outside accounts:** Yes
- **User content sharing:** No
- **App access:** Restricted — two demo sets (staff email + customer 10-digit mobile in both fields)
- **Delete data URL:** https://www.techwheels.in/privacy
- **R8 mapping warning:** ignore (do not rebuild)

## Play — Advertising ID

App content → Advertising ID → **No**. Required before send-for-review.

## Play — Photo and video permissions

Play rejected AAB 11: **Use alternative system pickers for photos / videos**. Do not declare gallery-wide `READ_MEDIA_*`.

The next AAB blocks `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` (keeps CAMERA). Android gallery uses the system picker. After that AAB is in the release draft, this policy row should clear.

## Play — listing fields

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

## App Store — description

```
Techwheels Service is the official app for Techwheels, an authorized Tata Motors dealership.

Staff use a work email for job cards, photos, reports, and floor operations.
Customers use the 10-digit mobile number registered at reception (the same number in both sign-in fields) to track service, estimates, bills, and gate pass.

There is no public staff sign-up. Camera and photos document jobs. Location geotags staff job activity while the app is in use.

Help: service@techwheels.in · https://www.techwheels.in
```

## Review notes (fill demo accounts before Add for Review)

```
Techwheels Service is a dealership workshop app (staff + registered customers) for Techwheels, an authorized Tata Motors dealership. First screen: Login as Customer / Login as Staff.

Staff demo: <email> / <password> → Home.
Customer demo: username and password both <10-digit mobile> → customer tracker.

Camera/photos: staff job-card and walkaround video only.
Location: foreground geotag of job activity only; not background.
No public staff sign-up, no ads, no IAP.

Do not review Techwheels Customer (com.techwheels.customer) or Teela.
```

## Screenshot shot list (no live customer PII)

1. Audience picker — Customer vs Staff
2. Customer tracker (demo phone)
3. Staff home
4. Job card / AutoDoc (demo)
5. Reports (demo)

iPhone 6.7" (1290×2796 or 1320×2868). Android phone, at least 2.
