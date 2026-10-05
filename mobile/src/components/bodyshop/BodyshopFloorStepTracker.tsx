import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { FloorFlowStepId, FloorFlowStepView } from '../../lib/bodyshopFloorWork/floorFlowSteps'
import { floorFlowStepLabel } from '../../lib/bodyshopFloorWork/floorFlowSteps'

type Props = {
  steps: FloorFlowStepView[]
}

function stepShortLabel(id: FloorFlowStepId): string {
  if (id === 'QC') return 'QC'
  if (id === 'RI') return 'RI'
  if (id === 'FLOOR_INCHARGE') return 'FI'
  if (id === 'DENTOR_HELPER') return 'DH'
  if (id === 'PAINTER_HELPER') return 'PH'
  if (id === 'PARTS_INCHARGE') return 'PI'
  if (id === 'TECHNICIAN') return 'TC'
  return id.slice(0, 2)
}

export function BodyshopFloorStepTracker({ steps }: Props) {
  const active = steps.find((s) => s.state === 'active')
  return (
    <View style={S.wrap}>
      <Text style={S.title}>Floor steps</Text>
      <Text style={S.sub}>
        {active
          ? `Now: ${floorFlowStepLabel(active.id)}${active.lockReason ? '' : ''}`
          : 'All steps complete or waiting on pipeline'}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.row}>
        {steps.map((step, idx) => {
          const tone =
            step.state === 'done'
              ? S.chipDone
              : step.state === 'skipped'
                ? S.chipSkip
                : step.state === 'active'
                  ? S.chipActive
                  : S.chipLocked
          return (
            <View key={step.id} style={S.chipWrap}>
              {idx > 0 ? <Text style={S.arrow}>→</Text> : null}
              <View style={[S.chip, tone]}>
                <Text style={[S.chipText, step.state === 'active' && S.chipTextActive]}>{stepShortLabel(step.id)}</Text>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const S = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e3d9',
    padding: 12,
    marginBottom: 14,
  },
  title: { fontSize: 14, fontWeight: '800', color: '#1a1b21', marginBottom: 4 },
  sub: { fontSize: 11, color: '#82858f', marginBottom: 10, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  chipWrap: { flexDirection: 'row', alignItems: 'center' },
  arrow: { color: '#c4c0b6', marginHorizontal: 4, fontSize: 12 },
  chip: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  chipDone: { backgroundColor: '#e4f4ec', borderColor: '#86efac' },
  chipSkip: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  chipActive: { backgroundColor: '#e9f0fd', borderColor: '#2f63cf' },
  chipLocked: { backgroundColor: '#f6f4ee', borderColor: '#d9d4c7' },
  chipText: { fontSize: 11, fontWeight: '700', color: '#82858f' },
  chipTextActive: { color: '#2f63cf' },
})
