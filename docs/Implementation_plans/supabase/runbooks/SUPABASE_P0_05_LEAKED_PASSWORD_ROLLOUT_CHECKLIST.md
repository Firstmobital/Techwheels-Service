# SUPABASE-001 P0-05 Leaked Password Protection Rollout Checklist

Last updated: 2026-06-08

## Goal
Enable leaked-password protection in Supabase Auth without breaking login, signup, reset-password, or callback flows in web/mobile.

## Preconditions
- P0-03 complete and validated.
- Keep one admin account with known strong password available for rollback validation.
- Collect baseline behavior from current auth pages before toggle.

## Dashboard Change (Manual)
1. Supabase Dashboard -> Authentication -> Providers -> Email/Password.
2. Enable leaked password protection.
3. Save changes.
4. Capture screenshot evidence with timestamp.

## Validation Matrix (Immediately After Toggle)

### Web
1. Login page: valid existing user with strong password succeeds.
2. Signup page: weak known-leaked password is rejected with clear error.
3. Signup page: strong password succeeds and confirmation flow remains intact.
4. Forgot password: reset email request still succeeds.
5. Auth callback route: token processing and redirect still work.

### Mobile
1. Login screen: valid existing user with strong password succeeds.
2. Signup screen: weak known-leaked password is rejected.
3. Signup screen: strong password succeeds.
4. Password reset screen: request succeeds.

## Expected Outcome
- Weak/leaked passwords are blocked on signup/password set flows.
- Existing strong-password login flows are unaffected.
- No regressions in callback/reset routes.

## Rollback Plan
1. Supabase Dashboard -> Authentication -> Providers -> Email/Password.
2. Disable leaked password protection.
3. Re-run a minimal sanity check:
   - web login,
   - mobile login,
   - web reset-password request.

## Evidence To Attach In Master Plan
- Dashboard toggle screenshot (enabled state).
- Web validation results (pass/fail per checklist item).
- Mobile validation results (pass/fail per checklist item).
- Any error payloads if a check fails.
