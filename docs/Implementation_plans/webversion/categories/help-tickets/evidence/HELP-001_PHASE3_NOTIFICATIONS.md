# HELP-001 Phase 3 — In-app notifications

**Date:** 2026-08-11  
**Status:** Code complete — awaiting Vercel deploy + smoke

## Implementation

| Piece | Location |
|---|---|
| API wrappers | `src/lib/api/helpTickets.ts` — list / unread / mark-read / mark-all / `helpTicketNotificationPath` |
| TopNav merge | `src/App.tsx` — combined complaint + help-ticket unread badge and feed |
| Deep links | `raiser` → `/help/tickets/:id`; else → `/help-tickets?ticketId=` |

## Backend (already live from Phase 1)

- Outbox: `help_ticket_notifications`
- RPCs: `list_my_help_ticket_notifications`, `get_unread_help_ticket_notification_count`, `mark_help_ticket_notification_read`, `mark_all_help_ticket_notifications_read`
- Emitters in create/assign/message/status/hold/escalate/verify RPCs

## Smoke checklist (prod)

1. Raise ticket as employee → support users with help_tickets view/modify see bell item
2. Assign / reply → counterpart notified
3. Resolve → raiser notified; click opens `/help/tickets/{id}`
4. Support notification click opens `/help-tickets?ticketId=`
5. Mark all as read clears badge
