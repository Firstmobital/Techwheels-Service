# Complaints Module — Documentation Index

**Status:** 🔄 PLANNING | **Created:** 2026-06-08 | **Sprints:** 2–3

---

## Overview

The **Complaint Ticketing System** is a self-service complaint-resolution module integrated into Techwheels Service. Every vehicle service visit (reception entry) can be attached to a **single-use, anonymous customer link** for raising, tracking, and rating complaints with full SLA management and staff escalation.

---

## Documentation Files

### Core Implementation Plan
- **[01_COMPREHENSIVE_PLAN.md](01_COMPREHENSIVE_PLAN.md)** — Full specification, architecture, DDL, RPCs, RLS, workflow, phases (single-source reference)

### Technical References
- **[02_DATABASE_SCHEMA.md](02_DATABASE_SCHEMA.md)** — DDL details, table relationships, indexes, constraints
- **[03_RPC_FUNCTIONS.md](03_RPC_FUNCTIONS.md)** — All RPC signatures, parameters, responses (anon + staff)
- **[04_TRIGGERS_HELPERS.md](04_TRIGGERS_HELPERS.md)** — Trigger functions, helper functions, background jobs
- **[05_RLS_POLICIES.md](05_RLS_POLICIES.md)** — Row-level security policies, tenant isolation, advisor scoping

### Frontend Architecture
- **[06_FRONTEND_API.md](06_FRONTEND_API.md)** — API layer (src/lib/api/complaints.ts), typed wrappers, usage patterns
- **[07_CUSTOMER_PORTAL.md](07_CUSTOMER_PORTAL.md)** — Anonymous portal (/c/:token), pages, components, flows
- **[08_STAFF_MODULE.md](08_STAFF_MODULE.md)** — Staff dashboard (/complaints), pages, RBAC, UI patterns

### Project Guides
- **[09_TESTING_ACCEPTANCE.md](09_TESTING_ACCEPTANCE.md)** — pgTAP unit tests, E2E workflows, acceptance criteria
- **[10_RISK_MITIGATION.md](10_RISK_MITIGATION.md)** — Risk assessment, mitigations, guardrails, constraints

### Implementation Tracking
- **[PHASES.md](PHASES.md)** — Phase breakdown (1–5), weekly sprints, checkpoints, deliverables
- **[CHECKLIST.md](CHECKLIST.md)** — Execution checklist (migration, triggers, RPCs, frontend, testing, deployment)

---

## Key Artifacts

### From Reference Design
- **Customer Portal Design:** `local_folder/Reference/complains_modules_reference/Complaints/Complaint Customer Portal.html`
- **Staff Module Design:** `local_folder/Reference/complains_modules_reference/Complaints/Complaint Module (Staff).html`
- **Design Tokens/CSS:** `local_folder/Reference/complains_modules_reference/Complaints/assets/complaints.css`
- **Mock Data:** `local_folder/Reference/complains_modules_reference/Complaints/staff-data.js`

### Authoritative Database Schema
- **Dump (primary):** `local_folder/backups/full_database.sql` (~50MB)
- **Dump (chunked):** `local_folder/backups/chunks/full_database.sql.part_{000,001,002}`

---

## Quick Start

1. **Read:** [01_COMPREHENSIVE_PLAN.md](01_COMPREHENSIVE_PLAN.md) (executive summary + architecture)
2. **Database:** [02_DATABASE_SCHEMA.md](02_DATABASE_SCHEMA.md) → [03_RPC_FUNCTIONS.md](03_RPC_FUNCTIONS.md) → [04_TRIGGERS_HELPERS.md](04_TRIGGERS_HELPERS.md)
3. **RLS & Security:** [05_RLS_POLICIES.md](05_RLS_POLICIES.md)
4. **Frontend:** [06_FRONTEND_API.md](06_FRONTEND_API.md) → [07_CUSTOMER_PORTAL.md](07_CUSTOMER_PORTAL.md) → [08_STAFF_MODULE.md](08_STAFF_MODULE.md)
5. **Execution:** [PHASES.md](PHASES.md) → [CHECKLIST.md](CHECKLIST.md)
6. **Validation:** [09_TESTING_ACCEPTANCE.md](09_TESTING_ACCEPTANCE.md) → [10_RISK_MITIGATION.md](10_RISK_MITIGATION.md)

---

## Reference Links

| Document | Purpose |
|----------|---------|
| [Techwheels Service README](../../README.md) | Main project overview |
| [RBAC Documentation](../rbac) | Role & permission system (reused in complaints) |
| [Supabase Migrations Guide](../supabase) | Migration patterns & conventions |
| [Security Best Practices](../security) | Tenant isolation, RLS patterns |

---

## Approval Gates

- ✅ Phase 1: Dump audit (no collisions), helper functions created, migration ready
- ⏳ Phase 2: Triggers + RPCs implemented, pgTAP tests pass, single-use guarantee verified
- ⏳ Phase 3: Customer portal built, E2E raise → track → reopen workflow validated
- ⏳ Phase 4: Staff module built, RBAC enforced, design HTML file matching verified
- ⏳ Phase 5: Notifications wired, reports built, production deployment ready

---

## Contact & Questions

For implementation guidance, refer to:
- **Tech Stack Issues:** See [06_FRONTEND_API.md](06_FRONTEND_API.md)
- **Schema Questions:** See [02_DATABASE_SCHEMA.md](02_DATABASE_SCHEMA.md)
- **Security/RLS:** See [05_RLS_POLICIES.md](05_RLS_POLICIES.md)
- **Execution Timeline:** See [PHASES.md](PHASES.md)

---

**Last Updated:** 2026-06-08 | **Version:** v1.0
