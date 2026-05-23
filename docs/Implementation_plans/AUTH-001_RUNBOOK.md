# AUTH-001 Runbook: Email-Throttle User Access Recovery

## Purpose

Use this runbook when Supabase Auth emails fail with `email rate limit exceeded` and you must restore user access immediately without deleting existing accounts.

---

## Prerequisites

- Admin account can sign in to Techwheels production app.
- Edge Function `set-user-temp-password` deployed in Supabase.
- Secure out-of-band channel available to send temporary password.

---

## Step A: Set One-Time Temporary Password (No Email)

1. Open production app admin page.
2. Go to Users tab.
3. Find user (example: `vinodexodus@gmail.com`).
4. Click `Temp Password` action.
5. Keep `Mark user email as confirmed` enabled.
6. Use generated password or paste your own strong value.
7. Click `Set Temp Password`.
8. Confirm success toast appears.

Expected result:
- Password is updated through server-side Admin API.
- No invite/magic/recovery email is sent.

---

## Step B: User Login and Rotation

1. Send temp password through secure channel (phone call, secure chat, or in person).
2. Ask user to login immediately at production URL.
3. App now redirects users with `force_password_change=true` to `/reset-password`; user must set a new strong password.
4. Verify user can log out and log in again with new password.

Operational note:
- Do not keep temporary password in chat history, tickets, or shared docs.

---

## Step C: SMTP + Rate Limit Hardening (Permanent Fix)

1. Supabase Dashboard -> Authentication -> Email provider.
2. Configure custom SMTP (Resend/SendGrid/SES).
3. Complete domain authentication for provider:
   - SPF
   - DKIM
   - DMARC (recommended)
4. Supabase Dashboard -> Authentication -> Rate Limits.
5. Increase email-related limits to match expected admin and recovery volume.
6. Run validation tests:
   - Create user and verify invite/confirmation delivery
   - Send magic link
   - Send password recovery (login page `Forgot password` now uses `/auth/callback` -> `/reset-password` recovery flow)

---

## Validation Checklist

- [ ] Temporary password set for target user
- [ ] User logged in once with temporary password
- [ ] User changed password successfully
- [ ] User re-login verified with new password
- [ ] SMTP configured and verified
- [ ] Invite/magic/recovery email tests passing

---

## Incident Notes Template

- Date/Time:
- Affected user email:
- Failure observed:
- Temporary access restored by:
- Password rotated confirmed by:
- SMTP/rate-limit follow-up owner:
- Closure timestamp:
