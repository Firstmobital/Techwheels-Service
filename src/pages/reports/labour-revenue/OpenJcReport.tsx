import type { ReportViewProps } from '../types'
import ServiceInvoiceOrderStatusReport from './ServiceInvoiceOrderStatusReport'

export default function OpenJcReport(props: ReportViewProps) {
  return (
    <ServiceInvoiceOrderStatusReport
      {...props}
      mode="open"
      title="Open JC"
    />
  )
}
