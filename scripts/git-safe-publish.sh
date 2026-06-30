#!/usr/bin/env bash
set -euo pipefail

# Safe Git publish workflow for this repository.
#
# This script is the Publication stage of the Repository Transaction Framework
# (docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md). Every
# transaction type defined there reaches "Publication" by running this script
# (npm run git:safe-publish) — it is not an isolated script with its own
# separate workflow.
#
# What this does, in order:
#   1. Verify the repo is on the "main" branch.
#   2. Show git status, run docs validation, show the pending diff stat.
#   3. Show the exact list of changed files.
#   4. Ask for confirmation before committing.
#   5. git add -A && git commit -m "Changes by Vinod"
#   6. Record the local HEAD before pulling (for manual rollback reference).
#   7. git pull --rebase origin main
#   8. Detect whether that pull brought in new commits from origin/main.
#   9. If new commits came in, stop and print an audit prompt to run before
#      pushing (does not push).
#  10. If no new commits came in, ask for confirmation before pushing.
#  11. git push origin main
#
# Safety rules (enforced, not optional):
#   - Never pushes if the pull brought in new commits from origin/main.
#   - Never pushes if the blocking docs validator (npm run docs:validate) fails.
#   - Never pushes if the rebase produced conflicts.
#   - Never commits if there are no changes.
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
#   bash scripts/git-safe-publish.sh
#   npm run git:safe-publish
#
# Exit codes:
#   0  success (pushed), or a clean no-op (nothing to commit/push)
#   1  precondition failed (not repo root, wrong branch) or user declined
#   2  blocking validation failed (npm run docs:validate)
#   3  rebase produced conflicts (push withheld, manual resolution required)
#   4  pull brought in new commits from origin/main (push withheld, audit required)
#   5  .git/index.lock already exists (stale or live lock; see preflight check)

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
  echo "Error: current branch is '$current_branch'. This script only operates on 'main'." >&2
  echo "Switch to main first: git checkout main" >&2
  exit 1
fi
echo "On branch: main"

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
# Step 2: status, validation, diff stat.
# ---------------------------------------------------------------------------
echo
echo "---- git status ----"
git --no-pager status

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
# Step 4 + 5: confirm, then commit (skip cleanly if nothing to commit).
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
  git commit -m "Changes by Vinod"
  echo "Committed."
fi

# ---------------------------------------------------------------------------
# Step 6: record local HEAD before pulling.
# ---------------------------------------------------------------------------
prev_head="$(git rev-parse HEAD)"
echo
echo "Previous local HEAD (save for manual rollback if ever needed): $prev_head"

# ---------------------------------------------------------------------------
# Step 7/8: fetch first so we can accurately detect new upstream commits,
# then run the actual rebase pull as specified.
# ---------------------------------------------------------------------------
echo
echo "---- Checking origin/main before rebase ----"
git fetch origin main --quiet
new_commit_count="$(git rev-list --count "${prev_head}..origin/main")"

echo
echo "---- git pull --rebase origin main ----"
if git pull --rebase origin main; then
  pull_exit_code=0
else
  pull_exit_code=$?
fi

if [[ "$pull_exit_code" -ne 0 ]]; then
  echo >&2
  echo "Error: git pull --rebase origin main failed (likely rebase conflicts)." >&2
  echo "Repository left as-is for manual resolution. Nothing was pushed." >&2
  echo "  1. Resolve conflicts (git status will show conflicted files)." >&2
  echo "  2. git add <resolved files>" >&2
  echo "  3. git rebase --continue   (or: git rebase --abort to give up and restore previous state)" >&2
  echo "  4. Re-run this script once the rebase is clean." >&2
  exit 3
fi

# ---------------------------------------------------------------------------
# Step 9/10: decide whether push is allowed.
# ---------------------------------------------------------------------------
if [[ "$new_commit_count" -gt 0 ]]; then
  echo
  echo "== STOPPING: $new_commit_count new commit(s) were pulled from origin/main during rebase. =="
  echo "Push withheld. Run an audit before pushing. Suggested audit prompt:"
  echo
  cat <<'AUDIT_PROMPT'
  --------------------------------------------------------------------------
  Review the commits just pulled from origin/main onto the local main
  branch during the most recent rebase. Confirm they do not conflict with,
  duplicate, or invalidate the local changes just committed on top of them.
  Run `npm run docs:validate` and `npm run docs:validate:health` and report
  the results. Use the Repository Audit and Code Review task contracts in
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

if [[ ! -t 0 ]]; then
  echo >&2
  echo "Error: no interactive terminal detected. Refusing to push without explicit confirmation." >&2
  exit 1
fi

read -r -p "Push to origin main now? [y/N] " confirm_push
if [[ ! "$confirm_push" =~ ^[Yy]$ ]]; then
  echo "Aborted by user before push. Local commit(s) remain unpushed."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 11: push.
# ---------------------------------------------------------------------------
echo
echo "---- git push origin main ----"
git push origin main

echo
echo "== git-safe-publish: done. =="
