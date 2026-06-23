# Docs Impact Matrix

Last Updated: 2026-05-23
Purpose: Map code change locations to required handbook doc updates.

## Matrix

| Change Area | Typical Paths | Required Doc Updates |
| --- | --- | --- |
| App shell, auth, routing | `src/App.tsx`, `src/main.tsx`, auth pages | `README.md` sections 4/6, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| Import flow/mapper logic | `src/pages/ImportPage.tsx`, `src/lib/*ColumnMapper.ts`, `src/lib/employeeMatcher.ts` | `README.md` section 5.1/7, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| Report definitions and query logic | `src/pages/ReportsPage.tsx`, `src/pages/reports/**`, `src/lib/reportQueries.ts`, `src/lib/partsReportQueries.ts` | `README.md` section 5.2/7, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| AutoDoc UI/API flow | `src/pages/AutoDocPage.tsx`, `src/pages/JobCardPage.tsx`, `src/lib/api/**`, `src/lib/generators/**` | `README.md` section 5.3/7/8, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| Admin users/permissions | `src/pages/AdminPage.tsx`, `src/lib/api/auth.ts` | `README.md` section 5.4/6, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| Database schema/migrations | `supabase/migrations/**` | `README.md` sections 4.3/6/8/10, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| DB governance/tracking updates | `docs/Project_Handbook/DB_CHANGE_LEDGER.md`, `docs/Project_Handbook/DB_CHANGE_PROTOCOL.md`, `docs/Implementation_plans/*` | `SYNC_PROTOCOL.md`, `CURRENT_STATE.md`, `CHANGE_LOG.md`, relevant implementation plan index |
| Supabase config/env dependencies | `src/lib/supabase.ts`, env usage changes | `README.md` section 9, `CURRENT_STATE.md`, `CHANGE_LOG.md` |
| Branch/filter behavior | `src/lib/branches.ts`, report filter controls | `README.md` section 5.2/7, `CURRENT_STATE.md`, `CHANGE_LOG.md` |

## Quick Checklist

Before closing a task, confirm:

- [ ] Impacted area matched in matrix.
- [ ] `CURRENT_STATE.md` updated.
- [ ] `CHANGE_LOG.md` entry added.
- [ ] `README.md` updated if architecture/logic/contracts changed.
- [ ] RBAC/RLS changes explicitly documented.
