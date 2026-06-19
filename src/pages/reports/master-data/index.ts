import MasterDataNullCountsReport from './MasterDataNullCountsReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const MASTER_DATA_CATEGORY: ReportCategoryDefinition = {
  id: 'master-data',
  label: 'Master Data Report',
  description: 'Column-wise null completeness for all_service_data.',
}

export const MASTER_DATA_REPORTS: ReportDefinition[] = [
  {
    id: 'master-data-null-counts',
    categoryId: 'master-data',
    label: 'All Service Data Null Counts',
    description: 'Shows null counts and completeness for each column in all_service_data.',
    cardHint: 'Best for data quality validation before report analysis.',
    Component: MasterDataNullCountsReport,
  },
]
