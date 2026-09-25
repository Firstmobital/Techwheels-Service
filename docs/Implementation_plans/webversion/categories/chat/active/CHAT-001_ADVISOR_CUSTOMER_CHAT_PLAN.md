# Implementation Plan: CHAT-001

**Plan ID:** CHAT-001  
**Created:** 2026-09-25  
**Priority:** HIGH  
**Owner:** Web Team + Mobile Team + Platform  
**Status:** In progress — chat and push migrations applied 2026-09-25. `send-chat-push` is deployed and FCM secrets are set for `techwheels-service`. A live phone delivery check is still open.  
**Mobile companion:** [MOBILE-014](../../../../mobileversion/categories/customer/active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)

---

## 1) Executive Summary

The customer home **Chat** button opens WhatsApp (`wa.me`) with the advisor or workshop phone. Complaints and Help Tickets already have message boxes. Neither is a live vehicle conversation.

This plan adds one workshop thread per dealer + vehicle number + customer phone. The web app gets a **Chat** module: a header icon immediately left of the notification bell, route `/chat`, and a split inbox. The customer app opens that same thread inside the app. Any user who has the `chat` module can send. The bubble records who on the workshop side spoke.

Staff screens update from Supabase realtime on the new tables. The customer app keeps using the session-token RPCs and refreshes while the screen is open, the same way Home already refreshes. Customers do not have a staff JWT.

A sent message also pushes the other side’s phone. Android uses Firebase Cloud Messaging. iOS uses the Expo push service. The phone app collects the token with `expo-notifications`. This matches the working pipeline in TECHWHEELS-WEB.

**Risk Level:** MEDIUM  
**Estimated Duration:** 3–4 working days  
**Rollback:** Remove the `/chat` route and header icon, point the customer Chat button back at `wa.me`, and leave the new tables unused. Drop the tables only after confirming no production messages must be kept.

---

## 2) Classification

| Item | Value |
|---|---|
| Kind | New module + customer screen |
| Module name | `chat` |
| Route | `/chat` |
| Permission | `has_module_view('chat')` or `is_admin()` can list and send |
| Dealer scope | `my_dealer_code()` for staff. Customer dealer is taken from the vehicle row the session already owns |
| Realtime | Staff `postgres_changes` on the two new tables. Customer poll through RPCs |
| Push | Android: FCM HTTP v1. iOS: Expo push. Token collected by `expo-notifications` |

---

## 3) Scope

### In scope

- Tables `advisor_chats` and `advisor_chat_messages`
- SECURITY DEFINER RPCs for customer session token and for staff
- SELECT-only RLS so signed-in staff with `chat` receive realtime events
- Web header icon, `/chat` split inbox, nav entry, module row
- Customer screen that replaces the WhatsApp link on Home
- Unread counts on the web icon and on each inbox row
- Device push to the other side when a chat message is saved (Phase 5)

### Out of scope

- `complaint_tickets`, `complaint_messages`, complaint link tokens
- `help_tickets`, `help_ticket_messages`, SLA, assignment, escalation
- Call advisor (`tel:`)
- Bodyshop stage WhatsApp groups and WA AI Agent
- Photos, files, voice notes, internal-only notes
- Staff starting a thread for a vehicle that has never sent a message
- SMS or WhatsApp to the mobile number. Push goes to the installed app on that person’s phone
- A second Firebase client SDK in the app. `expo-notifications` is the only phone client

---

## 4) Audit (2026-09-25)

DB authority: `supabase/backups/full_metadata.sql`.

| Surface | What it does | Why it stays separate |
|---|---|---|
| Customer Home Chat | `mobile/src/app/(customer)/index.tsx` calls `Linking.openURL(https://wa.me/91…)` with `getDirectAdvisorOrWorkshopPhone` and a prefilled status line | This is the button to replace. Call advisor on the same card stays a phone link |
| Complaints `/complaints` | `complaint_messages.author_type` is `customer`, `staff`, or `system`. Staff loads messages in `loadTicketDetails`. Customer writes with `add_customer_message(p_token, p_body)` on a one-time link | A thread exists only after a complaint. No live subscription. Opening Chat must not raise a complaint |
| Help Tickets `/help-tickets` | `help_ticket_messages` is employee-to-employee. Direct table access is revoked. UI reloads after send | No vehicle, no customer phone, no customer session |
| Customer login | `customer_start_session` writes `customer_sessions`. The phone uses the anon key plus `p_session_token` | The customer cannot subscribe to a staff table. Live customer updates go through RPCs |
| Staff realtime elsewhere | Service Advisor and the customer portal subscribe with `supabase.channel(...).on('postgres_changes', …)` | Reuse that client pattern. `supabase_realtime` currently publishes `parts_requests` only. New tables must be added to that publication |
| Header | `src/App.tsx` util bar order is Search, then the bell (`title="Notifications"`) | Chat icon goes between Search and the bell |

`customer_norm_reg` and `customer_last10_digits` already exist. Use them as the thread key. Do not invent a second normalizer.

---

## 5) Target contract

One open thread per `(dealer_code, reg_key, phone_10)`.

- `reg_key` = `customer_norm_reg(reg_number)`
- `phone_10` = `customer_last10_digits(customer phone)`
- Display title is the registration as stored (`RJ45CL3670`)
- Display subtitle is `phone_10`
- `jc_number` and `sa_name` are snapshots refreshed when the customer sends, not part of the unique key. History stays on the vehicle and phone across job cards
- The row is inserted on the first message, not when the screen opens. The staff inbox lists threads that have `last_message_at`

```
Customer Home → Chat
  -> /(customer)/chat
  -> customer_list_advisor_messages(session_token, reg)
  -> customer_send_advisor_message(session_token, reg, body)
       -> customer_require_session
       -> customer_assert_reg
       -> insert thread if missing, then message
       -> author_side = customer

Web header icon or /chat
  -> advisor_chat_list()
  -> advisor_chat_send(chat_id, body)
       -> is_admin() or has_module_view('chat')
       -> dealer_code = my_dealer_code()
       -> author_side = staff, author_name = signed-in user
```

Bubble sides:

| Viewer | Own messages | Other side |
|---|---|---|
| Web workshop | Right. Name of the staff user who sent | Left. Label Customer |
| Customer app | Right. Label You | Left. `author_name` of that staff message, or the advisor snapshot when the name is empty |

While either screen is open, a new message from the other side appears without a manual reload. Staff: realtime insert. Customer: refetch on an interval while focused (Home already uses 3.5s).

---

## 6) Database

Migration under `supabase/migrations/`. After apply, refresh `supabase/backups/full_metadata.sql` the same way other module migrations do.

### `advisor_chats`

| Column | Notes |
|---|---|
| `id` | `uuid` primary key, `gen_random_uuid()` |
| `dealer_code` | `text` not null |
| `reg_number` | display value |
| `reg_key` | `customer_norm_reg` |
| `phone_10` | 10 digits |
| `customer_name` | snapshot, nullable |
| `jc_number` | snapshot, nullable |
| `sa_name` | snapshot, nullable |
| `last_message_at` | `timestamptz` |
| `last_message_preview` | `text`, trimmed preview |
| `last_author_side` | `customer` or `staff` |
| `staff_unread_count` | integer default 0 |
| `customer_unread_count` | integer default 0 |
| `created_at`, `updated_at` | `timestamptz` default `now()` |

Unique index: `(dealer_code, reg_key, phone_10)`.  
List index: `(dealer_code, last_message_at desc)`.

### `advisor_chat_messages`

| Column | Notes |
|---|---|
| `id` | `uuid` primary key |
| `chat_id` | FK to `advisor_chats` on delete cascade |
| `author_side` | check `customer` or `staff` |
| `author_user_id` | `uuid` null for customer |
| `author_name` | not null |
| `body` | `text` not null, 1 to 2000 characters after trim |
| `created_at` | `timestamptz` default `now()` |

Index: `(chat_id, created_at)`.

### Module row

```sql
INSERT INTO public.modules (name, label, description, icon, route, sort_order, is_active)
VALUES (
  'chat',
  'Chat',
  'Workshop inbox for customer vehicle conversations.',
  'message-circle',
  '/chat',
  <next sort_order>,
  true
)
ON CONFLICT (name) DO NOTHING;
```

Do not insert role grants. `is_admin()` works immediately. Other users get `chat` view from Admin → Permissions after deploy.

### Access

Follow the Help Tickets RPC posture for writes, and open SELECT for staff realtime:

- RLS enabled on both tables
- `REVOKE ALL` from `anon`
- `REVOKE INSERT, UPDATE, DELETE` from `authenticated`
- `GRANT SELECT` on both tables to `authenticated`
- SELECT policy: `dealer_code = public.my_dealer_code()` and (`public.is_admin()` or `public.has_module_view('chat')`) on `advisor_chats`
- Messages SELECT policy: the parent chat passes that same check
- No policy and no grant for `anon`. Customer access is only through SECURITY DEFINER RPCs
- `ALTER PUBLICATION supabase_realtime ADD TABLE` for both tables
- `REPLICA IDENTITY FULL` on both tables so inbox updates include `last_message_preview` and unread counts

All RPCs are `SECURITY DEFINER`, `search_path = public`, and granted to `anon, authenticated` only where that caller needs them. Customer RPCs are granted to `anon` and `authenticated`. Staff RPCs are granted to `authenticated` only.

### Customer RPCs

Each one starts with `customer_require_session(p_session_token)` and `customer_assert_reg` for the registration. Dealer code and phone come from that session and the vehicle row, never from a client-supplied dealer or phone.

| RPC | Behavior |
|---|---|
| `customer_list_advisor_messages(p_session_token, p_reg_number)` | Return the thread summary and messages. Empty thread if none yet. Mark `customer_unread_count = 0` when messages are returned |
| `customer_send_advisor_message(p_session_token, p_reg_number, p_body)` | Reject blank or over 2000 characters. Insert the chat row on first send. Insert message `author_side = customer`. Set preview, `last_message_at`, bump `staff_unread_count` |

### Staff RPCs

Each one requires `public.is_admin()` or `public.has_module_view('chat')`, and the chat’s `dealer_code` must equal `public.my_dealer_code()`.

| RPC | Behavior |
|---|---|
| `advisor_chat_list()` | Threads for this dealer with `last_message_at` set, newest first. Include reg, phone, preview, time, `staff_unread_count`, `jc_number`, `customer_name` |
| `advisor_chat_get(p_chat_id)` | Thread plus messages in `created_at` order. Set `staff_unread_count = 0` |
| `advisor_chat_send(p_chat_id, p_body)` | Insert `author_side = staff`, `author_user_id` and `author_name` from the signed-in user. Bump `customer_unread_count` |
| `advisor_chat_unread_count()` | Count of this dealer’s threads where `staff_unread_count > 0` |

There is no assignee check. A floor user, receptionist, or another advisor with `chat` view sends on the same thread. The message stores that user’s name.

---

## 7) Web

### Header icon

In `src/App.tsx`, inside the util bar, add a button immediately before the notifications button (after Search).

- Icon: `message-circle` (already in `src/components/Icon.tsx`)
- Title: `Chat`
- Click navigates to `/chat`
- Badge uses `advisor_chat_unread_count()`, loaded with the existing notification fetch, shown only when the user can view `chat`

### Route and nav

- `ModuleName` gains `'chat'`
- `AppRoute` gains `'/chat'`
- `ROUTE_MODULE_MAP['/chat'] = ['chat']`
- `NAV_ITEMS` gains `{ to: '/chat', label: 'Chat', icon: 'message-circle' }`
- Page: `src/pages/ChatPage.tsx` plus `src/lib/api/advisorChat.ts`
- Update `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` in the same change, status Active once the route is wired

### Inbox

Split layout, same idea as a WhatsApp window:

- Left: search by vehicle number or phone, rows sorted by `last_message_at` descending. Title is the vehicle number. Subtitle is the phone. Third line is the preview. Time and unread count on the right
- Right: selected thread. Customer bubbles on the left. Staff bubbles on the right with `author_name`. Composer at the bottom. Send is enabled for every user who can open the module
- Empty selection state when the dealer has no threads
- Subscribe to `postgres_changes` on `advisor_chats` and `advisor_chat_messages` for this dealer while the page is mounted. Insert on the open thread appends the bubble. Updates reorder the list

---

## 8) Customer app

Detail and screen tasks live in [MOBILE-014](../../../../mobileversion/categories/customer/active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md).

Summary: add `mobile/src/app/(customer)/chat.tsx` with `href: null` (same as `complaint`). Home Chat navigates there and no longer calls `Linking.openURL` for WhatsApp. Call advisor is unchanged.

---

## 8.1) Push when a message is sent

Audit of this app on 2026-09-25: push is not active. `expo-notifications` is installed and listed in `mobile/app.json`, Android declares `POST_NOTIFICATIONS`, and `google-services.json` / `GoogleService-Info.plist` belong to Firebase project `techwheels-service` (`com.techwheels.service`). Nothing registers a token or sends a push. The staff Settings switch only flips local state. The customer bell is an in-app panel.

### Channel

Use the same split TECHWHEELS-WEB already runs in `mobile/src/services/notifications/pushRegistration.ts` and `supabase/functions/send_push_notifications/index.ts`.

| Phone | Token the app stores | Who delivers it |
|---|---|---|
| Android | Native FCM token from `Notifications.getDevicePushTokenAsync()` | FCM HTTP v1, `https://fcm.googleapis.com/v1/projects/techwheels-service/messages:send` |
| iOS | Expo token from `Notifications.getExpoPushTokenAsync()` | Expo push API, `https://exp.host/--/api/v2/push/send` |

Android prefers FCM so delivery does not depend on the Expo gateway. iOS stays on Expo, which is how that project reaches APNs. One worker reads `token_provider` (`fcm` or `expo`) and sends on that path. An Expo-shaped token is always sent through Expo, even if the row says otherwise.

Do not copy TECHWHEELS-WEB’s `employee_device_tokens` table, employee id, or FCM secrets. That app is a different Firebase project. This app uses project `techwheels-service`. Secrets `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` are new Supabase function secrets for this project. Do not put them in the phone binary.

### Who gets the push

The push goes to the other side’s installed app, not to an SMS.

| Sender | Recipients |
|---|---|
| Customer | Every active device registered to a staff user who has `chat` view for that thread’s `dealer_code` |
| Staff (advisor or anyone else with the module) | Every active device registered to the thread’s `phone_10` |

The sender’s own devices are skipped. A staff user with no registered phone gets no push; the web inbox and header badge stay the in-app path. A customer who has not allowed notifications gets no push; the thread still saves.

Tap payload is `chat_id`. Customer opens `/(customer)/chat`. Staff opens the staff shell’s chat route for that id when that screen exists; until then the tap opens the staff home.

### Store

New table `device_push_tokens`:

| Column | Notes |
|---|---|
| `id` | uuid |
| `audience` | `staff` or `customer` |
| `user_id` | staff auth user, null for customer |
| `phone_10` | customer phone from the session, null for staff |
| `device_token` | unique |
| `token_provider` | `fcm` or `expo` |
| `token_platform` | `ios` or `android` |
| `app_version` | nullable |
| `is_active` | default true |
| `last_used_at` | timestamptz |

Staff register with a SECURITY DEFINER RPC after staff login, keyed by `auth.uid()`. Customer register with a session-token RPC, keyed by `customer_require_session` phone. Direct table access stays closed to anon.

New table `chat_push_outbox`: one row per recipient device after `customer_send_advisor_message` or `advisor_chat_send` commits the message. Columns: `message_id`, `token_id`, `title`, `body`, `chat_id`, `status` (`pending`, `sent`, `failed`), `error_text`, `created_at`, `sent_at`. The send RPC only inserts the outbox. It does not call FCM.

Worker: Supabase edge function `send_chat_push`, same branching as WEB’s `send_push_notifications`. A scheduled call drains `pending` rows. Deactivate a token when FCM or Expo reports it unregistered.

Title is the vehicle number. Body is the message preview. Do not put the full phone number in the notification text.

---

## 9) Phases

### Phase 1 — Store and RPCs

- [x] **1.1** Migration for both tables, unique key, indexes, module row, RLS, SELECT grant, publication, replica identity
- [x] **1.2** Customer list and send RPCs, session and registration checks, first-send insert
- [x] **1.3** Staff list, get, send, unread-count RPCs, module and dealer checks
- [x] **1.4** Apply on the target database and refresh `full_metadata.sql`
- [x] **1.5** Confirm `anon` cannot `select` either table

### Phase 2 — Web Chat

- [x] **2.1** `src/lib/api/advisorChat.ts` wrappers
- [x] **2.2** `ChatPage` split inbox and two-sided thread
- [x] **2.3** Header icon before the bell, route, nav item, `ROUTE_MODULE_MAP`
- [x] **2.4** Realtime subscription while `/chat` is open
- [x] **2.5** Unread badge on the header icon
- [x] **2.6** Module-route contract row for `chat` → `/chat`

### Phase 3 — Customer screen

- [x] **3.1** Execute MOBILE-014
- [ ] **3.2** Send from the phone appears on the open web thread without reload
- [ ] **3.3** Send from the web appears on the open phone screen on the next refresh tick

### Phase 4 — Acceptance

- [ ] **4.1** Two staff users with `chat` view reply on one thread. Both names show. Customer sees both
- [ ] **4.2** A user without `chat` view cannot open `/chat` and the RPCs reject them
- [ ] **4.3** A customer session cannot read another registration
- [ ] **4.4** Complaints, Help Tickets, Call advisor, and bodyshop WhatsApp group actions still behave as before
- [ ] **4.5** Evidence note under `docs/Implementation_plans/webversion/categories/chat/evidence/`

### Phase 5 — Chat push

- [x] **5.1** `device_push_tokens` and `chat_push_outbox`, plus staff and customer register RPCs
- [x] **5.2** Enqueue one outbox row per other-side device on message insert. Skip the sender. Applied send RPCs are unchanged; `enqueue_advisor_chat_push` runs after insert
- [x] **5.3** Edge function `send-chat-push` is deployed: FCM HTTP v1 for `fcm`, Expo push for `expo`. Secrets `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` are set for Firebase project `techwheels-service`
- [x] **5.4** `send-chat-push` cron every minute calls `invoke_send_chat_push`. A failed or unregistered token is marked inactive. The message insert does not roll back if the HTTP call fails
- [x] **5.5** Staff login and customer session register the device with `expo-notifications`. Android stores the native FCM token. iOS stores the Expo token. Settings switch registers or deactivates instead of flipping local state only
- [x] **5.6** Tap payload is `chat_id`. Customer opens `/(customer)/chat`. Staff opens home until a staff chat screen exists. A live wake-up still needs the deployed worker and FCM secrets

---

## 10) Activity tracker

> Update this section as work progresses.

Legend: PENDING | IN PROGRESS | COMPLETED | BLOCKED

### Phase 1
```
✅ 1.1 | Tables, module, RLS, publication | Platform | 2026-09-25 | 2026-09-25 | 20260925084613_advisor_customer_chat.sql
✅ 1.2 | Customer RPCs | Platform | 2026-09-25 | 2026-09-25 | session token + customer_assert_reg
✅ 1.3 | Staff RPCs | Platform | 2026-09-25 | 2026-09-25 | view permission, no assignee
✅ 1.4 | Apply + metadata dump | Platform | 2026-09-25 | 2026-09-25 | full_metadata.sql refreshed
✅ 1.5 | Anon select denied | Platform | 2026-09-25 | 2026-09-25 | permission denied for anon
```

### Phase 2
```
✅ 2.1 | advisorChat.ts | Web | 2026-09-25 | 2026-09-25 | src/lib/api/advisorChat.ts
✅ 2.2 | ChatPage inbox | Web | 2026-09-25 | 2026-09-25 | src/pages/ChatPage.tsx
✅ 2.3 | Header icon, route, nav | Web | 2026-09-25 | 2026-09-25 | icon left of the bell
✅ 2.4 | Realtime on /chat | Web | 2026-09-25 | 2026-09-25 | postgres_changes while mounted
✅ 2.5 | Header unread badge | Web | 2026-09-25 | 2026-09-25 | advisor_chat_unread_count
✅ 2.6 | MODULE_ROUTE_CONTRACT | Web | 2026-09-25 | 2026-09-25 | chat → /chat
```

### Phase 3
```
✅ 3.1 | MOBILE-014 screen | Mobile | 2026-09-25 | 2026-09-25 | Home Chat no longer opens WhatsApp
⏳ 3.2 | Phone send shows on web | Mobile + Web | 2026-09-25 | | needs a live customer session
⏳ 3.3 | Web send shows on phone | Mobile + Web | 2026-09-25 | | needs a live customer session
```

### Phase 4
```
⏳ 4.1 | Two staff names on one thread | Web + Mobile | | | not started
⏳ 4.2 | Module guard | Web | | | not started
⏳ 4.3 | Session cannot cross registrations | Mobile | | | not started
⏳ 4.4 | Complaints, Help Tickets, Call, WA groups unchanged | Web + Mobile | | | not started
⏳ 4.5 | Evidence note | Platform | | | not started
```

### Phase 5
```
✅ 5.1 | Token table and outbox | Platform | 2026-09-25 | 2026-09-25 | 20260925092319_chat_push_tokens_outbox.sql
✅ 5.2 | Enqueue on message insert | Platform | 2026-09-25 | 2026-09-25 | trigger, send RPCs unchanged
✅ 5.3 | send-chat-push FCM + Expo | Platform | 2026-09-25 | 2026-09-25 | deployed; FCM secrets set for techwheels-service
✅ 5.4 | Scheduled drain | Platform | 2026-09-25 | 2026-09-25 | cron send-chat-push every minute
✅ 5.5 | Register token on staff and customer login | Mobile | 2026-09-25 | 2026-09-25 | expo-notifications; not verified on a device
✅ 5.6 | Tap routing coded | Mobile | 2026-09-25 | 2026-09-25 | customer chat; staff home until that screen exists
```

---

## 11) Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Customer granted table SELECT so realtime “just works” | Medium if rushed | High | Anon has no grant. Customer uses RPCs only |
| Reusing complaint or help-ticket messages | Medium | High | New tables. Phase 4 checks those modules still behave |
| Empty threads flood the inbox | Medium | Low | Insert the chat row on first send. List requires `last_message_at` |
| Realtime payload missing preview columns | Medium | Medium | `REPLICA IDENTITY FULL` before the web subscription ships |
| `chat` view not granted, so only admins see it | High until Admin assigns it | Medium | Document the permission step in rollout. Do not auto-grant every role |
| WhatsApp link left in place beside the new screen | Low | Medium | Phase 3 removes `wa.me` from the Home Chat handler only |

---

## 12) Success criteria

- Home Chat opens an in-app thread for the vehicle on screen
- `/chat` lists that dealer’s threads by vehicle number and phone, newest activity first
- Customer messages and staff messages sit on opposite sides
- Any user with `chat` view can send, and the bubble shows that user’s name
- A second staff user can continue the same thread
- The open web thread updates from realtime. The open customer thread updates from its refresh loop
- A customer session cannot read or write another vehicle
- Complaints, Help Tickets, Call advisor, and bodyshop WhatsApp groups are unchanged
- A customer message pushes staff phones with `chat` view for that dealer. A staff message pushes the customer phone for that vehicle. The sender is not pushed

---

## 13) File touch map

| Path | Change |
|---|---|
| `supabase/migrations/<new>_advisor_chat.sql` | Tables, RPCs, module, RLS, publication |
| `supabase/backups/full_metadata.sql` | Refresh after apply |
| `src/lib/api/advisorChat.ts` | New |
| `src/pages/ChatPage.tsx` | New |
| `src/App.tsx` | Icon, route, nav, module union, unread badge |
| `src/components/Icon.tsx` | No new icon. Use `message-circle` |
| `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` | Add `chat` when the route lands |
| `mobile/src/app/(customer)/chat.tsx` | New. Detail in MOBILE-014 |
| `mobile/src/app/(customer)/_layout.tsx` | `href: null` screen |
| `mobile/src/app/(customer)/index.tsx` | Chat navigates in-app |
| `mobile/src/lib/api/customerPortal.ts` | Customer RPC wrappers |
| `mobile/src/lib/notifications/pushRegistration.ts` | Android FCM token, iOS Expo token |
| `supabase/functions/send-chat-push/index.ts` | Drain `chat_push_outbox` |

---

## 14) Related documents

- [00_INDEX](00_INDEX.md)
- [PHASES](PHASES.md)
- [CHECKLIST](CHECKLIST.md)
- [MOBILE-014](../../../../mobileversion/categories/customer/active/MOBILE-014_CUSTOMER_ADVISOR_CHAT_PLAN.md)
- [MOBILE-011](../../../../mobileversion/categories/auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)
- [HELP-001](../../help-tickets/active/HELP-001_COMPREHENSIVE_PLAN.md) — peer for module insert, RPC-only writes, and the mobile companion split
- [CMP-01](../../complaints/active/01_COMPREHENSIVE_PLAN.md) — peer for customer/staff bubbles. Do not share tables
- [MODULE-ROUTE-001](../../../../shared/reference/MODULE_ROUTE_CONTRACT.md)
- TECHWHEELS-WEB push reference: `mobile/src/services/notifications/pushRegistration.ts`, `supabase/functions/send_push_notifications/index.ts`

---

**Last Updated:** 2026-09-25  
**Status:** In progress — chat and push migrations applied. Phase 4 live check is still open. Phase 5 worker is deployed and FCM secrets are set. A live phone delivery check is still open.
