# Updation Reminder — WhatsApp Template + Flow

Reference for the "Updation Reminder" automation (`src/pages/UpdationReminderPage.tsx`,
`supabase/functions/wa-updation-reminder/`). Sends up to two WhatsApp reminders per
chassis (day 0 and day 0+`updation_reminder_gap_days`) for vehicles pending a Tata
Motors update campaign (software/hardware "updation"), with a Flow-based booking form
(date, preferred time, branch) that writes into `service_bookings`.

No Flow-creation API is used anywhere in this repo — the existing `service_booking_cta`
Flow (used by Auto Service Reminder / EW Service Reminder) was built manually in Meta's
WhatsApp Manager. This Flow follows the same manual-publish pattern, but with a JSON we
author ourselves so the response field names are deterministic (`booking_date`,
`preferred_time`, `branch`) instead of the auto-generated `screen_0_X_<hash>` names Meta's
drag-and-drop builder produces.

## 1. Publish the Flow (one-time, in Meta Business Manager)

1. Go to **WhatsApp Manager → Account tools → Flows → Create Flow**.
2. Name it e.g. `Updation Booking Flow`, category `APPOINTMENT_BOOKING`.
3. In the Flow editor, switch to the **JSON** tab (not the drag-and-drop builder) and
   paste the contents of [`updation_booking_flow.json`](./updation_booking_flow.json).
4. Save, then **Publish** the Flow.
5. Copy the numeric **Flow ID** shown in the Flow's details — you'll need it in step 3
   below.

## 2. Create the WhatsApp message template

In this app's **WhatsApp Automations → Templates** tab (`WAAgentPage.tsx`), click
**+ Create Template** and fill in:

- **Category**: `UTILITY`
- **Body text**, using variables for the customer/campaign details, e.g.:
  > Hi {{1}}, your {{2}} ({{3}}) is due for an important update: *{{4}}*. Please book a
  > free visit at your nearest Techwheels branch.
  - `{{1}}` = customer name, `{{2}}` = model, `{{3}}` = registration number,
    `{{4}}` = updation reason (`updation_name` from the import file) — matches
    `updation_reminder_variable_map` default (`name`, `model`, `reg_no`, `reason`).
- **Buttons (JSON array)** — paste this, replacing `<FLOW_ID>` with the ID from step 1:

  ```json
  [
    {
      "type": "FLOW",
      "text": "Book My Visit",
      "flow_id": "<FLOW_ID>",
      "flow_action": "navigate",
      "navigate_screen": "BOOK_UPDATION_VISIT"
    }
  ]
  ```

- Save, then **Submit for Meta approval** from the Templates tab. Approval is required
  before the template can be selected in the Updation Reminder config or used to send
  live messages.

## 3. Wire it into the automation

Once approved, open **WhatsApp Automations → Updation Reminder → Configuration** and
select this template. The reminder job (`wa-updation-reminder`) sends it with body
parameters built from `updation_reminder_variable_map`.

## 4. How a booking reply is captured

When a customer taps **Book My Visit** and submits the form, Meta sends an `nfm_reply`
webhook event whose `response_json` has exactly the keys defined in the Flow's Footer
`on-click-action.payload`: `booking_date`, `preferred_time`, `branch`. `wa-webhook`
detects these deterministic keys (as opposed to the legacy `screen_0_...` keys used by
the older `service_booking_cta` Flow) and creates a `service_bookings` row with
`booking_source: 'WhatsApp Updation Reminder'`, linking it back to the matching
`updation_reminders` row so the day-3 follow-up is skipped once a customer has booked.
