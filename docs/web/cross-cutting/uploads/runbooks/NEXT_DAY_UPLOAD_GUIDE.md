# Next-Day Upload Runbook

This runbook is for operating and validating Day 1 and Day 2 uploads.

## Preconditions

- Import source file prepared for the target table.
- Correct branch/context selected in the UI before upload.
- Operator has permission to perform imports.

## Day 1 Operation

1. Upload baseline file.
2. Confirm rows were inserted.
3. Record baseline row count for validation.

## Day 2 Re-upload Operation

1. Upload updated file for the same business slice.
2. Confirm no duplicate explosion in target rows.
3. Confirm updated values appear where natural key matches.

## Validation Checks

- Row count reflects inserts plus expected updates (not raw append behavior).
- Re-uploaded natural-key rows are updated in place.
- No duplicate-key failure blocks normal re-upload flow.

## Failure Handling

If re-upload behavior is wrong:

1. Stop further uploads for that table.
2. Capture sample input rows and observed output rows.
3. Escalate with references to the deep-dive and implementation docs.

## Canonical References

- Summary: `../active/README_NEXT_DAY_UPLOADS.md`
- Plan sequencing: `../active/IMPLEMENTATION_ROADMAP.md`
- Code snippets: `COPY_PASTE_CODE.md`
- Technical rationale: `../evidence/UPLOAD_LOGIC_REFACTOR.md`
