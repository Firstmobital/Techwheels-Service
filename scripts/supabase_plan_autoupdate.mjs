import runPlanAutoupdate from './plan_autoupdate.mjs'

const DEFAULT_PLAN_PATH =
  'docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md'

export async function updateMasterPlanFromSummary(summary, options = {}) {
  const repoRoot = options.repoRoot || process.cwd()
  const relativePlanPath = options.planRelativePath || DEFAULT_PLAN_PATH
  const result = await runPlanAutoupdate({
    repoRoot,
    planRelativePath: relativePlanPath,
    adapterName: 'supabase',
    payload: summary,
  })

  return {
    planPath: result.planPath,
    snapshotNumber: result.metadata?.snapshotNumber,
  }
}

export default updateMasterPlanFromSummary
