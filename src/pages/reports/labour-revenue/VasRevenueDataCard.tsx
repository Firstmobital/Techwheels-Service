import VasRevenueReport from './VasRevenueReport'
import type { BranchFilter, DateRangeFilter } from '../../../lib/reportQueries'

interface VasRevenueDataCardProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function VasRevenueDataCard({ branch, dateFilter }: VasRevenueDataCardProps) {
  // Preserve legacy route/component usage while delegating to the canonical VAS report implementation.
  return <VasRevenueReport branch={branch} dateFilter={dateFilter} />
}
