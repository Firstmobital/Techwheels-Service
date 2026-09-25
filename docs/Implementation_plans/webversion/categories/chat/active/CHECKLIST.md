# CHAT-001 — Execution Checklist

**Plan:** [CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md](CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)  
**Phases:** [PHASES.md](PHASES.md)  
**Created:** 2026-09-25  
**Status:** Not started

---

## Before coding

- [ ] Re-read the audit in CHAT-001 section 4
- [ ] Grep `full_metadata.sql` for `advisor_chat` and confirm no collision
- [ ] Confirm `customer_require_session`, `customer_assert_reg`, `customer_norm_reg`, `customer_last10_digits`, `my_dealer_code`, `has_module_view` still exist
- [ ] Confirm Home Chat is still the `wa.me` handler in `mobile/src/app/(customer)/index.tsx`

## Phase 1

- [ ] Migration written
- [ ] Module insert uses `ON CONFLICT (name) DO NOTHING` and does not grant roles
- [ ] Customer RPCs take `p_session_token` and do not trust a client dealer code
- [ ] Staff send does not check an assignee
- [ ] Applied to the target database
- [ ] `full_metadata.sql` refreshed
- [ ] Anon select denied

## Phase 2

- [ ] Header control sits between Search and the bell
- [ ] `/chat` is behind `chat` in `ROUTE_MODULE_MAP`
- [ ] Inbox title is vehicle number, subtitle is phone, order is `last_message_at` desc
- [ ] Staff bubbles show `author_name`
- [ ] Realtime channel removed on unmount
- [ ] Module-route contract updated

## Phase 3

- [ ] MOBILE-014 checklist complete
- [ ] Home Chat does not call `Linking.openURL` for WhatsApp
- [ ] `tel:` Call advisor handler untouched

## Phase 4

- [ ] Two staff users reply on one thread
- [ ] Customer sees both names
- [ ] User without the module cannot open the route
- [ ] Complaints and Help Tickets smoke still load
- [ ] Evidence note filed
- [ ] CHAT-001 activity tracker and PHASES.md updated in the same session

## Phase 5

Setup is applied. These rows stay open until a real phone receives a chat push.

- [ ] Token row is `fcm` on Android and `expo` on iOS
- [ ] Customer send enqueues staff devices for that dealer’s `chat` users
- [ ] Staff send enqueues devices for the thread `phone_10`
- [ ] Sender devices are not enqueued
- [ ] Worker uses Firebase project `techwheels-service`, not the TECHWHEELS-WEB project
- [ ] Closed app shows the vehicle number and message preview
- [ ] Tap opens the thread
