// GRN Report — Sitapura EV (500A840)
// Thin wrapper around PartsGRNDealerReport scoped to EV Sitapura dealer.
import PartsGRNDealerReport from './PartsGRNDealerReport'
import type { ReportViewProps } from '../types'

export default function GRNSitapuraEVReport(props: ReportViewProps) {
  return (
    <PartsGRNDealerReport
      {...props}
      dealerCode="500A840"
      dealerName="Sitapura EV"
      accentColor="emerald"
      importLink="/import"
      reportRoute="/reports/parts/grn-sitapura-ev"
    />
  )
}
