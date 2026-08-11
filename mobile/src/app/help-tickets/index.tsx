import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  listMyHelpTickets,
  type HelpTicket,
  type HelpTicketStatus,
} from '../../lib/api/helpTickets'

type FilterKey = 'open' | 'resolved' | 'closed' | 'all'

const OPEN_STATUSES: HelpTicketStatus[] = [
  'new',
  'open',
  'in_progress',
  'waiting_raiser',
  'on_hold',
  'escalated',
  'reopened',
  'cannot_reproduce',
]

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

function statusForFilter(filter: FilterKey): HelpTicketStatus[] | null {
  if (filter === 'all') return null
  if (filter === 'resolved') return ['resolved']
  if (filter === 'closed') return ['closed']
  return OPEN_STATUSES
}

function statusTone(status: string): { bg: string; text: string } {
  if (status === 'closed') return { bg: 'bg-slate-200', text: 'text-slate-700' }
  if (status === 'resolved') return { bg: 'bg-emerald-100', text: 'text-emerald-800' }
  if (status === 'escalated' || status === 'reopened') return { bg: 'bg-amber-100', text: 'text-amber-900' }
  return { bg: 'bg-blue-100', text: 'text-blue-800' }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function MyHelpTicketsScreen() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('open')
  const [tickets, setTickets] = useState<HelpTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (activeFilter: FilterKey, mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const rows = await listMyHelpTickets({
        status: statusForFilter(activeFilter),
        limit: 50,
      })
      setTickets(rows)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tickets'
      setError(
        msg.toLowerCase().includes('employee')
          ? `${msg}. Link an employee profile in Admin, then try again.`
          : msg,
      )
      setTickets([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load(filter)
    }, [filter, load]),
  )

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-slate-900 text-lg font-bold">My Help Tickets</Text>
          <Text className="text-slate-500 text-xs mt-0.5">Issues you raised with support</Text>
        </View>
        <Pressable
          className="bg-blue-700 px-3 py-2 rounded-xl"
          onPress={() => router.push('/help-tickets/new')}
        >
          <Text className="text-white text-sm font-semibold">Raise</Text>
        </Pressable>
      </View>

      <View className="px-4 pb-2 flex-row flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <Pressable
              key={f.key}
              className={`px-3 py-1.5 rounded-full border ${
                active ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
              }`}
              onPress={() => setFilter(f.key)}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-700'}`}>
                {f.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {error ? (
        <View className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <Text className="text-red-700 text-sm">{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1d4ed8" />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(filter, 'refresh')} />
          }
          ListEmptyComponent={
            <View className="mt-16 items-center px-4">
              <Text className="text-slate-700 font-semibold text-base">No tickets yet</Text>
              <Text className="text-slate-500 text-sm mt-1 text-center">
                Raise a ticket and it will show up here and on web.
              </Text>
              <Pressable
                className="mt-4 bg-blue-700 px-4 py-2.5 rounded-xl"
                onPress={() => router.push('/help-tickets/new')}
              >
                <Text className="text-white font-semibold">Raise a ticket</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-2"
              onPress={() => router.push(`/help-tickets/${item.id}`)}
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1 pr-2">
                  <Text className="text-slate-900 font-semibold" numberOfLines={2}>
                    {item.subject}
                  </Text>
                  <Text className="text-slate-500 text-xs mt-1">
                    {item.ticket_number} · {item.category_key.replace(/_/g, ' ')}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">
                    Updated {formatWhen(item.updated_at || item.created_at)}
                  </Text>
                  {item.assigned_to_name ? (
                    <Text className="text-slate-500 text-xs mt-0.5">
                      Assignee: {item.assigned_to_name}
                    </Text>
                  ) : null}
                </View>
                <View className={`px-2 py-1 rounded-full ${statusTone(item.status).bg}`}>
                  <Text className={`text-[10px] font-bold uppercase ${statusTone(item.status).text}`}>
                    {item.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}
