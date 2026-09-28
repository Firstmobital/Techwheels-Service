import { Alert, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerCard, formatInr } from './customerUi'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { openReceptionDocument } from '../../lib/customer/openReceptionDocument'
import type { MechanicalCasePayload } from '../../lib/customer/mechanicalCustomerUi'
import type { EstimateView } from '../../lib/customer/math'

function DocRow({
  title,
  subtitle,
  driveUrl,
  storagePath,
}: {
  title: string
  subtitle: string
  driveUrl?: string | null
  storagePath?: string | null
}) {
  const ready = Boolean(String(driveUrl || '').trim() || String(storagePath || '').trim())
  return (
    <CustomerCard style={{ marginBottom: 10 }}>
      <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 15 }}>{title}</Text>
      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{subtitle}</Text>
      {ready ? (
        <TouchableOpacity
          onPress={() =>
            void openReceptionDocument({ driveUrl, storagePath }).catch((e) =>
              Alert.alert('Document', e instanceof Error ? e.message : 'Unable to open.')
            )
          }
          style={{
            marginTop: 12,
            backgroundColor: CustomerTheme.primary,
            borderRadius: CustomerTheme.radiusButton,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>View document</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 10, fontStyle: 'italic' }}>
          Your advisor will add this when it is ready.
        </Text>
      )}
    </CustomerCard>
  )
}

function EstimateDocRow({
  driveUrl,
  storagePath,
  estimates = [],
  expectedAmount,
}: {
  driveUrl?: string | null
  storagePath?: string | null
  estimates?: EstimateView[]
  expectedAmount?: number | null
}) {
  const router = useRouter()
  const activeEstimate = estimates[0]
  const hasDriveDoc = Boolean(String(driveUrl || '').trim() || String(storagePath || '').trim())
  const hasDigitalEstimate = Boolean(activeEstimate || (expectedAmount != null && expectedAmount > 0))
  const ready = hasDriveDoc || hasDigitalEstimate

  const displaySubtitle = activeEstimate
    ? `Quotation #${activeEstimate.estimate_no}${activeEstimate.grand_total != null ? ` · ${formatInr(activeEstimate.grand_total)}` : ''} (${activeEstimate.status})`
    : expectedAmount != null && expectedAmount > 0
    ? `Estimated amount: ${formatInr(expectedAmount)}`
    : 'Quotation prepared by your service advisor'

  const handleOpenEstimate = async () => {
    if (hasDriveDoc) {
      try {
        await openReceptionDocument({ driveUrl, storagePath })
        return
      } catch {
        // fallback to /estimate screen if drive URL fails
      }
    }
    router.push('/(customer)/estimate')
  }

  return (
    <CustomerCard style={{ marginBottom: 10 }}>
      <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 15 }}>Workshop estimate</Text>
      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
        {displaySubtitle}
      </Text>
      {ready ? (
        <TouchableOpacity
          onPress={() => void handleOpenEstimate()}
          style={{
            marginTop: 12,
            backgroundColor: CustomerTheme.primary,
            borderRadius: CustomerTheme.radiusButton,
            paddingVertical: 11,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
            {activeEstimate ? '📄 View & Approve Estimate' : 'View estimate'}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 10, fontStyle: 'italic' }}>
          Your advisor will add this when it is ready.
        </Text>
      )}
    </CustomerCard>
  )
}

export function MechanicalDocumentsContent({
  mechCase,
  fallbackJob,
  estimates = [],
}: {
  mechCase: MechanicalCasePayload | null
  fallbackJob?: Record<string, unknown> | null
  estimates?: EstimateView[]
}) {
  const estimateDriveUrl =
    mechCase?.estimate_drive_url || (fallbackJob?.estimate_drive_url as string | undefined)
  const estimateStoragePath =
    mechCase?.estimate_storage_path || (fallbackJob?.estimate_storage_path as string | undefined)
  const invoiceDriveUrl =
    mechCase?.invoice_drive_url || (fallbackJob?.invoice_drive_url as string | undefined)
  const invoiceStoragePath =
    mechCase?.invoice_storage_path || (fallbackJob?.invoice_storage_path as string | undefined)
  const expectedAmount = mechCase?.expected_invoice_amount ?? (fallbackJob?.expected_invoice_amount as number | undefined)

  return (
    <>
      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 13, marginBottom: 6 }}>Workshop paperwork</Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, lineHeight: 17 }}>
          Estimate and tax invoice from your service visit. No insurance claim uploads are needed for this job.
        </Text>
      </CustomerCard>
      <EstimateDocRow
        driveUrl={estimateDriveUrl}
        storagePath={estimateStoragePath}
        estimates={estimates}
        expectedAmount={expectedAmount}
      />
      <DocRow
        title="Tax invoice"
        subtitle="Final bill after service completion"
        driveUrl={invoiceDriveUrl}
        storagePath={invoiceStoragePath}
      />
    </>
  )
}
