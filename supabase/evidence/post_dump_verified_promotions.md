# Post-Dump Verified Promotions

Window opened at: 2026-06-25T15:02:12Z
Baseline dump sha256: 56cc1ef74d7c5482200b1f04d7b6404bf71a2d29c3f5addc7b4788472f7f9e35

This file tracks executed+verified migrations promoted after the latest dump refresh.
When a new dump is refreshed, this window is reset.

## 2026-06-25T15:36:30Z
- prefix: 20260625221000
- promoted migration: supabase/exec_success_migrations/sql/20260625221000_p1_07_disk_io_hotlist_indexes.sql
- promoted check: supabase/exec_success_migrations/sql_check/20260625221000_p1_07_disk_io_hotlist_indexes_checks.sql
- verification summary:
	- all 4 indexes created and present in pg_indexes
	- reception / technician / vas verification EXPLAIN blocks switched to Index Scan
