// GRN Report — Sitapura PV (3000840)
// Thin wrapper around PartsGRNDealerReport with dealer-specific props.
import PartsGRNDealerReport from './PartsGRNDealerReport'
import type { ReportViewProps } from '../types'

export default function GRNSitapuraPVReport(props: ReportViewProps) {
  return (
    <PartsGRNDealerReport
      {...props}
      dealerCode="3000840"
      dealerName="Sitapura PV"
      accentColor="blue"
      importLink="/import"
      reportRoute="/reports/parts/grn-sitapura-pv"
    />
  )
}
