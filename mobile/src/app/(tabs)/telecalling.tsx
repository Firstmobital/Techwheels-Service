/**
 * mobile/src/app/(tabs)/telecalling.tsx
 * Full-featured mobile telecalling screen for Android/iOS (Android-optimized)
 * Features: campaign selector, get-next, service history, WhatsApp send,
 *           booking/callback modals, queue view, daily summary
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, Dimensions,
  FlatList, Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase, SUPABASE_URL } from '../../lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  id: number
  chassis_no: string | null
  vehicle_registration_number: string | null
  first_name: string | null
  last_name: string | null
  contact_phones: string | null
  model: string | null
  powertrain_type: string | null
  product_line: string | null
  assumed_next_service_date: string | null
  assumed_next_service_type: string | null
  last_service_date: string | null
  last_service_type: string | null
  last_service_km: string | null
  last_service_dealer: string | null
  sold_dealer: string | null
  extended_warranty_end_date: string | null
  extended_warranty_product: string | null
}

interface ServiceHistoryRow {
  service_date: string | null
  service_type: string | null
  kms_at_service: string | null
  dealer_name: string | null
  job_card_no: string | null
  labour_amount: string | number | null
}

interface Assignment {
  id: number
  campaign_id: number
  status: string
  call_notes: string | null
  booking_date: string | null
  callback_date: string | null
  called_at: string | null
  call_count: number
  no_answer_count: number
  whatsapp_sent: boolean
  whatsapp_status: string | null
  customer: Customer
}

interface Campaign {
  id: number
  campaign_name: string
  date_from: string
  date_to: string
  status: string
  total_leads: number
  pending_count: number
  booked_count: number
  completed_count: number
}

interface DailySummary {
  total_calls: number
  booked: number
  no_answer: number
  not_interested: number
  callback_later: number
  wrong_number: number
  not_reachable: number
}

// ── Constants ────────────────────────────────────────────────────────────────
const EDGE_URL = `${SUPABASE_URL}/functions/v1/telecalling`
const { width: SCREEN_W } = Dimensions.get('window')

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; emoji: string }> = {
  booked:         { bg: '#dcfce7', text: '#15803d', label: 'Booked',          emoji: '✅' },
  callback_later: { bg: '#f3e8ff', text: '#7e22ce', label: 'Callback Later',  emoji: '📅' },
  no_answer:      { bg: '#ffedd5', text: '#c2410c', label: 'No Answer',       emoji: '😶' },
  not_reachable:  { bg: '#fee2e2', text: '#b91c1c', label: 'Not Reachable',   emoji: '🚫' },
  wrong_number:   { bg: '#fee2e2', text: '#b91c1c', label: 'Wrong Number',    emoji: '⚠️' },
  not_interested: { bg: '#f3f4f6', text: '#374151', label: 'Not Interested',  emoji: '😑' },
  pending:        { bg: '#f3f4f6', text: '#6b7280', label: 'Pending',         emoji: '⏳' },
  assigned:       { bg: '#dbeafe', text: '#1d4ed8', label: 'Assigned',        emoji: '👤' },
  completed:      { bg: '#dcfce7', text: '#15803d', label: 'Completed',       emoji: '✔️' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function callEdge(action: string, body: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Unknown error')
  return data
}

function fmtDate(d: string | null, withYear = false): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
    })
  } catch { return d }
}

async function fetchServiceHistory(
  chassis: string | null,
  reg: string | null,
  powertrain: string | null,
): Promise<ServiceHistoryRow[]> {
  if (!chassis && !reg) return []
  const isEV = (powertrain || '').toUpperCase() === 'EV'
  const table = isEV ? 'EV_service_history_test' : 'PV_service_history_test'

  // Try chassis first, fallback to reg number
  let query = supabase.from(table).select('*')
  if (chassis) {
    query = query.eq('chassis_no', chassis)
  } else if (reg) {
    query = query.eq('registration_no', reg)
  }

  const { data, error } = await query
    .order('service_date_time', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    console.warn('Service history fetch error:', error.message)
    return []
  }

  // Canonical service-history columns are normalized to the UI shape expected below.
  return (data || []).map((row: any) => ({
    service_date: row.service_date_time ?? row.service_date ?? null,
    service_type: row.sr_type ?? row.service_type ?? null,
    kms_at_service: row.odometer_reading ?? row.kms_at_service ?? null,
    dealer_name: row.serviced_at_dealer ?? row.dealer_name ?? null,
    job_card_no: row.job_card_no ?? null,
    labour_amount: row.labour_amount ?? null,
  })) as ServiceHistoryRow[]
}

// ── WhatsApp helper ──────────────────────────────────────────────────────────
function buildWhatsAppMessage(customer: Customer, type: 'not_reachable' | 'reminder'): string {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer'
  const model = customer.model || 'your vehicle'
  const reg = customer.vehicle_registration_number || ''
  const dueDate = customer.assumed_next_service_date
    ? fmtDate(customer.assumed_next_service_date, true)
    : 'soon'
  const serviceType = customer.assumed_next_service_type || 'Scheduled Service'
  const dealer = 'Techwheels - First Mobital Pvt. Ltd.'

  if (type === 'not_reachable') {
    return `Hello ${name},

We tried calling you regarding your ${model}${reg ? ` (${reg})` : ''}.

Your *${serviceType}* is due on *${dueDate}*.

Please call us back or book your service appointment at:
📞 Techwheels Service Center
🏢 ${dealer}

To book online, reply *BOOK* or call us at our service number.

Thank you,
Techwheels Service Team`
  }

  return `Hello ${name},

This is a reminder that your *${model}${reg ? ` (${reg})` : ''}* is due for *${serviceType}* on *${dueDate}*.

Schedule your service at ${dealer} today for best care of your vehicle.

Reply *BOOK* to confirm your appointment.

Thank you,
Techwheels Service Team`
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function TelecallingScreen() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<'call' | 'queue' | 'summary'>('call')
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null)
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [queue, setQueue] = useState<Assignment[]>([])
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [waBusy, setWaBusy] = useState(false)
  const [editingQueueId, setEditingQueueId] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editBookingDate, setEditBookingDate] = useState('')
  const [editCallbackDate, setEditCallbackDate] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showCallbackModal, setShowCallbackModal] = useState(false)
  const [showCampaignPicker, setShowCampaignPicker] = useState(false)
  const [bookingDate, setBookingDate] = useState('')
  const [callbackDate, setCallbackDate] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Init on focus
  useFocusEffect(useCallback(() => {
    init()
  }, []))

  async function init() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: camps } = await supabase
        .from('telecall_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
      setCampaigns(camps || [])
      const active = (camps || []).find((c: Campaign) => c.status === 'active') || (camps || [])[0] || null
      setActiveCampaign(active)
    } catch (e) {
      console.error('Init error:', e)
    } finally {
      setLoading(false)
    }
  }

  const refreshQueue = useCallback(async () => {
    if (!activeCampaign) return
    try {
      const data = await callEdge('my_queue', { campaign_id: activeCampaign.id })
      setQueue(data.queue || [])
    } catch (e) { console.error('Queue error:', e) }
  }, [activeCampaign])

  const refreshSummary = useCallback(async () => {
    try {
      const data = await callEdge('my_summary', {})
      setSummary(data.summary)
    } catch (e) { console.error('Summary error:', e) }
  }, [])

  useEffect(() => {
    refreshQueue()
    refreshSummary()
  }, [refreshQueue, refreshSummary])

  // Fetch service history when assignment changes
  useEffect(() => {
    if (!currentAssignment) { setServiceHistory([]); setShowHistory(false); return }
    const c = currentAssignment.customer
    setHistoryLoading(true)
    setShowHistory(false)
    fetchServiceHistory(c.chassis_no, c.vehicle_registration_number, c.powertrain_type)
      .then(rows => { setServiceHistory(rows); setHistoryLoading(false) })
      .catch(() => setHistoryLoading(false))
  }, [currentAssignment?.id])

  const handleGetNext = async () => {
    if (!activeCampaign) return
    setBusy(true); setError(null)
    try {
      const data = await callEdge('get_next', { campaign_id: activeCampaign.id })
      if (data.assignment) {
        setCurrentAssignment(data.assignment)
        setNotes('')
        setBookingDate('')
        setCallbackDate('')
        setCurrentView('call')
      } else {
        setError('No more pending customers in this campaign. Great job! 🎉')
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const handleUpdateStatus = async (status: string, bDate?: string, cbDate?: string) => {
    if (!currentAssignment || !activeCampaign) return
    setBusy(true); setError(null)
    try {
      await callEdge('update_status', {
        assignment_id: currentAssignment.id,
        campaign_id: activeCampaign.id,
        status,
        call_notes: notes || undefined,
        booking_date: status === 'booked' ? (bDate || bookingDate) : undefined,
        callback_date: status === 'callback_later' ? (cbDate || callbackDate) : undefined,
      })
      setCurrentAssignment(null)
      setNotes('')
      setBookingDate('')
      setCallbackDate('')
      setShowBookingModal(false)
      setShowCallbackModal(false)
      refreshQueue()
      refreshSummary()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const handleSendWhatsApp = async (type: 'not_reachable' | 'reminder') => {
    if (!currentAssignment) return
    const c = currentAssignment.customer
    const phone = (c.contact_phones || '').replace(/[^0-9+]/g, '')
    if (!phone) { Alert.alert('No phone number', 'This customer has no phone number on record.'); return }

    const message = buildWhatsAppMessage(c, type)
    const waPhone = phone.startsWith('+') ? phone : `+91${phone}`
    const waUrl = `https://wa.me/${waPhone.replace('+', '')}?text=${encodeURIComponent(message)}`

    Alert.alert(
      'Send WhatsApp',
      `Send a ${type === 'not_reachable' ? '"tried to call you"' : 'service reminder'} message to ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open WhatsApp',
          onPress: async () => {
            setWaBusy(true)
            try {
              // Mark whatsapp_sent in DB
              await supabase
                .from('telecall_assignments')
                .update({ whatsapp_sent: true, whatsapp_status: type })
                .eq('id', currentAssignment.id)
              // Update local state
              setCurrentAssignment(prev => prev ? { ...prev, whatsapp_sent: true, whatsapp_status: type } : prev)
              // Open WhatsApp
              await Linking.openURL(waUrl)
            } catch (e) {
              console.warn('WhatsApp error:', e)
              await Linking.openURL(waUrl)
            } finally {
              setWaBusy(false)
            }
          },
        },
      ],
    )
  }

  const handleEditSave = async (assignmentId: number) => {
    setEditBusy(true)
    try {
      await callEdge('edit_assignment', {
        assignment_id: assignmentId,
        call_notes: editNotes,
        booking_date: editBookingDate || undefined,
        callback_date: editCallbackDate || undefined,
        status: editStatus || undefined,
      })
      setEditingQueueId(null)
      await refreshQueue()
    } catch (e) {
      Alert.alert('Error', (e as Error).message)
    } finally {
      setEditBusy(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await init()
    await refreshQueue()
    await refreshSummary()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={s.flex1bg}>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={s.loadingText}>Loading telecalling…</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.flex1bg} edges={['top']}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>📞 Telecalling</Text>
          {activeCampaign ? (
            <TouchableOpacity onPress={() => setShowCampaignPicker(true)} style={s.campaignBadge}>
              <Text style={s.campaignBadgeText} numberOfLines={1}>
                {activeCampaign.campaign_name}
              </Text>
              <Text style={s.campaignBadgeArrow}>▾</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.noCampaign}>No active campaign</Text>
          )}
        </View>
        {activeCampaign && (
          <View style={s.campaignStats}>
            <View style={s.statChip}>
              <Text style={[s.statNum, { color: '#ea580c' }]}>{activeCampaign.pending_count}</Text>
              <Text style={s.statLabel}>pending</Text>
            </View>
            <View style={s.statChip}>
              <Text style={[s.statNum, { color: '#16a34a' }]}>{activeCampaign.booked_count}</Text>
              <Text style={s.statLabel}>booked</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {[
          { key: 'call',    label: '📞 Call' },
          { key: 'queue',   label: `📋 Queue (${queue.length})` },
          { key: 'summary', label: '📊 Today' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              setCurrentView(tab.key as any)
              if (tab.key === 'queue') refreshQueue()
              if (tab.key === 'summary') refreshSummary()
            }}
            style={[s.tabBtn, currentView === tab.key && s.tabBtnActive]}
          >
            <Text style={[s.tabBtnText, currentView === tab.key && s.tabBtnTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Error banner ── */}
      {error ? (
        <TouchableOpacity onPress={() => setError(null)} style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
          <Text style={s.errorDismiss}>✕</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Content ── */}
      <ScrollView
        style={s.flex1}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* CALL VIEW */}
        {currentView === 'call' && (
          <>
            {!activeCampaign ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>📞</Text>
                <Text style={s.emptyTitle}>No active campaign</Text>
                <Text style={s.emptyMsg}>Ask admin to create a campaign with service-due customers.</Text>
              </View>
            ) : !currentAssignment ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>🎯</Text>
                <Text style={s.emptyTitle}>Ready to call?</Text>
                <Text style={s.emptyMsg}>Tap below to get your next customer.</Text>
                <TouchableOpacity
                  onPress={handleGetNext}
                  disabled={busy}
                  style={[s.getNextBtn, busy && s.btnDisabled]}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.getNextBtnText}>📞 Get Next Customer</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <CallCard
                assignment={currentAssignment}
                serviceHistory={serviceHistory}
                historyLoading={historyLoading}
                showHistory={showHistory}
                setShowHistory={setShowHistory}
                notes={notes}
                setNotes={setNotes}
                busy={busy}
                waBusy={waBusy}
                onUpdateStatus={handleUpdateStatus}
                onSendWhatsApp={handleSendWhatsApp}
                onBooking={() => setShowBookingModal(true)}
                onCallback={() => setShowCallbackModal(true)}
              />
            )}
          </>
        )}

        {/* QUEUE VIEW */}
        {currentView === 'queue' && (
          queue.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>Queue is empty</Text>
              <Text style={s.emptyMsg}>Go to Call tab and get your next customer.</Text>
            </View>
          ) : (
            queue.map(asgn => (
              <QueueItem
                key={asgn.id}
                assignment={asgn}
                isEditing={editingQueueId === asgn.id}
                editNotes={editNotes}
                editStatus={editStatus}
                editBookingDate={editBookingDate}
                editCallbackDate={editCallbackDate}
                editBusy={editBusy}
                onStartEdit={() => {
                  setEditingQueueId(asgn.id)
                  setEditNotes(asgn.call_notes || '')
                  setEditStatus(asgn.status)
                  setEditBookingDate(asgn.booking_date || '')
                  setEditCallbackDate(asgn.callback_date || '')
                }}
                onCancelEdit={() => setEditingQueueId(null)}
                onSaveEdit={() => handleEditSave(asgn.id)}
                setEditNotes={setEditNotes}
                setEditStatus={setEditStatus}
                setEditBookingDate={setEditBookingDate}
                setEditCallbackDate={setEditCallbackDate}
              />
            ))
          )
        )}

        {/* SUMMARY VIEW */}
        {currentView === 'summary' && (
          summary ? (
            <SummaryView summary={summary} />
          ) : (
            <View style={s.emptyCard}>
              <ActivityIndicator color="#2563eb" />
              <Text style={[s.emptyMsg, { marginTop: 8 }]}>Loading summary…</Text>
            </View>
          )
        )}
      </ScrollView>

      {/* ── Booking Modal ── */}
      <DateModal
        visible={showBookingModal}
        title="📅 Select Visit Date"
        label="Booking date (YYYY-MM-DD)"
        value={bookingDate}
        onChange={setBookingDate}
        onConfirm={() => {
          if (!bookingDate) { Alert.alert('Please enter a date'); return }
          handleUpdateStatus('booked', bookingDate)
        }}
        onClose={() => setShowBookingModal(false)}
        confirmLabel="✅ Confirm Booking"
        confirmColor="#16a34a"
      />

      {/* ── Callback Modal ── */}
      <DateModal
        visible={showCallbackModal}
        title="📅 Schedule Callback"
        label="Callback date (YYYY-MM-DD)"
        value={callbackDate}
        onChange={setCallbackDate}
        onConfirm={() => {
          if (!callbackDate) { Alert.alert('Please enter a date'); return }
          handleUpdateStatus('callback_later', undefined, callbackDate)
        }}
        onClose={() => setShowCallbackModal(false)}
        confirmLabel="📅 Schedule Callback"
        confirmColor="#7c3aed"
      />

      {/* ── Campaign Picker Modal ── */}
      <Modal visible={showCampaignPicker} transparent animationType="slide" onRequestClose={() => setShowCampaignPicker(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowCampaignPicker(false)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerTitle}>Select Campaign</Text>
            {campaigns.map(c => (
              <TouchableOpacity
                key={c.id}
                onPress={() => { setActiveCampaign(c); setCurrentAssignment(null); setShowCampaignPicker(false) }}
                style={[s.pickerItem, activeCampaign?.id === c.id && s.pickerItemActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.pickerItemName, activeCampaign?.id === c.id && { color: '#1d4ed8' }]}>{c.campaign_name}</Text>
                  <Text style={s.pickerItemSub}>{c.status} · {c.total_leads} leads · {fmtDate(c.date_from)} – {fmtDate(c.date_to)}</Text>
                </View>
                {activeCampaign?.id === c.id && <Text style={{ color: '#2563eb', fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

// ── Call Card ─────────────────────────────────────────────────────────────────
function CallCard({
  assignment, serviceHistory, historyLoading, showHistory, setShowHistory,
  notes, setNotes, busy, waBusy,
  onUpdateStatus, onSendWhatsApp, onBooking, onCallback,
}: {
  assignment: Assignment
  serviceHistory: ServiceHistoryRow[]
  historyLoading: boolean
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  notes: string
  setNotes: (v: string) => void
  busy: boolean
  waBusy: boolean
  onUpdateStatus: (status: string) => void
  onSendWhatsApp: (type: 'not_reachable' | 'reminder') => void
  onBooking: () => void
  onCallback: () => void
}) {
  const c = assignment.customer
  const phone = c.contact_phones || ''
  const isEV = (c.powertrain_type || '').toUpperCase() === 'EV'

  const handleCall = () => {
    if (!phone) { Alert.alert('No phone number available'); return }
    Linking.openURL(`tel:${phone}`)
  }

  return (
    <View style={s.callCard}>
      {/* ── Customer header ── */}
      <View style={[s.customerHeader, { backgroundColor: isEV ? '#1e3a5f' : '#1e3a8a' }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.customerName}>{c.first_name} {c.last_name || ''}</Text>
          <Text style={s.customerSub}>
            {isEV ? '⚡' : '🚗'} {c.model || '—'} · {c.powertrain_type || 'N/A'}
          </Text>
          {assignment.whatsapp_sent && (
            <View style={s.waSentBadge}>
              <Text style={s.waSentText}>✓ WhatsApp sent</Text>
            </View>
          )}
        </View>
        {c.vehicle_registration_number && (
          <View style={s.regBadge}>
            <Text style={s.regText}>{c.vehicle_registration_number}</Text>
          </View>
        )}
      </View>

      {/* ── Call attempts badge ── */}
      {assignment.call_count > 0 && (
        <View style={s.callCountBanner}>
          <Text style={s.callCountText}>
            📊 Call attempts: {assignment.call_count} · No answers: {assignment.no_answer_count}
            {assignment.called_at ? `  ·  Last called: ${fmtDate(assignment.called_at)}` : ''}
          </Text>
        </View>
      )}

      {/* ── BIG Call Button ── */}
      <View style={{ padding: 12 }}>
        <TouchableOpacity onPress={handleCall} style={s.callBtn} activeOpacity={0.85}>
          <Text style={s.callBtnText}>📞  Call {phone || 'No number'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Service Details ── */}
      <View style={s.detailsGrid}>
        <DetailCell label="Service Due" value={fmtDate(c.assumed_next_service_date, true)} highlight />
        <DetailCell label="Service Type" value={c.assumed_next_service_type || '—'} />
        <DetailCell label="Last Service" value={fmtDate(c.last_service_date, true)} />
        <DetailCell label="Last Svc Type" value={c.last_service_type || '—'} />
        <DetailCell label="Last Svc KM" value={c.last_service_km ? `${c.last_service_km} km` : '—'} />
        <DetailCell label="Last Dealer" value={c.last_service_dealer || '—'} />
        {c.sold_dealer && <DetailCell label="Sold By" value={c.sold_dealer} />}
        {c.extended_warranty_end_date && (
          <DetailCell label="Warranty Ends" value={fmtDate(c.extended_warranty_end_date, true)} />
        )}
      </View>

      {/* ── Service History Toggle ── */}
      <TouchableOpacity
        onPress={() => setShowHistory(!showHistory)}
        style={s.historyToggle}
        activeOpacity={0.7}
      >
        <Text style={s.historyToggleText}>
          🔧 Service History {historyLoading ? '(loading…)' : `(${serviceHistory.length} records)`}
        </Text>
        <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 16 }}>
          {showHistory ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {showHistory && (
        <View style={s.historyContainer}>
          {serviceHistory.length === 0 ? (
            <Text style={s.historyEmpty}>No service history found for this vehicle.</Text>
          ) : (
            serviceHistory.map((row, idx) => (
              <View key={idx} style={[s.historyRow, idx % 2 === 0 && { backgroundColor: '#f8fafc' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyDate}>{fmtDate(row.service_date, true)}</Text>
                  <Text style={s.historyType}>{row.service_type || '—'}</Text>
                  {row.dealer_name && <Text style={s.historyDealer}>{row.dealer_name}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {row.kms_at_service && (
                    <Text style={s.historyKm}>{row.kms_at_service} km</Text>
                  )}
                  {row.job_card_no && (
                    <Text style={s.historyJC}>JC: {row.job_card_no}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* ── WhatsApp Section ── */}
      <View style={s.waSection}>
        <Text style={s.waSectionTitle}>💬 WhatsApp</Text>
        <View style={s.waButtons}>
          <TouchableOpacity
            onPress={() => onSendWhatsApp('not_reachable')}
            disabled={waBusy}
            style={[s.waBtn, { backgroundColor: '#25D366' }, waBusy && s.btnDisabled]}
          >
            <Text style={s.waBtnText}>📵 Not Reachable Msg</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSendWhatsApp('reminder')}
            disabled={waBusy}
            style={[s.waBtn, { backgroundColor: '#128C7E' }, waBusy && s.btnDisabled]}
          >
            <Text style={s.waBtnText}>🔔 Service Reminder</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Notes ── */}
      <View style={s.notesSection}>
        <Text style={s.notesLabel}>📝 Call Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="What did the customer say?"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={2}
          style={s.notesInput}
        />
      </View>

      {/* ── Status Buttons ── */}
      <View style={s.statusSection}>
        <Text style={s.statusLabel}>Call Outcome</Text>
        <View style={s.statusGrid}>
          {/* Booked */}
          <TouchableOpacity
            onPress={onBooking}
            disabled={busy}
            style={[s.statusBtn, { backgroundColor: '#16a34a' }, busy && s.btnDisabled]}
          >
            <Text style={s.statusBtnText}>✅ Booked</Text>
          </TouchableOpacity>

          {/* Callback Later */}
          <TouchableOpacity
            onPress={onCallback}
            disabled={busy}
            style={[s.statusBtn, { backgroundColor: '#7c3aed' }, busy && s.btnDisabled]}
          >
            <Text style={s.statusBtnText}>📅 Callback Later</Text>
          </TouchableOpacity>

          {/* No Answer */}
          <TouchableOpacity
            onPress={() => onUpdateStatus('no_answer')}
            disabled={busy}
            style={[s.statusBtn, { backgroundColor: '#ea580c' }, busy && s.btnDisabled]}
          >
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.statusBtnText}>😶 No Answer</Text>}
          </TouchableOpacity>

          {/* Not Reachable */}
          <TouchableOpacity
            onPress={() => onUpdateStatus('not_reachable')}
            disabled={busy}
            style={[s.statusBtn, { backgroundColor: '#dc2626' }, busy && s.btnDisabled]}
          >
            <Text style={s.statusBtnText}>🚫 Not Reachable</Text>
          </TouchableOpacity>

          {/* Wrong Number */}
          <TouchableOpacity
            onPress={() => onUpdateStatus('wrong_number')}
            disabled={busy}
            style={[s.statusBtn, { backgroundColor: '#b45309' }, busy && s.btnDisabled]}
          >
            <Text style={s.statusBtnText}>⚠️ Wrong Number</Text>
          </TouchableOpacity>

          {/* Not Interested */}
          <TouchableOpacity
            onPress={() => onUpdateStatus('not_interested')}
            disabled={busy}
            style={[s.statusBtn, { backgroundColor: '#4b5563' }, busy && s.btnDisabled]}
          >
            <Text style={s.statusBtnText}>😑 Not Interested</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ── Detail Cell ───────────────────────────────────────────────────────────────
function DetailCell({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={s.detailCell}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, highlight && { color: '#1d4ed8', fontWeight: '700' }]}>{value}</Text>
    </View>
  )
}

// ── Queue Item ────────────────────────────────────────────────────────────────
function QueueItem({
  assignment, isEditing, editNotes, editStatus, editBookingDate, editCallbackDate, editBusy,
  onStartEdit, onCancelEdit, onSaveEdit,
  setEditNotes, setEditStatus, setEditBookingDate, setEditCallbackDate,
}: {
  assignment: Assignment
  isEditing: boolean
  editNotes: string
  editStatus: string
  editBookingDate: string
  editCallbackDate: string
  editBusy: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  setEditNotes: (v: string) => void
  setEditStatus: (v: string) => void
  setEditBookingDate: (v: string) => void
  setEditCallbackDate: (v: string) => void
}) {
  const c = assignment.customer
  const cfg = STATUS_CONFIG[assignment.status] || STATUS_CONFIG.pending

  const STATUS_OPTIONS = [
    { value: 'assigned',      label: '👤 Assigned' },
    { value: 'booked',        label: '✅ Booked' },
    { value: 'callback_later',label: '📅 Callback Later' },
    { value: 'no_answer',     label: '😶 No Answer' },
    { value: 'not_reachable', label: '🚫 Not Reachable' },
    { value: 'wrong_number',  label: '⚠️ Wrong Number' },
    { value: 'not_interested',label: '😑 Not Interested' },
  ]

  return (
    <View style={s.queueItem}>
      {/* Main row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.queueName}>{c.first_name} {c.last_name || ''}</Text>
          <Text style={s.queueSub}>📱 {c.contact_phones || '—'} · 🚗 {c.model || '—'}</Text>
          <Text style={s.queueDue}>Due: {fmtDate(c.assumed_next_service_date, true)} · {c.assumed_next_service_type || '—'}</Text>
          {assignment.status === 'callback_later' && assignment.callback_date && (
            <Text style={s.queueCallback}>📅 Callback: {fmtDate(assignment.callback_date, true)}</Text>
          )}
          {assignment.status === 'booked' && assignment.booking_date && (
            <Text style={s.queueBooked}>✅ Booked: {fmtDate(assignment.booking_date, true)}</Text>
          )}
          {!isEditing && assignment.call_notes ? (
            <Text style={s.queueNotes}>📝 {assignment.call_notes}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[s.statusChip, { backgroundColor: cfg.bg }]}>
            <Text style={[s.statusChipText, { color: cfg.text }]}>{cfg.emoji} {cfg.label}</Text>
          </View>
          <TouchableOpacity onPress={onStartEdit} style={s.editBtn}>
            <Text style={s.editBtnText}>✏️ Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Inline Edit Panel ── */}
      {isEditing && (
        <View style={s.editPanel}>
          <Text style={s.editPanelTitle}>Edit Assignment</Text>

          {/* Status picker */}
          <Text style={s.editFieldLabel}>Status</Text>
          <View style={s.statusPickerRow}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setEditStatus(opt.value)}
                style={[
                  s.statusPickerChip,
                  editStatus === opt.value && s.statusPickerChipActive,
                ]}
              >
                <Text style={[
                  s.statusPickerChipText,
                  editStatus === opt.value && s.statusPickerChipTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Notes */}
          <Text style={[s.editFieldLabel, { marginTop: 10 }]}>Remarks / Notes</Text>
          <TextInput
            value={editNotes}
            onChangeText={setEditNotes}
            placeholder="Update call notes or remarks…"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            style={s.editNotesInput}
            textAlignVertical="top"
          />

          {/* Booking date */}
          {editStatus === 'booked' && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.editFieldLabel}>Booking Date (YYYY-MM-DD)</Text>
              <TextInput
                value={editBookingDate}
                onChangeText={setEditBookingDate}
                placeholder="2026-07-15"
                placeholderTextColor="#9ca3af"
                keyboardType="numbers-and-punctuation"
                style={s.editDateInput}
              />
            </View>
          )}

          {/* Callback date */}
          {editStatus === 'callback_later' && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.editFieldLabel}>Callback Date (YYYY-MM-DD)</Text>
              <TextInput
                value={editCallbackDate}
                onChangeText={setEditCallbackDate}
                placeholder="2026-07-10"
                placeholderTextColor="#9ca3af"
                keyboardType="numbers-and-punctuation"
                style={s.editDateInput}
              />
            </View>
          )}

          {/* Save / Cancel */}
          <View style={s.editActions}>
            <TouchableOpacity
              onPress={onSaveEdit}
              disabled={editBusy}
              style={[s.editSaveBtn, editBusy && s.btnDisabled]}
            >
              {editBusy
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.editSaveBtnText}>💾 Save Changes</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancelEdit} style={s.editCancelBtn}>
              <Text style={s.editCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

// ── Summary View ──────────────────────────────────────────────────────────────
function SummaryView({ summary }: { summary: DailySummary }) {
  const convRate = summary.total_calls > 0
    ? Math.round((summary.booked / summary.total_calls) * 100)
    : 0

  const items = [
    { label: 'Total Calls',     value: summary.total_calls,     color: '#2563eb', bg: '#eff6ff', icon: '📞' },
    { label: 'Booked',          value: summary.booked,           color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
    { label: 'Callback Later',  value: summary.callback_later,   color: '#7c3aed', bg: '#f5f3ff', icon: '📅' },
    { label: 'No Answer',       value: summary.no_answer,        color: '#ea580c', bg: '#fff7ed', icon: '😶' },
    { label: 'Not Reachable',   value: summary.not_reachable,    color: '#dc2626', bg: '#fef2f2', icon: '🚫' },
    { label: 'Not Interested',  value: summary.not_interested,   color: '#374151', bg: '#f9fafb', icon: '😑' },
    { label: 'Wrong Number',    value: summary.wrong_number,     color: '#b45309', bg: '#fffbeb', icon: '⚠️' },
    { label: 'Conversion',      value: `${convRate}%`,           color: '#0f766e', bg: '#f0fdfa', icon: '📈' },
  ]

  return (
    <View>
      <Text style={s.summaryTitle}>Today's Performance</Text>
      <View style={s.summaryGrid}>
        {items.map(item => (
          <View key={item.label} style={[s.summaryCard, { backgroundColor: item.bg }]}>
            <Text style={s.summaryIcon}>{item.icon}</Text>
            <Text style={[s.summaryNum, { color: item.color }]}>{item.value}</Text>
            <Text style={s.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Date Modal ────────────────────────────────────────────────────────────────
function DateModal({
  visible, title, label, value, onChange,
  onConfirm, onClose, confirmLabel, confirmColor,
}: {
  visible: boolean; title: string; label: string
  value: string; onChange: (v: string) => void
  onConfirm: () => void; onClose: () => void
  confirmLabel: string; confirmColor: string
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <View style={s.dateModalSheet} onStartShouldSetResponder={() => true}>
          <Text style={s.dateModalTitle}>{title}</Text>
          <Text style={s.dateModalLabel}>{label}</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="2026-07-15"
            placeholderTextColor="#9ca3af"
            keyboardType="numbers-and-punctuation"
            style={s.dateInput}
            autoFocus
          />
          <Text style={s.dateHint}>Format: YYYY-MM-DD (e.g. 2026-07-15)</Text>
          <View style={s.dateModalBtns}>
            <TouchableOpacity onPress={onClose} style={s.dateModalCancel}>
              <Text style={s.dateModalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={[s.dateModalConfirm, { backgroundColor: confirmColor }]}
            >
              <Text style={s.dateModalConfirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex1:        { flex: 1 },
  flex1bg:      { flex: 1, backgroundColor: '#f3f4f6' },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:  { marginTop: 12, color: '#9ca3af', fontSize: 14 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  campaignBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 4, backgroundColor: '#eff6ff',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#bfdbfe',
  },
  campaignBadgeText: { fontSize: 12, color: '#1d4ed8', fontWeight: '600', maxWidth: SCREEN_W * 0.45 },
  campaignBadgeArrow: { fontSize: 10, color: '#1d4ed8' },
  noCampaign: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  campaignStats: { flexDirection: 'row', gap: 8 },
  statChip: { alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#9ca3af', marginTop: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  tabBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabBtnActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  tabBtnTextActive: { color: '#fff' },

  // Error
  errorBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 12, marginTop: 8, padding: 12,
    borderRadius: 10, backgroundColor: '#fef3c7',
    borderWidth: 1, borderColor: '#fcd34d',
  },
  errorText: { flex: 1, fontSize: 13, color: '#92400e' },
  errorDismiss: { fontSize: 16, color: '#92400e', marginLeft: 8 },

  // Empty state
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 40,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptyMsg:   { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  getNextBtn: {
    marginTop: 24, backgroundColor: '#2563eb',
    paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 14, minWidth: 200, alignItems: 'center',
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  getNextBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },

  // Call card
  callCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e5e7eb', marginTop: 4,
  },
  customerHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 16, gap: 8,
  },
  customerName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  customerSub:  { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  waSentBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(37,211,102,0.25)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(37,211,102,0.5)',
  },
  waSentText: { fontSize: 11, color: '#25D366', fontWeight: '600' },
  regBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  regText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Call count banner
  callCountBanner: {
    backgroundColor: '#fef9c3', paddingHorizontal: 14, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#fde047',
  },
  callCountText: { fontSize: 12, color: '#92400e', fontWeight: '500' },

  // Call button
  callBtn: {
    backgroundColor: '#16a34a', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#16a34a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
  },
  callBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },

  // Details grid
  detailsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  detailCell: {
    width: '50%', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    borderRightWidth: 1, borderRightColor: '#f1f5f9',
  },
  detailLabel: { fontSize: 10, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#111827', marginTop: 2 },

  // Service history
  historyToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  historyToggleText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  historyContainer: { borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  historyEmpty: { padding: 16, fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  historyDate:   { fontSize: 13, fontWeight: '700', color: '#111827' },
  historyType:   { fontSize: 12, color: '#374151', marginTop: 2 },
  historyDealer: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  historyKm:     { fontSize: 12, fontWeight: '600', color: '#374151' },
  historyJC:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  // WhatsApp section
  waSection: {
    padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb',
    backgroundColor: '#f0fdf4',
  },
  waSectionTitle: { fontSize: 13, fontWeight: '700', color: '#166534', marginBottom: 8 },
  waButtons: { flexDirection: 'row', gap: 8 },
  waBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  waBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Notes
  notesSection: {
    padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  notesLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  notesInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', backgroundColor: '#fff',
    minHeight: 60, textAlignVertical: 'top',
  },

  // Status buttons
  statusSection: {
    padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  statusLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: {
    width: '48%', paddingVertical: 13, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  statusBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Queue
  queueItem: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  queueName:     { fontSize: 15, fontWeight: '700', color: '#111827' },
  queueSub:      { fontSize: 12, color: '#6b7280', marginTop: 3 },
  queueDue:      { fontSize: 12, color: '#374151', marginTop: 3 },
  queueCallback: { fontSize: 12, color: '#7c3aed', marginTop: 3, fontWeight: '600' },
  queueBooked:   { fontSize: 12, color: '#16a34a', marginTop: 3, fontWeight: '600' },
  queueNotes:    { fontSize: 11, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' },
  statusChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, alignSelf: 'flex-start' },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  // Summary
  summaryTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  summaryGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    width: '47%', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  summaryIcon:  { fontSize: 24, marginBottom: 4 },
  summaryNum:   { fontSize: 30, fontWeight: '900' },
  summaryLabel: { fontSize: 11, color: '#6b7280', marginTop: 2, textAlign: 'center' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12,
  },
  pickerItemActive: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8 },
  pickerItemName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  pickerItemSub:  { fontSize: 12, color: '#6b7280', marginTop: 2 },

  dateModalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24,
  },
  dateModalTitle:       { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
  dateModalLabel:       { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  dateInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#111827',
  },
  dateHint:     { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  dateModalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  dateModalCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  dateModalCancelText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dateModalConfirm: { flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  dateModalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Edit button + panel
  editBtn: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f9fafb',
  },
  editBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },

  editPanel: {
    marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb',
    paddingTop: 12, backgroundColor: '#eff6ff',
    borderRadius: 10, padding: 12,
  },
  editPanelTitle: { fontSize: 13, fontWeight: '800', color: '#1d4ed8', marginBottom: 8 },
  editFieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 },

  statusPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusPickerChip: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff',
  },
  statusPickerChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  statusPickerChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  statusPickerChipTextActive: { color: '#fff', fontWeight: '700' },

  editNotesInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: '#111827', backgroundColor: '#fff',
    minHeight: 70,
  },
  editDateInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', backgroundColor: '#fff',
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  editSaveBtn: {
    flex: 2, backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  editSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  editCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', backgroundColor: '#fff',
  },
  editCancelBtnText: { fontSize: 14, color: '#374151', fontWeight: '600' },
})
