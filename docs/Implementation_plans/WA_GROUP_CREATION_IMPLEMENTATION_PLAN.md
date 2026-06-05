# WhatsApp Group Creation Feature - Implementation Plan

**Project:** Techwheels Service  
**Feature:** Create WA Group Button in Service Advisor Page  
**Started:** 2026-06-05  
**Status:** IN PROGRESS  

---

## Executive Summary

Implementing a one-click guided WhatsApp group creation flow in the Service Advisor page. Users click "Create Group" on any vehicle row, and the system prepares a guided checklist with predefined Owner, Service Advisor, and Super Admin phone numbers, plus a dynamic service completion message (Reg No + Service Type). WhatsApp opens automatically and user completes group creation + message send manually (policy-compliant, no bot automation).

---

## What's Been Done ✅

### 1. **Core Logic Implementation** (COMPLETE)
- [x] Phone normalization function: `normalizeWhatsAppPhone()` in ServiceAdvisorPage.tsx:115
  - Handles 10-digit, 12-digit (91-prefixed), and invalid inputs
  - Returns null for missing/invalid numbers
- [x] Phone map parser: `parsePhoneMap()` in ServiceAdvisorPage.tsx:123
  - Parses env config: `SA001:9196XXXXX,SA002:9197XXXXX`
  - Maps employee code → WhatsApp-ready phone number
- [x] Service type message builder: `getServiceTypeForMessage()` in ServiceAdvisorPage.tsx:137
  - Prioritizes draft (in-progress) value over row value
  - Falls back to generic "Service" if neither available
- [x] Dynamic message template: `buildServiceCompleteMessage()` in ServiceAdvisorPage.tsx:144
  - Format: "Your vehicle {Reg No} with {Service Type} is complete. Please come and collect."
- [x] Group creation handler: `handleCreateGroup()` in ServiceAdvisorPage.tsx:571
  - Collects owner phone, SA phone (from map or default), super admin phone
  - Deduplicates members (Set)
  - Generates checklist with group name, member list, message
  - Copies checklist to clipboard
  - Opens WhatsApp automatically (mobile vs. desktop)

### 2. **Environment Configuration** (READY FOR TEST)
- [x] Four new env variables registered in code:
  - `VITE_WA_GROUP_SA_PHONE` - Default SA phone (fallback)
  - `VITE_WA_GROUP_SUPERADMIN_PHONE` - Super admin phone
  - `VITE_WA_GROUP_SA_PHONE_MAP` - Employee code → phone mapping
  - `VITE_WA_GROUP_NAME_PREFIX` - Group name template (default: "Service Delivery")

### 3. **UI/UX Implementation** (COMPLETE)
- [x] New button: "Create Group" in Action column (td-save) of each row
  - Placed below Save button
  - Uses tbtn--compact styling
  - Right next to Save for discoverability
- [x] Layout adjustments:
  - td-save width increased from 80px → 132px (src/App.css:360)
  - tactions--stack utility added for vertical button layout (src/App.css:513)
  - Buttons now stack cleanly with proper spacing

### 4. **Data Flow & Safety** (COMPLETE)
- [x] Per-row dynamic data:
  - Reg No from row.reg_number
  - Service Type from draft (editable) or row (original)
  - Owner phone from row.owner_phone
  - SA phone lookup by row.sa_employee_code with fallback
- [x] Error handling:
  - Validates at least one valid phone number before proceeding
  - Toast notification for failure (no members found)
  - User-friendly error message
- [x] Policy compliance:
  - No bot automation or forced actions
  - User manually creates group and sends message in WhatsApp
  - Message prefilled via wa.me link (official WhatsApp API)
  - Clipboard fallback for cases where window.open doesn't copy

### 5. **Code Quality** (COMPLETE)
- [x] TypeScript: No compile errors
- [x] Consistent with existing codebase style
- [x] All functions are pure/testable utilities
- [x] Error messages clear and actionable

---

## What's Pending ⏳

### PHASE 1: Testing & Validation (READY)
- [ ] **Local Development Test**
  - [ ] Add env vars to `.env.local` (or Vite dev config)
  - [ ] Start dev server: `npm run dev`
  - [ ] Open Service Advisor page
  - [ ] Verify "Create Group" button appears in action column
  - [ ] Click button on a row with owner_phone + service type
  - [ ] Confirm clipboard contains checklist
  - [ ] Confirm WhatsApp opens (web or mobile)
  - [ ] Verify message text includes correct Reg No and Service Type
  - [ ] Test edge cases:
    - Row with missing owner_phone (expect error)
    - Row with custom (draft) service type
    - SA employee code in map vs. not in map

### PHASE 2: Backend/Config Integration (NEXT STEP)
- [ ] **Define Production Phone Numbers**
  - [ ] Get SA default phone number from team
  - [ ] Get Super Admin phone number from team
  - [ ] Build SA employee code → phone map (CSV/config)
- [ ] **Environment Setup**
  - [ ] Add VITE_WA_GROUP_* vars to:
    - [ ] `.env.production`
    - [ ] `.env.staging` (if exists)
    - [ ] Vercel/deployment config
  - [ ] Test env vars load correctly in deployed environment
  - [ ] Verify no hardcoded fallback leaks sensitive data

### PHASE 3: User Acceptance & Documentation (FUTURE)
- [ ] **UAT Checklist**
  - [ ] Service Advisor tests flow with real numbers
  - [ ] Verify group name format matches dealer branding expectations
  - [ ] Test on iOS (WhatsApp app native behavior)
  - [ ] Test on Android (WhatsApp app native behavior)
  - [ ] Test on desktop (WhatsApp Web)
- [ ] **User Documentation**
  - [ ] Create "Create Group" how-to guide
  - [ ] Document expected checklist format
  - [ ] Document what happens after WhatsApp opens
- [ ] **Metrics/Analytics (Optional)**
  - [ ] Log "Create Group" clicks (for feature usage)
  - [ ] Track success rate (e.g., return to SA page after group creation)

### PHASE 4: Future Enhancements (BACKLOG)
- [ ] **Advanced Features**
  - [ ] Allow custom phone number input (if user wants to add more members)
  - [ ] Save group creation history (group name, members, timestamp)
  - [ ] Template message customization per dealership
  - [ ] Bulk Create Group for multiple rows
  - [ ] Integration with WhatsApp Business API (if upgrade needed for analytics)
- [ ] **Mobile App Parity**
  - [ ] Implement same feature in mobile app (if Service Advisor role exists there)

---

## Implementation Tracker

### Overall Progress
```
[████████████░░░░░░░░░░░░░░░░] 35% Complete
```

### Breakdown by Phase
| Phase | Status | Progress | ETA |
|-------|--------|----------|-----|
| Core Logic | ✅ Complete | 100% | Done |
| UI/UX | ✅ Complete | 100% | Done |
| Testing & Validation | ⏳ Pending | 0% | Start immediately |
| Config Integration | ⏳ Pending | 0% | After testing |
| UAT & Docs | ⏳ Pending | 0% | After config |
| Future Enhancements | 📋 Backlog | 0% | Post-launch |

---

## Configuration Examples

### Environment Variables Template
```bash
# .env.local (for local testing)
VITE_WA_GROUP_SA_PHONE=919876543210
VITE_WA_GROUP_SUPERADMIN_PHONE=919800000001
VITE_WA_GROUP_SA_PHONE_MAP=SA001:919600000001,SA002:919600000002,SA003:919600000003
VITE_WA_GROUP_NAME_PREFIX=Service Delivery
```

### SA Phone Map Format
```
Employee Code : Phone Number , Employee Code : Phone Number
SA001 : 91 9876543210 , SA002 : 91 9876543211
```

---

## Key Files Modified

| File | Change | Lines |
|------|--------|-------|
| `src/pages/ServiceAdvisorPage.tsx` | Added helpers + handler + button | 115-145, 151-157, 571-605, 1102-1107 |
| `src/App.css` | Updated td-save width, added tactions--stack | 360, 513 |

---

## Testing Checklist

### Unit Tests (If Needed)
- [ ] `normalizeWhatsAppPhone()` with 10 digits
- [ ] `normalizeWhatsAppPhone()` with 12 digits (91-prefixed)
- [ ] `normalizeWhatsAppPhone()` with invalid input
- [ ] `parsePhoneMap()` with valid CSV
- [ ] `parsePhoneMap()` with malformed CSV
- [ ] `getServiceTypeForMessage()` with draft value
- [ ] `getServiceTypeForMessage()` without draft
- [ ] `buildServiceCompleteMessage()` output format

### Integration Tests
- [ ] Env vars load correctly in dev
- [ ] Env vars load correctly in prod
- [ ] Button appears only when conditions are met
- [ ] Handler executes without crashing
- [ ] Clipboard receives correct data

### Manual Testing
- [ ] Mobile device (iOS) - WhatsApp app opens
- [ ] Mobile device (Android) - WhatsApp app opens
- [ ] Desktop (browser) - WhatsApp Web opens
- [ ] Missing phone numbers trigger error
- [ ] Custom service type in draft is used in message

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Invalid phone numbers passed | Medium | Validation in handler, error toast |
| Clipboard write fails on some browsers | Low | Fallback: still opens WhatsApp |
| WhatsApp not installed on user device | Low | User sees browser/app store hint from WhatsApp |
| Env vars missing in production | High | Provide clear docs, test in staging first |
| User cancels group creation | Low | Expected behavior, no side effects |

---

## Sign-Off & Approval

- [ ] Development Complete: ✅ 2026-06-05
- [ ] QA Testing: ⏳ Pending
- [ ] Product Approval: ⏳ Pending
- [ ] Deployment: ⏳ Pending

---

## Notes & Updates Log

### 2026-06-05 - Initial Implementation
- Core logic fully implemented and tested for compile errors
- UI buttons added to Service Advisor table
- All helpers type-safe and ready for testing
- Next: Local dev testing with real phone numbers

---

## Quick Start for Testing

```bash
# 1. Add to .env.local
VITE_WA_GROUP_SA_PHONE=919876543210
VITE_WA_GROUP_SUPERADMIN_PHONE=919800000001
VITE_WA_GROUP_SA_PHONE_MAP=SA001:919600000001
VITE_WA_GROUP_NAME_PREFIX=Service Delivery

# 2. Start dev server
npm run dev

# 3. Navigate to Service Advisor page
# 4. Click "Create Group" on any row
# 5. Verify clipboard & WhatsApp behavior
```

---

**Last Updated:** 2026-06-05  
**Last Updated By:** GitHub Copilot  
**Next Review:** After testing phase
