# Mobile Platform Documentation

**Scope:** Truth documentation for completed mobile platform implementations.

This directory contains the authoritative specifications for the mobile platform - what exists now, is validated, and deployed.

## Structure

### modules/
Mobile-specific feature implementations (created on-demand when different from web):
- [Populated only when mobile implementation differs from web platform]
- When identical to web, reference web documentation

### cross-cutting/
Mobile-specific infrastructure and systems:
- `push-registration/` - Push notification registration, token management, delivery

## Subcategories

Each module/cross-cutting folder contains:
- `reference/` → Specifications, API contracts, data models (authority)
- `evidence/` → Validation reports, test results, audits
- `runbooks/` → Operational procedures, troubleshooting guides
- `active/` → Live policies and configurations
- `catalog/` → Reusable templates and libraries

## Lifecycle

Implementation plans are tracked in `docs/Implementation_plans/mobileversion/`.

When implementation is completed:
1. Implementation plan → `docs/Implementation_plans/completed/`
2. Truth documentation → `docs/mobile/modules|cross-cutting/<name>/`
3. Implementation plan → DELETED (no longer needed)
4. New truth established ✓

## Navigation

For implementation plans → See [docs/Implementation_plans/mobileversion/](../Implementation_plans/mobileversion/)
For shared governance → See [docs/shared/](docs/shared/)
For platform guide → See [docs/STRUCTURE_GUIDE.md](../STRUCTURE_GUIDE.md)
