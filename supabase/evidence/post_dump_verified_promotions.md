# Post-Dump Verified Promotions

Window opened at: 2026-09-04T11:20:08Z
Baseline dump sha256: 85bb6e06c43e4dfeb1516d51242c9c87637d2eef52bd08c2efd36b4c8d24ff4e

This file tracks executed+verified migrations promoted after the latest dump refresh.
When a new dump is refreshed, this window is reset.

Current dump (`supabase/backups/full_metadata.sql`, 2026-09-04 16:50 IST) already includes DBL-0026 through DBL-0037. Post-dump verified promotions below (DBL-0045). DBL-0042 insurer master remains PROPOSED (not in dump).

## 2026-09-11T08:29:01Z
- prefix: 20260911140000
- migration: 20260911140000_route_eligible_post_feedback_to_bot.sql
- checks: 20260911140000_route_eligible_post_feedback_to_bot_checks.sql
- baseline_dump_sha256: ae1f8292dfbd3b60e86902e4edf151b16d42c93d593a800eea8933f7fff1aa99
