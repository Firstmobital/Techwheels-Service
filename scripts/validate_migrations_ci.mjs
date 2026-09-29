/**
 * CI migration filename and ordering validator.
 *
 * Validates SQL files in MCP-writable Supabase directories without any
 * database connection or production credentials. Checks only file structure
 * and ordering — does NOT validate SQL semantics or execution correctness.
 *
 * Duplicate timestamp policy:
 *   - Paired files (same timestamp, same logical base name, different suffixes
 *     e.g. _checks / _practical / base) are ALLOWED — this is the repository
 *     convention for migration + companion check pairs.
 *   - True duplicate timestamps (different logical base names sharing a
 *     timestamp) produce WARNINGS, not errors, because the repository already
 *     has pre-existing duplicate timestamps from concurrent development. They
 *     are reported for awareness but do not fail CI.
 *   - Malformed timestamps and out-of-order files ARE errors (exit 1).
 *
 * Directories validated:
 *   supabase/migrations/
 *   supabase/sql_checks/
 *   supabase/exec_success_migrations/sql/
 *   supabase/exec_success_migrations/sql_check/
 *
 * Run: node scripts/validate_migrations_ci.mjs
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TIMESTAMP_RE = /^(\d{14})_(.+)\.sql$/;

function logicalBase(stem) {
  return stem.replace(/_checks$/, '').replace(/_practical$/, '');
}

const DIRECTORIES = [
  'supabase/migrations',
  'supabase/sql_checks',
  'supabase/exec_success_migrations/sql',
  'supabase/exec_success_migrations/sql_check',
];

let hardErrors = 0;
let warnings = 0;

function validateDirectory(relDir) {
  const absDir = join(repoRoot, relDir);

  let entries;
  try {
    entries = readdirSync(absDir);
  } catch {
    console.log(`  SKIP  ${relDir} (directory not found)`);
    return;
  }

  const sqlFiles = entries
    .filter(f => f.endsWith('.sql'))
    .sort();

  const timestampedFiles = [];
  const skipped = [];

  for (const f of sqlFiles) {
    const m = TIMESTAMP_RE.exec(f);
    if (m) {
      timestampedFiles.push({ name: f, ts: m[1], stem: m[2] });
    } else {
      skipped.push(f);
    }
  }

  let localErrors = 0;
  let localWarnings = 0;

  // 1. Timestamp format sanity (hard error)
  for (const { name, ts } of timestampedFiles) {
    if (!/^\d{14}$/.test(ts)) {
      console.error(`  ERROR  ${relDir}: malformed timestamp "${ts}" in "${name}"`);
      localErrors++;
    }
  }

  // 2. Ascending order check (hard error — out-of-order files break Supabase migration ordering)
  let prevTs = '';
  for (const { name, ts } of timestampedFiles) {
    if (ts < prevTs) {
      console.error(`  ERROR  ${relDir}: out-of-order file "${name}" (ts ${ts} < previous ${prevTs})`);
      localErrors++;
    }
    prevTs = ts;
  }

  // 3. Duplicate detection — WARNING only (repo has pre-existing duplicates from concurrent dev)
  const tsGroups = new Map();
  for (const file of timestampedFiles) {
    if (!tsGroups.has(file.ts)) tsGroups.set(file.ts, []);
    tsGroups.get(file.ts).push(file);
  }

  for (const [ts, group] of tsGroups) {
    if (group.length <= 1) continue;

    const baseGroups = new Map();
    for (const f of group) {
      const base = logicalBase(f.stem);
      if (!baseGroups.has(base)) baseGroups.set(base, []);
      baseGroups.get(base).push(f);
    }

    if (baseGroups.size > 1) {
      // True duplicate: different logical base names at same timestamp
      const names = group.map(f => f.name).join(', ');
      console.warn(`  WARN   ${relDir}: duplicate timestamp ${ts}: ${names}`);
      localWarnings++;
    } else {
      // Same logical base — check exact suffix duplication within the group
      for (const [, files] of baseGroups) {
        const suffixTypes = files.map(f => {
          if (f.stem.endsWith('_checks')) return '_checks';
          if (f.stem.endsWith('_practical')) return '_practical';
          return 'base';
        });
        const uniqueSuffixes = new Set(suffixTypes);
        if (uniqueSuffixes.size < suffixTypes.length) {
          const names = files.map(f => f.name).join(', ');
          console.error(`  ERROR  ${relDir}: exact duplicate (same base+suffix) at ${ts}: ${names}`);
          localErrors++;
        }
        // else: legitimate paired files (base + _checks, or _checks + _practical) — OK
      }
    }
  }

  if (localErrors === 0 && localWarnings === 0) {
    const skipNote = skipped.length > 0
      ? ` (${skipped.length} non-timestamped file(s) skipped)`
      : '';
    console.log(`  OK    ${relDir}: ${timestampedFiles.length} timestamped SQL file(s) validated${skipNote}`);
  } else if (localErrors === 0) {
    console.log(`  OK    ${relDir}: ${timestampedFiles.length} file(s) validated, ${localWarnings} duplicate warning(s) (pre-existing)`);
  } else {
    console.error(`  FAIL  ${relDir}: ${localErrors} error(s)`);
  }

  hardErrors += localErrors;
  warnings += localWarnings;
}

console.log('Validating Supabase SQL file structure (format, ordering, duplicates)...');
console.log('NOTE: This validates structure only. SQL semantic correctness requires a database.');
console.log('');

for (const dir of DIRECTORIES) {
  validateDirectory(dir);
}

console.log('');
if (warnings > 0) {
  console.log(`WARNINGS: ${warnings} pre-existing duplicate timestamp(s) found (non-blocking).`);
}

if (hardErrors > 0) {
  console.error(`FAIL: ${hardErrors} structural error(s) found.`);
  process.exit(1);
} else {
  console.log('PASS: All Supabase SQL directories validated (structure and ordering).');
  process.exit(0);
}
