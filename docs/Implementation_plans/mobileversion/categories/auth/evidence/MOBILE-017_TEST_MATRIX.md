# MOBILE-017 — Test Matrix

**Plan:** [MOBILE-017_CUSTOMER_SESSION_TERMS_RESILIENCE_PLAN.md](../active/MOBILE-017_CUSTOMER_SESSION_TERMS_RESILIENCE_PLAN.md)  
**Date:** 2026-10-31  
**Environment:** _fill on execution_  
**Build / OTA:** _fill on execution_  

| ID | Steps | Expected | Pass | Tester | Date |
|---|---|---|---|---|---|
| T-01 | Login → accept terms immediately | Profile `terms_accepted_at` set; customer home | | | |
| T-02 | Expired session → tap Accept | Login with `reason=expired`; no trap on terms | | | |
| T-03 | Accepted → logout → login same phone | Terms not shown | | | |
| T-04 | Accept → kill app → reopen within TTL | No terms; session valid | | | |
| T-05 | Active use → verify touch extends `expires_at` | DB `expires_at` moved forward | | | |
| T-06 | Revoke-on-login (if enabled): two tokens | Old token gets Session expired | | | |
| T-07 | Staff + customer paths | No cross-audience data leak | | | |
| T-08 | New user: terms → accept → register vehicle | Register RPC succeeds | | | |
| T-09 | Version bump (simulate in staging only) | Terms re-shown; accept updates version | | | |

**SQL spot-check (phone `__________`):**

```sql
SELECT phone, terms_accepted_at, terms_accepted_version, last_login_at
FROM public.customer_profiles WHERE phone = '__________';

SELECT expires_at, revoked_at, created_at
FROM public.customer_sessions s
JOIN public.customer_profiles p ON p.id = s.profile_id
WHERE p.phone = '__________'
ORDER BY created_at DESC LIMIT 3;
```
