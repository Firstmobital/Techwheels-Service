# MOBILE-011 Test Matrix

Started: 2026-09-16  
Plan: [MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md](../active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)

| ID | Case | Expected | Status |
|---|---|---|---|
| C-01 | Username and password both same 10-digit mobile with two regs | Session + both vehicles | Pending apply |
| C-02 | Username and password are different mobiles | Fail; no session | Pending apply |
| C-02b | Username is a vehicle reg, password is a phone | Fail | Pending apply |
| C-02c | Unknown 10-digit mobile used as both fields | Fail; no fake vehicle | Pending apply |
| C-03 | Customer token `.from('service_reception_entries')` | RLS deny / empty | Pending apply |
| C-03b | Customer token + another customer’s `p_reg_number` | RPC reject | Pending apply |
| C-04 | Customer deep-link `/(tabs)/admin` | Redirect / denied | Code in `mobile/` |
| C-05 | Staff session opens `/(customer)` | Redirect to staff home | Code in `mobile/` |
| C-06 | Anon `customer_get_active_job` without token | Fail | Pending apply |
| C-07 | Staff JWT calls `customer_*` RPC | Fail | Pending apply |
| C-08 | Estimate missing in DB for my vehicle | Empty / pending — no synthetic lines | Code in `mobile/` |
| C-09 | Gate pass not issued | Null — no client QR | Code in `mobile/` |
| C-09b | Gate pass issued without `qr_token` | Pass fields; no decorative QR | Code in `mobile/` |
| C-09c | Gate pass issued with workshop `qr_token` | Encode that token only | Code in `mobile/` |
| C-10 | Staff signup without invite | Blocked | Code in `mobile/` |
| C-11 | Web and mobile same mobile=mobile login | Same RPC | Code in web + mobile |
| C-12 | Phase 4 OTP | Not this ship | N/A |
| C-13 | No billed / payment / expected amount | Settlement empty or quoted from real estimate total only | Code in `mobile/` |
| C-14 | Booking without preferred date | RPC fail | Needs `20260916123000` |
| C-15 | No repair card | Tracker from job only; no fake claim | Code in `mobile/` |
| C-16 | Null model / advisor / JC on dashboard | `—` — never Creative Edition / AMAN GUPTA / JC-2026-00125 | Code in `mobile/` |
