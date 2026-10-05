import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import {
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  type BodyshopFloorWorkLogRole,
} from '../../lib/bodyshopFloorWork/roles'
import type { BodyshopFloorRoleDailyLogRow } from '../../lib/bodyshopFloorRoleWorkLog'
import {
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForJobCard,
  openRoleDailyLogPhoto,
} from '../../lib/api/bodyshopFloorRoleWorkLog'

type Props = {
  jobCardNumber: string
}

export function WorkerRoleUpdatesPanel({ jobCardNumber }: Props) {
  const [logs, setLogs] = useState<BodyshopFloorRoleDailyLogRow[]>([])
  const [photoCountByLogId, setPhotoCountByLogId] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const rows = await fetchRoleDailyLogsForJobCard(jobCardNumber, 24)
      setLogs(rows)
      if (rows.length === 0) {
        setPhotoCountByLogId({})
        return
      }
      const photos = await fetchRoleDailyLogPhotos(rows.map(r => r.id))
      const counts: Record<number, number> = {}
      for (const p of photos) {
        counts[p.log_id] = (counts[p.log_id] ?? 0) + 1
      }
      setPhotoCountByLogId(counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load worker updates')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [jobCardNumber])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e7e3d9',
      padding: 12,
      marginBottom: 14,
    }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1a1b21', marginBottom: 4 }}>
        Worker updates (Floor Work app)
      </Text>
      <Text style={{ fontSize: 11, color: '#82858f', marginBottom: 10, lineHeight: 16 }}>
        Dentor / Painter submit photos + Done here → saves to daily logs and marks their pipeline step on the assignment row below.
      </Text>
      {loading ? (
        <ActivityIndicator color="#2a4cd0" style={{ alignSelf: 'flex-start' }} />
      ) : null}
      {error ? <Text style={{ fontSize: 12, color: '#c33b53' }}>{error}</Text> : null}
      {!loading && !error && logs.length === 0 ? (
        <Text style={{ fontSize: 12, color: '#82858f' }}>No worker logs yet for this vehicle.</Text>
      ) : null}
      {logs.map(log => {
        const role = log.floor_role as BodyshopFloorWorkLogRole
        const roleLabel = BODYSHOP_FLOOR_WORK_ROLE_LABELS[role] ?? log.floor_role
        const photos = photoCountByLogId[log.id] ?? 0
        return (
          <View
            key={log.id}
            style={{
              borderTopWidth: 1,
              borderTopColor: '#f6f4ee',
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1a1b21' }}>
              {log.update_date} · {roleLabel}
              {log.is_support ? ' (support)' : ''}
              {' · '}
              {log.employee_name ?? log.employee_code}
            </Text>
            {log.note_text?.trim() ? (
              <Text style={{ fontSize: 12, color: '#4b4e59', marginTop: 4 }}>{log.note_text.trim()}</Text>
            ) : (
              <Text style={{ fontSize: 11, color: '#82858f', marginTop: 4, fontStyle: 'italic' }}>No note</Text>
            )}
            {photos > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  void fetchRoleDailyLogPhotos([log.id]).then(list => {
                    const first = list[0]
                    if (first) void openRoleDailyLogPhoto(first)
                  })
                }}
                style={{ marginTop: 6 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#2a4cd0' }}>
                  {photos} photo{photos === 1 ? '' : 's'} · tap to open
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ fontSize: 11, color: '#82858f', marginTop: 4 }}>No photos on this log</Text>
            )}
          </View>
        )
      })}
      {!loading ? (
        <TouchableOpacity onPress={() => void load()} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2a4cd0' }}>Refresh worker logs</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
