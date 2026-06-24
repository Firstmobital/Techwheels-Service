# WhatsApp Customer Message Sender - Implementation Plan

Project: Techwheels Service  
Feature: Replace Create Group with Send WA (template-driven)  
Started: 2026-06-11  
Status: RE-SCOPED (GROUP FLOW RETIRED)

---

## Executive Summary

Previous behavior assumed automated WhatsApp group creation from the Service Advisor page. That is not viable as a reliable automated workflow. This plan pivots to a robust and scalable pattern:

1. Replace row action with Send WA (or WhatsApp icon button with tooltip Send WA).
2. Send a direct WhatsApp message to the customer mobile number using a predefined template.
3. Use a dynamic complaint tracking URL for each row/reception entry.
4. Build a universal WhatsApp sender architecture, similar to universal email sender, so future templates can be plugged in without rewriting sender logic.

---

## Product Decision

### UI Recommendation

Default recommendation:
- Use a single WhatsApp icon button in the Action column for compact table UX.
- Tooltip: Send WA.
- Accessibility label: Send WA to customer.

Fallback option:
- If discoverability is a concern during rollout, use text button Send WA for 1 sprint, then switch to icon once adoption is stable.

### Messaging Behavior

On click:
1. Validate customer phone on row.
2. Resolve or generate complaint URL for that vehicle/reception entry.
3. Render template sa_floor_completed_wa with dynamic placeholders.
4. Dispatch message using universal WhatsApp sender.
5. Log send attempt + status (sent/failed) for audit.

---

## Template Contract (Initial)

Template key: sa_floor_completed_wa

Required dynamic fields:
- customer_name
- reg_number
- vehicle_details (model + service type)
- completed_on
- complaint_url

Message intent:
- Inform customer work completion.
- Invite issue reporting via complaint URL.

Canonical copy:

Hello {customer_name},

Your vehicle {reg_number} ({vehicle_details}) work is completed on {completed_on}.

If you face any issue, please raise a complaint here:
{complaint_url}

Thank you,
Techwheels Service

---

## Technical Architecture (Universal Sender Pattern)

### Layer 1: Template Layer (reusable)
- Path: src/lib/waTemplates/
- One file per template.
- Exports template builder functions that return final message text.

### Layer 2: Universal WhatsApp Sender (generic delivery)
- Suggested endpoint: supabase/functions/send-whatsapp/index.ts
- Responsibilities:
  - validate internal auth/secret
  - normalize/validate destination phone
  - send via configured provider (Cloud API/Gupshup/etc.)
  - return delivery status + provider reference
  - write audit logs

### Layer 3: Feature Orchestrator (Service Advisor action)
- ServiceAdvisor page handler should:
  - gather row data
  - obtain complaint URL dynamically
  - call template builder
  - invoke universal sender
  - show toast feedback to user

This mirrors the existing universal email sender model:
- template composition separated from transport
- sender remains generic
- feature modules only orchestrate payload

---

## Dynamic Complaint URL Strategy

Use existing complaints link generation mechanism per reception entry.

Preferred flow:
1. Call complaints utility/RPC to get active link token for row reception entry.
2. Construct complaint URL as /c/{token}.
3. Inject URL into template before dispatch.

If link generation fails:
- Do not send a partial message.
- Show error: Unable to generate complaint link. Please retry.

---

## Scope Changes from Old Plan

Retired:
- Automated/manual group creation checklist flow.
- Multi-member group assembly logic.
- Create Group label and behavior.

New scope:
- One-click customer WhatsApp send.
- Template-driven message payload.
- Universal sender + future template expansion.

---

## Implementation Phases

### Phase 1 - Plan and UI Rename
- [ ] Replace Create Group action label with Send WA or WhatsApp icon.
- [ ] Update tooltip/help text and user copy.
- [ ] Remove group-creation wording from UI and docs.

### Phase 2 - Template Layer
- [ ] Create src/lib/waTemplates/index.ts.
- [ ] Create src/lib/waTemplates/sa_floor_completed_wa.ts.
- [ ] Add placeholder contract typing and validation.

### Phase 3 - Universal Sender
- [ ] Create/extend send-whatsapp edge function.
- [ ] Add provider adapter interface for future provider swap.
- [ ] Add request validation, error taxonomy, and audit logging.

### Phase 4 - Service Advisor Integration
- [ ] Replace old handler with handleSendWhatsApp().
- [ ] Fetch dynamic complaint URL per row.
- [ ] Build template payload and dispatch message.
- [ ] Show success/failure toasts with actionable detail.

### Phase 5 - QA and Rollout
- [ ] Validate on rows with valid/invalid phone.
- [ ] Validate complaint URL generation for each send.
- [ ] Validate template placeholder substitutions.
- [ ] Validate audit logs and retry behavior.
- [ ] Roll out to production.

---

## QA Acceptance Criteria

- [ ] Action column no longer shows Create Group.
- [ ] Send WA action is visible and clickable per row.
- [ ] Message lands on customer number with correct dynamic values.
- [ ] Complaint URL opens correct customer complaint page.
- [ ] Failed sends are surfaced clearly to user and logged.
- [ ] Universal sender works with at least one template now and is reusable for new templates later.

---

## Risks and Mitigations

1. Missing/invalid customer phone
- Mitigation: strict phone validation before dispatch.

2. Complaint URL not generated
- Mitigation: block send when URL generation fails; show retry guidance.

3. Provider outages/rate limits
- Mitigation: sender retries + explicit failure logging + non-silent errors.

4. Template drift across teams
- Mitigation: single template folder + typed payload contracts + review checklist.

---

## Files and Structure (Target)

- docs/Implementation_plans/webversion/categories/operations/active/WA_GROUP_CREATION_IMPLEMENTATION_PLAN.md (this document; now re-scoped)
- docs/web/cross-cutting/wa_templates/reference/sa_floor_completed_wa.md (template documentation)
- src/lib/waTemplates/index.ts (template exports)
- src/lib/waTemplates/sa_floor_completed_wa.ts (template builder)
- src/pages/ServiceAdvisorPage.tsx (Send WA action wiring)
- supabase/functions/send-whatsapp/index.ts (universal sender)

---

## Update Log

2026-06-11
- Plan re-scoped from group creation to template-based customer WhatsApp sender.
- Added universal sender recommendation aligned with email sender architecture.
- Added first template definition: sa_floor_completed_wa.

---

Last Updated: 2026-06-11  
Last Updated By: GitHub Copilot
