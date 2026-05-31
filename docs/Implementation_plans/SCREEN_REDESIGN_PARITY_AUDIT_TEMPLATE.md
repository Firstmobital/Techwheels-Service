# Screen Redesign Parity Audit Template

**Purpose:** Systematic verification framework to prevent design drift during mobile app screen redesign implementation.  
**Authority:** Locked to reference design bundle in `local_folder/Reference/MobileAppRedesignReference/.../design-refactor-bundle/`

---

## 1) Component-Level Styling Verification Grid

### Color & Gradients
- [ ] **Flat colors**: All color tokens from `tailwind.config.js` applied correctly (brand, pre, under, post, slate, etc.)
- [ ] **Gradients**: Any gradient backgrounds (e.g., estimate total box) use `linear-gradient()` with correct color mix
- [ ] **Color mixing**: CSS `color-mix(in oklch, ...)` effects replicated or approximated correctly
- [ ] **Text colors**: Text contrast and semantic colors (ink, ink-2, ink-3, ink-4) applied per reference
- [ ] **Background surfaces**: surface, surface-2, surface-3 used appropriately per hierarchy

### Typography & Spacing
- [ ] **Font weights**: Space Grotesk (display), Plus Jakarta Sans (UI) render with correct weights
- [ ] **Font sizes**: All text sizes match reference (headline h1/h2, body, label, mono, etc.)
- [ ] **Line height**: Proper line-height for readability (body ~1.5, labels ~1.4)
- [ ] **Letter spacing**: Uppercase labels use correct tracking (0.04em, 0.06em, 0.08em per reference)
- [ ] **Padding/margins**: Component spacing (12px, 14px, 16px, 18px base units) matches reference exactly

### Borders & Shadows
- [ ] **Border widths**: 1px, 1.5px, 2px borders used correctly per reference
- [ ] **Border radius**: Scale applied (xs=8px, sm=10px, md=14px, lg=18px, pill=999px)
- [ ] **Box shadows**: shadow-sm, shadow-md, shadow-lg, shadow-brand used with correct rgba values
- [ ] **Border colors**: line, line-strong, color-specific borders (brand-line, pre-line, etc.) match
- [ ] **Hover/active states**: Border and shadow changes on interaction match reference

### Component Anatomy
- [ ] **Icon sizing**: All icons match reference sizes (13px, 14px, 15px, 17px, 18px, 20px, 22px, etc.)
- [ ] **Icon stroke width**: 2, 2.5, 3 used correctly per reference icon definitions
- [ ] **Icon styling**: Icons centered, colored correctly, no emoji icons remain
- [ ] **Button sizing**: Primary buttons (52px height typical), secondary (44px), icon buttons (38px)
- [ ] **Form field sizing**: Input heights (44px minimum), select field heights, padding
- [ ] **Card structure**: Padding (var(--pad) = 16px typically), border, background, shadow

### Specific Component Patterns

#### Status Pill / Badge Component
- [ ] Color coding by status (post/under/pre/slate/violet/rose)
- [ ] Icon + text + right indicator (e.g., badge count)
- [ ] Dot indicator (color circle 4-8px)
- [ ] Font size, weight, padding correct

#### Stage Filter Strip / Stage Cards
- [ ] Horizontal scroll enabled
- [ ] Card sizing (116px width typical)
- [ ] Icon background (light surface-3 or solid based on state)
- [ ] Number display (text-xl or larger for counts)
- [ ] Label styling (all caps, smaller font)
- [ ] Border active/inactive states

#### Repair Stage Selector (Pre/Under/Post)
- [ ] Color mixing for soft backgrounds
- [ ] Border colors match stage color (orange, blue, emerald)
- [ ] Text colors (orange-700, blue-700, emerald-700)
- [ ] Number display styling
- [ ] "photos" label styling

#### Form Field / Input
- [ ] Border styling (1px solid)
- [ ] Placeholder text color (ink-3)
- [ ] Focus state styling
- [ ] Disabled state styling
- [ ] Label styling (11-12px, uppercase, tracking)
- [ ] Error state (red-200 border, red background)

#### Action Row / List Item Button
- [ ] Icon circle styling (36-40px diameter)
- [ ] Icon color (ink-3 inactive, brand/status-color active)
- [ ] Text styling (truncate, bold)
- [ ] Right indicator (chevron-right, check, spinner, status)
- [ ] Busy state (spinner animation)
- [ ] Done state (post-background, check icon white)

#### Submission Checklist Row
- [ ] Icon circle (22px diameter)
- [ ] Check/X icon (13px stroke 2.5)
- [ ] Icon color (post for done, pre for missing)
- [ ] Icon background (post-soft, pre-soft)
- [ ] Label text styling
- [ ] Status text (right aligned, color-coded)

---

## 2) Screen-Level Layout Verification

### Grid & Responsive Layout
- [ ] ScrollView padding and content-containerStyle consistent
- [ ] Flex layout proportions match (flex: 1, flex-shrink: 0)
- [ ] Card spacing consistent (mt-3 = 12px, mt-4 = 16px)
- [ ] Margins between major sections match reference
- [ ] Bottom padding for FAB/button zones (paddingBottom: 28-32px)

### Section Spacing & Gaps
- [ ] Gap between items (flex-row gap: 10-12px typical)
- [ ] Header-to-content margin
- [ ] Content-to-footer margin
- [ ] Card-to-card margin

### Overflow & Scrolling
- [ ] Horizontal scroll on strip components (overflowX: auto)
- [ ] Scrollbar hidden (scrollbarWidth: none)
- [ ] Snap behavior (if any) matches reference

### Modal / Overlay States
- [ ] Modal background opacity/color
- [ ] Modal timing and animations
- [ ] Input focus state overlay

---

## 3) Data Binding & Value Display Verification

### Computed Values
- [ ] Totals (parts, paint, labour, grand total) calculated correctly
- [ ] Counts (panels, photos per stage, estimate rows) rendered correctly
- [ ] Panel readiness logic (pre-repair OK, estimate OK) reflected in UI
- [ ] Status derivation (draft/submitted/approved/in_work/completed) colors UI correctly

### Conditional Rendering
- [ ] Empty states displayed (no panels, no estimate rows, no photos)
- [ ] Loading states (spinner, loading text)
- [ ] Error states (error message, retry button)
- [ ] Completion states (check mark, "uploaded" text)

### List Rendering
- [ ] Map iterations preserve key prop
- [ ] Filter logic matches reference (active/today/completed tabs)
- [ ] Sort order matches (none, alphabetical, count-based)

---

## 4) Interaction & Animation Verification

### Button States
- [ ] Primary button: full color, hover, disabled state visual difference
- [ ] Secondary button: outline or soft fill, states
- [ ] Ghost button: no fill, text-only, states
- [ ] Icon button: minimum 38px target

### Feedback
- [ ] Busy state spinner (animation-spin .7s)
- [ ] Press feedback (opacity, scale, or color change)
- [ ] Disabled state (opacity 0.5 or gray color)

### Animations
- [ ] Fade-in on component mount
- [ ] Slide-in for expanding sections
- [ ] Spinner rotation (smooth)
- [ ] No janky transitions

---

## 5) Accessibility & Semantics

- [ ] Text contrast ratios ≥ 4.5:1 for body text, ≥ 3:1 for headings
- [ ] Touch targets ≥ 44px minimum
- [ ] Color not used as sole indicator (icons + text)
- [ ] Form fields labeled appropriately
- [ ] Error messages clear and actionable

---

## 6) Screenshot Comparison (Device Validation)

### Checklist
- [ ] Header layout matches (title, icons, avatar)
- [ ] Search field styling and placeholder
- [ ] Filter strip appearance and spacing
- [ ] Card list item layout (JC#, reg, model, pipeline, metrics)
- [ ] Status pills colors and styling
- [ ] Icons rendering correctly (no emoji)
- [ ] Fonts visible (Space Grotesk headers, Plus Jakarta Sans body)
- [ ] Colors match design tokens (no washed-out or over-saturated)
- [ ] Buttons and CTAs look polished (no stretching, proper padding)

---

## 7) Common Drift Patterns to Avoid

1. **Color Token Misuse**: Using hardcoded hex instead of design tokens (var(--brand), var(--pre), etc.)
2. **Missing Gradients**: Flat colors used instead of reference gradients
3. **Border/Shadow Omission**: Removing box-shadows or border styles to simplify
4. **Icon Sizing Inconsistency**: Icons too large or too small (off by 2-4px)
5. **Spacing Drift**: Padding/margin using non-standard values (15px, 13px instead of 12px, 14px)
6. **Typography Mismatch**: Wrong font weights or incorrect letter-spacing
7. **Disabled State Invisibility**: Disabled buttons not visually distinct
8. **Hover States Missing**: No visual feedback on interactive elements
9. **Accessibility Shortcuts**: Contrast too low, touch targets too small
10. **Data Value Format Mismatch**: Currency not formatted correctly, counts missing "pluralization"

---

## 8) Verification Checklist per Screen

Use this matrix to track which sections of each screen pass parity audit:

| Component | Estimate | Damage | Submit | Notes |
|-----------|----------|--------|--------|-------|
| Estimate Total Box | [ ] | N/A | N/A | Gradient, color mix |
| Panel Readiness | [ ] | N/A | N/A | Pills, semantic colors |
| Repair Stage Cards | N/A | [ ] | N/A | Color mix, borders |
| Pre-Repair Uploads | N/A | [ ] | N/A | Icon styling |
| Submission Checklist | N/A | N/A | [ ] | Icons, circles, status |
| Action Rows | N/A | N/A | [ ] | Icon circles, chevrons |
| Status Bar (dark) | N/A | N/A | [ ] | Gradient, spacing |

---

## 9) Fix Workflow

1. Identify failing component using checklist above
2. Compare reference code (bp-core.jsx / bp-more.jsx) line-by-line
3. Extract exact styling (colors, sizes, spacing, effects)
4. Implement in React Native / Tailwind equivalent
5. Take screenshot and compare side-by-side
6. Update checklist with PASS/FAIL status
7. Move to next component

---

## 10) Sign-Off Criteria

Screen redesign is production-ready only when:

- ✅ All component checklist items checked
- ✅ Layout verification passed
- ✅ Data binding correct
- ✅ Screenshot comparison shows parity
- ✅ Device TestFlight screenshots match reference
- ✅ No common drift patterns detected
- ✅ Tracker documentation updated with audit results and timestamp

---

## 11) Current Audit Snapshot (2026-05-31)

Use this snapshot as the active benchmark for the current redesign pass.

| Screen | Overall Verdict | Top Failing Areas | Required Action |
|---|---|---|---|
| Dashboard (`bp`) | FAIL | Card anatomy, icon container treatment, spacing rhythm, rail/detail density | Normalize shared card primitives and restyle dashboard cards/metrics to reference |
| Job Card (`jobcard`) | FAIL | Header hierarchy, tab card dimensions, field shell/label styling | Rebuild section shell and form field visual grammar using reference token scale |
| Damage (`damage`) | FAIL | Affected panel chips, repair-stage cards, upload row anatomy, CTA block | Align chips/cards/rows to reference component anatomy and stage semantics |
| Estimate (`estimate`) | FAIL | Estimate total hero, inset amount cards, panel readiness area, summary cadence | Implement exact hero structure and spacing/token parity |
| Submit (`submit`) | FAIL | Checklist icon circles, action row icon treatment, disabled state semantics | Implement checklist/action-row primitives and strict disabled/warning styles |

### 11.1 Gate Rule for This Tracker Cycle

1. Do not mark any BP screen as done until the screen has paired screenshots (reference + latest app capture).
2. Each screen must pass all four gates in MOBILE-009:
	- Design Gate
	- Data Gate
	- Flow Gate
	- Icon Gate
3. If one critical component fails (hero block, checklist, stage cards, tab rail), overall screen verdict remains FAIL.
4. Any prior "parity verified" note must be treated as stale if newer screenshot evidence shows drift.

### 11.2 Evidence Pack Minimum

For each screen audit, attach:

1. One full-screen reference image.
2. One full-screen app image from latest OTA/build.
3. One zoomed crop for each critical component mismatch.
4. A one-line pass/fail decision per component in Section 8 matrix.
