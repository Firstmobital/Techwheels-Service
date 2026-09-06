# BODYSHOP-INSURER-001 — Manual Test Matrix

**Plan:** `BODYSHOP-INSURER-001_INSURANCE_COMPANY_MASTER_PLAN_2026-09-04.md`  
**Status:** Scaffold only. Run when Phase 3+ is implemented.

| # | Case | Expected |
|---|---|---|
| 1 | Settings → Insurance Companies | Card exists; add official name; it appears in SA dropdown |
| 2 | Add duplicate / alias of existing | Rejected or maps; no second official row |
| 3 | Deactivate a company | Hidden from SA dropdown; old cards still display the stored text |
| 4 | SA Insurance Company | Select only; no free-text typing |
| 5 | Fetch RC name that has an alias (e.g. HDFC → HDFC ERGO …) | Dropdown selects official name; policy no / valid-till still from RC |
| 6 | Fetch RC name with no alias | Company stays blank; toast to pick; raw RC string not saved |
| 7 | Stage 15+ DMS bill-to `UNIVERSAL SOMPO … C/O <customer>` | Invoice account unchanged; policy dropdown does not become the C/O string |
| 8 | 005071 United India vs Go Digit bill-to | Mismatch / payer warning still shows |
| 9 | Recovery All insurers + Mismatch | Filter still policy vs DMS bill-to; after Phase 4, insurer options are official names |
| 10 | New insurer | Add in Settings only; then selectable on SA |
