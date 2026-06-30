# Contributing to Techwheels Service

## General Guidelines

- Follow TypeScript best practices
- Keep functions small and focused
- Add comments for non-obvious logic
- Test your changes before submitting

## Web-Mobile Parity Policy - Mandatory

Techwheels has parallel web and mobile implementations. To prevent product drift,
any business logic change in web must be reviewed for mobile impact in the same
change set.

This includes (non-exhaustive):

- Report calculation formulas and aggregation logic
- Query behavior, filters, grouping, sorting, and date handling
- Component behavior, state transitions, and empty/error states
- Export fields and data format
- Any new/removed report IDs, routes, or feature flags

### Required for Every PR touching web logic

Add a section named `Web-Mobile Parity` in PR description with:

1. `Impact`: `No impact` or `Impact`
2. `Mobile status`: `Updated in same PR` or `Tracked separately`
3. `Mobile files changed`: explicit list (if applicable)
4. `Validation`: mobile type-check/test command output summary

If `Tracked separately` is chosen, PR must include:

- Linked mobile follow-up task/ID
- Owner name
- Due date
- Reason same-PR update is not possible

PRs that change business logic and skip parity declaration should not be merged.

---

## Admin Operations - CRITICAL SECURITY PATTERN

**All admin operations MUST use Supabase Edge Functions. Never call Supabase Auth API directly from frontend.**

### ❌ NEVER DO THIS (Exposed Credentials)
```typescript
// WRONG: Service key in frontend
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY
await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
  headers: { Authorization: `Bearer ${serviceKey}` }
})
```

### ✅ ALWAYS DO THIS (Secure Pattern)
```typescript
// CORRECT: Call Edge Function
const { error } = await supabase.functions.invoke('operation-name', {
  body: { /* parameters */ },
})
```

## Adding New Admin Features

**Follow these steps for ANY new admin operation:**

1. **Create Edge Function**
   - Location: `supabase/functions/[feature-name]/index.ts`
   - Use shared utilities: `validateRequest()` (JWT + admin check), `logAuditEvent()` (logging)
   - Example: See `supabase/functions/confirm-user-email/index.ts`

2. **Call from Frontend via supabase.functions.invoke()**
   - Never pass service key
   - Always handle errors gracefully

3. **Log Audit Events**
   - Every admin operation must be logged
   - Use `logAuditEvent()` from shared utilities
   - Include action, resource type, resource ID, and details

4. **Document in `docs/web/cross-cutting/security/reference/SECURITY_REFACTOR_REFERENCE.md`**
   - Follow the existing "How to Add New Admin Features" pattern in that doc
   - Include input, operation, and audit log details

5. **Test with Non-Admin JWT**
   - Verify operation rejects non-admins with 401
   - Verify error message is helpful but doesn't leak sensitive data

## Examples of Existing Secure Operations

- **confirm-user-email** - `supabase/functions/confirm-user-email/`
- **sync-dealer-metadata** - `supabase/functions/sync-dealer-metadata/`

**Both follow the same pattern** → implement new features using them as reference.

## Audit Logs

All admin operations are logged in `public.audit_logs` table.

**Query examples:**
```sql
-- All operations by current user
SELECT * FROM audit_logs WHERE actor_id = auth.uid() ORDER BY timestamp DESC;

-- All email confirmations today
SELECT * FROM audit_logs WHERE action = 'email_confirmed' 
  AND timestamp > NOW()::date ORDER BY timestamp DESC;
```

## Security Checklist Before PR

- [ ] No `VITE_SUPABASE_SERVICE_KEY` in frontend code
- [ ] Admin operations use Edge Functions
- [ ] Edge Function validates JWT + admin role
- [ ] Audit log created for every operation
- [ ] Tested with non-admin account (should fail)
- [ ] Error messages don't leak sensitive data
- [ ] Documentation updated

## Web-Mobile Parity Checklist Before PR

- [ ] I checked whether web logic changes affect mobile behavior.
- [ ] If affected, mobile app was updated in the same PR.
- [ ] Report IDs/routes/components remain aligned between web and mobile.
- [ ] Mobile validation run (type-check at minimum).
- [ ] If deferred, follow-up task, owner, and due date are documented.

---

## Environment Variables

**Frontend (.env.local):**
```
VITE_SUPABASE_URL=<your-url>
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_DEFAULT_DEALER_CODE=TN123456
VITE_DEFAULT_DEALER_NAME=Techwheels
```

**Never include service key in frontend env files.**

---

## AI Agent Operating Contract

All AI agents/tools must follow the single generic operating contract at [`.instructions.md`](.instructions.md) — no vendor-specific instruction files. For documentation placement, read [`docs/STRUCTURE_GUIDE.md`](docs/STRUCTURE_GUIDE.md) before creating, moving, or editing any doc. For database truth, see [`docs/shared/reference/DATABASE_TRUTH.md`](docs/shared/reference/DATABASE_TRUTH.md).

## Related Documentation

- [Secure Admin Operations Pattern](docs/web/cross-cutting/security/reference/SECURITY_REFACTOR_REFERENCE.md)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [JWT Best Practices](https://supabase.com/docs/guides/auth/auth-jwt)
- [Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)
