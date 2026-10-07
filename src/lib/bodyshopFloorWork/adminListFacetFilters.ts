import type { BodyshopFloorWorkTask } from './roles'
import type { FloorWorkPhysicalFloorFilter } from './display'
import type { FloorWorkFloorDayBucket } from './display'
import type { FloorWorkPipelineStageBucket, FloorWorkPipelineStageFilter } from './pipelineStageFilter'

export type UpdateFilter = 'all' | 'pending' | 'done'
export type FloorDayFilter = 'all' | FloorWorkFloorDayBucket

export type FloorWorkListEntry = {
  jobCardNumber: string
  tasks: BodyshopFloorWorkTask[]
  floorDayBucket: FloorWorkFloorDayBucket
  physicalFloorKey: 'Floor 2' | 'Floor 3' | 'unknown'
  pipelineStage: FloorWorkPipelineStageBucket
  hasPending: boolean
}

export type AdminListFacetFilters = {
  floorDay: FloorDayFilter
  physical: FloorWorkPhysicalFloorFilter
  pipeline: FloorWorkPipelineStageFilter
  update: UpdateFilter
}

export function matchesAdminListFacets(entry: FloorWorkListEntry, facets: AdminListFacetFilters): boolean {
  if (facets.floorDay !== 'all' && entry.floorDayBucket !== facets.floorDay) return false
  if (facets.physical !== 'all' && entry.physicalFloorKey !== facets.physical) return false
  if (facets.pipeline !== 'all' && entry.pipelineStage !== facets.pipeline) return false
  if (facets.update === 'pending' && !entry.hasPending) return false
  if (facets.update === 'done' && entry.hasPending) return false
  return true
}

export function filterAdminListCatalog(
  catalog: FloorWorkListEntry[],
  facets: AdminListFacetFilters,
): FloorWorkListEntry[] {
  return catalog.filter((e) => matchesAdminListFacets(e, facets))
}

export function countAdminListFacet(
  catalog: FloorWorkListEntry[],
  facets: AdminListFacetFilters,
  override: Partial<AdminListFacetFilters>,
): number {
  return filterAdminListCatalog(catalog, { ...facets, ...override }).length
}

/** List length must equal the active chip count for each facet dimension. */
export function assertAdminListFacetCountsMatchList(
  catalog: FloorWorkListEntry[],
  facets: AdminListFacetFilters,
): string[] {
  const errors: string[] = []
  const listLen = filterAdminListCatalog(catalog, facets).length

  const floorDayKeys: FloorDayFilter[] = ['all', 'today', 'yesterday', 'older', 'unknown']
  for (const key of floorDayKeys) {
    if (facets.floorDay === key && key !== 'all') {
      const n = countAdminListFacet(catalog, facets, { floorDay: key })
      if (n !== listLen) errors.push(`floorDay active "${key}": chip count ${n} !== list ${listLen}`)
    }
  }

  const physicalKeys: FloorWorkPhysicalFloorFilter[] = ['all', 'Floor 2', 'Floor 3', 'unknown']
  for (const key of physicalKeys) {
    if (facets.physical === key && key !== 'all') {
      const n = countAdminListFacet(catalog, facets, { physical: key })
      if (n !== listLen) errors.push(`physical active "${key}": chip count ${n} !== list ${listLen}`)
    }
  }

  const pipelineKeys: FloorWorkPipelineStageFilter[] = ['all', 'unassigned', 'hold', 'denting', 'painting', 'technician', 'rubbing', 'worker_qc', 'floor_completed']
  for (const key of pipelineKeys) {
    if (facets.pipeline === key && key !== 'all') {
      const n = countAdminListFacet(catalog, facets, { pipeline: key })
      if (n !== listLen) errors.push(`pipeline active "${key}": chip count ${n} !== list ${listLen}`)
    }
  }

  const updateKeys: UpdateFilter[] = ['all', 'pending', 'done']
  for (const key of updateKeys) {
    if (facets.update === key && key !== 'all') {
      const n = countAdminListFacet(catalog, facets, { update: key })
      if (n !== listLen) errors.push(`update active "${key}": chip count ${n} !== list ${listLen}`)
    }
  }

  if (facets.floorDay === 'all' && facets.physical === 'all' && facets.pipeline === 'all' && facets.update === 'all') {
    const n = countAdminListFacet(catalog, facets, {})
    if (n !== listLen) errors.push(`all facets open: total chip ${n} !== list ${listLen}`)
    if (listLen !== catalog.length) errors.push(`all facets open: list ${listLen} !== catalog ${catalog.length}`)
  }

  return errors
}
