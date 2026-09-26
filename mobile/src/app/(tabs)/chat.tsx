import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon } from '../../components/ui/Icon'
import {
  getStaffAdvisorChat,
  listStaffAdvisorChats,
  sendStaffAdvisorChat,
  type CustomerAdvisorMessage,
  type StaffAdvisorChatThread,
} from '../../lib/api/advisorChat'

function formatWhen(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function subtitle(row: StaffAdvisorChatThread): string {
  if (row.contact_key && row.contact_key !== 'advisor' && row.sa_name) {
    return `${row.sa_name} · ${row.phone_10}`
  }
  return row.phone_10
}

export default function StaffChatScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ chat?: string }>()
  const [threads, setThreads] = useState<StaffAdvisorChatThread[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CustomerAdvisorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadThreads = useCallback(async () => {
    const rows = await listStaffAdvisorChats()
    setThreads(rows)
    return rows
  }, [])

  const openThread = useCallback(async (chatId: string) => {
    const detail = await getStaffAdvisorChat(chatId)
    setOpenId(chatId)
    setMessages(detail.messages)
    setThreads((prev) => prev.map((row) => (
      row.id === chatId ? { ...row, ...detail.chat, staff_unread_count: 0 } : row
    )))
  }, [])

  useEffect(() => {
    const chatId = typeof params.chat === 'string' ? params.chat : ''
    if (!chatId) return
    void openThread(chatId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Unable to open chat.')
    })
  }, [params.chat, openThread])

  useFocusEffect(
    useCallback(() => {
      let active = true
      void loadThreads()
        .then((rows) => {
          if (!active) return
          setError(null)
          const chatId = typeof params.chat === 'string' ? params.chat : ''
          if (chatId && rows.some((row) => row.id === chatId)) {
            void openThread(chatId)
          }
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : 'Unable to load chats.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
      const timer = setInterval(() => {
        void loadThreads().catch(() => undefined)
        if (openId) void openThread(openId).catch(() => undefined)
      }, 4000)
      return () => {
        active = false
        clearInterval(timer)
      }
    }, [loadThreads, openId, openThread, params.chat]),
  )

  const selected = threads.find((row) => row.id === openId) || null

  async function onSend() {
    const body = draft.trim()
    if (!openId || !body || sending) return
    setSending(true)
    setError(null)
    try {
      await sendStaffAdvisorChat(openId, body)
      setDraft('')
      await openThread(openId)
      await loadThreads()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => {
              if (openId) {
                setOpenId(null)
                setMessages([])
                return
              }
              router.back()
            }}
            hitSlop={8}
          >
            <Icon name="arrow-left" size={20} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#0f172a' }} numberOfLines={1}>
              {selected ? selected.reg_number : 'Chats'}
            </Text>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }} numberOfLines={1}>
              {selected ? subtitle(selected) : 'New and unanswered customer messages'}
            </Text>
          </View>
        </View>

        {error ? <Text style={{ color: '#dc2626', paddingHorizontal: 16, paddingTop: 8 }}>{error}</Text> : null}

        {loading && threads.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : openId && selected ? (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
              {messages.map((message) => {
                const mine = message.author_side === 'staff'
                return (
                  <View key={message.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    <View style={{ maxWidth: '82%', backgroundColor: mine ? '#2563eb' : '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: mine ? 0 : 1, borderColor: '#e2e8f0' }}>
                      <Text style={{ color: mine ? '#dbeafe' : '#2563eb', fontSize: 11, fontWeight: '800' }}>
                        {mine ? message.author_name || 'You' : 'Customer'}
                      </Text>
                      <Text style={{ color: mine ? '#fff' : '#0f172a', fontSize: 15, marginTop: 2 }}>{message.body}</Text>
                      <Text style={{ color: mine ? '#dbeafe' : '#94a3b8', fontSize: 10, marginTop: 4, textAlign: 'right' }}>{formatWhen(message.created_at)}</Text>
                    </View>
                  </View>
                )
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message"
                style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }}
              />
              <TouchableOpacity onPress={() => void onSend()} disabled={sending || !draft.trim()} style={{ backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', opacity: sending || !draft.trim() ? 0.5 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
            {threads.length === 0 ? (
              <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 32 }}>No chats yet.</Text>
            ) : threads.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => void openThread(row.id).catch((err) => setError(err instanceof Error ? err.message : 'Unable to open chat.'))}
                style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{row.reg_number}</Text>
                  <Text style={{ color: '#64748b', marginTop: 2 }}>{subtitle(row)}</Text>
                  <Text style={{ color: '#334155', marginTop: 4 }} numberOfLines={1}>{row.last_message_preview || ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ color: '#94a3b8', fontSize: 11 }}>{formatWhen(row.last_message_at)}</Text>
                  {row.staff_unread_count > 0 ? (
                    <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{row.staff_unread_count > 9 ? '9+' : row.staff_unread_count}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
