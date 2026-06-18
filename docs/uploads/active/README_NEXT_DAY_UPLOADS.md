# Next-Day Re-upload Summary

## Objective

Prevent duplicate rows or duplicate-key failures when the same operational files are uploaded again on later days.

## Core Approach

- Use natural-key-based upsert behavior instead of insert-only behavior.
- Apply flexible header mapping so source format differences do not block ingestion.
- Apply date fallback rules so incomplete rows can still map deterministically.

## Intended Outcome

- Day 1 upload inserts baseline rows.
- Day 2 re-upload updates existing rows where natural key matches.
- Net dataset stays clean without manual duplicate cleanup.

## Scope

- Service VAS data
- Service invoice data
- Parts order data
- Parts consumption data
- Parts stock snapshot data

## Where Details Live

- Execution order and phase plan: `IMPLEMENTATION_ROADMAP.md`
- Runbook for operators: `../runbooks/NEXT_DAY_UPLOAD_GUIDE.md`
- Implementation snippets: `../runbooks/COPY_PASTE_CODE.md`
- Deep technical rationale: `../evidence/UPLOAD_LOGIC_REFACTOR.md`
- Reusable code template: `../evidence/UPLOAD_TEMPLATE_CODE.md`

## Ownership Boundary

This file is summary-only. Do not add code snippets, line-level implementation notes, or long test scripts here.
