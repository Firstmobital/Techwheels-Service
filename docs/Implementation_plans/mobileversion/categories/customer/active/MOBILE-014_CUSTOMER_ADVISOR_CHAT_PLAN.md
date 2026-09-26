# MOBILE-014 — Customer Advisor Chat

**Plan ID:** MOBILE-014  
**Created:** 2026-09-25  
**Priority:** HIGH  
**Owner:** Mobile Team + Platform  
**Status:** In progress  
**Category:** customer  
**Shared backend authority:** [CHAT-001](../../../../webversion/categories/chat/active/CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)  
**Phase alignment:** CHAT-001 Phase 3 for the screen. Customer push registration is in CHAT-001 Phase 5. The worker is deployed and FCM secrets are set. A live phone delivery check is still open.

---

## 1) Objective

Login as Customer taps **Chat** on the vehicle card and stays in the app. The screen talks to the workshop thread for that registration. Workshop replies show on the left with the staff name. The customer’s own messages show on the right.

### Measurable outcomes

- Home Chat no longer opens `https://wa.me/`
- The screen calls `customer_list_advisor_messages` and `customer_send_advisor_message` with the existing session token
- A message sent here appears on web `/chat` for that vehicle and phone
- A workshop reply appears on this screen while it is focused, using the same refresh interval Home already uses
- Call advisor still places a phone call
- Helpdesk Chat opens the same screen for that contact and the vehicle already selected on Home. Call and Mail stay

---

## 2) Scope

### In scope

- `mobile/src/app/(customer)/chat.tsx`
- Hidden tab registration in `mobile/src/app/(customer)/_layout.tsx` (`href: null`, same as `complaint`)
- Home button in `mobile/src/app/(customer)/index.tsx`
- Helpdesk Chat button on each escalation contact in `mobile/src/app/(customer)/helpdesk.tsx`
- Wrappers in `mobile/src/lib/api/customerPortal.ts` (or a sibling `advisorChat.ts` under `mobile/src/lib/api/`)

### Out of scope

- A new bottom tab
- Staff inbox on mobile
- Attachments
- Replacing Call or Mail on helpdesk. Chat is an extra button that opens the same screen with that contact's thread
- Subscribing the anon client to `advisor_chat_messages`
- Choosing a different push provider than CHAT-001 section 8.1. Customer registration stores an FCM token on Android and an Expo token on iOS, then the shared worker delivers it

---

## 3) Screen contract

Entry: Home Chat, with the registration already selected (`selectedReg` / `vehicles[0]`).

Header: vehicle number, then the advisor name already shown on the home card (`sa_name` / service advisor). The phone number is not the title. The workshop list uses the phone; the customer already knows their own number.

Messages:

- `author_side = customer` aligned to the trailing edge, label You
- `author_side = staff` aligned to the leading edge, label `author_name`
- Time under each bubble
- Empty state with the composer when no row exists yet. The first send creates the thread (server rule in CHAT-001)

Composer: single text field, send disabled when blank. Server enforces the 2000 character cap. Show the RPC error inline.

Refresh: `useFocusEffect` plus an interval while focused. Match the Home interval (3.5s) unless a shorter tick is already used on a customer screen. Refetch list. Do not clear the composer on refetch.

Auth: pass `token` from `useCustomerSession`. If the token is missing, the existing customer auth layout already blocks this group.

---

## 4) Tasks

- [x] **4.1** Add the two customer RPC wrappers. Map errors the same way `customerAuth.ts` maps session and registration failures
- [x] **4.2** Add `chat.tsx` and `<Tabs.Screen name="chat" options={{ href: null, title: 'Chat' }} />`
- [x] **4.3** Replace the Home Chat `Linking.openURL(wa.me…)` handler with `router.push('/(customer)/chat')`
- [x] **4.4** Leave the Call advisor `tel:` handler as it is
- [ ] **4.5** Verify on a running customer session: send, see the workshop reply, leave the screen, come back, history still there

---

## 5) Activity tracker

```
✅ 4.1 | Customer RPC wrappers | Mobile | 2026-09-25 | 2026-09-25 | mobile/src/lib/api/advisorChat.ts
✅ 4.2 | chat.tsx hidden from the tab bar | Mobile | 2026-09-25 | 2026-09-25 | href null
✅ 4.3 | Home Chat navigates in-app | Mobile | 2026-09-25 | 2026-09-25 | wa.me removed from Chat
✅ 4.4 | Call advisor unchanged | Mobile | 2026-09-25 | 2026-09-25 | tel: handler kept
⏳ 4.5 | Two-way check against /chat | Mobile + Web | 2026-09-25 | | needs a logged-in customer
```

---

## 6) Success criteria

- Chat on the home card opens `/(customer)/chat` for the selected vehicle
- The first message creates the workshop thread keyed by that dealer, registration, and phone
- Later messages append. The customer sees staff names, not a single shared “Advisor” label when the sender name is present
- The customer cannot pass a different registration than the session allows (`customer_assert_reg` on the server)
- Call advisor, Report issue, and the bottom tabs are unchanged

---

## 7) Related documents

- [CHAT-001](../../../../webversion/categories/chat/active/CHAT-001_ADVISOR_CUSTOMER_CHAT_PLAN.md)
- [MOBILE-011](../../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)
- [MOBILE-013](MOBILE-013_CUSTOMER_DOCUMENT_DRIVE_UPLOAD_PLAN.md) — same customer session. Do not couple document upload to this thread
- [Customer category](../README.md)

---

**Last Updated:** 2026-09-25  
**Status:** In progress — RPCs are live. Task 4.5 still needs a customer session.
