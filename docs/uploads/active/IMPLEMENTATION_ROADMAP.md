# Implementation Roadmap: Next-Day Re-upload De-dup

This file tracks execution order and ownership. It does not contain code snippets.

## Sequencing

1. `service_vas_jc_data`
2. `service_invoice_data`
3. `service_parts_order_data`
4. `service_parts_consumption_data`
5. `service_parts_stock_snapshot_data`

## Workstream Checklist

### Phase 1: VAS

- [ ] Header-mapper alignment
- [ ] Date fallback alignment
- [ ] Natural-key upsert alignment
- [ ] Day 1/Day 2 validation

### Phase 2: Invoice

- [ ] Header-mapper alignment
- [ ] Date fallback alignment
- [ ] Natural-key upsert alignment
- [ ] Day 1/Day 2 validation

### Phase 3: Parts Order

- [ ] Header-mapper alignment
- [ ] Date fallback alignment
- [ ] Natural-key upsert alignment
- [ ] Day 1/Day 2 validation

### Phase 4: Parts Consumption

- [ ] Header-mapper alignment
- [ ] Date fallback alignment
- [ ] Natural-key upsert alignment
- [ ] Day 1/Day 2 validation

### Phase 5: Parts Stock Snapshot

- [ ] Header-mapper alignment
- [ ] Date fallback alignment
- [ ] Natural-key upsert alignment
- [ ] Day 1/Day 2 validation

## Validation Gates

- [ ] Duplicate-free re-upload behavior confirmed
- [ ] Build/typecheck/lint passes
- [ ] Production deploy checklist approved

## Implementation References

- Operator runbook: `../runbooks/NEXT_DAY_UPLOAD_GUIDE.md`
- Code snippets: `../runbooks/COPY_PASTE_CODE.md`
- Technical deep-dive: `../evidence/UPLOAD_LOGIC_REFACTOR.md`
- Reusable template: `../evidence/UPLOAD_TEMPLATE_CODE.md`
