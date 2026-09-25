# Chat — Documentation Index

**Plan ID:** CHAT-001  
**Status:** In progress — migration applied 2026-09-25  
**Created:** 2026-09-25  
**Platform:** web (workshop inbox) • mobile (Login as Customer) • shared Supabase backend  
**Repository:** Firstmobital/Techwheels-Service  

---

## Overview

In-app conversation between the customer on the vehicle home card and the workshop. One thread per dealer, vehicle number, and customer phone. Any signed-in user with the `chat` module can read and reply. The customer Chat button stops opening WhatsApp.

This is not Complaints and not Help Tickets. Do not reuse `complaint_messages`, `help_ticket_messages`, complaint tokens, or help-ticket RPCs.

---

## Documentation Files

### Core implementation plan
- **[CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md](CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)** — Audit, contract, schema, RPCs, web inbox, customer screen, phases

### Implementation tracking
- **[PHASES.md](PHASES.md)** — Phase breakdown and success criteria
- **[CHECKLIST.md](CHECKLIST.md)** — Execution checklist

### Mobile companion
- **[MOBILE-014](../../../../mobileversion/categories/customer/active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)** — Customer Chat screen. Shared backend is owned by CHAT-001.

---

## Authority Sources

| Authority | Path |
|---|---|
| This plan | `CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md` |
| DB metadata | `supabase/backups/full_metadata.sql` |
| Module-route contract | `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` |
| App routes and header | `src/App.tsx` |
| Customer home Chat button | `mobile/src/app/(customer)/index.tsx` |
| Customer session | MOBILE-011, `customer_require_session` |
| Peer message UI (do not reuse tables) | Complaints portal bubbles, Help Tickets composer |

---

## Quick Start

1. Read **[CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md](CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)**.
2. Execute Phase 1 before any screen.
3. Web inbox is Phase 2. Customer screen is Phase 3 via **[MOBILE-014](../../../../mobileversion/categories/customer/active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)**.
4. Push is Phase 5. Android uses FCM. iOS uses Expo. See section 8.1 of the plan.
5. Drop evidence under `../evidence/` when a phase is verified.

---

## Explicit non-goals

- Replacing Call advisor, bodyshop WhatsApp groups, or the WA AI Agent.
- Filing a complaint or a help ticket from this thread.
- Attachments, internal notes, or assignment to a single advisor.
