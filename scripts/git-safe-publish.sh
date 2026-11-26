#!/usr/bin/env bash
set -euo pipefail

# Safe Git publish workflow for this repository.
#
# This script is the Publication stage of the Repository Transaction Framework
# (docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md). Every
# transaction type defined there reaches "Publication" by running this script
# (npm run publish:safe) — it is not an isolated script with its own
# separate workflow.
#
# What this does, in order:
#   1. Verify the repo is on the "main" branch.
#   2. Show git status, run docs validation, show the pending diff stat.
#   3. Show the exact list of changed files.
#   4. If local changes exist, automatically run a read-only outgoing
#      local-change intake report (scripts/repo_change_impact.mjs) before
#      commit confirmation.
#   5. If the local report raises review-sensitive findings, require an
#      explicit second confirmation before commit can proceed.
#   6. Ask for confirmation before committing.
#   7. git add -A (validator reports are never staged), then unstage any DB paths deferred in
#      publication_readiness_disposition.json, then commit.
#   8. Record the local HEAD before pulling (for manual rollback reference).
#   9. Merge origin/main only if it has new commits (never rebase)
#  10. Detect whether origin/main had new commits.
#  11. If new commits came in, automatically run a read-only incoming-change
#      intake report (scripts/repo_change_impact.mjs --range) covering just
#      those commits, then stop and print an audit prompt to run before
#      pushing (does not push).
#  12. If no new commits came in, run publish-readiness verification.
#  13. Ask for confirmation before pushing.
#  14. git push origin main
#
# Safety rules (enforced, not optional):
#   - Never pushes if the pull brought in new commits from origin/main.
#   - Never pushes if the blocking docs validator (npm run docs:validate) or the build (npm run build) fails.
#   - Never rewrites local history; never pushes if merging origin/main produced conflicts.
#   - Never commits if there are no changes.
#   - Never commits regenerated validator reports; edits to them that existed before the run are kept.
#   - Runs only on local main tracking origin/main; refuses otherwise before changing anything.
#   - Never commits if local change impact analysis fails.
#   - Never pushes if publish-readiness verification fails.
#   - Never commits or pushes without explicit interactive confirmation.
#   - Reads no credentials and hardcodes none; git push/pull use whatever
#     credential helper/SSH key is already configured for this repo.
#
# Note on validation commands:
#   - `npm run docs:validate` is the blocking gate in this repo (it currently
#     runs the plan-retention validator). A non-zero exit here stops this
#     script before any commit.
#   - `npm run docs:validate:health` is an advisory-only repository health
#     audit (see docs/STRUCTURE_GUIDE.md Section 24 and
#     docs/shared/reference/SYNC_PROTOCOL.md). It exits non-zero whenever it
#     finds any advisory issue, by design — it is intentionally NOT one of
#     the blocking gates, so this script reports its output but does not
#     abort because of it.
#
# Usage (must be run from the repository root):
#   npm run publish:safe
#   bash scripts/git-safe-publish.sh
#   npm run git:safe-publish   # backward-compatible alias
#
# Exit codes:
#   0  success (pushed), or a clean no-op (nothing to commit/push)
#   1  precondition failed (not repo root, wrong branch) or user declined
#   2  blocking validation failed (npm run docs:validate)
#   3  merge produced conflicts (push withheld, manual resolution required)
#   4  origin/main had new commits, now merged (push withheld, audit required)
#   5  .git/index.lock already exists (stale or live lock; see preflight check)
#   6  local outgoing impact analysis failed before commit
#   7  publish-readiness verification failed before push

trap 'echo "git-safe-publish: unexpected error near line ${LINENO}. Nothing was pushed." >&2' ERR

# ---------------------------------------------------------------------------
# Step 0: must be run from the repository root.
# ---------------------------------------------------------------------------
current_dir="$(pwd)"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository. Run this script from the repository root." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"

if [[ "$current_dir" != "$repo_root" ]]; then
  echo "Error: this script must be run from the repository root." >&2
  echo "  You are in : $current_dir" >&2
  echo "  Repo root is: $repo_root" >&2
  echo "  Run: cd \"$repo_root\" && bash scripts/git-safe-publish.sh" >&2
  exit 1
fi

echo "== git-safe-publish: starting from repository root ($repo_root) =="

# ---------------------------------------------------------------------------
# Step 1: verify current branch is main.
# ---------------------------------------------------------------------------
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  echo "Error: current branch is '$current_branch'. This script publishes only local 'main' to origin/main." >&2
  echo "Nothing was changed. To publish another branch's work, first bring it onto main (for example:" >&2
  echo "  git switch main && git merge --ff-only <branch>) after its reviews are recorded." >&2
  exit 1
fi
main_upstream="$(git rev-parse --abbrev-ref --symbolic-full-name 'main@{u}' 2>/dev/null || true)"
if [[ "$main_upstream" != "origin/main" ]]; then
  echo "Error: local main must track origin/main (tracks: '${main_upstream:-nothing}'). Nothing was changed." >&2
  exit 1
fi
echo "Publication branch: main -> destination: origin/main ($(git remote get-url origin))"

# ---------------------------------------------------------------------------
# Step 1.5: preflight check for an existing .git/index.lock.
#
# Without this check, a leftover lock from a crashed/interrupted git
# operation only surfaces later, inside `git add -A` or `git commit`, where
# this script's blanket ERR trap (line 1) catches it and prints a generic
# "unexpected error near line N" — swallowing git's own specific guidance
# ("Another git process seems to be running... remove the file manually to
# continue") right when that detail matters most. Surface it clearly here
# instead, before any validation or diff output, and stop with a distinct
# exit code.
# ---------------------------------------------------------------------------
lock_file="${repo_root}/.git/index.lock"
if [[ -e "$lock_file" ]]; then
  lock_mtime="$(stat -c %Y "$lock_file" 2>/dev/null || stat -f %m "$lock_file" 2>/dev/null || echo "")"
  if [[ -n "$lock_mtime" ]]; then
    lock_age_seconds=$(( $(date +%s) - lock_mtime ))
    echo "Error: $lock_file already exists (age: ${lock_age_seconds}s)." >&2
  else
    echo "Error: $lock_file already exists." >&2
  fi
  echo "This usually means a previous git operation crashed or was interrupted before cleaning up." >&2
  echo "Before re-running:" >&2
  echo "  1. Confirm no git process is actually using it: ps aux | grep git" >&2
  echo "  2. If nothing is using it, remove the stale lock: rm \"$lock_file\"" >&2
  echo "  3. Confirm git works again: git status" >&2
  echo "  4. Re-run this script." >&2
  echo "Refusing to proceed with a pre-existing lock file. Nothing committed or pushed." >&2
  exit 5
fi

# ---------------------------------------------------------------------------
# Validator reports are outputs of this pipeline, not part of a publication. They are never committed
# here: they are reset to HEAD wherever the tree must be clean, copies of this run are kept under
# .git/publish-safe/ for inspection, and on exit any edits that existed before the run are restored.
# ---------------------------------------------------------------------------
pipeline_reports=(
  "docs/shared/evidence/repo_change_impact_report.json"
  "docs/shared/evidence/repo_health_audit_report.json"
  "docs/Implementation_plans/retention_validation_report.json"
)
report_backup="$(mktemp -d)"
run_copy_dir="$(git rev-parse --git-dir)/publish-safe"
keep_impact_report=0

for index in "${!pipeline_reports[@]}"; do
  report="${pipeline_reports[$index]}"
  if [[ -f "$report" ]] && ! git diff --quiet HEAD -- "$report" 2>/dev/null; then
    cp "$report" "${report_backup}/${index}"
  fi
done

reset_reports_to_head() {
  local report
  mkdir -p "$run_copy_dir"
  for report in "${pipeline_reports[@]}"; do
    [[ -f "$report" ]] && cp "$report" "$run_copy_dir/"
    if git cat-file -e "HEAD:${report}" 2>/dev/null; then
      git checkout -q HEAD -- "$report"
    else
      rm -f -- "$report"
    fi
  done
}

restore_reports_on_exit() {
  local index report kept_impact=""
  if [[ "$keep_impact_report" -eq 1 ]]; then
    kept_impact="$(mktemp)"
    cp "${pipeline_reports[0]}" "$kept_impact"
  fi
  reset_reports_to_head || true
  for index in "${!pipeline_reports[@]}"; do
    report="${pipeline_reports[$index]}"
    [[ -f "${report_backup}/${index}" ]] && cp "${report_backup}/${index}" "$report"
  done
  [[ -n "$kept_impact" ]] && cp "$kept_impact" "${pipeline_reports[0]}"
  rm -rf -- "${report_backup:?}"
  echo "Validator reports from this run: ${run_copy_dir}/ (not committed)."
}

# ---------------------------------------------------------------------------
# Step 2: status, validation, diff stat.
# ---------------------------------------------------------------------------
echo
echo "---- git status ----"
git --no-pager status

trap restore_reports_on_exit EXIT

echo
echo "---- npm run docs:validate (blocking gate) ----"
if ! npm run docs:validate; then
  echo >&2
  echo "Error: npm run docs:validate failed. Fix validation errors before publishing. Nothing committed or pushed." >&2
  exit 2
fi

echo
echo "---- npm run docs:validate:health (advisory only, never blocking) ----"
if npm run docs:validate:health; then
  : # no advisory findings
else
  health_exit_code=$?
  echo "Note: health audit reported advisory findings (exit code $health_exit_code)."
  echo "This is informational only and does not block commit/push (see docs/STRUCTURE_GUIDE.md Section 24)."
fi

reset_reports_to_head

echo
echo "---- git diff --stat ----"
git --no-pager diff --stat || true

# ---------------------------------------------------------------------------
# Step 3: show changed files explicitly.
# ---------------------------------------------------------------------------
echo
echo "---- Changed files (working tree + index) ----"
changed_files="$(git --no-pager status --porcelain)"
if [[ -z "$changed_files" ]]; then
  echo "(none)"
else
  echo "$changed_files"
fi

# ---------------------------------------------------------------------------
# Step 4: local outgoing-change intake before commit confirmation.
# ---------------------------------------------------------------------------
if [[ -n "$changed_files" ]]; then
  echo
  echo "---- Auto-generating outgoing local-change intake report (read-only) ----"
  if node scripts/repo_change_impact.mjs; then
    local_impact_report="docs/shared/evidence/repo_change_impact_report.json"
    echo "Local impact report: ${local_impact_report}"
  else
    impact_exit_code=$?
    echo >&2
    echo "Error: local impact analysis failed (exit code ${impact_exit_code}). Fix the impact tool/report issue before committing. Nothing committed or pushed." >&2
    exit 6
  fi

  local_impact_summary="$(
    node -e '
      const fs = require("fs");
      const report = JSON.parse(fs.readFileSync("docs/shared/evidence/repo_change_impact_report.json", "utf8"));
      const cats = report.categories_present || [];
      const hasCategory = (name) => cats.some((c) => c.category === name);
      const independentReview = Boolean(report.independent_review_recommended_before_publication);
      const unknown = Array.isArray(report.unknown_or_unmapped_files) ? report.unknown_or_unmapped_files : [];
      const hasDb = hasCategory("database_schema_truth");
      const hasGenerated = hasCategory("generated_artifact");
      const needsCaution = independentReview || unknown.length > 0 || hasDb || hasGenerated;
      const reasons = [];
      if (independentReview) reasons.push("independent review recommended");
      if (hasDb) reasons.push("DB ledger/protocol expectations present");
      if (hasGenerated) reasons.push("generated artifact refresh/validation expectations present");
      if (unknown.length > 0) reasons.push(`unmapped file review required (${unknown.length})`);
      console.log(JSON.stringify({
        needs_caution: needsCaution,
        reasons,
        validation_commands: report.validation_commands_to_run || [],
        review_recommended: independentReview,
        unknown_count: unknown.length
      }));
    '
  )"

  local_impact_needs_caution="$(
    node -e 'const s = JSON.parse(process.argv[1]); console.log(s.needs_caution ? "yes" : "no")' "$local_impact_summary"
  )"

  if [[ "$local_impact_needs_caution" == "yes" ]]; then
    echo
    echo "Local impact intake raised review-sensitive findings:"
    node -e '
      const s = JSON.parse(process.argv[1]);
      for (const reason of s.reasons) console.log(`  - ${reason}`);
      if (s.validation_commands.length > 0) {
        console.log("Recommended validation from impact report:");
        for (const command of s.validation_commands) console.log(`  - ${command}`);
      }
    ' "$local_impact_summary"
    echo
    echo "This script will not auto-edit documentation, auto-self-heal, refresh generated artifacts, or update the DB ledger."
    echo "Confirm those expectations have been reviewed/routed, or abort and address them before publishing."

    if [[ ! -t 0 ]]; then
      echo >&2
      echo "Error: no interactive terminal detected. Refusing to commit local changes with review-sensitive impact findings." >&2
      exit 1
    fi

    echo
    read -r -p "Continue toward commit despite these local impact findings? [y/N] " confirm_local_impact
    if [[ ! "$confirm_local_impact" =~ ^[Yy]$ ]]; then
      echo "Aborted by user after local impact intake. Nothing committed or pushed."
      exit 1
    fi
  else
    echo "Local impact intake found no review-sensitive findings."
  fi

  reset_reports_to_head

  echo
  echo "---- Changed files after local impact intake ----"
  changed_files="$(git --no-pager status --porcelain)"
  if [[ -z "$changed_files" ]]; then
    echo "(none)"
  else
    echo "$changed_files"
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 + 6: confirm, then commit (skip cleanly if nothing to commit).
# ---------------------------------------------------------------------------
if [[ -z "$changed_files" ]]; then
  echo
  echo "No changes to commit. Skipping commit step."
else
  if [[ ! -t 0 ]]; then
    echo >&2
    echo "Error: no interactive terminal detected. Refusing to commit without explicit confirmation." >&2
    echo "Run this script from an interactive terminal." >&2
    exit 1
  fi

  echo
  read -r -p "Commit the changes listed above with message \"Changes by Vinod\"? [y/N] " confirm_commit
  if [[ ! "$confirm_commit" =~ ^[Yy]$ ]]; then
    echo "Aborted by user before commit. Nothing committed or pushed."
    exit 1
  fi

  git add -A
  git reset -q HEAD -- "${pipeline_reports[@]}"

  deferred_from_publication="$(
    node -e '
      const fs = require("fs");
      const dispositionPath = "docs/shared/evidence/publication_readiness_disposition.json";
      try {
        const disposition = JSON.parse(fs.readFileSync(dispositionPath, "utf8"));
        const paths = (disposition.deferred_db_changes || [])
          .filter((entry) => entry.deferred_from_publication === true && entry.reason)
          .flatMap((entry) => entry.paths || []);
        console.log([...new Set(paths)].join("\n"));
      } catch (_) {}
    '
  )"

  if [[ -n "$deferred_from_publication" ]]; then
    echo
    echo "Unstaging DB paths deferred from publication (publication_readiness_disposition.json):"
    while IFS= read -r deferred_path; do
      [[ -z "$deferred_path" ]] && continue
      echo "  - ${deferred_path}"
      git reset HEAD -- "$deferred_path" 2>/dev/null || true
    done <<< "$deferred_from_publication"
  fi

  git commit -m "Changes by Vinod"
  echo "Committed."
fi

# ---------------------------------------------------------------------------
# Step 6: record local HEAD before integrating.
# ---------------------------------------------------------------------------
prev_head="$(git rev-parse HEAD)"
echo
echo "Previous local HEAD (save for manual rollback if ever needed): $prev_head"

# ---------------------------------------------------------------------------
# Step 7/8: fetch first so we can accurately detect new upstream commits,
# then merge only if there is something new.
# ---------------------------------------------------------------------------
echo
echo "---- Checking origin/main before rebase ----"
git fetch origin main --quiet
new_commit_count="$(git rev-list --count "${prev_head}..origin/main")"

reset_reports_to_head

# Integrate only when origin/main has something new, and by merge: a rebase would replay (and can re-conflict
# on) merge commits already in local history, and would rewrite the commits that were validated and approved.
if [[ "$new_commit_count" -gt 0 ]]; then
  echo
  echo "---- git merge origin/main ----"
  if ! git merge --no-edit origin/main; then
    echo >&2
    echo "Error: merging origin/main failed (likely conflicts). Nothing was pushed." >&2
    echo "  1. Resolve conflicts (git status shows the files), then git add them and git commit" >&2
    echo "     (or: git merge --abort to restore the previous state)." >&2
    echo "  2. Re-run this script." >&2
    exit 3
  fi
fi

# ---------------------------------------------------------------------------
# Step 9/10: decide whether push is allowed.
# ---------------------------------------------------------------------------
if [[ "$new_commit_count" -gt 0 ]]; then
  echo
  echo "== STOPPING: $new_commit_count new commit(s) from origin/main were merged. =="

  echo
  echo "---- Auto-generating incoming-change intake report (advisory, read-only) ----"
  if node scripts/repo_change_impact.mjs --range "${prev_head}..origin/main"; then
    intake_report_status=0
  else
    intake_report_status=$?
    echo "Note: intake report generation did not complete cleanly (exit code ${intake_report_status})." >&2
    echo "This is advisory tooling only — it does not change the stop-before-push decision below." >&2
  fi

  keep_impact_report=1
  echo
  echo "Push withheld. Run an audit before pushing. Suggested audit prompt:"
  echo
  cat <<'AUDIT_PROMPT'
  --------------------------------------------------------------------------
  Review the commits just pulled from origin/main onto the local main
  branch during the most recent merge. An automated incoming-change intake
  report covering exactly those commits was just generated at
  docs/shared/evidence/repo_change_impact_report.json (mode:
  "incoming_commit_range") — read it first; it lists the upstream commits,
  the files/categories they touched, the owning authority for each, and
  which validation it recommends. Use it to confirm the upstream commits do
  not conflict with, duplicate, or invalidate the local changes just
  committed on top of them. Run `npm run docs:validate` and
  `npm run docs:validate:health` and report the results. Use the Repository
  Audit and Code Review task contracts in
  docs/shared/reference/catalog/task_library/generic/ as the basis for this
  review. Report whether it is safe to push, and what (if anything) needs
  to change first.
  --------------------------------------------------------------------------
AUDIT_PROMPT
  echo
  echo "Re-run this script after completing that review to push."
  exit 4
fi

echo
echo "No new commits came in from origin/main. Safe to push."

echo
echo "---- Refresh publication validation evidence before readiness gate ----"
if ! npm run docs:validate; then
  echo >&2
  echo "Error: npm run docs:validate failed during pre-push readiness refresh. Nothing was pushed." >&2
  exit 2
fi

if npm run docs:validate:health; then
  : # no advisory findings
else
  health_exit_code=$?
  echo "Note: health audit reported advisory findings during pre-push readiness refresh (exit code $health_exit_code)."
  echo "This is informational only and does not block push (see docs/STRUCTURE_GUIDE.md Section 24)."
fi

# Technical validation is what routine changes publish on: the application must build.
echo
echo "---- npm run build (blocking gate) ----"
if ! npm run build --if-present; then
  echo >&2
  echo "Error: the build failed. Nothing was pushed." >&2
  exit 2
fi

# High-risk files without a current approval: the owner types APPROVE here and it is recorded. The readiness
# gate below still verifies the record.
if [[ -f scripts/publish_record_approval.mjs ]]; then
  if ! node scripts/publish_record_approval.mjs; then
    echo >&2
    echo "Error: approval was not given. Nothing was pushed." >&2
    exit 7
  fi
fi

publish_upstream="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"
unpushed_count=0
if [[ -n "$publish_upstream" ]]; then
  unpushed_count="$(git rev-list --count "${publish_upstream}..HEAD")"
fi

if [[ "$unpushed_count" -gt 0 ]]; then
  node scripts/repo_change_impact.mjs --range "${publish_upstream}..HEAD"
else
  node scripts/repo_change_impact.mjs
fi

echo
echo "---- npm run publish:ready (blocking readiness gate) ----"
if ! npm run publish:ready; then
  echo >&2
  echo "Error: publish-readiness verification failed. Resolve blockers before pushing. Nothing was pushed." >&2
  exit 7
fi

if [[ ! -t 0 ]]; then
  echo >&2
  echo "Error: no interactive terminal detected. Refusing to push without explicit confirmation." >&2
  exit 1
fi

echo "Commits to be pushed to origin/main:"
git --no-pager log --oneline origin/main..HEAD
published_head="$(git rev-parse HEAD)"
read -r -p "Push to origin main now? [y/N] " confirm_push
if [[ ! "$confirm_push" =~ ^[Yy]$ ]]; then
  echo "Aborted by user before push. Local commit(s) remain unpushed."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 11: push.
# ---------------------------------------------------------------------------
if [[ "$(git rev-parse HEAD)" != "$published_head" || "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
  echo "Error: HEAD changed after the readiness gate. Nothing was pushed." >&2
  exit 7
fi

echo
echo "---- git push origin main ----"
git push origin main

echo
echo "== git-safe-publish: done. =="
