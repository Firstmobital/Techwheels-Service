# Techwheels Docs

This folder uses a strict three-level hierarchy for all markdown files:

1. Primary category
2. Subcategory
3. Optional sub-subcategory

## Primary categories

- `Implementation_plans` - execution plans and trackers
- `Project_Handbook` - durable architecture and policy handbooks
- `Project_Instructions` - operating instructions for contributors and agents
- `autodoc` - AutoDoc operational documentation
- `complaints` - complaints authority/reference docs
- `rbac` - RBAC runbooks and evidence
- `security` - security reference docs
- `supabase` - Supabase operations and evidence
- `uploads` - upload feature docs
- `wa_templates` - WhatsApp template catalog/docs
- `warranty` - warranty evidence and reports

## Category structure rule

Every primary category should use one or more of these standard subfolders:

- `active/` - live docs and current trackers
- `evidence/` - audits, test reports, validations
- `runbooks/` - operational procedures
- `reference/` - authority/spec/reference material
- `catalog/` - template and reusable content indexes

Use only category-level `README.md` files as index files. Keep non-index markdown files out of category roots.

For full governance, see `STRUCTURE_GUIDE.md`.
