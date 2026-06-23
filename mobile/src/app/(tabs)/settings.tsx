/**
 * settings.tsx
 * App Settings screen — includes Report Email configuration for AutoDoc send feature.
 */
import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Switch, Alert,
  RefreshControl, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { useRouter } from 'expo-router'
import { getDealerSettings, saveDealerSetting } from '../../lib/api/dealerSettings'

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg:          '#f4f6fb',
  card:        '#ffffff',
  border:      '#e2e8f0',
  primary:     '#1d4ed8',
  primarySoft: '#eff6ff',
  danger:      '#dc2626',
  dangerSoft:  '#fef2f2',
  text:        '#111827',
  sub:         '#6b7280',
  green:       '#16a34a',
  greenSoft:   '#f0fdf4',
  amber:       '#d97706',
  amberSoft:   '#fffbeb',
  label:       '#374151',
  divider:     '#f1f5f9',
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 20, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.sub, letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {icon}  {title}
      </Text>
    </View>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────
function SettingRow({
  label, sublabel, value, last = false,
  right,
}: {
  label: string; sublabel?: string; value?: string; last?: boolean; right?: React.ReactNode
}) {
  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 13,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: C.divider,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{label}</Text>
        {sublabel ? <Text style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{sublabel}</Text> : null}
        {value ? <Text style={{ fontSize: 13, color: C.primary, marginTop: 3, fontWeight: '500' }}>{value}</Text> : null}
      </View>
      {right}
    </View>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  // Toggles
  const [notifications, setNotifications] = useState(true)
  const [autoSync, setAutoSync] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Email settings
  const [reportEmail, setReportEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [emailEditMode, setEmailEditMode] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [emailSaved, setEmailSaved] = useState(false)

  // ── Load settings from DB ──────────────────────────────────────────────────
  const loadSettings = async () => {
    setLoadingSettings(true)
    try {
      const s = await getDealerSettings()
      const email = s.reportEmail ?? ''
      setReportEmail(email)
      setEmailInput(email)
    } catch (e) {
      console.warn('[Settings] load failed:', e)
    } finally {
      setLoadingSettings(false)
    }
  }

  useEffect(() => { void loadSettings() }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadSettings()
    setRefreshing(false)
  }

  // ── Save email ─────────────────────────────────────────────────────────────
  const handleSaveEmail = async () => {
    const trimmed = emailInput.trim()
    if (!trimmed) {
      Alert.alert('Required', 'Please enter a valid email address.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. name@domain.com).')
      return
    }

    setSavingEmail(true)
    const result = await saveDealerSetting('report_email', trimmed, user?.email)
    setSavingEmail(false)

    if (result.error) {
      Alert.alert('Save Failed', result.error)
    } else {
      setReportEmail(trimmed)
      setEmailEditMode(false)
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 3000)
    }
  }

  const handleCancelEmail = () => {
    setEmailInput(reportEmail)
    setEmailEditMode(false)
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        {/* ── Header ── */}
        <View style={{
          backgroundColor: C.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
          borderBottomWidth: 1, borderBottomColor: C.border,
        }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>Settings</Text>
          <Text style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>Manage account and preferences</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── 1. Profile ── */}
          <SectionHeader title="Profile" icon="👤" />
          <View style={{ backgroundColor: C.card, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            <SettingRow
              label="Email"
              sublabel="Logged-in account"
              value={user?.email || 'Not available'}
            />
            <SettingRow
              label="Role"
              value={(user as any)?.user_metadata?.role ?? (user as any)?.app_metadata?.role ?? 'User'}
              last
            />
          </View>

          {/* ── 2. Report Email (AutoDoc Send) ── */}
          <SectionHeader title="Report Email" icon="📧" />
          <View style={{ backgroundColor: C.card, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>

            {/* Info banner */}
            <View style={{ backgroundColor: C.primarySoft, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#dbeafe' }}>
              <Text style={{ fontSize: 12, color: C.primary, fontWeight: '600' }}>
                📤 AutoDoc — Claim Send Destination
              </Text>
              <Text style={{ fontSize: 11, color: '#1e40af', marginTop: 2, lineHeight: 16 }}>
                When you tap "Send" on an AutoDoc claim, the warranty report, PPT and estimate will be automatically emailed to the address saved here.
              </Text>
            </View>

            {loadingSettings ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>Loading settings…</Text>
              </View>
            ) : emailEditMode ? (
              /* ── Edit mode ── */
              <View style={{ padding: 14 }}>
                <Text style={{ fontSize: 12, color: C.label, fontWeight: '600', marginBottom: 6 }}>
                  Report Email Address <Text style={{ color: C.danger }}>*</Text>
                </Text>
                <TextInput
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="e.g. manager@dealership.com"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    borderWidth: 1.5, borderColor: C.primary, borderRadius: 8,
                    paddingHorizontal: 12, paddingVertical: 11,
                    fontSize: 14, color: C.text, backgroundColor: C.primarySoft,
                  }}
                />
                <Text style={{ fontSize: 11, color: C.sub, marginTop: 5 }}>
                  All AutoDoc claim emails will be sent to this address.
                </Text>

                {/* Buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={handleCancelEmail}
                    style={{
                      flex: 1, paddingVertical: 11, borderRadius: 8, borderWidth: 1.5,
                      borderColor: C.border, alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.sub }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveEmail}
                    disabled={savingEmail}
                    style={{
                      flex: 2, paddingVertical: 11, borderRadius: 8,
                      backgroundColor: savingEmail ? '#93c5fd' : C.primary, alignItems: 'center',
                    }}
                  >
                    {savingEmail
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>💾 Save Email</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ── View mode ── */
              <View>
                <View style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.divider }}>
                  <Text style={{ fontSize: 12, color: C.sub, fontWeight: '500' }}>Current report email</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                    <Text style={{
                      fontSize: 15, fontWeight: '700',
                      color: reportEmail ? C.primary : C.sub,
                      flex: 1,
                    }}>
                      {reportEmail || '(not set)'}
                    </Text>
                    {emailSaved && (
                      <View style={{ backgroundColor: C.greenSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, color: C.green, fontWeight: '700' }}>✓ Saved</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => { setEmailInput(reportEmail); setEmailEditMode(true) }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 12,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.primary }}>
                    ✏️  {reportEmail ? 'Change Email' : 'Set Email Address'}
                  </Text>
                  <Text style={{ fontSize: 16, color: C.primary }}>›</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── 3. Dealer Info ── */}
          <SectionHeader title="Dealer Information" icon="🏢" />
          <View style={{ backgroundColor: C.card, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            <SettingRow label="Dealer Name" value="FIRST MOBITEL PVT. LTD." />
            <SettingRow label="Dealer Code" value="3000840" />
            <SettingRow label="App Version" value="1.0.0 (Build 1)" last />
          </View>

          {/* ── 4. App Preferences ── */}
          <SectionHeader title="App Preferences" icon="⚙️" />
          <View style={{ backgroundColor: C.card, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            <SettingRow
              label="Push Notifications"
              sublabel="Receive job and system alerts"
              right={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                  thumbColor={notifications ? C.primary : '#f3f4f6'}
                />
              }
            />
            <SettingRow
              label="Auto Sync"
              sublabel="Sync data when online"
              last
              right={
                <Switch
                  value={autoSync}
                  onValueChange={setAutoSync}
                  trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                  thumbColor={autoSync ? C.primary : '#f3f4f6'}
                />
              }
            />
          </View>

          {/* ── 5. Logout ── */}
          <View style={{ marginHorizontal: 16, marginTop: 28 }}>
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                backgroundColor: C.dangerSoft, borderWidth: 1.5, borderColor: '#fca5a5',
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}
              activeOpacity={0.75}
            >
              <View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.danger }}>Logout</Text>
                <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>End your current session</Text>
              </View>
              <Text style={{ fontSize: 20, color: C.danger }}>→</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
