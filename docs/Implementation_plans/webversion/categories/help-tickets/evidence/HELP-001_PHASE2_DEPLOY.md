# HELP-001 Phase 2 — Deploy Evidence

**Date:** 2026-08-11  
**Status:** Deployed

| Item | Status |
|---|---|
| Web (Vercel) | Deployed |
| Edge `universal-drive-upload` (`help_ticket_attachment`) | Deployed |
| DB Phase 1 migrations + `full_metadata.sql` refresh | Done earlier |

## Remaining ops (not blockers for Phase 3 code)

- Grant `help_tickets` **view + modify** to support users via Admin (if not already)
- Prod smoke: raise ticket, support inbox, attachment Drive URL
