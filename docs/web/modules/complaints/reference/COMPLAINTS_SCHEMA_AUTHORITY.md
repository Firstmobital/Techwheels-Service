# COMPLAINTS MODULE — AUTHORITATIVE SCHEMA AUDIT (2026-06-09)

**Authority Status:** ✅ VERIFIED & LOCKED  
**Source:** `/local_folder/backups/full_database.sql` (55MB, 136,721 lines)  
**Mirror Access:** `/local_folder/backups/chunks/full_database.sql.part_000, _001, _002`

---

## GOVERNANCE RULE

**For all future work on the complaints module:**
1. **Never invent** tables, columns, functions, triggers, or RLS policies not present in the authoritative dump.
2. **Authority never downgrades.** The dump is the single source of truth; on any conflict, trust the dump.
3. **Direct file access blocked by size?** Read the chunks instead: `part_000`, `part_001`, `part_002`.
4. **All code must reference objects verified present in the dump.** Use grep/search to audit before implementation.

---

## VERIFIED INVENTORY (All Present in Dump)

### Tables (6 total) ✅

| Table | Line | Status |
|-------|------|--------|
| `public.complaint_access_links` | 6005 | ✅ Present, RLS enabled (131531) |
| `public.complaint_activity` | 6042 | ✅ Present, RLS enabled (131539) |
| `public.complaint_attachments` | 6080 | ✅ Present, RLS enabled (131547) |
| `public.complaint_messages` | 6116 | ✅ Present, RLS enabled (131555) |
| `public.complaint_sla_policies` | 6152 | ✅ Present, RLS enabled (131563) |
| `public.complaint_tickets` | 6186 | ✅ Present, RLS enabled (131571) |

### RPC Functions (13 total) ✅

| Function | Line | Signature |
|----------|------|-----------|
| `acknowledge` | 998 | `(p_complaint_id bigint) → jsonb` |
| `add_staff_message` | 1064 | `(p_complaint_id bigint, p_body text, p_is_internal boolean) → jsonb` |
| `check_complaint_sla_breaches` | 1252 | `() → TABLE(breached_count int, escalated_count int)` |
| `close` | 1299 | `(p_complaint_id bigint) → jsonb` |
| `escalate` | 1506 | `(p_complaint_id bigint, p_escalation_reason text) → jsonb` |
| `generate_complaint_link` | 1534 | `(p_reception_entry_id bigint) → jsonb` |
| `get_complaint_by_token` | 1609 | `(p_token text) → jsonb` |
| `raise_complaint` | 2289 | `(p_token, p_category, p_title, p_description, p_severity_self, p_customer_name, p_customer_phone) → jsonb` |
| `reassign` | 2411 | `(p_complaint_id bigint, p_assigned_to_user_id uuid) → jsonb` |
| `reopen_complaint` | 2436 | `(p_token text, p_reason text) → jsonb` |
| `resolve` | 2501 | `(p_complaint_id bigint) → jsonb` |
| `set_priority` | 2552 | `(p_complaint_id bigint, p_priority text) → jsonb` |
| `start_progress` | 2611 | `(p_complaint_id bigint) → jsonb` |

### Triggers (6 total) ✅

| Trigger | Line | Table | Event |
|---------|------|-------|-------|
| `trg_ct_ticket_number` | 129994 | `complaint_tickets` | BEFORE INSERT |
| `trg_ct_autoassign` | 129962 | `complaint_tickets` | BEFORE INSERT |
| `trg_ct_sla` | 129978 | `complaint_tickets` | BEFORE INSERT |
| `trg_ct_sla_on_priority_change` | 129986 | `complaint_tickets` | BEFORE UPDATE OF priority |
| `trg_ct_touch` | 130002 | `complaint_tickets` | BEFORE UPDATE |
| `trg_ct_history` | 130970 | `complaint_tickets` | AFTER UPDATE |

### Helper Functions (5 total) ✅

| Function | Line | Purpose |
|----------|------|---------|
| `my_employee_code` | 2117 | Resolve caller's employee code from JWT or links |
| `my_dealer_code` | 2020 | Resolve caller's dealer code from JWT or links |
| `is_admin` | 2003 | Check if caller is system admin |
| `has_module_view` | 1983 | Check if caller has view perm for module |
| `has_module_modify` | 1963 | Check if caller has modify perm for module |

### RLS Policies (16+ total across 6 tables) ✅

**All tables have:**
- Admin bypass policies (lines 130954–131090)
- User-scoped policies with dealer_code + module permission checks (lines 133004+)

**Policy patterns:**
- `admin_bypass_*` — admins bypass all checks
- `user_delete_own_dealer_*` — delete restricted to own dealer + has_module_delete
- `user_insert_complaint_*` — insert restricted to own dealer + has_module_modify
- `user_modify_own_dealer_*` — update restricted to own dealer + has_module_modify
- `user_view_own_dealer_*` — select restricted to own dealer + has_module_view

---

## KEY FACTS (Verified from Dump)

1. ✅ **No name collisions.** All complaint objects are unique in the database.
2. ✅ **RLS fully enabled.** All 6 complaint tables have RLS enabled.
3. ✅ **Multi-tenant scoping.** All tables have `dealer_code NOT NULL` column; RLS uses `my_dealer_code()`.
4. ✅ **Anonymous access gated.** RPCs are SECURITY DEFINER; anon role has EXECUTE only (not direct table access).
5. ✅ **Helper functions present.** `my_employee_code()`, `my_dealer_code()`, `is_admin()`, `has_module_modify()`, `has_module_view()` all exist.
6. ✅ **SLA infrastructure present.** `complaint_sla_policies` table + SLA trigger functions confirmed.
7. ✅ **Escalation logic present.** `escalate()` RPC and `is_escalated` column confirmed.

---

## AUDIT METHOD (for future reference)

If you need to audit the dump:

```bash
# Find all complaint tables
grep "CREATE TABLE.*complaint" local_folder/backups/full_database.sql

# Find all complaint functions
grep "CREATE FUNCTION.*complaint\|CREATE FUNCTION.*get_complaint" local_folder/backups/full_database.sql

# Find all complaint triggers
grep "CREATE TRIGGER.*complaint" local_folder/backups/full_database.sql

# Find RLS policies
grep "CREATE POLICY.*complaint" local_folder/backups/full_database.sql

# If file is too large, use chunks
grep -h "CREATE TABLE.*complaint" local_folder/backups/chunks/full_database.sql.part_*
```

---

## ENFORCEMENT

**Before any code change or schema addition:**
1. Grep the dump for the object name to verify presence.
2. If NOT found → STOP. Do NOT invent. Instead:
   - Create a migration SQL file.
   - Have the user execute it manually.
   - Update the dump and chunks after execution.
3. If found → Proceed with code/documentation only.

**Authority hierarchy:**
1. **Authoritative dump** (source of truth)
2. User manual migrations (upgrade path)
3. Code implementation (follows #1 + #2)

---

## LAST VERIFIED

**Date:** 2026-06-09  
**Dump timestamp:** 2026-06-09 12:27:00 UTC  
**Lines scanned:** 136,721  
**Grep patterns tested:** ✅ All clear

