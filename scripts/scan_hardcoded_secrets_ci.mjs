/**
 * CI hardcoded-secret detector for Supabase edge functions and new SQL migrations.
 *
 * Detects credential-like literals in TypeScript source and SQL migrations
 * without printing matched values. Reports path, line, and rule only.
 *
 * TypeScript rules (supabase/functions/**):
 *   HEX64    — 64-char lowercase hex string assigned to a variable whose
 *              name contains SECRET/TOKEN/KEY/PASSWORD/CREDENTIAL/AUTH
 *   HEX40    — 40-char lowercase hex string in the same assignment context
 *   BEARER   — Bearer token literal longer than 32 chars
 *
 * SQL rules (supabase/migrations/** — new/non-historical files only):
 *   SQL_HEX64  — 64-char hex literal appearing next to a credential-header key
 *                (e.g. 'x-cron-secret', '<hex64>') in pg_net / jsonb calls
 *   SQL_HEX40  — same for 40-char hex
 *
 * Historical migrations excluded from SQL scan (immutable evidence; known
 * compromised values cannot be rotated in-place by design):
 *   20260722193000_insurance_renewal_rc_fetch_jobs.sql
 *   20260722203000_insurance_renewal_rc_fetch_worker_max_4.sql
 *
 * Non-rules (deliberately not flagged):
 *   - Config keys / identifiers that merely contain SECRET/TOKEN in name
 *     but have short values
 *   - Deno.env.get(...) / vault.decrypted_secrets calls (runtime reads)
 *   - process.env, import.meta.env references
 *   - GitHub Actions ${{ secrets.* }} expressions
 *   - UUID / project-ref values (36-char with dashes) — structural, not credentials
 *   - Import paths and URLs
 *   - Comment-only lines
 *
 * Usage: node scripts/scan_hardcoded_secrets_ci.mjs
 *
 * Exit codes:
 *   0 — no findings
 *   1 — one or more findings
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const SCAN_DIRS = [
  'supabase/functions',
];

// SQL migrations to scan (new/forward files only).
// Historical migrations listed in HISTORICAL_MIGRATION_EXCLUSIONS are skipped.
const SQL_SCAN_DIRS = [
  'supabase/migrations',
];

// These immutable historical files contain a known-compromised secret that
// cannot be removed from migration history. They are excluded from CI scanning
// to avoid an unresolvable failure. The forward migration at
// 20260929120000_invoke_rc_fetch_worker_vault_secret.sql supersedes them.
const HISTORICAL_MIGRATION_EXCLUSIONS = new Set([
  '20260722193000_insurance_renewal_rc_fetch_jobs.sql',
  '20260722203000_insurance_renewal_rc_fetch_worker_max_4.sql',
]);

const EXCLUDED_DIRS = [
  'local_folder',
  'node_modules',
  '.git',
];

// Matches: const/let/var FOO_SECRET = "hexvalue64" or 'hexvalue64'
// Deliberately narrow: requires assignment of a long hex literal to a
// *_SECRET/*_TOKEN/*_KEY/*_PASSWORD name to reduce false positives.
// Also matches export const FOO = "hexvalue" when name fits.
const CRED_NAME_RE = /(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|AUTH)/i;

// 64-char hex (common for sha256-derived secrets)
const HEX64_RE = /^[0-9a-f]{64}$/i;
// 40-char hex (sha1-derived or similar)
const HEX40_RE = /^[0-9a-f]{40}$/i;
// Very long base64/alphanumeric string typical of JWTs or API keys
const LONGALPHA_RE = /^[A-Za-z0-9+/=_\-]{64,}$/;

// Skip lines that are clearly env reads or template expressions
const SAFE_PATTERNS = [
  /Deno\.env\.get\s*\(/,
  /process\.env\b/,
  /import\.meta\.env\b/,
  /\$\{\{\s*secrets\./,
  /^\s*\/\//,   // comment-only line
  /^\s*\*/,     // jsdoc line
  /from\s+['"]https?:/,  // import URL
  /import\s+.*from/,
];

function isSafeLine(line) {
  return SAFE_PATTERNS.some((re) => re.test(line));
}

/**
 * Extract the string literal value from a line like:
 *   const FOO = "value"
 *   const FOO = 'value'
 *   export const FOO = "value"
 * Returns null if no assignment literal found.
 */
function extractLiteralValue(line) {
  const m = line.match(/=\s*["']([^"']+)["']\s*;?\s*$/)
             ?? line.match(/=\s*["']([^"']+)["']/)
  return m ? m[1] : null;
}

function isCredentialName(line) {
  // Check if the variable name looks like a credential holder
  const nameMatch = line.match(/(?:const|let|var|export\s+const)\s+(\w+)\s*=/)
  if (!nameMatch) return false;
  return CRED_NAME_RE.test(nameMatch[1]);
}

function scanFile(absPath) {
  const findings = [];
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return findings;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (isSafeLine(line)) continue;

    const literal = extractLiteralValue(line);
    if (!literal) continue;

    // Rule HEX64
    if (HEX64_RE.test(literal) && isCredentialName(line)) {
      findings.push({ lineNo, rule: 'HEX64', redacted: '[REDACTED]' });
      continue;
    }

    // Rule HEX40
    if (HEX40_RE.test(literal) && isCredentialName(line)) {
      findings.push({ lineNo, rule: 'HEX40', redacted: '[REDACTED]' });
      continue;
    }

    // Rule BEARER — bearer token literals over 32 chars on a credential-name line
    if (LONGALPHA_RE.test(literal) && literal.length > 32 && isCredentialName(line)) {
      findings.push({ lineNo, rule: 'BEARER', redacted: '[REDACTED]' });
    }
  }
  return findings;
}

/**
 * Scan a single SQL migration file for credential-like literals in
 * pg_net / jsonb_build_object header pairs, e.g.:
 *   'x-cron-secret', '<hex64>'
 *   'Authorization', 'Bearer <token>'
 *
 * The SQL pattern is a string key that names a credential header
 * followed immediately by a long hex or long alpha literal value.
 */
function scanSqlFile(absPath) {
  const findings = [];
  const basename = absPath.split('/').pop();
  if (HISTORICAL_MIGRATION_EXCLUSIONS.has(basename)) return findings;

  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return findings;
  }

  // SQL header credential key names (case-insensitive)
  const SQL_CRED_KEY_RE = /(?:secret|token|key|password|credential|auth|Authorization)/i;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Skip comment lines
    if (/^\s*--/.test(line)) continue;
    if (/^\s*\/\*/.test(line)) continue;

    // Match: '<credential-key>', '<long-hex-or-token>' in SQL
    // Pattern: a single-quoted credential key followed by comma and a single-quoted value
    const sqlPairRe = /'([^']+)'\s*,\s*'([^']+)'/g;
    let m;
    while ((m = sqlPairRe.exec(line)) !== null) {
      const key   = m[1];
      const value = m[2];

      if (!SQL_CRED_KEY_RE.test(key)) continue;

      if (HEX64_RE.test(value)) {
        findings.push({ lineNo, rule: 'SQL_HEX64', redacted: '[REDACTED]' });
      } else if (HEX40_RE.test(value)) {
        findings.push({ lineNo, rule: 'SQL_HEX40', redacted: '[REDACTED]' });
      } else if (LONGALPHA_RE.test(value) && value.length > 32) {
        findings.push({ lineNo, rule: 'SQL_BEARER', redacted: '[REDACTED]' });
      }
    }
  }
  return findings;
}

function walkDir(dir, results = [], extFilter = ['.ts', '.js']) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.some((ex) => entry === ex)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, results, extFilter);
    } else if (extFilter.includes(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

let totalFindings = 0;

for (const dir of SCAN_DIRS) {
  const absDir = join(repoRoot, dir);
  const files = walkDir(absDir, [], ['.ts', '.js']);
  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      const rel = relative(repoRoot, file);
      for (const f of findings) {
        console.log(`FINDING  ${rel}:${f.lineNo}  rule=${f.rule}  value=${f.redacted}`);
        totalFindings++;
      }
    }
  }
}

// Scan new/non-historical SQL migrations
for (const dir of SQL_SCAN_DIRS) {
  const absDir = join(repoRoot, dir);
  const files = walkDir(absDir, [], ['.sql']);
  for (const file of files) {
    const findings = scanSqlFile(file);
    if (findings.length > 0) {
      const rel = relative(repoRoot, file);
      for (const f of findings) {
        console.log(`FINDING  ${rel}:${f.lineNo}  rule=${f.rule}  value=${f.redacted}`);
        totalFindings++;
      }
    }
  }
}

if (totalFindings === 0) {
  console.log('OK  No hardcoded credential literals found.');
  process.exit(0);
} else {
  console.error(`\nFAIL  ${totalFindings} hardcoded credential finding(s). See above.`);
  process.exit(1);
}
