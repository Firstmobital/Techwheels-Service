# OPS-PSF-BOT-001 validation evidence

**Date:** 2026-09-11  
**Environment:** Linked Supabase project `jmdndcphkmaljhwgzqxq` (`supabase db query --linked`)  
**Migration:** `20260911140000_route_eligible_post_feedback_to_bot.sql` (DBL-0049)  
**Classification:** state = implementation, scope = web, intent = evidence

## Schema checks

| Check | Result |
|---|---|
| `source_feedback_message_id` bigint nullable | Pass |
| UNIQUE (`source_feedback_message_id`) | Pass |
| FK to `post_service_feedback_messages(id) ON DELETE RESTRICT` | Pass |
| `insert_post_feedback_bot_from_message` SECURITY INVOKER | Pass (`prosecdef=false`) |
| `route_eligible_post_feedback_to_bot` SECURITY INVOKER | Pass (`prosecdef=false`) |
| Trigger WHEN eligibility | Pass: `status=responded AND rating IS NOT NULL AND rating<=3 AND cre_status=open` |
| Trigger event | Pass: `AFTER INSERT OR UPDATE OF status, rating, cre_status` |
| Bot table RLS | Unchanged: disabled; policy `admin_unrestricted_all_ops_v1` still present, dormant |
| CRE queue view | Unchanged: `status=responded AND rating IS NOT NULL` (462 rows) |

## Historical backfill

| Metric | Count | Reason |
|---|---|---|
| Eligible source rows | 33 | `responded` + `rating<=3` + `cre_status=open` |
| Already represented | 33 | Existing bot rows uniquely matched on mobile + VRN + rating; source ids attached |
| Inserted / backfilled | 0 | All eligible rows already had a bot row |
| Skipped | 33 | Unique conflict on `source_feedback_message_id` after attach |
| Duplicate source ids | 0 | Unique constraint held |
| Eligible missing after apply | 0 | |

## Tests A–I

Controlled `DO` block in `supabase/evidence/ops_psf_bot_001_behavior_tests.sql` completed without exception (cleanup on success and failure). Visible follow-up proof on message id 4598 (then deleted):

| Test | Setup | Result |
|---|---|---|
| A | INSERT responded / rating 3 / open | 1 bot row |
| B | INSERT responded / rating 1 / open | 1 bot row |
| C | INSERT responded / rating 4 / open | 0 bot rows |
| D | INSERT responded / rating 5 / open | 0 bot rows |
| E | INSERT responded / rating 2 / resolved | 0 bot rows |
| F | INSERT sent / rating 2 / open | 0 bot rows |
| G | INSERT sent then UPDATE to responded / rating 2 / open | 1 bot row after update |
| H | UPDATE same eligible row `SET rating = rating` | still 1 bot row |
| I | Compare destination to source/join | All match: VRN, mobile, name, rating, feedback, SA, branch, service_type; also chassis_no = `jc.chassis_number` |

Test I2 mapping flags for message 4598: `vrn_match=true`, `mobile_match=true`, `name_match=true`, `rating_match=true`, `feedback_match=true`, `sa_match=true`, `branch_match=true`, `service_type_match=true`, `chassis_match=true`, `bot_count_for_source=1`. After repeat update, count remained 1. Proof rows deleted (`leftover_msg_4598=0`).

## Security

- No `SECURITY DEFINER` added.
- Bot table RLS not enabled (pre-existing posture preserved).
- No policies dropped or widened.
- Grants: `EXECUTE` on the two new functions to `anon`, `authenticated`, `service_role` (same class of trigger/helper grants used elsewhere). Table ACLs unchanged.
