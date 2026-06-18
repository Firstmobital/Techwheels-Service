# Next-Day Upload Docs Index (Authority Map)

This file is the single navigation authority for the upload de-dup documentation set.

## Document Boundaries

- `README_NEXT_DAY_UPLOADS.md`
   - Executive summary only.
   - Problem statement and adoption outcomes.

- `IMPLEMENTATION_ROADMAP.md`
   - Sequenced implementation plan and phase ownership.
   - No copy-paste code blocks.

- `../runbooks/NEXT_DAY_UPLOAD_GUIDE.md`
   - Operator runbook for Day 1 and Day 2 upload execution.

- `../runbooks/COPY_PASTE_CODE.md`
   - Code snippets and concrete edit blocks.

- `../evidence/UPLOAD_LOGIC_REFACTOR.md`
   - Detailed technical rationale and architecture comparisons.

- `../evidence/UPLOAD_TEMPLATE_CODE.md`
   - Reusable template implementation pattern.

- `../evidence/VISUAL_GUIDE.md`
   - Flow diagrams and visual explainers.

- `../evidence/VAS_DEDUPLICATION_FIX.md`
   - VAS-specific issue history and correction notes.

## Reader Paths

- Product/ops overview:
   - `README_NEXT_DAY_UPLOADS.md` -> `../runbooks/NEXT_DAY_UPLOAD_GUIDE.md`

- Developer implementation:
   - `IMPLEMENTATION_ROADMAP.md` -> `../runbooks/COPY_PASTE_CODE.md` -> `../evidence/UPLOAD_TEMPLATE_CODE.md`

- Root-cause and decision trace:
   - `../evidence/UPLOAD_LOGIC_REFACTOR.md` -> `../evidence/VAS_DEDUPLICATION_FIX.md`

## De-dup Rule

If content is duplicated between files, keep the most detailed/lowest-level file as source and replace other copies with links.

**Q: Why not just delete old records first?**
A: Because if upload fails mid-way, you lose all data. Upsert is atomic.

---

## 📞 Support

### If Stuck
1. Read: [VISUAL_GUIDE.md](../evidence/VISUAL_GUIDE.md) - Understand the concept
2. Read: [COPY_PASTE_CODE.md](../runbooks/COPY_PASTE_CODE.md) - See exact code placement
3. Check: Line numbers provided in code comments
4. Test: Day 1 + Day 2 upload manually

### Common Issues
- Build fails → Check for syntax errors in PART 1
- Upsert doesn't work → Verify natural key matches database
- Duplicates still appear → Check onConflict field names
- Date fallback fails → Check field names in config

---

## 📝 Summary

**What:** Enable Day 2+ uploads to update existing records instead of creating duplicates

**Why:** Users need to re-upload data when:
- New information arrives
- Amounts or quantities are corrected
- Additional columns are available

**How:** 
1. Map flexible Excel column names to DB columns
2. Fill missing dates from related fields
3. Use UPSERT with natural keys (update if exists, insert if new)

**Result:** Seamless multi-day data uploads with automatic conflict resolution

**Timeline:** 2 weeks if starting fresh, 2 days if using this guide

---

## 📚 Document Navigation

```
START HERE
    ↓
README_NEXT_DAY_UPLOADS.md (5 min read)
    ↓
VISUAL_GUIDE.md (diagrams & examples)
    ↓
Choose your path:
    ├─→ Understanding: NEXT_DAY_UPLOAD_GUIDE.md
    ├─→ Coding: COPY_PASTE_CODE.md ⭐⭐
    ├─→ Planning: IMPLEMENTATION_ROADMAP.md
    ├─→ Reference: UPLOAD_TEMPLATE_CODE.md
    └─→ Deep Dive: UPLOAD_LOGIC_REFACTOR.md
```

---

Last Updated: 27 May 2026  
Status: Ready for Implementation  
Priority: HIGH
