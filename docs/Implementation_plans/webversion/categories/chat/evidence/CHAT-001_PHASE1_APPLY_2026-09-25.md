# CHAT-001 Phase 1 apply — 2026-09-25

Migration `supabase/migrations/20260925084613_advisor_customer_chat.sql` applied to the project database. `supabase/backups/full_metadata.sql` was refreshed afterward.

Checked against that database:

- `public.modules` has `chat` → `/chat`, active.
- `advisor_chats` and `advisor_chat_messages` are on publication `supabase_realtime`.
- Both tables use replica identity `f` (FULL).
- `anon` `SELECT` on `advisor_chats` returns `permission denied`.
- `advisor_chat_unread_count()` with no staff JWT raises `Not authenticated`.
- `customer_list_advisor_messages` with a bad token raises `Session expired.`

An event trigger also added policy `admin_unrestricted_all_ops_v1` (`is_admin()` only) on both tables. Authenticated users still have `SELECT` only. Inserts and updates stay on the SECURITY DEFINER RPCs.

Not checked yet: a real customer session sending a message, and two staff users with `chat` view replying on `/chat`.
