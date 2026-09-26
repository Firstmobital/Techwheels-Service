import { Alert, Text, TouchableOpacity, View } from 'react-native'
import { CustomerCard } from './customerUi'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import { openReceptionDocument } from '../../lib/customer/openReceptionDocument'
import type { MechanicalCasePayload } from '../../lib/customer/mechanicalCustomerUi'

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

export function MechanicalDocumentsContent({ mechCase }: { mechCase: MechanicalCasePayload | null }) {
  return (
    <>
      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontWeight: '900', fontSize: 13, marginBottom: 6 }}>Workshop paperwork</Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, lineHeight: 17 }}>
          Estimate and tax invoice from your service visit. No insurance claim uploads are needed for this job.
        </Text>
      </CustomerCard>
      <DocRow
        title="Workshop estimate"
        subtitle="Quotation prepared by your service advisor"
        driveUrl={mechCase?.estimate_drive_url}
        storagePath={mechCase?.estimate_storage_path}
      />
      <DocRow
        title="Tax invoice"
        subtitle="Final bill after service completion"
        driveUrl={mechCase?.invoice_drive_url}
        storagePath={mechCase?.invoice_storage_path}
      />
    </>
  )
}
