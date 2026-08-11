import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Stack, useLocalSearchParams } from 'expo-router'
import {
  getHelpTicketDetail,
  sendHelpTicketMessage,
  verifyHelpTicketResolution,
  type HelpTicketDetail,
} from '../../lib/api/helpTickets'
import { uploadHelpTicketAttachmentFromUri } from '../../lib/api/helpTicketUpload'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function HelpTicketDetailScreen() {
  const params = useLocalSearchParams<{ ticketId: string }>()
  const ticketId = String(params.ticketId || '')

  const [detail, setDetail] = useState<HelpTicketDetail | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!ticketId) return
    if (mode === 'refresh') setRefreshing(true)
    setError(null)
    try {
      const data = await getHelpTicketDetail(ticketId)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [ticketId])

  useEffect(() => {
    void reload('initial')
  }, [reload])

  const onSend = async () => {
    if (!ticketId || !message.trim()) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await sendHelpTicketMessage({ ticketId, messageText: message.trim() })
      setMessage('')
      await reload('refresh')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async (verified: boolean) => {
    if (!ticketId) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await verifyHelpTicketResolution({ ticketId, verified })
      setSuccess(verified ? 'Marked as verified and closed.' : 'Ticket reopened.')
      await reload('refresh')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update resolution')
    } finally {
      setBusy(false)
    }
  }

  const onAttach = async () => {
    if (!ticketId) return
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ['image/*', 'application/pdf', '*/*'],
    })
    if (result.canceled) return

    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      for (const asset of result.assets || []) {
        await uploadHelpTicketAttachmentFromUri({
          ticketId,
          file: {
            uri: asset.uri,
            name: asset.name || 'attachment',
            mimeType: asset.mimeType,
            size: asset.size ?? null,
          },
        })
      }
      setSuccess('Attachment uploaded.')
      await reload('refresh')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      Alert.alert('Upload failed', msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator color="#1d4ed8" />
      </View>
    )
  }

  if (!detail) {
    return (
      <View className="flex-1 bg-slate-50 px-4 pt-6">
        <Text className="text-red-700">{error || 'Ticket not found'}</Text>
      </View>
    )
  }

  const { ticket, messages, attachments, viewer } = detail
  const canReply = ticket.status !== 'closed'
  const canVerify =
    viewer.is_raiser && (ticket.status === 'resolved' || ticket.status === 'cannot_reproduce')

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: ticket.ticket_number }} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void reload('refresh')} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 pr-2">
            <Text className="text-slate-900 text-lg font-bold">{ticket.subject}</Text>
            <Text className="text-slate-500 text-xs mt-1">
              {ticket.ticket_number} · {ticket.category_key.replace(/_/g, ' ')}
              {ticket.assigned_to_name ? ` · ${ticket.assigned_to_name}` : ''}
            </Text>
          </View>
          <View className="bg-blue-100 px-2 py-1 rounded-full">
            <Text className="text-blue-800 text-[10px] font-bold uppercase">
              {ticket.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {error ? (
          <View className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <Text className="text-red-700 text-sm">{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <Text className="text-emerald-800 text-sm">{success}</Text>
          </View>
        ) : null}

        <View className="mt-3 bg-white border border-slate-200 rounded-2xl p-4">
          <Text className="text-slate-500 text-xs">
            Raised by {ticket.raised_by_name} · {formatWhen(ticket.created_at)} · Priority {ticket.priority}
          </Text>
          <Text className="text-slate-800 mt-2" style={{ lineHeight: 20 }}>
            {ticket.description}
          </Text>

          {attachments.length > 0 ? (
            <View className="mt-3 gap-1.5">
              {attachments.map((a) => (
                <Pressable
                  key={a.id}
                  disabled={!a.drive_url}
                  onPress={() => {
                    if (a.drive_url) void Linking.openURL(a.drive_url)
                  }}
                >
                  <Text className={`text-sm ${a.drive_url ? 'text-blue-700' : 'text-slate-500'}`}>
                    {a.original_filename}
                    {!a.drive_url ? ` (${a.status})` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {canVerify ? (
          <View className="mt-3 bg-white border border-amber-200 rounded-2xl p-4">
            <Text className="text-slate-900 font-semibold">Resolution ready — please confirm</Text>
            <View className="flex-row gap-2 mt-3">
              <Pressable
                className="flex-1 bg-emerald-600 rounded-xl py-2.5 items-center"
                disabled={busy}
                onPress={() => void onVerify(true)}
              >
                <Text className="text-white font-semibold text-sm">Fixed — close</Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-red-600 rounded-xl py-2.5 items-center"
                disabled={busy}
                onPress={() => void onVerify(false)}
              >
                <Text className="text-white font-semibold text-sm">Not fixed</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text className="text-slate-900 font-semibold mt-4 mb-2">Conversation</Text>
        {messages.length === 0 ? (
          <Text className="text-slate-500 text-sm mb-2">No messages yet.</Text>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 mb-2"
            >
              <View className="flex-row justify-between mb-1">
                <Text className="text-slate-700 text-xs font-semibold">{m.created_by_name}</Text>
                <Text className="text-slate-400 text-xs">{formatWhen(m.created_at)}</Text>
              </View>
              <Text className="text-slate-800 text-sm" style={{ lineHeight: 20 }}>
                {m.message_text}
              </Text>
            </View>
          ))
        )}

        {canReply ? (
          <View className="mt-2 bg-white border border-slate-200 rounded-2xl p-3">
            <TextInput
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 min-h-[96px]"
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              placeholder="Write a reply…"
              placeholderTextColor="#94a3b8"
              editable={!busy}
            />
            <View className="flex-row gap-2 mt-2">
              <Pressable
                className={`flex-1 rounded-xl py-2.5 items-center ${
                  busy || !message.trim() ? 'bg-blue-300' : 'bg-blue-700'
                }`}
                disabled={busy || !message.trim()}
                onPress={() => void onSend()}
              >
                <Text className="text-white font-semibold text-sm">Send reply</Text>
              </Pressable>
              <Pressable
                className="px-3 rounded-xl py-2.5 items-center border border-slate-300 bg-slate-50"
                disabled={busy}
                onPress={() => void onAttach()}
              >
                <Text className="text-slate-800 font-semibold text-sm">Attach</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
