# Documentation Update Template

Use this template in every feature/fix/change set.

## Change Metadata

- Date:
- Author:
- Task/Issue:

## What Changed

- Summary:
- Why:
- User/business impact:

## Code Scope

- Frontend files changed:
- API/service files changed:
- Schema/migration files changed:
- Config/env files changed:

## Logic and Contract Delta

- New behavior:
- Removed behavior:
- Function conditions changed:
- Validation changes:

## Access Control Delta

- UI role change:
- Permission matrix change:
- RLS/policy change:

## Required Handbook File Updates

- [ ] `docs/shared/README.md`
- [ ] `docs/shared/reference/CURRENT_STATE.md`
- [ ] `docs/shared/active/CHANGE_LOG.md`
- [ ] `docs/DOCS_IMPACT_MATRIX.md` (if mappings changed)

## Migration Lifecycle Checklist (Required if DB change exists)

- [ ] Added/updated row in `docs/shared/reference/DB_CHANGE_LEDGER.md`
- [ ] Followed `docs/shared/reference/DB_CHANGE_PROTOCOL.md` workflow
- [ ] Migration execution evidence captured (env + timestamp + validation)
- [ ] If execution successful, moved SQL file from `supabase/migrations/` to `supabase/exec_success_migrations/`
- [ ] Authority checked against `local_folder/backups/full_database.sql`

## Notes

- Follow-up actions:
- Risks:
- Rollback considerations:
