# MOBILE-HELP-001 Phase 4 — Employee Help Lite screens

**Date:** 2026-08-11  
**Status:** Code complete — awaiting OTA + cross-platform smoke

## Files

| Piece | Path |
|---|---|
| API (employee RPCs only) | `mobile/src/lib/api/helpTickets.ts` |
| Upload helper | `mobile/src/lib/api/helpTicketUpload.ts` |
| Stack layout | `mobile/src/app/help-tickets/_layout.tsx` |
| My tickets | `mobile/src/app/help-tickets/index.tsx` |
| Raise ticket | `mobile/src/app/help-tickets/new.tsx` |
| Detail + chat | `mobile/src/app/help-tickets/[ticketId].tsx` |
| Root stack register | `mobile/src/app/_layout.tsx` |
| Profile entry | `mobile/src/app/(tabs)/profile.tsx` → Support |

## Allowed RPCs used

- `help_ticket_list_categories`
- `help_ticket_create`
- `help_ticket_list_mine`
- `help_ticket_get_detail`
- `help_ticket_send_message` (visibility forced `public`)
- `help_ticket_verify_resolution`
- `help_ticket_attachment_create`
- `help_ticket_attachment_mark_failed`
- optional: `get_unread_help_ticket_notification_count`

## Forbidden RPCs (verified absent from `mobile/`)

- `help_ticket_list_admin`, `help_ticket_list_assigned_to_me`, `help_ticket_assign`
- `help_ticket_update_status`, `help_ticket_update_priority`
- `help_ticket_hold`, `help_ticket_escalate`, `help_ticket_mark_duplicate`
- `help_ticket_get_audit_log`, `help_ticket_list_assignees`

## Smoke checklist

1. Profile → Raise a ticket → submit → detail opens
2. Profile → My tickets → filter chips + open detail
3. Reply from mobile appears on web employee/support detail
4. Resolve on web → Verify / Not fixed on mobile
5. Attachment → Drive URL on ticket after upload
6. Unlinked employee sees clear employee-link error (no crash)
