import type { ReportViewProps } from '../types'
import ServiceInvoiceOrderStatusReport from './ServiceInvoiceOrderStatusReport'

export default function CancelledJobCardReport(props: ReportViewProps) {
  return (
    <ServiceInvoiceOrderStatusReport
      {...props}
      mode="cancel"
      title="Cancelled Job Card"
    />
  )
}
