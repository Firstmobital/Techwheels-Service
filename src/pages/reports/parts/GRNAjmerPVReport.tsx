// GRN Report — Ajmer Road PV (3001440)
// Thin wrapper around PartsGRNDealerReport with dealer-specific props.
import PartsGRNDealerReport from './PartsGRNDealerReport'
import type { ReportViewProps } from '../types'

export default function GRNAjmerPVReport(props: ReportViewProps) {
  return (
    <PartsGRNDealerReport
      {...props}
      dealerCode="3001440"
      dealerName="Ajmer Road PV"
      accentColor="purple"
      importLink="/import"
      reportRoute="/reports/parts/grn-ajmer-pv"
    />
  )
}
