/**
 * Verifies Floor Work admin filter chips match filtered list length (same rules as UI).
 */
import {
  assertAdminListFacetCountsMatchList,
  countAdminListFacet,
  filterAdminListCatalog,
  type AdminListFacetFilters,
  type FloorWorkListEntry,
} from '../src/lib/bodyshopFloorWork/adminListFacetFilters.ts'
import { PIPELINE_STAGE_FILTER_BUCKETS } from '../src/lib/bodyshopFloorWork/pipelineStageFilter.ts'

function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function buildRandomCatalog(n: number): FloorWorkListEntry[] {
  const floorDays = ['today', 'yesterday', 'older', 'unknown'] as const
  const physical = ['Floor 2', 'Floor 3', 'unknown'] as const
  const out: FloorWorkListEntry[] = []
  for (let i = 0; i < n; i += 1) {
    out.push({
      jobCardNumber: `JC-${i}`,
      tasks: [],
      floorDayBucket: randPick([...floorDays]),
      physicalFloorKey: randPick([...physical]),
      pipelineStage: randPick(PIPELINE_STAGE_FILTER_BUCKETS),
      hasPending: Math.random() > 0.5,
    })
  }
  return out
}

function randomFacets(): AdminListFacetFilters {
  const floorDayOpts = ['all', 'today', 'yesterday', 'older', 'unknown'] as const
  const physicalOpts = ['all', 'Floor 2', 'Floor 3', 'unknown'] as const
  const pipelineOpts = ['all', ...PIPELINE_STAGE_FILTER_BUCKETS] as const
  const updateOpts = ['all', 'pending', 'done'] as const
  return {
    floorDay: randPick([...floorDayOpts]),
    physical: randPick([...physicalOpts]),
    pipeline: randPick([...pipelineOpts]),
    update: randPick([...updateOpts]),
  }
}

let failures = 0
const rounds = 500

for (let r = 0; r < rounds; r += 1) {
  const catalog = buildRandomCatalog(20 + Math.floor(Math.random() * 80))
  const facets = randomFacets()
  const list = filterAdminListCatalog(catalog, facets)
  const errors = assertAdminListFacetCountsMatchList(catalog, facets)
  if (errors.length > 0) {
    failures += 1
    console.error(`Round ${r + 1} failed:`, errors)
  }

  // Cross-facet: pipelineStage.all with current other filters
  const pipelineAll = countAdminListFacet(catalog, facets, { pipeline: 'all' })
  const manualAllPipeline = filterAdminListCatalog(catalog, { ...facets, pipeline: 'all' }).length
  if (pipelineAll !== manualAllPipeline) {
    failures += 1
    console.error(`Round ${r + 1}: pipeline all chip mismatch`)
  }

  // Active pipeline chip
  if (facets.pipeline !== 'all') {
    const chip = countAdminListFacet(catalog, facets, { pipeline: facets.pipeline })
    if (chip !== list.length) {
      failures += 1
      console.error(`Round ${r + 1}: active pipeline chip ${chip} !== list ${list.length}`)
    }
  }
}

if (failures > 0) {
  console.error(`FAILED: ${failures} issues in ${rounds} rounds`)
  process.exit(1)
}

console.log(`OK: ${rounds} random facet rounds — list and chip counts match`)
