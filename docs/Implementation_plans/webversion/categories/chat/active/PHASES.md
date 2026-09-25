# CHAT-001 — Phase Tracking

**Implementation Plan:** CHAT-001  
**Last Updated:** 2026-09-25  
**Total Phases:** 5  
**Current Progress:** Phases 1–3 coded. Phase 4 live check is open. Phase 5 tables, cron, worker, and FCM secrets are in. A live phone delivery check is still open.  
**Status:** In progress  

Authority: [CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md](CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)  
Checklist: [CHECKLIST.md](CHECKLIST.md)  
Mobile detail: [MOBILE-014](../../../../mobileversion/categories/customer/active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)

---

## Phase Overview

| Phase | Name | Duration | Status | Completion |
|-------|------|----------|--------|------------|
| 1 | Tables, RLS, RPCs, `chat` module | 1 day | Applied | 100% |
| 2 | Web header icon, `/chat` inbox, realtime | 1–1.5 days | Coded | 100% |
| 3 | Customer Chat screen (MOBILE-014) | 1 day | Coded | 80% |
| 4 | Two-user acceptance and evidence | 0.5 day | Open | 20% |
| 5 | Chat push to the other phone | 1–1.5 days | Not started | 0% |

Phase 2 and Phase 3 both depend on Phase 1. Phase 3 can start once the customer RPCs exist. Phase 4 needs both screens.

---

## Phase 1: Store and RPCs

**Goal:** A dealer-scoped thread can be created and read only by the owning customer session or by staff with `chat` view.

### Deliverables

- [ ] `advisor_chats` and `advisor_chat_messages`
- [ ] Unique `(dealer_code, reg_key, phone_10)`
- [ ] `modules` row `chat` → `/chat`
- [ ] Customer and staff RPCs in the plan
- [ ] Anon cannot select. Authenticated can select own dealer when they have `chat` view
- [ ] Both tables on `supabase_realtime` with `REPLICA IDENTITY FULL`
- [ ] Migration applied and `full_metadata.sql` refreshed

### Success

A SQL session as a `chat` viewer can list and send. A customer token can send only for its registration. Anon `select` fails.

---

## Phase 2: Web Chat

**Goal:** The header icon left of the bell opens a WhatsApp-style inbox for this dealer.

### Deliverables

- [ ] `ChatPage` and `advisorChat.ts`
- [ ] Route, nav item, `ROUTE_MODULE_MAP`
- [ ] Realtime subscription while the page is open
- [ ] Unread badge on the icon
- [ ] `MODULE_ROUTE_CONTRACT.md` updated

### Success

Two browsers signed in as different `chat` users see the same thread. A send on one appears on the other without reload. Vehicle number and phone show on the list row.

---

## Phase 3: Customer screen

**Goal:** Home Chat stays inside the app and uses the Phase 1 RPCs.

### Deliverables

- [ ] MOBILE-014 tasks checked
- [ ] `wa.me` removed from the Home Chat handler
- [ ] Call advisor still dials

### Success

A message sent on the phone shows on the open web thread. A workshop reply shows on the phone within one refresh tick.

---

## Phase 4: Acceptance

**Goal:** Shared participation and the untouched modules are verified.

### Deliverables

- [ ] Two staff names on one customer thread
- [ ] User without `chat` is denied
- [ ] Cross-registration customer read is denied
- [ ] Complaints, Help Tickets, Call advisor, bodyshop WhatsApp groups unchanged
- [ ] Evidence file under `../evidence/`

### Success

All success criteria in CHAT-001 section 12 are true.

---

## Phase 5: Chat push

**Goal:** A saved message wakes the other side’s phone. Android goes through Firebase. iOS goes through Expo.

### Deliverables

- [x] `device_push_tokens` and `chat_push_outbox`
- [x] Message insert enqueues the other side and skips the sender
- [x] `send-chat-push` is deployed and uses FCM HTTP v1 or the Expo push API from `token_provider`. FCM secrets are set for `techwheels-service`
- [x] Staff login and customer session register the device
- [x] Tap opens customer chat, or staff home until a staff chat screen exists

### Success

A customer message arrives on a staff phone that has `chat` view for that dealer. A staff reply arrives on the customer phone registered to that vehicle’s phone. The message is stored even when push fails.
