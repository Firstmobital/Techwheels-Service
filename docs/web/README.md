# Web Platform Documentation

**Scope:** Truth documentation for completed web platform implementations.

This directory contains the authoritative specifications for the web platform - what exists now, is validated, and deployed.

## Structure

### modules/
Standalone web features with their own implementation lifecycles:
- `autodoc/` - AutoDoc module for web
- `complaints/` - Complaints module for web
- `telecalling/` - Telecalling module for web
- `warranty/` - Warranty module for web

### cross-cutting/
Infrastructure and shared systems across the web platform:
- `rbac/` - Role-based access control (RLS policies)
- `supabase/` - Database infrastructure, migrations, schemas
- `security/` - Security governance and procedures
- `uploads/` - File upload and storage procedures
- `wa_templates/` - WhatsApp template library and catalog

## Subcategories

Each module/cross-cutting folder contains:
- `reference/` → Specifications, API contracts, data models (authority)
- `evidence/` → Validation reports, test results, audits
- `runbooks/` → Operational procedures, troubleshooting guides
- `active/` → Live policies and configurations
- `catalog/` → Reusable templates and libraries

## Lifecycle

Implementation plans are tracked in `docs/Implementation_plans/webversion/`.

When implementation is completed:
1. Implementation plan → `docs/Implementation_plans/completed/`
2. Truth documentation → `docs/web/modules|cross-cutting/<name>/`
3. Implementation plan → DELETED (no longer needed)
4. New truth established ✓

## Navigation

For implementation plans → See [docs/Implementation_plans/webversion/](../Implementation_plans/webversion/)
For shared governance → See [docs/Project_Handbook/](../Project_Handbook/)
For platform guide → See [docs/STRUCTURE_GUIDE.md](../STRUCTURE_GUIDE.md)
