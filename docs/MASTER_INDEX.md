# Techwheels Service — Master Documentation Index

**Project:** Techwheels Service Platform | **Last Updated:** 2026-06-08 | **Version:** v1.0

---

## 📚 Documentation Structure

```
docs/
├── README.md (overview)
├── STRUCTURE_GUIDE.md (folder organization guide)
│
├── Implementation_plans/
│   ├── INDEX.md (master implementation index)
│   ├── IMPLEMENTATION_TRACKER.md (global tracking)
│   ├── TEMPLATE.md (template for new modules)
│   │
│   ├── complaints/ ✨ NEW
│   │   ├── 00_INDEX.md (entry point)
│   │   ├── 01_COMPREHENSIVE_PLAN.md (full spec)
│   │   ├── 02_DATABASE_SCHEMA.md (DDL reference)
│   │   ├── 03_RPC_FUNCTIONS.md (RPC signatures)
│   │   ├── 04_TRIGGERS_HELPERS.md (trigger + helper functions)
│   │   ├── 05_RLS_POLICIES.md (security policies)
│   │   ├── 06_FRONTEND_API.md (API layer)
│   │   ├── 07_CUSTOMER_PORTAL.md (anon portal)
│   │   ├── 08_STAFF_MODULE.md (staff dashboard)
│   │   ├── 09_TESTING_ACCEPTANCE.md (testing guide)
│   │   ├── 10_RISK_MITIGATION.md (risk assessment)
│   │   ├── PHASES.md (5-phase breakdown)
│   │   └── CHECKLIST.md (execution checklist)
│   │
│   ├── autodoc/
│   │   └── (reference implementation documents)
│   │
│   ├── warranty/
│   │   └── (reference implementation documents)
│   │
│   └── ... (other module implementations)
│
├── Project_Handbook/
│   └── (general project guidelines)
│
├── rbac/
│   └── (RBAC system documentation)
│
├── security/
│   └── (security best practices)
│
├── supabase/
│   └── (Supabase/database guides)
│
└── ... (other reference folders)
```

---

## 🎯 Quick Navigation

### For Developers Starting on Complaints Module

**Read in this order:**

1. **Start here:** [docs/Implementation_plans/complaints/00_INDEX.md](Implementation_plans/complaints/00_INDEX.md)
   - Quick overview, links to all sections

2. **Architecture & Spec:** [docs/Implementation_plans/complaints/01_COMPREHENSIVE_PLAN.md](Implementation_plans/complaints/01_COMPREHENSIVE_PLAN.md)
   - Full specification (2–3 sprints, 5 phases)
   - Executive summary + architecture overview
   - Core mechanics, guardrails, acceptance criteria

3. **Technical Deep-Dives:**
   - **Database:** [02_DATABASE_SCHEMA.md](Implementation_plans/complaints/02_DATABASE_SCHEMA.md)
   - **Backend APIs:** [03_RPC_FUNCTIONS.md](Implementation_plans/complaints/03_RPC_FUNCTIONS.md) + [04_TRIGGERS_HELPERS.md](Implementation_plans/complaints/04_TRIGGERS_HELPERS.md)
   - **Security:** [05_RLS_POLICIES.md](Implementation_plans/complaints/05_RLS_POLICIES.md)
   - **Frontend APIs:** [06_FRONTEND_API.md](Implementation_plans/complaints/06_FRONTEND_API.md)

4. **Frontend Screens:**
   - **Customer Portal:** [07_CUSTOMER_PORTAL.md](Implementation_plans/complaints/07_CUSTOMER_PORTAL.md)
   - **Staff Module:** [08_STAFF_MODULE.md](Implementation_plans/complaints/08_STAFF_MODULE.md)

5. **Execution:**
   - **Phases:** [PHASES.md](Implementation_plans/complaints/PHASES.md) (weekly breakdown)
   - **Checklist:** [CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) (daily tracking)

6. **Validation:**
   - **Testing:** [09_TESTING_ACCEPTANCE.md](Implementation_plans/complaints/09_TESTING_ACCEPTANCE.md)
   - **Risks:** [10_RISK_MITIGATION.md](Implementation_plans/complaints/10_RISK_MITIGATION.md)

---

### By Role

#### 🔧 Backend Engineers
1. [01_COMPREHENSIVE_PLAN.md](Implementation_plans/complaints/01_COMPREHENSIVE_PLAN.md) — Sections 2–6 (schema, RPCs, triggers)
2. [02_DATABASE_SCHEMA.md](Implementation_plans/complaints/02_DATABASE_SCHEMA.md) — Full DDL
3. [03_RPC_FUNCTIONS.md](Implementation_plans/complaints/03_RPC_FUNCTIONS.md) — All RPC signatures
4. [04_TRIGGERS_HELPERS.md](Implementation_plans/complaints/04_TRIGGERS_HELPERS.md) — Trigger logic
5. [05_RLS_POLICIES.md](Implementation_plans/complaints/05_RLS_POLICIES.md) — Security policies
6. [PHASES.md](Implementation_plans/complaints/PHASES.md) — Phase 1–2
7. [CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) — Phase 1–2 checklist

#### 🎨 Frontend Engineers
1. [01_COMPREHENSIVE_PLAN.md](Implementation_plans/complaints/01_COMPREHENSIVE_PLAN.md) — Sections 3, 9 (architecture, frontend)
2. [06_FRONTEND_API.md](Implementation_plans/complaints/06_FRONTEND_API.md) — API layer patterns
3. [07_CUSTOMER_PORTAL.md](Implementation_plans/complaints/07_CUSTOMER_PORTAL.md) — Anon portal
4. [08_STAFF_MODULE.md](Implementation_plans/complaints/08_STAFF_MODULE.md) — Staff dashboard
5. [PHASES.md](Implementation_plans/complaints/PHASES.md) — Phase 3–4
6. [CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) — Phase 3–4 checklist

#### 🧪 QA / Testing Engineers
1. [01_COMPREHENSIVE_PLAN.md](Implementation_plans/complaints/01_COMPREHENSIVE_PLAN.md) — Sections 11–12 (testing, risks)
2. [09_TESTING_ACCEPTANCE.md](Implementation_plans/complaints/09_TESTING_ACCEPTANCE.md) — Full test plan
3. [10_RISK_MITIGATION.md](Implementation_plans/complaints/10_RISK_MITIGATION.md) — Risk assessment
4. [PHASES.md](Implementation_plans/complaints/PHASES.md) — Phase 5
5. [CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) — Phase 5 checklist

#### 📋 Project Managers
1. [00_INDEX.md](Implementation_plans/complaints/00_INDEX.md) — Overview + links
2. [PHASES.md](Implementation_plans/complaints/PHASES.md) — Timeline + sprints
3. [CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) — Daily stand-ups + approval gates

---

## 📖 Documentation by Feature/Module

### Complaints Module ✨ (NEW)
- **Status:** 🔄 PLANNING (2–3 sprints)
- **Entry Point:** [docs/Implementation_plans/complaints/00_INDEX.md](Implementation_plans/complaints/00_INDEX.md)
- **Features:**
  - Anonymous customer complaint raising & tracking
  - SLA management (urgent/high/medium/low timers)
  - Staff ticketing dashboard (inbox, board, SLA tab)
  - RBAC enforcement (advisor/manager/admin scopes)
  - Internal notes + conversation threading
  - CSAT rating & escalation
- **Deliverables:** Schema, RPCs (anon + staff), frontend (portal + module), tests, notifications

### Auto Documentation (Autodoc)
- **Location:** [docs/Implementation_plans/autodoc/](Implementation_plans/autodoc/)
- **Features:** Job card auto-documentation, panel detection, rate card lookup
- **Status:** (refer to individual docs)

### Warranty Module
- **Location:** [docs/Implementation_plans/warranty/](Implementation_plans/warranty/)
- **Features:** Warranty claims, tracking, escalation
- **Status:** (refer to individual docs)

### Other Modules
- **Reception / Job Cards:** [docs/Implementation_plans/reception/](Implementation_plans/reception/)
- **RBAC System:** [docs/rbac/](rbac/)
- **Mobile App:** [docs/Implementation_plans/mobile/](Implementation_plans/mobile/)
- **Supabase Integration:** [docs/supabase/](supabase/)
- **Security & RLS:** [docs/security/](security/)

---

## 🔍 How to Find Information

### By Question

**Q: "What tables will be created for complaints?"**  
→ [complaints/02_DATABASE_SCHEMA.md](Implementation_plans/complaints/02_DATABASE_SCHEMA.md)

**Q: "What RPC functions do I need to build?"**  
→ [complaints/03_RPC_FUNCTIONS.md](Implementation_plans/complaints/03_RPC_FUNCTIONS.md)

**Q: "How do I implement the customer portal?"**  
→ [complaints/07_CUSTOMER_PORTAL.md](Implementation_plans/complaints/07_CUSTOMER_PORTAL.md)

**Q: "What's the implementation timeline?"**  
→ [complaints/PHASES.md](Implementation_plans/complaints/PHASES.md)

**Q: "What are my daily tasks for this week?"**  
→ [complaints/CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) (Phase X)

**Q: "What security concerns are there?"**  
→ [complaints/05_RLS_POLICIES.md](Implementation_plans/complaints/05_RLS_POLICIES.md) + [complaints/10_RISK_MITIGATION.md](Implementation_plans/complaints/10_RISK_MITIGATION.md)

**Q: "How do I test this?"**  
→ [complaints/09_TESTING_ACCEPTANCE.md](Implementation_plans/complaints/09_TESTING_ACCEPTANCE.md)

---

## 📋 Key Documents per Module

### Complaints Module Structure
```
complaints/
├── 00_INDEX.md              ← Start here
├── 01_COMPREHENSIVE_PLAN.md ← Full spec
├── 02_DATABASE_SCHEMA.md    ← Tables + indexes
├── 03_RPC_FUNCTIONS.md      ← API signatures
├── 04_TRIGGERS_HELPERS.md   ← Database triggers
├── 05_RLS_POLICIES.md       ← Security
├── 06_FRONTEND_API.md       ← API wrappers (src/lib/api/)
├── 07_CUSTOMER_PORTAL.md    ← /c/:token page
├── 08_STAFF_MODULE.md       ← /complaints page
├── 09_TESTING_ACCEPTANCE.md ← Tests + criteria
├── 10_RISK_MITIGATION.md    ← Risk assessment
├── PHASES.md                ← Phase breakdown (5 weeks)
└── CHECKLIST.md             ← Execution tracking
```

---

## 🚀 Getting Started (New Team Member)

1. **Onboarding:**
   - Read [README.md](README.md) (project overview)
   - Read [STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md) (docs organization)

2. **Choose Your Feature:**
   - **Complaints Module?** Start at [complaints/00_INDEX.md](Implementation_plans/complaints/00_INDEX.md)
   - **Autodoc?** Start at [Implementation_plans/autodoc/](Implementation_plans/autodoc/)
   - **Warranty?** Start at [Implementation_plans/warranty/](Implementation_plans/warranty/)

3. **Dive into Technical Details:**
   - Backend? → Schema → RPCs → Triggers → Tests
   - Frontend? → API layer → Components → Pages → Tests
   - QA? → Test plan → Acceptance criteria → Risk assessment

4. **Track Your Progress:**
   - Daily: Update [complaints/CHECKLIST.md](Implementation_plans/complaints/CHECKLIST.md) (or your module)
   - Weekly: Review [complaints/PHASES.md](Implementation_plans/complaints/PHASES.md)

---

## 🔗 Cross-Module References

### RBAC System (Used by Complaints)
- **Reference:** [docs/rbac/](rbac/)
- **In Complaints:** Module permissions, user_module_permissions table, has_module_view/modify/delete() functions
- **Scoping:** Advisor (own sa_employee_code rows), Manager (branch rows), Admin (all rows)

### Security Best Practices (Used by Complaints)
- **Reference:** [docs/security/](security/)
- **In Complaints:** RLS policies, tenant isolation, SECURITY DEFINER functions, token handling
- **Key:** Anon role gets EXECUTE-only on named RPCs, never direct table access

### Supabase Integration (Used by Complaints)
- **Reference:** [docs/supabase/](supabase/)
- **In Complaints:** Migrations, Edge functions, realtime subscriptions, Storage (attachments)

### Mobile App (Uses Complaints)
- **Reference:** [docs/Implementation_plans/mobile/](Implementation_plans/mobile/)
- **Integration:** Complaints module API available to mobile via same Supabase RPC layer

---

## 📞 Questions? Common Issues?

| Issue | Reference |
|-------|-----------|
| "What tables do I create first?" | [complaints/02_DATABASE_SCHEMA.md](Implementation_plans/complaints/02_DATABASE_SCHEMA.md) → §4.1 |
| "How do I ensure single-use raise?" | [complaints/03_RPC_FUNCTIONS.md](Implementation_plans/complaints/03_RPC_FUNCTIONS.md) → raise_complaint() |
| "How do advisors see only their tickets?" | [complaints/05_RLS_POLICIES.md](Implementation_plans/complaints/05_RLS_POLICIES.md) → Advisor scoping |
| "Where do I start the customer portal?" | [complaints/07_CUSTOMER_PORTAL.md](Implementation_plans/complaints/07_CUSTOMER_PORTAL.md) → Screens section |
| "What's the timeline?" | [complaints/PHASES.md](Implementation_plans/complaints/PHASES.md) → Timeline summary |
| "What could go wrong?" | [complaints/10_RISK_MITIGATION.md](Implementation_plans/complaints/10_RISK_MITIGATION.md) |

---

## 📊 Documentation Completeness

| Module | Spec | Schema | RPCs | Frontend | Tests | Status |
|--------|------|--------|------|----------|-------|--------|
| **Complaints** | ✅ | ✅ | ✅ | ✅ | ✅ | 🔄 READY TO BUILD |
| Autodoc | (partial) | (partial) | (partial) | (partial) | (partial) | Refer to folder |
| Warranty | (partial) | (partial) | (partial) | (partial) | (partial) | Refer to folder |

---

## 📝 Contributing to Docs

When creating new implementation plans:
1. Follow the folder structure: `Implementation_plans/<module_name>/`
2. Include: 00_INDEX.md, 01_SPEC.md, PHASES.md, CHECKLIST.md
3. Document: Schema, RPCs, Frontend, Tests, Risks
4. Update this master index

---

**Last Updated:** 2026-06-08 | **Maintained By:** Development Team
