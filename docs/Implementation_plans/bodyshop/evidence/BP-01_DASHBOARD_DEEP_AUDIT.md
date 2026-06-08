# BP-01 Dashboard Deep Audit Report
**Date:** 2026-05-31  
**Priority:** CRITICAL - Blocks all other screens  
**Status:** AUDIT COMPLETE - FIXES IN PROGRESS

---

## Executive Summary

Dashboard (autodoc.tsx) has **functional** icons but **styling gaps** preventing visual parity. Stage filter cards, job card bottom section, and semantic coloring all require refinement.

---

## Visual Parity Failures (vs. Reference Design)

### 1. Stage Filter Cards (Horizontal Scroll Section)
**Current State:** Icon backgrounds are plain white (#ffffff) with light grey fill  
**Reference State:** Icons inside colored semantic circles (pre=#fbefdd, under=#e9f0fd, post=#e4f4ec, slate=#f6f4ee)

**Failures:**
- [ ] Documentation card: Icon should have pre/orange background (#fbefdd) with orange icon (#c9751b)
- [ ] Estimate card: Icon should have under/blue background (#e9f0fd) with blue icon (#7048cf) 
- [ ] Pre-Submit card: Icon should have pre/orange background (#fbefdd) with orange icon (#c9751b)
- [ ] Post-Repair card: Icon should have under/blue background (#e9f0fd) with blue icon (#2f63cf)
- [ ] Intake card: Icon should have slate background (#f6f4ee) with slate icon (#6b6e78)

**Code Location:** [autodoc.tsx](mobile/src/app/(tabs)/autodoc.tsx#L540-L575) stage filter rendering

**Fix Required:**
```
const getStageIconBackground = (stage: string) => {
  // Map stage to semantic color background
}
const getStageIconColor = (stage: string) => {
  // Map stage to semantic icon color
}
```

---

### 2. Job Card Pipeline / Bottom Section
**Current State:** Icons rendering with hardcoded colors, proper layout  
**Reference State:** Icons with proper semantic coloring and spacing

**Checks:**
- [x] Layers icon + panel count - rendering
- [x] Camera icon + photo count - rendering  
- [x] Estimate amount (INR) - rendering
- [x] Action label + arrow - rendering

**Status:** ✅ PASSING (icons, layout, spacing match reference)

---

### 3. Card Typography & Spacing
**Current State:** Mostly correct, minor spacing gaps  
**Reference State:** Precise 12px/16px spacing, font weights match

**Issues Found:**
- [ ] JC number font: Should be JetBrains Mono, 14.5px, weight 700 ✅ Correct
- [ ] Reg/Model line: Should be 12.5px, weight 600 ✅ Correct
- [ ] Status pill sizing: Should be compact (sm variant) ✅ Correct
- [ ] Bottom icon row spacing: Should be 14px gap, currently 14px ✅ Correct

**Status:** ✅ PASSING

---

### 4. Segmented Control (Active/Today/Done Tabs)
**Current State:** Basic styling, functional tabs  
**Reference State:** Pill-style segmented control with smooth transitions

**Checks:**
- [x] Background color (#f6f4ee) - correct
- [x] Active tab background (#ffffff) - correct
- [x] Border styling - correct
- [x] Text colors - correct
- [x] Spacing - correct

**Status:** ✅ PASSING

---

### 5. Header Section (Module Title + Search)
**Current State:** Header renders correctly  
**Reference State:** Matches reference design

**Status:** ✅ PASSING

---

## Icon Rendering Issues

### Icon Names Mapping
All icons used in dashboard:
- `chevron-left` - Back button ✅
- `bell` - Notifications ✅
- `search` - Search icon ✅
- `layers` - Panel count icon ✅
- `camera` - Photo count icon ✅
- `arrow-right` - Action indicator ✅
- `chevron-right` - Stage card indicator ✅
- `x` - Clear filter ✅
- `presentation` - Post-Repair stage ✅
- `file-text` - Estimate stage ✅
- `truck` - Intake stage ✅
- `clipboard` - Pre-Submit stage ✅

**Status:** ✅ All icons exist in Icon.tsx wrapper

---

## Priority Fix Order

### Phase 1 - Critical (Blocks visual parity)
1. **Stage filter card icon backgrounds** - Add semantic color backgrounds to icon circles
2. **Stage filter label colors** - Match icon colors to stage semantic palette
3. **Verify all icons render on device** - Test on iOS/Android

### Phase 2 - Polish (After Phase 1 passes parity audit)
1. Card shadow refinements
2. Touch feedback/active states
3. Spacing micro-adjustments

---

## Reference Design Lock Points

**Source:** `design-refactor-bundle/reference-design/Techwheels Service Screens.html#bp-dashboard`

1. Stage cards 116px wide, 12px padding
2. Icon circles 30px diameter inside stage cards
3. Icon size 17px with semantic coloring
4. Number text 24px Space Grotesk weight 600
5. Label text 11px Plus Jakarta Sans weight 600 uppercase
6. Horizontal scroll with 10px gaps between cards

---

## Test Checklist

- [ ] Stage filter cards render with colored icon backgrounds
- [ ] All 5 stage cards (Documentation, Estimate, Pre-Submit, Post-Repair, Intake) have correct colors
- [ ] Job card bottom icons (layers, camera) render clearly
- [ ] Action labels and arrow render properly
- [ ] Status pills display correctly
- [ ] Search functionality works
- [ ] Segmented control tabs function correctly
- [ ] iOS screenshot matches reference
- [ ] Android screenshot matches reference

---

## Implementation Timeline

**Commit Pattern:**
1. `BP-01 audit: fix stage filter icon backgrounds and colors`
2. `BP-01 validation: screenshot parity check`
3. `OTA push: BP-01 dashboard corrections`

