# Updation Reminder — WhatsApp Template + Flow

Reference for the "Updation Reminder" automation (`src/pages/UpdationReminderPage.tsx`,
`supabase/functions/wa-updation-reminder/`). Sends up to two WhatsApp reminders per
chassis (day 0 and day 0+`updation_reminder_gap_days`) for vehicles pending a Tata
Motors update campaign (software/hardware "updation"), with a Flow-based booking form
(date, preferred time, branch) that writes into `service_bookings`.

No Flow-creation API is used anywhere in this repo — the existing `service_booking_cta`
Flow (used by Auto Service Reminder / EW Service Reminder) was built manually in Meta's
WhatsApp Manager, and this Flow follows the same manual-publish pattern.

## 1. Flow — published

The Flow (screen id `DETAILS`, title "Book Service") has been published in Meta
WhatsApp Manager. Its exact JSON is captured in
[`updation_booking_flow.json`](./updation_booking_flow.json) for reference. Fields:

| Field | Component | Options |
|---|---|---|
| `Service_Date_401615` | DatePicker | — |
| `Preferred_Time_7de7b2` | RadioButtonsGroup | `0_Morning`, `1_Afternoon`, `2_Evening` |
| `Service_Centre_Location_5aad9a` | RadioButtonsGroup | `0_Ajmer_Road`, `1_Sitapura` |

On submit, the Footer's `on-click-action.payload` sends back exactly these keys (this is
what `wa-webhook` parses):
- `screen_0_Service_Date_0`
- `screen_0_Preferred_Time_1`
- `screen_0_Service_Centre_Location_2`

Note the Flow only offers **Ajmer Road** and **Sitapura** as branches (not the full
`REPORT_BRANCH_OPTIONS` list) — if Tonk/Shahpura need to be bookable via this Flow too,
add them as additional `data-source` options in Meta WhatsApp Manager and update the
`branchMap` in `wa-webhook`'s UPDATION REMINDER handler to match.

## 2. Attach the Flow button to the WhatsApp template — outstanding

The template currently wired into Updation Reminder config (`updation_service`, approved)
has **no button attached yet** — `wa_templates.buttons` is `null` for it. WhatsApp won't
let you edit buttons on an already-approved template in place, so:

1. In this app's **WhatsApp Automations → Templates** tab (`WAAgentPage.tsx`), open
   `updation_service` for editing (or create a new template if Meta requires a new name
   for a component change).
2. Set **Buttons (JSON array)** to:

   ```json
   [
     {
       "type": "FLOW",
       "text": "Book Service",
       "flow_id": "<FLOW_ID from Meta WhatsApp Manager>",
       "flow_action": "navigate",
       "navigate_screen": "DETAILS"
     }
   ]
   ```

3. Save, then **Submit for Meta approval** from the Templates tab. The reminder job will
   only attach this Flow button when sending once `wa_templates.buttons` contains a
   `FLOW`-type entry — `wa-updation-reminder` checks this automatically (`hasFlowButton`
   in `loadConfigAndTemplate()`), so a body-only template still sends fine as plain text
   in the meantime, just without the booking button.

## 3. Wire it into the automation

Once the template has the Flow button and is approved, open **WhatsApp Automations →
Updation Reminder → Configuration** and (re)select it. The reminder job
(`wa-updation-reminder`) sends it with body parameters built from
`updation_reminder_variable_map`.

## 4. How a booking reply is captured

When a customer taps the Flow button and submits the form, Meta sends an `nfm_reply`
webhook event whose `response_json` has the three `screen_0_...` keys listed in section 1.
`wa-webhook` detects `screen_0_Service_Date_0` (distinct from the legacy
`service_booking_cta` Flow's `screen_0_Service_Date_2d2cde` key) and creates a
`service_bookings` row with `booking_source: 'WhatsApp Updation Reminder'`, linking it
back to the matching `updation_reminders` row so the day-N follow-up is skipped once a
customer has booked.
