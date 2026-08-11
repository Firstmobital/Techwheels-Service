import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import * as DocumentPicker from 'expo-document-picker'
import { useRouter } from 'expo-router'
import {
  createHelpTicket,
  listHelpTicketCategories,
  type HelpTicketCategory,
  type HelpTicketPriority,
} from '../../lib/api/helpTickets'
import {
  uploadHelpTicketAttachmentFromUri,
  type LocalHelpAttachment,
} from '../../lib/api/helpTicketUpload'

export default function RaiseHelpTicketScreen() {
  const router = useRouter()
  const [categories, setCategories] = useState<HelpTicketCategory[]>([])
  const [categoryKey, setCategoryKey] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<HelpTicketPriority | ''>('')
  const [files, setFiles] = useState<LocalHelpAttachment[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const rows = await listHelpTicketCategories()
        if (!mounted) return
        setCategories(rows)
        if (rows[0]) setCategoryKey(rows[0].key)
        if (!rows.length) {
          setError('No help ticket categories found. Ask an admin to seed categories.')
        }
      } catch (err) {
        if (!mounted) return
        const msg = err instanceof Error ? err.message : 'Failed to load categories'
        setError(
          msg.toLowerCase().includes('employee')
            ? `${msg}. Link an employee profile in Admin, then try again.`
            : msg,
        )
      } finally {
        if (mounted) setLoadingCats(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: [
        'image/*',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    })
    if (result.canceled) return
    const next = (result.assets || []).map((asset) => ({
      uri: asset.uri,
      name: asset.name || 'attachment',
      mimeType: asset.mimeType,
      size: asset.size ?? null,
    }))
    setFiles((prev) => [...prev, ...next].slice(0, 5))
  }

  const onSubmit = async () => {
    setError(null)
    if (!categoryKey) {
      setError('Select a category')
      return
    }
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required')
      return
    }

    setSubmitting(true)
    try {
      const created = await createHelpTicket({
        categoryKey,
        subject: subject.trim(),
        description: description.trim(),
        priority: priority || null,
      })

      for (const file of files) {
        await uploadHelpTicketAttachmentFromUri({ ticketId: created.id, file })
      }

      router.replace(`/help-tickets/${created.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create ticket'
      setError(msg)
      Alert.alert('Could not submit', msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingCats) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator color="#1d4ed8" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-slate-900 text-lg font-bold">Raise a ticket</Text>
        <Text className="text-slate-500 text-xs mt-1 mb-4">
          Tell support what you need help with
        </Text>

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            <Text className="text-red-700 text-sm">{error}</Text>
          </View>
        ) : null}

        <View className="bg-white border border-slate-200 rounded-2xl p-4 gap-3">
          <View>
            <Text className="text-slate-700 text-xs font-semibold mb-1">Category</Text>
            <View className="border border-slate-200 rounded-xl overflow-hidden">
              <Picker
                selectedValue={categoryKey}
                onValueChange={(value) => setCategoryKey(String(value))}
              >
                {categories.map((c) => (
                  <Picker.Item key={c.id} label={c.label} value={c.key} />
                ))}
              </Picker>
            </View>
          </View>

          <View>
            <Text className="text-slate-700 text-xs font-semibold mb-1">Subject</Text>
            <TextInput
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
              value={subject}
              onChangeText={setSubject}
              maxLength={200}
              placeholder="Short summary"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View>
            <Text className="text-slate-700 text-xs font-semibold mb-1">Description</Text>
            <TextInput
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 min-h-[120px]"
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholder="What happened? Steps to reproduce, expected result…"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View>
            <Text className="text-slate-700 text-xs font-semibold mb-1">Priority (optional)</Text>
            <View className="border border-slate-200 rounded-xl overflow-hidden">
              <Picker
                selectedValue={priority}
                onValueChange={(value) => setPriority(value as HelpTicketPriority | '')}
              >
                <Picker.Item label="Category default" value="" />
                <Picker.Item label="Low" value="low" />
                <Picker.Item label="Normal" value="normal" />
                <Picker.Item label="High" value="high" />
                <Picker.Item label="Urgent" value="urgent" />
              </Picker>
            </View>
          </View>

          <View>
            <Text className="text-slate-700 text-xs font-semibold mb-1">
              Attachments (optional, max 25 MB each)
            </Text>
            <Pressable
              className="border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50"
              onPress={() => void pickFiles()}
            >
              <Text className="text-slate-800 font-semibold text-sm">Add files</Text>
            </Pressable>
            {files.map((f, idx) => (
              <View key={`${f.uri}-${idx}`} className="flex-row items-center justify-between mt-2">
                <Text className="text-slate-600 text-xs flex-1 pr-2" numberOfLines={1}>
                  {f.name}
                </Text>
                <Pressable onPress={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}>
                  <Text className="text-red-600 text-xs font-semibold">Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            className={`mt-2 rounded-xl py-3 items-center ${submitting ? 'bg-blue-400' : 'bg-blue-700'}`}
            disabled={submitting}
            onPress={() => void onSubmit()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Submit ticket</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
