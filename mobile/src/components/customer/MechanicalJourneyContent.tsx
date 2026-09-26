import { Text, View } from 'react-native'
import { CustomerCard } from './customerUi'
import { CustomerTheme } from '../../lib/customer/customerTheme'
import {
  mechanicalPhaseComplete,
  mechanicalStatusLabel,
  type MechanicalCasePayload,
} from '../../lib/customer/mechanicalCustomerUi'
import { dash, formatWhen } from './customerUi'

const PHASES = [
  { id: 1 as const, title: 'Received', desc: 'Vehicle checked in at reception' },
  { id: 2 as const, title: 'Job card', desc: 'Official job card opened for your visit' },
  { id: 3 as const, title: 'Workshop', desc: 'Technician work on the service floor' },
  { id: 4 as const, title: 'Billing', desc: 'Accounts invoice and payment tracking' },
  { id: 5 as const, title: 'Collection', desc: 'Gate pass and vehicle handover' },
]

export function MechanicalJourneyContent({
  mechCase,
  advisor,
}: {
  mechCase: MechanicalCasePayload | null
  advisor: string | null
}) {
  const status = mechanicalStatusLabel(mechCase)
  const jc = String(mechCase?.jc_number || '').trim()
  const ws = String(mechCase?.floor?.work_status || '').toLowerCase()
  const tech = mechCase?.floor?.technician_name
  const bay = mechCase?.floor?.bay_no

  let workshopDetail = 'Waiting for technician assignment'
  if (ws === 'work_inprocess') {
    workshopDetail = tech
      ? `In progress · ${tech}${bay ? ` · Bay ${bay}` : ''}`
      : 'Work in progress on the floor'
  } else if (ws === 'hold') {
    workshopDetail = 'Work is on hold — chat with your advisor for an update'
  } else if (ws === 'completed') {
    workshopDetail = tech ? `Floor work completed · ${tech}` : 'Floor work completed'
  }

  const completedCount = PHASES.filter((p) => mechanicalPhaseComplete(p.id, mechCase)).length
  const pct = Math.round((completedCount / PHASES.length) * 100)

  return (
    <>
      <CustomerCard style={{ borderColor: CustomerTheme.border, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              Service status
            </Text>
            <Text style={{ color: CustomerTheme.ink, fontSize: 18, fontWeight: '900', marginTop: 4 }}>{status}</Text>
            <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, marginTop: 4 }}>
              {dash(mechCase?.service_type)} · JC {jc || 'pending'}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: CustomerTheme.tabActiveBg,
            }}
          >
            <Text style={{ color: CustomerTheme.primary, fontSize: 11, fontWeight: '800' }}>{pct}%</Text>
          </View>
        </View>
        <View style={{ height: 7, borderRadius: 999, backgroundColor: CustomerTheme.primaryLight, overflow: 'hidden' }}>
          <View
            style={{
              width: `${Math.max(4, pct)}%`,
              height: '100%',
              backgroundColor: pct === 100 ? CustomerTheme.success : CustomerTheme.primary,
            }}
          />
        </View>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, marginTop: 8 }}>
          Advisor: {dash(advisor)}
        </Text>
      </CustomerCard>

      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontSize: 15, fontWeight: '900', marginBottom: 12 }}>Service journey</Text>
        {PHASES.map((phase, index) => {
          const done = mechanicalPhaseComplete(phase.id, mechCase)
          const isLast = index === PHASES.length - 1
          const current =
            !done &&
            (index === 0 ||
              mechanicalPhaseComplete(PHASES[index - 1].id, mechCase))
          const desc = phase.id === 3 ? workshopDetail : phase.desc
          return (
            <View key={phase.id} style={{ flexDirection: 'row', minHeight: 56 }}>
              <View style={{ width: 28, alignItems: 'center' }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: done ? CustomerTheme.success : current ? CustomerTheme.primary : CustomerTheme.border,
                    backgroundColor: done ? CustomerTheme.success : '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text> : null}
                </View>
                {!isLast ? (
                  <View
                    style={{
                      flex: 1,
                      width: 2,
                      backgroundColor: done ? CustomerTheme.success : CustomerTheme.border,
                      marginVertical: 2,
                    }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14, paddingLeft: 4 }}>
                <Text style={{ color: CustomerTheme.ink, fontSize: 14, fontWeight: current ? '900' : '700' }}>
                  {phase.title}
                </Text>
                <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, marginTop: 3, lineHeight: 16 }}>{desc}</Text>
                {phase.id === 4 && mechCase?.invoice_done_at ? (
                  <Text style={{ color: CustomerTheme.inkMuted, fontSize: 10.5, marginTop: 4 }}>
                    Advisor closed job · {formatWhen(String(mechCase.invoice_done_at))}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </CustomerCard>
    </>
  )
}
