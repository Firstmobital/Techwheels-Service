import fs from 'fs/promises'
import path from 'path'
import { applyRetentionMutations, resolvePlanPath } from './lib/plan_retention_policy.mjs'
import { supabasePlanAdapter } from './adapters/supabase_plan_adapter.mjs'

const ADAPTERS = {
  supabase: supabasePlanAdapter,
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = 'true'
      continue
    }
    args[key] = next
    i += 1
  }
  return args
}

async function loadPayloadFromArgs(args) {
  if (args['payload-json']) {
    return JSON.parse(args['payload-json'])
  }

  if (args['payload-file']) {
    const raw = await fs.readFile(path.resolve(process.cwd(), args['payload-file']), 'utf8')
    return JSON.parse(raw)
  }

  return null
}

export async function runPlanAutoupdate({
  repoRoot = process.cwd(),
  planRelativePath,
  adapterName,
  payload,
}) {
  if (!planRelativePath) {
    throw new Error('runPlanAutoupdate requires planRelativePath')
  }

  const adapter = ADAPTERS[adapterName]
  if (!adapter) {
    throw new Error(`Unknown adapter: ${adapterName}`)
  }

  const planPath = resolvePlanPath(repoRoot, planRelativePath)
  const markdown = await fs.readFile(planPath, 'utf8')
  const mutation = adapter.buildMutation({ markdown, payload })
  const writeResult = await applyRetentionMutations(planPath, mutation)

  return {
    planPath,
    changed: writeResult.changed,
    adapter: adapterName,
    metadata: mutation.metadata || {},
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const planRelativePath = args.plan
  const adapterName = args.adapter || 'supabase'
  const payload = await loadPayloadFromArgs(args)

  const result = await runPlanAutoupdate({
    repoRoot: process.cwd(),
    planRelativePath,
    adapterName,
    payload,
  })

  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}

export default runPlanAutoupdate
