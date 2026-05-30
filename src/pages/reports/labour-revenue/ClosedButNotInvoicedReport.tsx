import type { ReportViewProps } from '../types'
import ServiceInvoiceOrderStatusReport from './ServiceInvoiceOrderStatusReport'

export default function ClosedButNotInvoicedReport(props: ReportViewProps) {
  return (
    <ServiceInvoiceOrderStatusReport
      {...props}
      mode="closed-not-invoiced"
      title="JC Closed But Not Invoiced"
    />
  )
}
