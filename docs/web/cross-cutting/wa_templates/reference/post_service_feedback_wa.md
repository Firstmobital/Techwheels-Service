# Post Service Feedback — 10-Star WhatsApp Template & Meta Flow

Reference for the Post Service Feedback (PSF) WhatsApp automation (`supabase/functions/wa-post-service-feedback/`, `supabase/functions/wa-webhook/`, `src/pages/PostServiceFeedbackPage.tsx`, `src/pages/PostServiceFeedbackCREPage.tsx`).

## 1. Legacy 5-Star Template & Flow (Kept Compatible)

- **Template:** `post_service_feedback_v1` (`wa_templates.id = 17`, language `en`, status `approved`).
- **Meta Flow ID:** `1914603942514334` (`navigate_screen: "RECOMMEND"`).
- **Webhook payload keys:** `screen_0_Choose_one_0` (option text containing `(N/5)`), `screen_0_Remarks_1`.
- **Transition behaviour:** All pre-migration rows (including in-flight unresponded messages) are stamped `request_rating_scale = 5`. If a customer later responds to an older `post_service_feedback_v1` message with `1–5`, `wa-webhook` identifies the legacy 5-star scale (via explicit `(N/5)` payload and/or `request_rating_scale = 5` on the matched row) and converts it deterministically (`1→2, 2→4, 3→6, 4→8, 5→10`).

## 2. New 10-Star Meta Flow (`psf_10_star_v2`)

Meta WhatsApp Flows are created and published in Meta WhatsApp Manager (no Flow-publishing API is used in this repo).

1. Open Meta WhatsApp Manager → **Account Tools → Flows → Create Flow**.
2. Name the flow `post_service_feedback_10star_v2`, category **Customer Support** (or **Survey**), template **Without endpoint**.
3. Paste the exact JSON from [`post_service_feedback_10star_flow.json`](./post_service_feedback_10star_flow.json) into the Flow JSON editor.
   - Screen ID: `FEEDBACK_10_STAR`
   - Rating control: `RadioButtonsGroup` (`name: "rating_10"`) with all 10 individual integer values `10` through `1`.
   - Remarks control: `TextArea` (`name: "remarks"`, optional, max 500 chars).
   - Complete payload keys: `flow_version: "psf_10_star_v2"`, `rating_scale: "10"`, `rating_10`, `remarks`.
4. Preview all 10 options in Meta's simulator, verify odd ratings (`1, 3, 5, 7, 9`) and even ratings (`2, 4, 6, 8, 10`) submit cleanly, then **Publish** the Flow and record its new numeric `flow_id`.

## 3. New Approved WhatsApp Template (`post_service_feedback_v2`)

Meta does not allow changing the attached Flow button on an already-approved template (`post_service_feedback_v1`) in place. Create a new template so legacy messages remain intact:

1. In **WhatsApp Automations → Templates** (or Meta Business Manager), create template **`post_service_feedback_v2`** (language `en`, category `UTILITY` or matching existing approved category) with the same Hindi/Hinglish body text and 3 variables (`{{1}}` customer name, `{{2}}` vehicle model, `{{3}}` registration number):
   ```
   नमस्कार {{1}},

   आपकी {{2}} car की service complete हो गई है।

   Registration No.: {{3}}

   हमें उम्मीद है कि service के time बताए गए आपके concerns properly resolve हो गए होंगे।

   कृपया नीचे दिए गए form से 1 से 10 के बीच अपना feedback share करें।
   ```
2. Attach the Flow button pointing to the newly published 10-star Flow:
   ```json
   [
     {
       "type": "FLOW",
       "text": "Submit Feedback",
       "flow_id": "<NEW_10_STAR_FLOW_ID>",
       "flow_action": "NAVIGATE",
       "navigate_screen": "FEEDBACK_10_STAR"
     }
   ]
   ```
3. Submit for Meta approval and wait until `status = approved`.
4. **Only after** DB migration `DBL-0106` and updated `wa-webhook` + `wa-post-service-feedback` Edge Functions are deployed:
   - In **WhatsApp Automations → Post-Service Feedback → Configuration**, switch the selected template from `post_service_feedback_v1` to `post_service_feedback_v2` and click **Save Config**.
   - Run **Send Test Message** to an internal phone, submit an odd rating (e.g. `7` and `9`), and verify exact storage (`7/10` → Needs Follow-up, `9/10` → Positive + Google review link).

## 4. Webhook Rules (`supabase/functions/_shared/psfRating.ts`)

- **Correlation priority**: Exact `msg.context.id -> post_service_feedback_messages.wa_message_id` always takes precedence. If that matched row is already rated, the response is ignored (`[Feedback duplicate ignored]`) and never spills over to another open request for the same mobile number.
- **Unambiguous fallback only**: When `context.id` is absent or unmatched, phone fallback updates a row **only** when the eligible unrated target is strictly unambiguous (`count === 1`). Multiple outstanding requests, unmatched phones, or conflicting payload vs DB `request_rating_scale` are never guessed — the full raw `response_json` and candidate IDs are retained in `wa_messages` (`[Feedback needs review: <reason>]`) for recovery.
- Native 10-star ratings (`1–10`) are stored verbatim (`1→1`, `5→5`, `7→7`, `8→8`, `9→9`, `10→10`).
- Legacy 5-star responses (`1–5`) are converted `× 2` (`5→10`, etc.) only when explicitly identified by legacy payload `(N/5)` and/or `request_rating_scale = 5` with zero scale conflict.
- Values outside the valid range (e.g. `0`, `11`, non-integers, missing scale) are rejected and retained in `wa_messages` without mutating `post_service_feedback_messages`.
- Google Review link is sent only for `storedRating >= 8`.
- Duplicate/concurrent webhook deliveries are blocked by `wa_messages.wa_message_id` deduplication plus an atomic `.is('rating', null)` update guard on `post_service_feedback_messages`.
