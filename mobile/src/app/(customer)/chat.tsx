import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '../../components/ui/Icon'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerListAdvisorMessages,
  customerSendAdvisorMessage,
  type CustomerAdvisorMessage,
} from '../../lib/api/advisorChat'
import { CustomerTheme } from '../../lib/customer/customerTheme'

function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function CustomerAdvisorChatScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { token, vehicles, selectedReg } = useCustomerSession()
  const selected = vehicles.find((vehicle) => vehicle.reg_number === selectedReg) || vehicles[0]
  const regNumber = selected?.reg_number || ''
  const advisor = selected?.sa_display_name || selected?.sa_name || 'Service advisor'
  const [messages, setMessages] = useState<CustomerAdvisorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<ScrollView | null>(null)

  const load = useCallback(async (isInitial = false) => {
    if (!token || !regNumber) return
    if (isInitial) setLoading(true)
    try {
      const thread = await customerListAdvisorMessages(token, regNumber)
      setMessages(thread.messages)
      setError(null)
    } catch (err) {
      if (isInitial) setError(err instanceof Error ? err.message : 'Unable to load chat.')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [token, regNumber])

  useEffect(() => {
    void load(true)
  }, [load])

  useFocusEffect(
    useCallback(() => {
      void load(false)
      const timer = setInterval(() => {
        void load(false)
      }, 3500)
      return () => clearInterval(timer)
    }, [load]),
  )

  useEffect(() => {
    scroller.current?.scrollToEnd({ animated: true })
  }, [messages.length])

  async function onSend() {
    const body = draft.trim()
    if (!token || !regNumber || !body || sending) return
    setSending(true)
    setError(null)
    try {
      await customerSendAdvisorMessage(token, regNumber, body)
      setDraft('')
      await load(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: CustomerTheme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          paddingTop: Math.max(insets.top, 12),
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: CustomerTheme.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-left" size={20} color={CustomerTheme.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
            {regNumber || 'Chat'}
          </Text>
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
            {advisor}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={CustomerTheme.primary} />
        </View>
      ) : (
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <Text style={{ color: CustomerTheme.inkMuted, textAlign: 'center', marginTop: 24 }}>
              Send a message to your service advisor.
            </Text>
          )}
          {messages.map((message) => {
            const mine = message.author_side === 'customer'
            return (
              <View key={message.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View
                  style={{
                    maxWidth: '82%',
                    backgroundColor: mine ? CustomerTheme.primary : '#FFFFFF',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: mine ? 0 : 1,
                    borderColor: CustomerTheme.border,
                  }}
                >
                  <Text style={{ color: mine ? '#D6E8F8' : CustomerTheme.primary, fontSize: 11, fontWeight: '800' }}>
                    {mine ? 'You' : message.author_name || advisor}
                  </Text>
                  <Text style={{ color: mine ? '#FFFFFF' : CustomerTheme.ink, fontSize: 15, marginTop: 2 }}>
                    {message.body}
                  </Text>
                  <Text style={{ color: mine ? '#D6E8F8' : CustomerTheme.inkSoft, fontSize: 10, marginTop: 4, textAlign: 'right' }}>
                    {formatWhen(message.created_at)}
                  </Text>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}

      {error ? (
        <Text style={{ color: '#B91C1C', paddingHorizontal: 16, paddingTop: 6 }}>{error}</Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 12,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: CustomerTheme.border,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={CustomerTheme.inkSoft}
          multiline
          maxLength={2000}
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 110,
            borderWidth: 1,
            borderColor: CustomerTheme.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: CustomerTheme.ink,
            backgroundColor: CustomerTheme.bg,
          }}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={sending || !draft.trim()}
          onPress={() => void onSend()}
          style={{
            backgroundColor: CustomerTheme.primary,
            borderRadius: 12,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: sending || !draft.trim() ? 0.5 : 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
