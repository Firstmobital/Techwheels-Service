# HELP-001 Phase 1 — Migration Evidence

**Date:** 2026-08-11  
**Status:** Migrations authored (apply to target DB next)

## Preflight

| Check | Result |
|---|---|
| `help_ticket_*` in `supabase/backups/full_metadata.sql` | Absent (greenfield) |
| `my_employee_code`, `is_admin`, `has_module_view/modify` | Present |
| `modules_name_key` UNIQUE(name) | Present — `ON CONFLICT (name) DO NOTHING` OK |

## Files

| Migration | Purpose |
|---|---|
| `supabase/migrations/20260811120000_help_tickets_schema.sql` | Tables, indexes, category seed, `help_tickets` module, RLS + revoke direct grants |
| `supabase/migrations/20260811120100_help_tickets_rpcs.sql` | Helpers + employee/support/notification RPCs + EXECUTE grants |

## Dealer-agnostic verification (static)

- No `my_dealer_code()` in RPC security paths
- `help_ticket_can_see` / `help_ticket_list_admin` / support notifications do not require matching dealer
- `p_raiser_dealer_code` on `help_ticket_list_admin` is optional display filter only
- Column is `raiser_dealer_code` (nullable snapshot), not ACL `dealer_code`

## Apply next

```bash
# against linked project / local
supabase db push
# then refresh dump
# supabase db dump --schema public > supabase/backups/full_metadata.sql  (or project pull process)
```

## Manual smoke (post-apply)

1. Linked employee: `help_ticket_create` → `help_ticket_list_mine`
2. Unlinked / anon: create fails
3. Employee: `help_ticket_list_admin` fails
4. Support with modify on different dealer link: can assign ticket from other dealer
5. Internal note: not returned to raiser in `help_ticket_get_detail`
