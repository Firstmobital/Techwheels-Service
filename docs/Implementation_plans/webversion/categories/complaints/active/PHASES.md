# Phases & Implementation Timeline

**Total Duration:** 2–3 sprints (4–6 weeks)  
**Team:** Backend (DB), Frontend (React), QA (Testing)

---

## Phase 1: Database Schema & Helpers (Week 1)

### Deliverables
- ✅ Migration: 6 new tables + indexes
- ✅ Module registration & permissions backfill
- ✅ Helper function: `my_employee_code()`
- ✅ SLA policies seed
- ✅ RLS policies enabled on all tables
- ✅ Schema audit (no collisions with dump)

### Tasks

#### 1.1 Pre-Migration Audit
- [ ] Grep the authoritative dump for: `complaint_*`, `my_employee_code`
- [ ] Verify `user_employee_links` schema (columns: employee_code, is_primary, is_active, deleted_at)
- [ ] Confirm existing helpers present: `my_dealer_code()`, `is_admin()`, `has_module_view/modify/delete()`
- [ ] Document any schema differences vs. plan §4

#### 1.2 Create Migration File
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaints_tables.sql`

- Create 6 tables (complaint_sla_policies, complaint_tickets, complaint_access_links, complaint_messages, complaint_activity, complaint_attachments)
- Add indexes on foreign keys + frequently-filtered columns
- Enable RLS on all tables (RLS policies in separate migration or same file)

#### 1.3 Module Registration
**File:** `supabase/migrations/YYYYMMDDHHMMSS_register_complaints_module.sql`

- `INSERT INTO modules` (name='complaints', label='Complaints', icon='message-warning', route='/complaints')
- Backfill `user_module_permissions` for existing users

#### 1.4 Create Helper Function
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_my_employee_code_helper.sql`

- Create `public.my_employee_code()` function
- Grant to authenticated + service_role

#### 1.5 Seed SLA Policies
**File:** Same as 1.2 or separate migration

```sql
INSERT INTO complaint_sla_policies (dealer_code, priority, response_mins, resolution_mins)
VALUES 
  (my_dealer_code(), 'urgent', 60, 480),
  (my_dealer_code(), 'high', 240, 1440),
  (my_dealer_code(), 'medium', 480, 2880),
  (my_dealer_code(), 'low', 1440, 5760)
ON CONFLICT (dealer_code, priority) DO NOTHING;
```

#### 1.6 Enable RLS
- `ALTER TABLE public.complaint_* ENABLE ROW LEVEL SECURITY`
- Create SELECT/UPDATE/DELETE policies per table (see §7)

### Acceptance
- [ ] All migrations apply without error
- [ ] No schema name collisions in dump
- [ ] Module appears in `modules` table
- [ ] Permissions backfilled for 1+ user
- [ ] RLS enabled + policies in place
- [ ] `my_employee_code()` callable

---

## Phase 2: Triggers & RPC Layer (Week 1–2)

### Deliverables
- ✅ 5 triggers on complaint_tickets
- ✅ 5 anon RPCs (SECURITY DEFINER, GRANT to anon)
- ✅ 8 staff RPCs (SECURITY DEFINER, GRANT to authenticated)
- ✅ 1 utility RPC (generate_complaint_link)
- ✅ 1 background job (SLA breach sweep)
- ✅ pgTAP unit tests (single-use, tenant isolation, internal-note hiding, RLS, SLA breach)

### Tasks

#### 2.1 Create Trigger Functions
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaint_triggers.sql`

- `trg_ct_ticket_number_fn()` — auto-generate ticket number (CMP-FstMbl-FQ7-2627-XXXXXX)
- `trg_ct_autoassign_fn()` — copy sa_employee_code from entry, resolve assigned_to user ID
- `trg_ct_sla_fn()` — calculate response_due_at + resolution_due_at from SLA policies
- `trg_ct_touch_fn()` — update updated_at on every change
- `trg_ct_history_fn()` — write complaint_activity rows on status/assignment/escalation changes; stamp milestones

#### 2.2 Create Anon RPCs
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaint_anon_rpcs.sql`

- `get_complaint_by_token(p_token)` — fetch ticket + thread (no internal notes) + activity
- `raise_complaint(p_token, p_category, ...)` — create ticket, consume link, single-use guard
- `add_customer_message(p_token, p_body)` — append to thread
- `submit_csat(p_token, p_rating, p_comment)` — capture satisfaction rating
- `reopen_complaint(p_token, p_reason)` — reopen resolved ticket, escalate to manager

Each:
- `SECURITY DEFINER`
- `GRANT EXECUTE TO anon`
- Validates token, scopes to one complaint
- Never returns is_internal rows

#### 2.3 Create Staff RPCs
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaint_staff_rpcs.sql`

- `acknowledge(p_complaint_id)` — status → acknowledged
- `start_progress(p_complaint_id)` — status → in_progress
- `resolve(p_complaint_id)` — status → resolved
- `close(p_complaint_id)` — status → closed
- `set_priority(p_complaint_id, p_priority)` — change priority (recalc SLA due)
- `reassign(p_complaint_id, p_assigned_to_user_id)` — assign to different staff
- `escalate(p_complaint_id, p_reason)` — flag for manager escalation
- `add_staff_message(p_complaint_id, p_body, p_is_internal)` — add reply or internal note

Each:
- Checks `has_module_modify('complaints')` or `is_admin()`
- `GRANT EXECUTE TO authenticated`

#### 2.4 Create Utility RPC
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaint_utilities.sql`

- `generate_complaint_link(p_reception_entry_id)` — mint new token for a reception entry

#### 2.5 Create Background Job
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaint_sla_breach_job.sql`

- `check_complaint_sla_breaches()` — run every 15 min via pg_cron
- Marks response_breached + resolution_breached
- Auto-escalates breached tickets

#### 2.6 Write pgTAP Tests
**File:** `supabase/sql_checks/test__complaints.sql`

```sql
-- Test: single-use raise
SELECT * FROM pgTAP.test__raise_complaint_single_use();

-- Test: tenant isolation
SELECT * FROM pgTAP.test__complaint_tenant_isolation();

-- Test: internal notes hidden
SELECT * FROM pgTAP.test__internal_notes_hidden_from_customers();

-- Test: SLA breach detection
SELECT * FROM pgTAP.test__sla_breach_detection();

-- Test: RBAC
SELECT * FROM pgTAP.test__complaint_rbac();
```

### Acceptance
- [ ] All migrations apply
- [ ] Anon RPCs callable by anon role only
- [ ] Staff RPCs callable by authenticated users
- [ ] `raise_complaint()` rejects if link.status != 'active'
- [ ] `raise_complaint()` second call on consumed link errors
- [ ] `get_complaint_by_token()` never returns is_internal rows
- [ ] Triggers write activity + stamp milestones
- [ ] SLA breach sweep marks tickets + escalates
- [ ] pgTAP tests all pass (0 failures)
- [ ] RLS enforced in SQL unit tests

---

## Phase 3: Customer Portal (Week 2–3)

### Deliverables
- ✅ Public route `/c/:token` (no authentication)
- ✅ Screen states: Verify → Raise → Submitted → Track → Resolved+CSAT → Reopened
- ✅ Mobile-first, responsive design (matches `Complaint Customer Portal.html`)
- ✅ Fully functional raise → track → reopen E2E flow

### Tasks

#### 3.1 Create Public Route
**File:** `src/pages/ComplaintPortal.tsx`

- Route: `/c/:token` (accessible without login)
- Extract token from URL params
- On mount: call `getComplaintByToken(token)` (from API layer)

#### 3.2 Implement Screens

##### 3.2.1 Verify Screen (optional)
- Phone re-check (soft security)
- "Verify Your Identity" → proceed to raise

##### 3.2.2 Raise Form
- Category dropdown (service_quality, billing, delivery_delay, staff_behaviour, parts_spares, damage_during_service, cleanliness, other)
- Title text input
- Description textarea
- Severity dropdown (low, medium, high)
- Customer name + phone (pre-fill if available)
- Photo upload (attachment support)
- Submit button (calls `raiseComplaint()`)
- Error handling + loading state

##### 3.2.3 Submitted Screen
- Confirmation message
- "Your complaint has been received"
- Redirect to Track after 3s or click button

##### 3.2.4 Track Screen
- Vehicle card (reg, model, service type, branch)
- Status stepper (new → acknowledged → in_progress → resolved → closed)
- SLA ring (circular progress: response time left, resolution time left)
- Assigned advisor name + avatar
- Conversation thread (messages, timestamps, author names)
  - Customer messages (left-align, blue)
  - Staff messages (right-align, gray)
  - Internal notes NOT shown
- Reply box (customer can add messages)
  - Text input + send button
  - Calls `addCustomerMessage()`

##### 3.2.5 Resolved Screen
- Show "Your complaint has been resolved"
- CSAT stars (1–5 rating)
- Optional comment textarea
- Submit button (calls `submitCsat()`)
- "Reopen if not satisfied" link

##### 3.2.6 Reopened Screen
- Confirmation "Your ticket has been reopened and escalated to management"
- Return to Track view

#### 3.3 Implement Components
**Files:** `src/components/complaints/`

- `<ComplaintForm />` — raise form with validation
- `<StatusStepper />` — visual status progression
- `<SLARing />` — circular SLA progress indicator
- `<ConversationThread />` — message list + reply box
- `<CSATStars />` — 1–5 rating selector
- `<VehicleCard />` — vehicle info display

#### 3.4 API Layer Integration
**File:** `src/lib/api/complaints.ts` (see §9.2)

Export typed wrappers:
- `getComplaintByToken(token)`
- `raiseComplaint(token, category, title, ...)`
- `addCustomerMessage(token, body)`
- `submitCsat(token, rating, comment)`
- `reopenComplaint(token, reason)`

#### 3.5 Styling
**File:** `src/index.css` + `src/App.css`

- Reuse existing tokens: `--accent`, `--ink`, `--canvas`, radii, shadows
- Add new components: stepper, ring, thread layout
- Mobile-first responsive (match design HTML)

### Acceptance
- [ ] `/c/:token` route works
- [ ] Raise form validates & submits
- [ ] Link transitions from raise → view mode after submit
- [ ] Track screen shows live ticket data
- [ ] Messages append in real-time
- [ ] CSAT submission works
- [ ] Reopen button triggers escalation
- [ ] Mobile responsive on iPhone 12/14
- [ ] Design HTML file matching 1:1 (screens, copy, layout)
- [ ] E2E flow: mint link → open → raise → track → reopen completes

---

## Phase 4: Staff Module (Week 3–4)

### Deliverables
- ✅ Staff dashboard `/complaints` (authenticated, RBAC-gated)
- ✅ Inbox table view (tickets, filters, sorting)
- ✅ Kanban board (drag-drop by status)
- ✅ SLA breaches tab (highlighted, auto-escalated)
- ✅ Detail view (in-page panel or modal)
- ✅ Nav integration (Complaints link + open-count badge)
- ✅ RBAC enforced (view/modify/delete)

### Tasks

#### 4.1 Create ComplaintsPage
**File:** `src/pages/ComplaintsPage.tsx`

- Permission gate: `useModulePermission('complaints', 'view')`
- If no permission: render access-denied state
- Tab layout: Inbox | Board | SLA Breaches
- Global filters: Status, priority, branch, assigned_to, created_at range
- KPI row: open_count, avg_csat, sla_attainment, overdue_count

#### 4.2 Implement Inbox Tab
**Component:** `ComplaintInbox.tsx`

- Table columns: ticket_number, customer, category, priority, status, sla_status, age, unread
- Sortable headers
- Clickable rows (open detail)
- Pagination or virtual scroll (large datasets)
- Badge on unread rows

#### 4.3 Implement Board Tab
**Component:** `ComplaintBoard.tsx`

- Kanban columns: new | acknowledged | in_progress | resolved | closed | reopened
- Cards per column showing: ticket_number, customer, priority pill, sla_status
- Drag-drop to change status (calls `startProgress()`, `resolve()`, etc.)
- Click card to detail view

#### 4.4 Implement SLA Breaches Tab
**Component:** `ComplaintSLABreaches.tsx`

- Table of breached tickets (response_breached OR resolution_breached = true)
- Auto-escalated flag visible
- Highlight escalated_at timestamp
- Quick actions: acknowledge, escalate

#### 4.5 Implement Detail View
**Component:** `ComplaintDetail.tsx`

Layout:
- **Left panel (60%):**
  - Ticket header (ticket_number, status stepper, priority pill, SLA ring, age)
  - Vehicle card (reg, model, JC, branch, service_type)
  - Conversation thread (messages + internal notes visible to staff only)
  - Add reply box (staff message input, is_internal toggle)
  - Activity timeline (status changes, assignments, escalations, milestones)

- **Right panel (40%):**
  - Properties (customer_name, phone, category, severity_self, created_at, assigned_to, sa_employee_code)
  - Action buttons:
    - `acknowledge` (if status=new, visible if can_modify)
    - `start_progress` (if status=acknowledged, visible if can_modify)
    - `resolve` (if status=in_progress, visible if can_modify)
    - `close` (if status=resolved, visible if can_modify)
    - `set_priority` (dropdown, visible if can_modify)
    - `reassign` (dropdown of staff, visible if can_modify)
    - `escalate` (button + reason input, visible if can_modify)
  - SLA targets (response_mins, resolution_mins from policy)
  - CSAT (if submitted: rating + comment)

#### 4.6 Nav Integration
**File:** `src/components/TopNav.tsx`

- Add Complaints item to nav visible items (check module permission)
- Show badge with open count
- Link to `/complaints`

#### 4.7 Permission Enforcement
**Hook:** `useModulePermission('complaints')`

- Return: { can_view, can_modify, can_delete }
- Hide/disable buttons based on permissions
- Advisors: RLS enforces own sa_employee_code rows (add UI filter)
- Managers: can see/modify branch
- Admins: can see/modify all

#### 4.8 Responsive Design
- Desktop: 3-column (filters | main | detail)
- Tablet: 2-column (filters | main-detail toggle)
- Mobile: stacked (filters → list → detail)

### Acceptance
- [ ] `/complaints` route loads (auth required)
- [ ] Permission gate denies users without view permission
- [ ] Inbox table shows tickets, filters work
- [ ] Board kanban shows columns, drag-drop changes status
- [ ] Detail view loads full ticket data
- [ ] Action buttons call RPCs correctly
- [ ] Internal notes visible to staff, hidden from anon
- [ ] Advisors see only own sa_employee_code rows (RLS + UI)
- [ ] Managers see branch rows
- [ ] Admins see all rows
- [ ] Nav badge shows accurate open count
- [ ] Design HTML file matching 1:1 (screens, copy, layout)
- [ ] E2E staff workflow: open dashboard → filter tickets → view detail → action (acknowledge/escalate/close) completes

---

## Phase 5: Notifications & Polish (Week 4–5)

### Deliverables
- ✅ Notification outbox (SMS/email/in-app stubs)
- ✅ Reports (complaints by category/branch/SA, avg CSAT, SLA attainment)
- ✅ Design tokens & CSS (stepper, ring, thread, board, detail components)
- ✅ End-to-end testing (all workflows vs. design HTML)
- ✅ Documentation & deployment prep

### Tasks

#### 5.1 Notification System
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_complaint_notifications.sql`

- Create `complaint_notifications` outbox table (or reuse `email_logs`)
- Trigger events:
  - `complaint_raised` → customer SMS
  - `status_changed` → customer SMS (if staff reply)
  - `sla_breached` / `escalated` → staff email (manager + advisor)
  - `resolved` → customer SMS (rate us)
  - `reopened` → staff email (escalation)

**Implementation:** Backend job polls outbox, sends SMS via Gupshup, email via sendgrid

#### 5.2 Reports Module
**Files:** `src/pages/reports/ComplaintsReport.tsx`

- Complaints by category (pie chart)
- Complaints by branch (bar chart)
- Complaints by assigned advisor (bar chart)
- Average CSAT by branch
- SLA attainment % (responded on time, resolved on time)
- Trend: complaints/day over last 30 days

#### 5.3 Design Tokens & CSS
**Files:** `src/index.css`, `src/App.css`

Port new components (only genuinely new CSS, reuse existing):
- `.stepper` — status progression
- `.sla-ring` — circular progress
- `.thread` — conversation layout
- `.msg.msg--customer`, `.msg.msg--staff` — message bubbles
- `.board`, `.board__col`, `.tcard` — kanban
- `.detail` — 2-column layout
- `.prio`, `.pill` — priority/status badges

#### 5.4 Full E2E Testing
**Workflow 1: Customer Raise → Track → Reopen**
- [ ] Mint link for reception entry
- [ ] Open link, see raise mode
- [ ] Submit form (category, title, description, phone)
- [ ] Link now shows view mode (ticket, thread, SLA)
- [ ] Customer adds reply
- [ ] Staff acknowledges (first_response_at stamped)
- [ ] Staff resolves (resolved_at stamped)
- [ ] Customer rates CSAT (1–5)
- [ ] Customer reopens (ticket escalated to manager)
- [ ] Manager notified + ticket shows reopened status
- [ ] Resolution SLA reset
- [ ] Match design HTML (Complaint Customer Portal.html) 1:1

**Workflow 2: Staff Inbox → Detail → Actions**
- [ ] Manager logs in, opens Complaints
- [ ] Sees KPI row (open count, CSAT, SLA)
- [ ] Filters/sorts inbox table
- [ ] Clicks ticket → detail view loads
- [ ] Acknowledges (status → acknowledged, activity logged)
- [ ] Adds staff reply (visible to customer)
- [ ] Adds internal note (NOT visible to customer)
- [ ] Changes priority → SLA due recalculated
- [ ] Reassigns to different advisor
- [ ] Marks in progress → resolved
- [ ] Board view shows ticket moved to resolved column
- [ ] Escalate (if SLA breached) → escalated flag visible
- [ ] Match design HTML (Complaint Module (Staff).html) 1:1

#### 5.5 Documentation
- [ ] Update README.md with Complaints module overview
- [ ] Create DEPLOYMENT.md with production checklist
- [ ] Document notification integration points
- [ ] Create TROUBLESHOOTING.md (common issues)

#### 5.6 Deployment Prep
- [ ] Security audit (RLS, token handling, cross-tenant isolation)
- [ ] Performance testing (100+ tickets, 1000+ messages)
- [ ] Load testing (SLA breach sweep under load)
- [ ] Backup & rollback plan
- [ ] Staging environment test (full E2E)

### Acceptance
- [ ] Notifications sent correctly (SMS, email, in-app)
- [ ] Reports display accurate data
- [ ] Design tokens match design HTML file
- [ ] CSS components render correctly
- [ ] Full customer E2E passes (raise → track → reopen)
- [ ] Full staff E2E passes (inbox → detail → actions → board)
- [ ] Cross-tenant isolation verified (no data leaks)
- [ ] RLS policies enforced in production
- [ ] Internal notes never exposed to anon
- [ ] Performance acceptable (response time < 500ms)
- [ ] Readiness for production deployment

---

## Timeline Summary

| Week | Phase | Deliverables | Checkpoints |
|------|-------|--------------|------------|
| **W1** | 1 | Schema, helpers, RLS, SLA seed | Migrations apply, no collisions |
| **W1–2** | 2 | Triggers, RPCs, tests | pgTAP passes, single-use verified |
| **W2–3** | 3 | Customer portal | E2E raise → track → reopen |
| **W3–4** | 4 | Staff module | E2E inbox → detail → actions |
| **W4–5** | 5 | Notifications, reports, polish | Production deployment ready |

**Buffer:** +1 week for rework / performance tuning.

---

**Status:** Ready for execution. See [CHECKLIST.md](CHECKLIST.md) for daily tracking.
