# Implementation Execution Checklist

**Project:** Complaints Module | **Start Date:** 2026-06-09 | **Target Completion:** 2026-07-20

---

## PHASE 1: DATABASE SCHEMA & HELPERS
**Duration:** Week 1 | **Owner:** Backend | **Status:** 🔴 Not Started

### Pre-Migration Audit
- [ ] **1.1** Grep dump for `complaint_*` table names (verify no collisions)
  - Command: `grep -i "CREATE TABLE.*complaint" local_folder/backups/chunks/full_database.sql.part_*`
  - Expected: 0 matches
  - Document: `_audit_results.txt`

- [ ] **1.2** Grep dump for `my_employee_code` function (verify missing)
  - Command: `grep -i "CREATE FUNCTION.*my_employee_code" local_folder/backups/chunks/full_database.sql.part_*`
  - Expected: 0 matches
  - If found: adjust plan §5.1

- [ ] **1.3** Confirm `user_employee_links` schema
  - Columns: employee_code, is_primary, is_active, deleted_at (verify existence)
  - Query: `SELECT column_name FROM information_schema.columns WHERE table_name='user_employee_links'`
  - Document: `_schema_audit.md`

- [ ] **1.4** Verify existing helpers present
  - `my_dealer_code()` ✓
  - `is_admin()` ✓
  - `has_module_view()` ✓
  - `has_module_modify()` ✓
  - `has_module_delete()` ✓
  - Document any differences in behavior

### Migration Creation
- [ ] **2.1** Create file: `supabase/migrations/20260609120000_create_complaints_tables.sql`
  - [ ] complaint_sla_policies table
  - [ ] complaint_tickets table (with all columns per §4.1.2)
  - [ ] complaint_access_links table
  - [ ] complaint_messages table
  - [ ] complaint_activity table
  - [ ] complaint_attachments table
  - [ ] Add indexes (ix_ct_entry, ix_ct_status, ix_ct_sa, ix_ct_branch, ix_cm_complaint, ix_ca_complaint)
  - [ ] Add UNIQUE constraints (UNIQUE(dealer_code, ticket_number), UNIQUE(reception_entry_id) on links)
  - [ ] Verify DDL per §4.1

- [ ] **2.2** Create file: `supabase/migrations/20260609130000_register_complaints_module.sql`
  - [ ] INSERT INTO modules (name='complaints', label='Complaints', icon='message-warning', route='/complaints')
  - [ ] Backfill user_module_permissions (check existing pattern)
  - [ ] Use ON CONFLICT DO NOTHING
  - [ ] Document permission logic (admin/manager/viewer mapping)

- [ ] **2.3** Create file: `supabase/migrations/20260609140000_create_my_employee_code_helper.sql`
  - [ ] Function signature per §5.1
  - [ ] SECURITY: STABLE language
  - [ ] GRANT to authenticated + service_role
  - [ ] Test: SELECT public.my_employee_code() returns correct employee_code

- [ ] **2.4** Create file: `supabase/migrations/20260609150000_seed_complaint_sla_policies.sql`
  - [ ] Urgent: 60 / 480
  - [ ] High: 240 / 1440
  - [ ] Medium: 480 / 2880
  - [ ] Low: 1440 / 5760
  - [ ] Use ON CONFLICT DO NOTHING

### RLS Enablement
- [ ] **3.1** Create file: `supabase/migrations/20260609160000_enable_complaint_rls.sql`
  - [ ] ALTER TABLE public.complaint_tickets ENABLE ROW LEVEL SECURITY
  - [ ] ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY
  - [ ] ALTER TABLE public.complaint_activity ENABLE ROW LEVEL SECURITY
  - [ ] ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY
  - [ ] ALTER TABLE public.complaint_access_links ENABLE ROW LEVEL SECURITY
  - [ ] ALTER TABLE public.complaint_sla_policies ENABLE ROW LEVEL SECURITY
  - [ ] Create SELECT/UPDATE/DELETE policies (per §7)
  - [ ] Verify policies in information_schema.table_constraints

### Testing & Acceptance
- [ ] **4.1** Apply migrations in order
  - [ ] supabase migration up (or equivalent)
  - [ ] Check for errors: `supabase migration status`

- [ ] **4.2** Verify schema created
  - [ ] Query: `SELECT tablename FROM pg_tables WHERE tablename LIKE 'complaint_%'`
  - [ ] Expect 6 tables

- [ ] **4.3** Verify module registered
  - [ ] Query: `SELECT * FROM public.modules WHERE name='complaints'`
  - [ ] Expect 1 row with route='/complaints'

- [ ] **4.4** Verify permissions backfilled
  - [ ] Query: `SELECT COUNT(*) FROM public.user_module_permissions WHERE module_id=(SELECT id FROM public.modules WHERE name='complaints')`
  - [ ] Expect count > 0

- [ ] **4.5** Verify helper function
  - [ ] Query: `SELECT public.my_employee_code()`
  - [ ] Expect: employee_code or NULL (no error)

- [ ] **4.6** Verify SLA policies seeded
  - [ ] Query: `SELECT COUNT(*) FROM public.complaint_sla_policies`
  - [ ] Expect: ≥ 4 rows (urgent, high, medium, low)

- [ ] **4.7** Verify RLS enabled
  - [ ] Query: `SELECT tablename FROM pg_tables WHERE tablename LIKE 'complaint_%' AND rowsecurity = true`
  - [ ] Expect: 6 tables with rowsecurity=true

**Phase 1 Sign-Off:** All tests pass, no warnings, ready for Phase 2

---

## PHASE 2: TRIGGERS & RPC LAYER
**Duration:** Week 1–2 | **Owner:** Backend | **Status:** 🔴 Not Started

### Trigger Functions
- [ ] **1.1** Create file: `supabase/migrations/20260610100000_create_complaint_triggers.sql`
  - [ ] `trg_ct_ticket_number_fn()` (BEFORE INSERT, generates CMP-...)
    - [ ] Test: INSERT ticket, verify ticket_number format
  - [ ] `trg_ct_autoassign_fn()` (BEFORE INSERT, copies sa_employee_code + resolves assigned_to)
    - [ ] Test: INSERT ticket with reception_entry_id, verify assigned_to user_id populated
  - [ ] `trg_ct_sla_fn()` (BEFORE INSERT + BEFORE UPDATE OF priority)
    - [ ] Test: INSERT ticket with priority=urgent, verify response_due_at = now() + 60min
  - [ ] `trg_ct_touch_fn()` (BEFORE UPDATE, updates updated_at)
    - [ ] Test: UPDATE ticket, verify updated_at > created_at
  - [ ] `trg_ct_history_fn()` (AFTER UPDATE, writes activity + stamps milestones)
    - [ ] Test: UPDATE ticket status → acknowledged, verify first_response_at stamped
    - [ ] Test: UPDATE ticket status → resolved, verify resolved_at stamped
    - [ ] Test: Activity row created with event_type=status_change

### Anon RPCs
- [ ] **2.1** Create file: `supabase/migrations/20260611100000_create_complaint_anon_rpcs.sql`
  - [ ] `get_complaint_by_token(p_token)` (SECURITY DEFINER)
    - [ ] Test: Call with valid token, expect ticket data + entry_summary
    - [ ] Test: Call on new entry, expect mode='raise'
    - [ ] Test: Call after raise, expect mode='view' + messages + activity
    - [ ] Test: Verify is_internal messages NOT returned
    - [ ] Test: Verify view_count incremented
    - [ ] GRANT EXECUTE TO anon

  - [ ] `raise_complaint(p_token, p_category, ...)` (SECURITY DEFINER, single-use)
    - [ ] Test: Call with active link, expect ticket created + link consumed
    - [ ] Test: Call again with same token, expect error "already used"
    - [ ] Test: Verify link.status='consumed' after first raise
    - [ ] Test: Verify complaint_messages row created with customer message
    - [ ] Test: Verify complaint_activity row created with event_type='raised'
    - [ ] GRANT EXECUTE TO anon

  - [ ] `add_customer_message(p_token, p_body)` (SECURITY DEFINER)
    - [ ] Test: Call with valid token, expect message added to thread
    - [ ] Test: Verify is_internal=false (never true for customer)
    - [ ] GRANT EXECUTE TO anon

  - [ ] `submit_csat(p_token, p_rating, p_comment)` (SECURITY DEFINER)
    - [ ] Test: Call with valid token, expect csat_rating + csat_comment + csat_at updated
    - [ ] Test: Verify activity row created with event_type='csat'
    - [ ] GRANT EXECUTE TO anon

  - [ ] `reopen_complaint(p_token, p_reason)` (SECURITY DEFINER)
    - [ ] Test: Call on resolved ticket, expect status='reopened'
    - [ ] Test: Verify is_escalated=true + escalated_at stamped
    - [ ] Test: Verify resolution_due_at recalculated
    - [ ] Test: Verify activity row created with event_type='reopened'
    - [ ] GRANT EXECUTE TO anon

### Staff RPCs
- [ ] **3.1** Create file: `supabase/migrations/20260611120000_create_complaint_staff_rpcs.sql`
  - [ ] `acknowledge(p_complaint_id)` 
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call updates status → acknowledged
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `start_progress(p_complaint_id)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call updates status → in_progress
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `resolve(p_complaint_id)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call updates status → resolved + stamps resolved_at
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `close(p_complaint_id)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call updates status → closed + stamps closed_at
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `set_priority(p_complaint_id, p_priority)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call recalculates response_due_at + resolution_due_at
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `reassign(p_complaint_id, p_assigned_to_user_id)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call updates assigned_to + writes activity
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `escalate(p_complaint_id, p_reason)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call sets is_escalated=true + escalated_at + reason
    - [ ] GRANT EXECUTE TO authenticated

  - [ ] `add_staff_message(p_complaint_id, p_body, p_is_internal)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call with is_internal=true, verify internal note NOT returned by anon RPC
    - [ ] Test: Call with is_internal=false, verify visible to anon in get_complaint_by_token
    - [ ] GRANT EXECUTE TO authenticated

### Utility RPCs
- [ ] **4.1** Create file: `supabase/migrations/20260611130000_create_complaint_utilities.sql`
  - [ ] `generate_complaint_link(p_reception_entry_id)`
    - [ ] Check: has_module_modify('complaints') required
    - [ ] Test: Call returns token + url (https://tw.care/c/{token})
    - [ ] Test: Verify complaint_access_links row created with status='active'
    - [ ] GRANT EXECUTE TO authenticated

### Background Job
- [ ] **5.1** Create file: `supabase/migrations/20260612100000_create_complaint_sla_breach_job.sql`
  - [ ] `check_complaint_sla_breaches()` function
    - [ ] Test: Manually call function
    - [ ] Test: Verify response_breached set to true if now() > response_due_at + first_response_at IS NULL
    - [ ] Test: Verify resolution_breached set to true if now() > resolution_due_at + status NOT IN (resolved,closed)
    - [ ] Test: Verify is_escalated set to true for breached tickets
  - [ ] Schedule via pg_cron: every 15 minutes
    - [ ] Command: `SELECT cron.schedule('complaint-sla-breaches', '*/15 * * * *', 'SELECT check_complaint_sla_breaches()')`

### pgTAP Unit Tests
- [ ] **6.1** Create file: `supabase/sql_checks/test__complaints_single_use.sql`
  - Test: raise_complaint() rejects if link.status != 'active'
  - Test: second call on consumed link errors
  - Expected: ✅ All pass

- [ ] **6.2** Create file: `supabase/sql_checks/test__complaints_tenant_isolation.sql`
  - Test: User from dealer A cannot see tickets from dealer B
  - Test: my_dealer_code() filters correctly in RLS policies
  - Expected: ✅ All pass

- [ ] **6.3** Create file: `supabase/sql_checks/test__complaints_internal_notes.sql`
  - Test: get_complaint_by_token() never returns is_internal=true messages
  - Test: Staff RPC add_staff_message() with is_internal=true is stored but not leaked to anon
  - Expected: ✅ All pass

- [ ] **6.4** Create file: `supabase/sql_checks/test__complaints_sla_breach.sql`
  - Test: check_complaint_sla_breaches() sets response_breached=true correctly
  - Test: check_complaint_sla_breaches() sets resolution_breached=true correctly
  - Test: Auto-escalation sets is_escalated=true on breach
  - Expected: ✅ All pass

- [ ] **6.5** Create file: `supabase/sql_checks/test__complaints_rbac.sql`
  - Test: Advisor sees only own sa_employee_code rows (RLS enforced)
  - Test: Manager sees own dealer + branch rows
  - Test: Admin sees all rows
  - Test: Viewer can read but not modify
  - Expected: ✅ All pass

### Testing & Acceptance
- [ ] **7.1** Run all migrations
  - [ ] supabase migration up
  - [ ] Check: no errors, all migrations applied

- [ ] **7.2** Run pgTAP tests
  - [ ] `supabase test db` (or equivalent)
  - [ ] Check: all 5 test suites pass (0 failures)
  - [ ] Document: test results summary

- [ ] **7.3** Verify anon RPC permission grants
  - [ ] Query: `SELECT grantee, privilege_type FROM information_schema.role_usage WHERE routine_name LIKE 'get_complaint_by_token'`
  - [ ] Expect: anon role with EXECUTE

- [ ] **7.4** Verify staff RPC permission grants
  - [ ] Query: `SELECT grantee, privilege_type FROM information_schema.role_usage WHERE routine_name LIKE 'acknowledge'`
  - [ ] Expect: authenticated role with EXECUTE

- [ ] **7.5** Verify SLA breach sweep scheduled
  - [ ] Query: `SELECT * FROM cron.job WHERE jobname LIKE '%complaint%'`
  - [ ] Expect: 1 row, schedule='*/15 * * * *'

**Phase 2 Sign-Off:** All RPCs callable, pgTAP tests pass, single-use guarantee verified, ready for Phase 3

---

## PHASE 3: CUSTOMER PORTAL
**Duration:** Week 2–3 | **Owner:** Frontend | **Status:** 🔴 Not Started

### API Layer
- [ ] **1.1** Create file: `src/lib/api/complaints.ts`
  - [ ] `getComplaintByToken(token)`
  - [ ] `raiseComplaint(token, category, title, ...)`
  - [ ] `addCustomerMessage(token, body)`
  - [ ] `submitCsat(token, rating, comment)`
  - [ ] `reopenComplaint(token, reason)`
  - [ ] Update `src/lib/api/index.ts` to export complaints module
  - [ ] Verify types generated: `npm run types:generate`

### Route & Layout
- [ ] **2.1** Create file: `src/pages/ComplaintPortal.tsx`
  - [ ] Route: `/c/:token` (public, no auth required)
  - [ ] Extract token from URL params
  - [ ] On mount: call getComplaintByToken()
  - [ ] State management (loading, error, data)

### Components
- [ ] **3.1** Create file: `src/components/complaints/ComplaintForm.tsx`
  - [ ] Form fields: category, title, description, severity, customer_name, customer_phone
  - [ ] Validation: title required, description required, phone format
  - [ ] Submit button + loading state
  - [ ] Error display

- [ ] **3.2** Create file: `src/components/complaints/StatusStepper.tsx`
  - [ ] Render status progression (new → acknowledged → in_progress → resolved → closed)
  - [ ] Highlight current status
  - [ ] Show reopened state if applicable

- [ ] **3.3** Create file: `src/components/complaints/SLARing.tsx`
  - [ ] Circular progress indicator
  - [ ] Show response SLA + resolution SLA
  - [ ] Color: green (ok), yellow (warning), red (breached)
  - [ ] Display remaining time (hours:minutes)

- [ ] **3.4** Create file: `src/components/complaints/ConversationThread.tsx`
  - [ ] Render messages in chronological order
  - [ ] Customer messages (left-align, blue, avatar)
  - [ ] Staff messages (right-align, gray, avatar)
  - [ ] Timestamps
  - [ ] Hide is_internal messages
  - [ ] Reply box (text input + send button)

- [ ] **3.5** Create file: `src/components/complaints/CSATStars.tsx`
  - [ ] 5-star rating selector (interactive)
  - [ ] Comment textarea (optional)
  - [ ] Submit button
  - [ ] Show submitted confirmation

- [ ] **3.6** Create file: `src/components/complaints/VehicleCard.tsx`
  - [ ] Display: reg_number, model, service_type, branch
  - [ ] Simple card layout

### Screens
- [ ] **4.1** Implement Raise Screen
  - [ ] Show form (ComplaintForm component)
  - [ ] Submit button → calls raiseComplaint()
  - [ ] Loading state
  - [ ] Error display
  - [ ] Success → redirect to Track

- [ ] **4.2** Implement Track Screen
  - [ ] Show VehicleCard
  - [ ] Show StatusStepper (current status)
  - [ ] Show SLARing (response + resolution)
  - [ ] Show ConversationThread
  - [ ] Show assigned advisor name
  - [ ] If resolved: show CSATStars
  - [ ] If resolved: show "Reopen" link

- [ ] **4.3** Implement Reopened Screen
  - [ ] Show confirmation message
  - [ ] Show "escalated to manager" note
  - [ ] Redirect to Track view

### Styling
- [ ] **5.1** Update `src/index.css`
  - [ ] Add stepper component CSS
  - [ ] Add SLA ring component CSS
  - [ ] Add thread/message CSS
  - [ ] Mobile-first breakpoints

- [ ] **5.2** Update `src/App.css`
  - [ ] Add complaint-specific component styles
  - [ ] Reuse existing tokens (--accent, --ink, --canvas)
  - [ ] Verify responsive on iPhone 12/14

### Testing & Acceptance
- [ ] **6.1** Functional test: Raise flow
  - [ ] Open `/c/{valid_token}`
  - [ ] See raise form
  - [ ] Fill form (category=service_quality, title=..., etc.)
  - [ ] Submit
  - [ ] Verify ticket created (check DB)
  - [ ] Verify link status=consumed
  - [ ] Verify redirects to track view

- [ ] **6.2** Functional test: Track flow
  - [ ] Reopen same link
  - [ ] See track screen (status=new, SLA timers, empty thread)
  - [ ] Add customer message
  - [ ] Verify message appears in thread (via DB or refresh)

- [ ] **6.3** Functional test: CSAT flow
  - [ ] Mark ticket resolved (via DB or staff RPC)
  - [ ] Reopen customer link
  - [ ] See CSAT stars
  - [ ] Submit rating (3/5 + comment)
  - [ ] Verify csat_rating + csat_comment saved

- [ ] **6.4** Functional test: Reopen flow
  - [ ] Mark ticket closed (via DB)
  - [ ] Reopen customer link
  - [ ] See "Reopen" button
  - [ ] Click reopen
  - [ ] Verify status → reopened
  - [ ] Verify is_escalated=true
  - [ ] Verify reopened_at stamped

- [ ] **6.5** Design verification
  - [ ] Compare screens vs. `Complaint Customer Portal.html`
  - [ ] Check copy (wording, tone)
  - [ ] Check layout (mobile-first, spacing)
  - [ ] Check colors (match design tokens)

**Phase 3 Sign-Off:** All screens functional, E2E flow works, design HTML matching verified, ready for Phase 4

---

## PHASE 4: STAFF MODULE
**Duration:** Week 3–4 | **Owner:** Frontend | **Status:** 🔴 Not Started

### Main Page
- [ ] **1.1** Create file: `src/pages/ComplaintsPage.tsx`
  - [ ] Permission gate: useModulePermission('complaints', 'view')
  - [ ] Render access-denied if no permission
  - [ ] Tab layout (Inbox | Board | SLA)
  - [ ] KPI row: open_count, avg_csat, sla_attainment, overdue_count
  - [ ] Global filters (status, priority, branch, assigned_to, date_range)

### Inbox Tab
- [ ] **2.1** Create file: `src/components/complaints/ComplaintInbox.tsx`
  - [ ] Table columns: ticket_number, customer, category, priority, status, sla_status, age, unread
  - [ ] Sortable headers
  - [ ] Clickable rows (open detail)
  - [ ] Badge for unread tickets
  - [ ] Pagination
  - [ ] Filters applied (status, priority, branch, etc.)

- [ ] **2.2** Create file: `src/components/complaints/ComplaintDetail.tsx`
  - [ ] Left panel (ticket header, vehicle, thread, activity)
  - [ ] Right panel (properties, action buttons)
  - [ ] Thread shows messages (staff + customer, hide is_internal from view mode)
  - [ ] Add reply box (staff only)
  - [ ] Activity timeline

### Board Tab
- [ ] **3.1** Create file: `src/components/complaints/ComplaintBoard.tsx`
  - [ ] Columns: new | acknowledged | in_progress | resolved | closed | reopened
  - [ ] Drag-drop to move ticket between statuses
  - [ ] On drop, call corresponding staff RPC (acknowledge, start_progress, resolve, close)
  - [ ] Cards show: ticket_number, customer, priority, sla_status
  - [ ] Click card to detail view

### SLA Breaches Tab
- [ ] **4.1** Create file: `src/components/complaints/ComplaintSLABreaches.tsx`
  - [ ] Table: breached tickets (response_breached OR resolution_breached = true)
  - [ ] Show auto-escalated flag
  - [ ] Quick actions: acknowledge, escalate

### Detail Panel
- [ ] **5.1** Implement left panel
  - [ ] Ticket header (ticket_number, status stepper, priority pill, SLA ring, age)
  - [ ] Vehicle card
  - [ ] Conversation thread (messages + internal notes visible to staff)
  - [ ] Add reply box (is_internal toggle)
  - [ ] Activity timeline (status changes, assignments, escalations)

- [ ] **5.2** Implement right panel
  - [ ] Properties: customer_name, phone, category, severity_self, created_at
  - [ ] Action buttons (visible only if can_modify):
    - [ ] acknowledge (if status=new)
    - [ ] start_progress (if status=acknowledged)
    - [ ] resolve (if status=in_progress)
    - [ ] close (if status=resolved)
    - [ ] set_priority (dropdown)
    - [ ] reassign (dropdown of staff)
    - [ ] escalate (button + reason input)
  - [ ] SLA targets display (response_mins, resolution_mins)
  - [ ] CSAT display (if submitted)

### Nav Integration
- [ ] **6.1** Update `src/components/TopNav.tsx`
  - [ ] Add Complaints nav item
  - [ ] Check module permission (only show if can_view)
  - [ ] Display open-count badge
  - [ ] Link to `/complaints`

### RBAC Enforcement
- [ ] **7.1** Verify advisor filtering
  - [ ] Advisor logs in
  - [ ] Sees only own sa_employee_code tickets (RLS enforced)
  - [ ] UI filters to own tickets
  - [ ] Cannot modify other advisor's tickets

- [ ] **7.2** Verify manager filtering
  - [ ] Manager logs in
  - [ ] Sees own branch tickets
  - [ ] Can modify all branch tickets
  - [ ] Cannot delete (if not admin)

- [ ] **7.3** Verify admin filtering
  - [ ] Admin logs in
  - [ ] Sees all tickets (all dealers/branches)
  - [ ] Can modify + delete all tickets

### Testing & Acceptance
- [ ] **8.1** Functional test: Inbox view
  - [ ] Open `/complaints`
  - [ ] See table with tickets
  - [ ] Filters work (status=new shows only new tickets)
  - [ ] Sorting works (click column header)
  - [ ] Pagination works (navigate pages)

- [ ] **8.2** Functional test: Detail view
  - [ ] Click ticket → detail panel opens
  - [ ] Shows vehicle, thread, activity
  - [ ] Can add staff reply (visible to customer)
  - [ ] Can add internal note (not visible to customer)

- [ ] **8.3** Functional test: Actions
  - [ ] Acknowledge button → calls acknowledge() RPC → status changes → activity logged
  - [ ] Start progress button → calls start_progress() RPC
  - [ ] Resolve button → calls resolve() RPC → resolved_at stamped
  - [ ] Close button → calls close() RPC → closed_at stamped
  - [ ] Priority dropdown → calls set_priority() RPC → SLA recalculated
  - [ ] Reassign → calls reassign() RPC → assigned_to changed
  - [ ] Escalate → calls escalate() RPC → is_escalated=true

- [ ] **8.4** Functional test: Board view
  - [ ] See columns (new, acknowledged, in_progress, resolved, closed)
  - [ ] Drag ticket from new → acknowledged
  - [ ] Verify status changes + activity logged
  - [ ] Verify detail view updates

- [ ] **8.5** Functional test: SLA breaches
  - [ ] Mark ticket with response_breached=true (via DB)
  - [ ] Open SLA tab
  - [ ] See breached ticket listed
  - [ ] Show auto-escalated flag

- [ ] **8.6** Design verification
  - [ ] Compare screens vs. `Complaint Module (Staff).html`
  - [ ] Check inbox layout (table, filters, sorting)
  - [ ] Check board layout (kanban columns)
  - [ ] Check detail view (2-column layout, thread, actions)
  - [ ] Check colors (match design tokens)

**Phase 4 Sign-Off:** Staff module fully functional, RBAC enforced, design HTML matching verified, ready for Phase 5

---

## PHASE 5: NOTIFICATIONS & POLISH
**Duration:** Week 4–5 | **Owner:** Backend + Frontend | **Status:** 🔴 Not Started

### Notification Outbox
- [ ] **1.1** Create file: `supabase/migrations/20260618100000_create_complaint_notifications.sql`
  - [ ] complaint_notifications outbox table (or extend email_logs)
  - [ ] Columns: id, complaint_id, event_type, recipient_type, recipient_address, message_type, status, created_at, sent_at
  - [ ] Seed trigger events:
    - [ ] 'raised' → customer SMS
    - [ ] 'status_changed' → customer SMS (if staff reply)
    - [ ] 'sla_breached' → staff email (manager + advisor)
    - [ ] 'escalated' → staff email
    - [ ] 'resolved' → customer SMS (rate us)
    - [ ] 'reopened' → staff email

### Reports
- [ ] **2.1** Create file: `src/pages/reports/ComplaintsReport.tsx`
  - [ ] Complaints by category (pie chart)
  - [ ] Complaints by branch (bar chart)
  - [ ] Complaints by assigned advisor (bar chart)
  - [ ] Average CSAT by branch
  - [ ] SLA attainment % (response + resolution)
  - [ ] Trend: complaints/day over last 30 days
  - [ ] Date range filter

### Design & CSS Polish
- [ ] **3.1** Update `src/index.css`
  - [ ] Add .stepper component (complete styling)
  - [ ] Add .sla-ring component (complete styling)
  - [ ] Add .thread component (message layout)
  - [ ] Add .board component (kanban styling)
  - [ ] Verify responsive on all breakpoints

- [ ] **3.2** Update `src/App.css`
  - [ ] Add complaint-specific component styles
  - [ ] Verify all tokens reused (no duplicates)
  - [ ] Mobile-first media queries

### Full E2E Testing
- [ ] **4.1** Customer E2E: Raise → Track → Reopen
  - [ ] [ ] Mint link for reception entry (via staff)
  - [ ] [ ] Open link, see raise mode
  - [ ] [ ] Submit form (category=service_quality, title="AC issue", description=..., phone=9829XXXX21)
  - [ ] [ ] Link now shows view mode
  - [ ] [ ] Staff acknowledges (via staff RPC)
  - [ ] [ ] Customer sees status=acknowledged
  - [ ] [ ] Staff adds reply (visible to customer)
  - [ ] [ ] Customer adds reply (visible to staff)
  - [ ] [ ] Staff marks in progress
  - [ ] [ ] Staff marks resolved
  - [ ] [ ] Customer sees CSAT stars
  - [ ] [ ] Customer submits rating (4/5)
  - [ ] [ ] Staff can see csat_rating in detail view
  - [ ] [ ] Customer clicks reopen
  - [ ] [ ] Staff sees is_escalated=true + escalated_at
  - [ ] [ ] Verify all screens match `Complaint Customer Portal.html`

- [ ] **4.2** Staff E2E: Inbox → Detail → Actions
  - [ ] [ ] Manager logs in
  - [ ] [ ] Opens Complaints module
  - [ ] [ ] Sees KPI row (open_count, avg_csat, sla_attainment, overdue)
  - [ ] [ ] Filters by status=new
  - [ ] [ ] Sees new tickets in inbox
  - [ ] [ ] Clicks ticket → detail panel opens
  - [ ] [ ] Shows vehicle card, status stepper, SLA ring, thread
  - [ ] [ ] Acknowledges (button → RPC → status changes)
  - [ ] [ ] Adds staff reply (visible to customer)
  - [ ] [ ] Marks in progress
  - [ ] [ ] Marks resolved
  - [ ] [ ] Customer sees status=resolved
  - [ ] [ ] Board view shows ticket in resolved column
  - [ ] [ ] SLA breaches tab shows any breached tickets
  - [ ] [ ] Reassign to different advisor (button → RPC)
  - [ ] [ ] Verify all screens match `Complaint Module (Staff).html`

### Documentation
- [ ] **5.1** Create file: `docs/Implementation_plans/complaints/DEPLOYMENT.md`
  - [ ] Pre-deployment checklist
  - [ ] Rollback plan
  - [ ] Monitoring & alerts
  - [ ] Performance baseline

- [ ] **5.2** Create file: `docs/Implementation_plans/complaints/TROUBLESHOOTING.md`
  - [ ] Common issues + solutions
  - [ ] Debug procedures
  - [ ] Contact info

- [ ] **5.3** Update `README.md`
  - [ ] Add Complaints module overview
  - [ ] Link to documentation

### Final Testing & Sign-Off
- [ ] **6.1** Security audit
  - [ ] Cross-tenant data isolation verified (no data leaks)
  - [ ] RLS policies enforced (advisor scope, dealer scope)
  - [ ] Internal notes never exposed to anon
  - [ ] Token handling secure (128-bit, hash-at-rest optional)
  - [ ] Single-use raise guarantee verified

- [ ] **6.2** Performance testing
  - [ ] 100+ tickets loaded (response < 500ms)
  - [ ] 1000+ messages in thread (load test)
  - [ ] SLA breach sweep under load (100 concurrent tickets)
  - [ ] No N+1 queries in API layer

- [ ] **6.3** Staging environment E2E
  - [ ] All migrations apply
  - [ ] All RPCs callable
  - [ ] Customer portal functional
  - [ ] Staff module functional
  - [ ] Design HTML files match 1:1

- [ ] **6.4** Production deployment prep
  - [ ] Backup database
  - [ ] Backup procedures documented
  - [ ] Rollback procedures tested
  - [ ] Monitoring dashboards configured
  - [ ] Alert rules configured

**Phase 5 Sign-Off:** All tests pass, production deployment ready, all documentation complete

---

## DAILY STAND-UP TEMPLATE

**Date:** ________ | **Phase:** ________ | **Sprint:** ________

### Completed Today
- [ ] Task 1: ...
- [ ] Task 2: ...

### Blockers
- [ ] Issue: ... | Resolution: ...

### Next (Tomorrow)
- [ ] Task: ...

### Risk/Notes
- Note: ...

---

## APPROVAL GATES (Sign-Off Required)

### Phase 1 Sign-Off
- **Lead:** Backend | **Date:** ________ | **Approved:** ____
- All migrations applied, no schema collisions, RLS enabled

### Phase 2 Sign-Off
- **Lead:** Backend | **Date:** ________ | **Approved:** ____
- All RPCs working, pgTAP tests pass, single-use guarantee verified

### Phase 3 Sign-Off
- **Lead:** Frontend | **Date:** ________ | **Approved:** ____
- Customer portal functional, E2E flow works, design HTML matching

### Phase 4 Sign-Off
- **Lead:** Frontend | **Date:** ________ | **Approved:** ____
- Staff module functional, RBAC enforced, design HTML matching

### Phase 5 Sign-Off
- **Lead:** QA + DevOps | **Date:** ________ | **Approved:** ____
- All tests pass, security audit clear, production deployment ready

**Final Go/No-Go:** ________ | **Deployed:** ________

---

**Document Version:** v1.0 | **Last Updated:** 2026-06-08
