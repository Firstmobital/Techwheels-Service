# Meta WhatsApp Templates — Insurance Renewal Drip

## Overview

The insurance renewal module uses a **3-step WhatsApp drip** via Meta Cloud API.  
When a telecaller marks a lead as "No Answer", the system automatically sends  
a WhatsApp template message. After 3 no-answers, the lead is marked unreachable  
and a self-renewal link is sent.

Templates use the **same Meta credentials** from your existing `wa_agent_config`  
table (row id=1): `meta_phone_number_id` and `meta_access_token`.

---

## Templates to Create in Meta Business Manager

Create these 3 templates in your Meta WhatsApp Business Manager  
(https://business.facebook.com/wa/manage/message-templates/)

### 1. Template: `insurance_renewal_reminder` (Step 1)

| Field | Value |
|---|---|
| **Name** | `insurance_renewal_reminder` |
| **Category** | Marketing |
| **Language** | en_US (or hi for Hindi) |
| **Header** | None (text) |
| **Body** | See below |
| **Footer** | Team Techwheels |
| **Buttons** | None (or Quick Reply: " Renew Now") |

**Body text:**
```
Namaskar {{1}} ji! 🙏

Aapki {{2}} ({{3}}) ki insurance policy {{4}} ko expire ho rahi hai.

Abhi renew karwayein aur bina rukawat drive karein! 🚗🛡️

Reply karein ya humare telecaller se baat karein.
```

**Variable mapping:**
- `{{1}}` = Customer name (e.g., "Rahul Sharma")
- `{{2}}` = Vehicle model (e.g., "Maruti Swift")
- `{{3}}` = Registration number (e.g., "DL01AB1234")
- `{{4}}` = Expiry date (e.g., "15 Aug 2026")

---

### 2. Template: `insurance_renewal_urgent` (Step 2)

| Field | Value |
|---|---|
| **Name** | `insurance_renewal_urgent` |
| **Category** | Marketing |
| **Language** | en_US (or hi for Hindi) |
| **Header** | None (text) |
| **Body** | See below |
| **Footer** | Team Techwheels |
| **Buttons** | Quick Reply: "Renew Now" |

**Body text:**
```
Namaskar {{1}} ji! 🙏

Aapki {{2}} ({{3}}) ki insurance sirf kuch dinon mein {{4}} ko expire ho rahi hai.

Iska renewal karwaana na bhulein. Bina insurance drive karna illegal hai aur penalty lag sakti hai.

Abhi renew karwayein — humare saath best premium guaranteed! 🛡️

Reply "RENEW" karein aur hum aapko call karenge.
```

---

### 3. Template: `insurance_renewal_final` (Step 3)

| Field | Value |
|---|---|
| **Name** | `insurance_renewal_final` |
| **Category** | Marketing |
| **Language** | en_US (or hi for Hindi) |
| **Header** | None (text) |
| **Body** | See below |
| **Footer** | Team Techwheels |
| **Buttons** | CTA URL: "Self Renewal Link" → opens self-renewal page |

**Body text:**
```
Namaskar {{1}} ji! 🙏

Humne aapko insurance renewal ke baare mein 2 baar call kiya, par connect nahi ho paya.

Aapki {{2}} ({{3}}) ki insurance {{4}} ko expire ho rahi hai.

Abhi khud online renew karein — niche diye link par click karein! 👇

Team Techwheels 🚗
```

**CTA Button URL:** `https://techwheels-service.vercel.app/insurance-renewal/self?token={{1}}`  
*(The system will append the actual token. In Meta, use a static placeholder URL — the edge function sends the real link in the message body.)*

---

## How the Drip Works

```
Call Attempt 1 → No Answer
  → Next day: Lead returns to queue (retry_after = tomorrow)
  → Auto-send: insurance_renewal_reminder template

Call Attempt 2 → No Answer (next day)  
  → Lead returns to queue again
  → Auto-send: insurance_renewal_urgent template

Call Attempt 3 → No Answer (day 3)
  → Lead marked as "not_reachable"
  → Auto-send: insurance_renewal_final template
  → Self-renewal link generated and included
```

The cron job (`cron_daily_refresh`) runs at **8:30 AM IST** every day and:
1. Refreshes all active campaigns (adds new 30-day window leads)
2. Sends pending drip messages for leads due for retry
3. Snapshots the daily leaderboard

---

## Meta API Call Flow

```
Frontend (no_answer button)
  → p9('update_status', { status: 'no_answer', ... })
    → Edge function increments no_answer_count
    → If drip enabled:
      → Fetches Meta config from wa_agent_config (id=1)
      → Calls Meta Cloud API: POST /v18.0/{phone_number_id}/messages
      → Logs to insurance_renewal_meta_logs table
      → Updates assignment whatsapp_status = "drip_step_{n}"
```

---

## Approval Process

1. Create templates in Meta Business Manager
2. Submit for Meta review (usually approved within 1-24 hours)
3. Once status = "APPROVED", they're ready to use
4. No code changes needed — the edge function uses template names dynamically

## Troubleshooting

| Issue | Fix |
|---|---|
| Template not found | Check exact template name spelling matches |
| Authentication error | Verify `meta_access_token` in `wa_agent_config` is valid and not expired |
| Phone number format | System auto-prepends `91` to 10-digit Indian numbers |
| Rate limiting | 500ms delay between messages in cron batch |
| Template language mismatch | Template must be approved in the same language code used |
