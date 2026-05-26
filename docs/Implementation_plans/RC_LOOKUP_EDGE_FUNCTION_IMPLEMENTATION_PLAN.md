# RC Lookup Edge Function (invoke-ocean025) - Cross-Project Implementation Plan

## Objective

Use the existing `invoke-ocean025` edge function in another Supabase project with a compatible `public.rto_cache` table for RC lookup caching.

## Source of Truth Used

Schema was taken from the authoritative local DB dump mirror:

- `local_folder/backups/full_database_chunks/full_database.part.0000` (table definition)
- `local_folder/backups/full_database_chunks/full_database.part.0002` (PK, indexes, trigger, RLS, grants)

This follows project policy: local full dump/chunks are authoritative and do not downgrade to fallback schema.

## Deliverables in This Repo

1. Migration file to run in the target Supabase project:
   - `supabase/migrations/20260526140500_create_rto_cache_for_rc_lookup.sql`
2. This implementation plan.

## Target Project Rollout Steps

1. Create/apply the migration in the target project.
   - Preferred: Run the SQL file in Supabase SQL Editor for the target project.
   - Alternate: Include the file in target project's migrations and run its migration process.

2. Add edge function code in target project:
   - Path: `supabase/functions/invoke-ocean025/index.ts`
   - Use your current function code as-is.

3. Set required function secrets in target project:
   - `INVINCIBLE_OCEAN_SECRET_KEY`
   - `INVINCIBLE_OCEAN_CLIENT_ID`
   - `INVINCIBLE_OCEAN_BASE_URL` (optional; defaults to `https://api.invincibleocean.com/invincible`)

4. Deploy the function in target project.

5. Verify function call:
   - Endpoint:
     - `https://<target-project-ref>.supabase.co/functions/v1/invoke-ocean025`
   - Minimal request body:
     - `{ "vehicleNumber": "RJ14AB1234", "consent": "Y" }`

6. Verify DB cache behavior:
   - Confirm rows write/read in `public.rto_cache`.
   - Confirm unique normalization on registration number works.
   - Confirm expiry/access indexes exist.

## Notes About Compatibility

- Migration keeps the same table shape and index strategy from current project.
- Trigger function is made self-contained (`public.set_rto_cache_updated_at`) so the migration does not depend on `public.tw_set_updated_at` existing in the target project.
- RLS policy creation is adaptive:
  - If target project has `public.is_super_admin` and `public.has_rbac_right`, RBAC-style policies are used.
  - Otherwise, fallback authenticated policies are created so the table remains usable.

## Post-Deployment Quick Checks

Run in target project SQL editor:

1. `select count(*) from public.rto_cache;`
2. `select indexname from pg_indexes where schemaname = 'public' and tablename = 'rto_cache' order by indexname;`
3. `select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'rto_cache' order by policyname;`
