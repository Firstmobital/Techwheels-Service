import { createElement } from 'react'
import WarrantyOverviewReport from './WarrantyOverviewReport'
import WarrantySubReports from './WarrantySubReports'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'
import type { ReportViewProps } from '../types'

// Factory: wraps WarrantySubReports with the right activeTabId prop
function makeWarrantyTab(tabId: string) {
  return function WarrantyTab(props: ReportViewProps) {
    return createElement(WarrantySubReports, { ...props, activeTabId: tabId })
  }
}

export const WARRANTY_CATEGORY: ReportCategoryDefinition = {
  id: 'warranty',
  label: 'Warranty Reports',
  description: 'Warranty claim settlement, campaign, and goodwill reporting.',
}

export const WARRANTY_REPORTS: ReportDefinition[] = [
  {
    id: 'warranty-overview',
    categoryId: 'warranty',
    label: '📊 Overview',
    description: 'Consolidated warranty dashboard — all categories, monthly trends.',
    cardHint: 'Full overview across all warranty categories.',
    Component: WarrantyOverviewReport,
  },
  {
    id: 'warranty-claims',
    categoryId: 'warranty',
    label: '🛡️ Warranty',
    description: 'Standard warranty claims — Prowac prefix CW, CR, CS.',
    cardHint: 'Regular warranty claims.',
    Component: makeWarrantyTab('warranty-claims'),
  },
  {
    id: 'warranty-ext',
    categoryId: 'warranty',
    label: '🔒 Ext. Warranty',
    description: 'Extended warranty claims — Prowac prefix EW, ER, EE.',
    cardHint: 'Extended warranty — EV-heavy.',
    Component: makeWarrantyTab('warranty-ext'),
  },
  {
    id: 'warranty-goodwill',
    categoryId: 'warranty',
    label: '🤝 Goodwill',
    description: 'Goodwill warranty claims — Prowac prefix MW, MR, ME.',
    cardHint: 'Goodwill claims.',
    Component: makeWarrantyTab('warranty-goodwill'),
  },
  {
    id: 'warranty-rusting',
    categoryId: 'warranty',
    label: '🔧 Rusting',
    description: 'Rusting & body SPL claims — job code 980016.',
    cardHint: 'Rusting SPL claims.',
    Component: makeWarrantyTab('warranty-rusting'),
  },
  {
    id: 'warranty-pdi',
    categoryId: 'warranty',
    label: '🔍 PDI',
    description: 'Pre-delivery inspection claims — job code 980004.',
    cardHint: 'PDI claims.',
    Component: makeWarrantyTab('warranty-pdi'),
  },
  {
    id: 'warranty-amc',
    categoryId: 'warranty',
    label: '📋 AMC',
    description: 'Annual Maintenance Contract claims — Prowac prefix 00.',
    cardHint: 'AMC warranty claims.',
    Component: makeWarrantyTab('warranty-amc'),
  },
  {
    id: 'warranty-updation',
    categoryId: 'warranty',
    label: '⚙️ Updation',
    description: 'Updation / software warranty claims — Prowac SW, SR, SE.',
    cardHint: 'Updation claims.',
    Component: makeWarrantyTab('warranty-updation'),
  },
]
