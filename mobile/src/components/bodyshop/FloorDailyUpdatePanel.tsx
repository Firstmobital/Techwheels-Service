import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'
import {
  bodyshopFloorDailyUpdateHasContent,
  bodyshopFloorTodayIstDate,
  isBodyshopFloorDailyUpdateActive,
  type BodyshopFloorDailyUpdateRow,
} from '../../lib/bodyshopFloorDailyUpdate'
import { upsertBodyshopFloorDailyUpdate } from '../../lib/api/bodyshopFloorDailyUpdate'
import { useOptimisticAction } from '../../hooks/useOptimisticAction'

type Props = {
  jobCardNumber: string
  repairCardId: number
  initialRow: BodyshopFloorDailyUpdateRow | null
  onSaved: (row: BodyshopFloorDailyUpdateRow) => void
  compact?: boolean
}

export function FloorDailyUpdatePanel({ jobCardNumber, repairCardId, initialRow, onSaved, compact }: Props) {
  const today = bodyshopFloorTodayIstDate()
  const activeRow = isBodyshopFloorDailyUpdateActive(initialRow, today) ? initialRow : null
  const [note, setNote] = useState(String(activeRow?.note_text ?? ''))
  const [saving, setSaving] = useState(false)
  const optimistic = useOptimisticAction()

  useEffect(() => {
    setNote(String(activeRow?.note_text ?? ''))
  }, [activeRow?.id, activeRow?.updated_at, today])

  const hasTodayContent = bodyshopFloorDailyUpdateHasContent(activeRow)

  const saveUpdate = useCallback(async () => {
    const trimmed = note.trim()
    if (!trimmed) {
      Alert.alert('Today\'s update', 'Please enter today\'s status or reason.')
      return
    }
    const prevNote = note
    const optimisticRow: BodyshopFloorDailyUpdateRow = activeRow
      ? { ...activeRow, note_text: trimmed, updated_at: new Date().toISOString() }
      : {
          id: -1,
          job_card_number: jobCardNumber,
          repair_card_id: repairCardId,
          dealer_code: '',
          update_date: today,
          note_text: trimmed,
          voice_bucket: null,
          voice_storage_path: null,
          voice_mime: null,
          voice_duration_sec: null,
          created_by: null,
          updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
    try {
      await optimistic.run(`daily-${jobCardNumber}`, {
        apply: () => {
          setSaving(true)
          onSaved(optimisticRow)
        },
        rollback: () => {
          setNote(prevNote)
          if (activeRow) onSaved(activeRow)
          setSaving(false)
        },
        execute: async () => {
          const { data: { user } } = await supabase.auth.getUser()
          const { data: dealerCodeRaw, error: dealerErr } = await supabase.rpc('my_dealer_code')
          if (dealerErr) throw new Error(dealerErr.message)
          const dealerCode = String(dealerCodeRaw ?? '').trim()
          if (!dealerCode) throw new Error('Dealer code missing on your account')
          const row = await upsertBodyshopFloorDailyUpdate({
            jobCardNumber,
            repairCardId,
            dealerCode,
            noteText: trimmed,
            actorEmail: user?.email ?? null,
          })
          onSaved(row)
        },
        onSuccess: () => setSaving(false),
        rethrow: true,
      })
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Save failed')
    }
  }, [activeRow, jobCardNumber, note, onSaved, repairCardId, today])

  if (compact && hasTodayContent && activeRow?.note_text) {
    return (
      <Text style={{ fontSize: 11, color: '#4b4e59', marginTop: 4 }} numberOfLines={2}>
        Today: {activeRow.note_text}
      </Text>
    )
  }

  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: hasTodayContent ? '#cadcf8' : '#f1dcb8',
      padding: 12,
      marginBottom: compact ? 0 : 14,
    }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1a1b21', marginBottom: 4 }}>
        Today&apos;s floor update
      </Text>
      <Text style={{ fontSize: 11, color: '#82858f', marginBottom: 8 }}>
        {hasTodayContent
          ? 'Saved for today (IST). Tomorrow you must add a fresh update.'
          : 'Required daily — yesterday’s update does not carry forward.'}
      </Text>

      <TextInput
        style={{
          backgroundColor: '#f6f4ee',
          borderWidth: 1,
          borderColor: '#e7e3d9',
          borderRadius: 8,
          padding: 10,
          fontSize: 13,
          minHeight: 72,
          textAlignVertical: 'top',
          color: '#1a1b21',
        }}
        multiline
        placeholder="What is today’s status / reason? (assigned, unassigned, hold…)"
        placeholderTextColor="#a7a99f"
        value={note}
        onChangeText={setNote}
      />

      <TouchableOpacity
        style={{
          marginTop: 12,
          backgroundColor: '#2a4cd0',
          borderRadius: 8,
          padding: 11,
          alignItems: 'center',
          opacity: saving ? 0.6 : 1,
        }}
        disabled={saving}
        onPress={() => void saveUpdate()}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '700' }}>Save today&apos;s update</Text>
        )}
      </TouchableOpacity>

      {activeRow?.updated_by ? (
        <Text style={{ fontSize: 10, color: '#82858f', marginTop: 6 }}>
          Last by {activeRow.updated_by}
        </Text>
      ) : null}
    </View>
  )
}