/**
 * mobile/src/app/(tabs)/telecalling.tsx
 * Mobile version of web TelecallingPage.tsx — service reminder telecalling
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, FlatList, Modal, Platform,
  RefreshControl, ScrollView, Text, TextInput,
  TouchableOpacity, View, Alert, Linking,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase, SUPABASE_URL } from '../../lib/supabase'

// ── Types ───────────────────────────────────────────────────────────────────
interface Customer {
  id: number; first_name: string | null; last_name: string | null
  contact_phones: string | null; model: string | null
  powertrain_type: string | null; vehicle_registration_number: string | null
  assumed_next_service_date: string | null; assumed_next_service_type: string | null
  last_service_date: string | null; last_service_type: string | null
  last_service_km: string | null
}

interface Assignment {
  id: number; campaign_id: number; status: string; call_notes: string | null
  booking_date: string | null; callback_date: string | null
  called_at: string | null; call_count: number; no_answer_count: number
  whatsapp_sent: boolean; customer: Customer
}

interface Campaign {
  id: number; campaign_name: string; date_from: string; date_to: string
  status: string; total_leads: number; pending_count: number
  booked_count: number; completed_count: number
}

const EDGE_URL = `${SUPABASE_URL}/functions/v1/telecalling`

async function callEdge(action: string, body: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Unknown error')
  return data
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) } catch { return d }
}

const STATUS_COLORS: Record<string, string> = {
  booked: '#16a34a', callback_later: '#9333ea', no_answer: '#ea580c',
  not_reachable: '#dc2626', wrong_number: '#dc2626', not_interested: '#6b7280',
  pending: '#9ca3af', assigned: '#2563eb', calling: '#2563eb', completed: '#16a34a',
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function TelecallingScreen() {
  const [role, setRole] = useState('staff')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<'call' | 'queue' | 'summary'>('call')
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null)
  const [queue, setQueue] = useState<Assignment[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showCallbackModal, setShowCallbackModal] = useState(false)
  const [bookingDate, setBookingDate] = useState('')
  const [callbackDate, setCallbackDate] = useState('')

  // Init
  useFocusEffect(useCallback(() => {
    async function init() {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data: user } = await supabase.from('users').select('role').eq('id', session.user.id).single()
        if (user?.role) setRole(user.role)
        const { data: camps } = await supabase.from('telecall_campaigns').select('*').order('created_at', { ascending: false })
        setCampaigns(camps || [])
        const active = camps?.find((c: Campaign) => c.status === 'active') || camps?.[0] || null
        setActiveCampaign(active || null)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    init()
  }, []))

  const refreshQueue = useCallback(async () => {
    if (!activeCampaign) return
    try {
      const data = await callEdge('my_queue', { campaign_id: activeCampaign.id })
      setQueue(data.queue || [])
    } catch (e) { console.error(e) }
  }, [activeCampaign])

  const refreshSummary = useCallback(async () => {
    try { const data = await callEdge('my_summary', {}); setSummary(data.summary) } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { refreshQueue(); refreshSummary() }, [refreshQueue, refreshSummary])

  const handleGetNext = async () => {
    if (!activeCampaign) return
    setBusy(true); setError(null)
    try {
      const data = await callEdge('get_next', { campaign_id: activeCampaign.id })
      if (data.assignment) { setCurrentAssignment(data.assignment); setCurrentView('call') }
      else { setError('No more pending customers. Great job! 🎉') }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const handleUpdateStatus = async (status: string, bDate?: string, cbDate?: string) => {
    if (!currentAssignment || !activeCampaign) return
    setBusy(true); setError(null)
    try {
      await callEdge('update_status', {
        assignment_id: currentAssignment.id, campaign_id: activeCampaign.id,
        status, call_notes: notes || undefined,
        booking_date: status === 'booked' ? (bDate || bookingDate) : undefined,
        callback_date: status === 'callback_later' ? (cbDate || callbackDate) : undefined,
      })
      setCurrentAssignment(null); setNotes(''); setBookingDate(''); setCallbackDate('')
      setShowBookingModal(false); setShowCallbackModal(false)
      refreshQueue(); refreshSummary()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const makeCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`)
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ marginTop: 12, color: '#9ca3af', fontSize: 14 }}>Loading telecalling…</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827' }}>📞 Telecalling</Text>
        {activeCampaign && (
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 12, color: '#ea580c' }}>⏳ {activeCampaign.pending_count} pending</Text>
            <Text style={{ fontSize: 12, color: '#16a34a' }}>✅ {activeCampaign.booked_count} booked</Text>
          </View>
        )}
      </View>

      {/* Tab buttons */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {[
          { key: 'call', label: '📞 Call' },
          { key: 'queue', label: `📋 Queue (${queue.length})` },
          { key: 'summary', label: '📊 Summary' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              setCurrentView(tab.key as any)
              if (tab.key === 'queue') refreshQueue()
              if (tab.key === 'summary') refreshSummary()
            }}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
              backgroundColor: currentView === tab.key ? '#111827' : '#fff',
              borderWidth: 1, borderColor: currentView === tab.key ? '#111827' : '#e5e7eb',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: currentView === tab.key ? '#fff' : '#4b5563' }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 8, backgroundColor: '#fef3c7' }}>
          <Text style={{ fontSize: 13, color: '#92400e' }}>{error}</Text>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        {/* ── CALL VIEW ── */}
        {currentView === 'call' && (
          !activeCampaign ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📞</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151' }}>No active campaign</Text>
              <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>
                Ask admin to create a campaign with service-due customers.
              </Text>
            </View>
          ) : !currentAssignment ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🎯</Text>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>Ready to call?</Text>
              <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
                Get the next customer who needs a service reminder.
              </Text>
              <TouchableOpacity
                onPress={handleGetNext}
                disabled={busy}
                style={{ marginTop: 24, backgroundColor: '#2563eb', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>📞 Get Next Customer</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <CallCard
              assignment={currentAssignment}
              busy={busy}
              notes={notes}
              setNotes={setNotes}
              onCall={makeCall}
              onBooked={() => setShowBookingModal(true)}
              onCallback={() => setShowCallbackModal(true)}
              onStatus={(s) => handleUpdateStatus(s)}
            />
          )
        )}

        {/* ── QUEUE VIEW ── */}
        {currentView === 'queue' && (
          queue.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#9ca3af' }}>No active assignments. Tap "Get Next Customer" to start.</Text>
            </View>
          ) : (
            queue.map((asgn) => (
              <View key={asgn.id} style={{ marginBottom: 8, padding: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>
                      {asgn.customer.first_name} {asgn.customer.last_name || ''}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      📱 {asgn.customer.contact_phones} · 🚗 {asgn.customer.model}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      🔧 {asgn.customer.assumed_next_service_type} due {fmtDate(asgn.customer.assumed_next_service_date)}
                    </Text>
                    {asgn.status === 'callback_later' && asgn.callback_date && (
                      <Text style={{ fontSize: 12, color: '#9333ea', marginTop: 4 }}>📅 Callback: {fmtDate(asgn.callback_date)}</Text>
                    )}
                    {asgn.status === 'booked' && asgn.booking_date && (
                      <Text style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>✅ Booked: {fmtDate(asgn.booking_date)}</Text>
                    )}
                  </View>
                  <View style={{ backgroundColor: (STATUS_COLORS[asgn.status] || '#9ca3af') + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: STATUS_COLORS[asgn.status] || '#9ca3af' }}>
                      {asgn.status.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>
                {asgn.call_notes ? (
                  <View style={{ marginTop: 8, padding: 8, borderRadius: 6, backgroundColor: '#f3f4f6' }}>
                    <Text style={{ fontSize: 12, color: '#4b5563' }}>📝 {asgn.call_notes}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )
        )}

        {/* ── SUMMARY VIEW ── */}
        {currentView === 'summary' && summary && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Total Calls', value: summary.total_calls, color: '#2563eb', icon: '📞' },
              { label: 'Booked', value: summary.booked, color: '#16a34a', icon: '✅' },
              { label: 'Callback', value: summary.callback_later, color: '#9333ea', icon: '📅' },
              { label: 'No Answer', value: summary.no_answer, color: '#ea580c', icon: '📵' },
              { label: 'Not Reachable', value: summary.not_reachable, color: '#dc2626', icon: '🚫' },
              { label: 'Not Interested', value: summary.not_interested, color: '#6b7280', icon: '😐' },
            ].map((item, i) => (
              <View key={i} style={{ width: '48%', padding: 16, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: item.color + '30' }}>
                <Text style={{ fontSize: 28 }}>{item.icon}</Text>
                <Text style={{ fontSize: 28, fontWeight: 'bold', color: item.color, marginTop: 4 }}>{item.value}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.label}</Text>
              </View>
            ))}
            <View style={{ width: '48%', padding: 16, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#16a34a30' }}>
              <Text style={{ fontSize: 28 }}>📈</Text>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#16a34a', marginTop: 4 }}>
                {summary.total_calls > 0 ? Math.round((summary.booked / summary.total_calls) * 100) : 0}%
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Conversion Rate</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Booking Modal */}
      <Modal visible={showBookingModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>✅ Confirm Booking</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>When will the customer visit?</Text>
            <TextInput
              value={bookingDate}
              onChangeText={setBookingDate}
              placeholder="YYYY-MM-DD"
              style={{ marginTop: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowBookingModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleUpdateStatus('booked')}
                disabled={busy || !bookingDate}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#16a34a', alignItems: 'center', opacity: busy || !bookingDate ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{busy ? 'Saving…' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Callback Modal */}
      <Modal visible={showCallbackModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>📞 Schedule Callback</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>When should we call again?</Text>
            <TextInput
              value={callbackDate}
              onChangeText={setCallbackDate}
              placeholder="YYYY-MM-DD"
              style={{ marginTop: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowCallbackModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleUpdateStatus('callback_later')}
                disabled={busy || !callbackDate}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#9333ea', alignItems: 'center', opacity: busy || !callbackDate ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{busy ? 'Saving…' : 'Schedule'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Call Card ───────────────────────────────────────────────────────────────
function CallCard({ assignment, busy, notes, setNotes, onCall, onBooked, onCallback, onStatus }: {
  assignment: Assignment; busy: boolean; notes: string; setNotes: (v: string) => void
  onCall: (phone: string) => void; onBooked: () => void; onCallback: () => void
  onStatus: (s: string) => void
}) {
  const c = assignment.customer
  const phone = c.contact_phones || ''

  return (
    <View>
      {/* Customer header */}
      <View style={{ backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 16, borderRadius: 12, marginBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>{c.first_name} {c.last_name || ''}</Text>
        <Text style={{ fontSize: 14, color: '#bfdbfe', marginTop: 4 }}>🚗 {c.model} · {c.powertrain_type || 'N/A'}</Text>
        {c.vehicle_registration_number ? (
          <View style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{c.vehicle_registration_number}</Text>
          </View>
        ) : null}
      </View>

      {/* Call button */}
      <TouchableOpacity
        onPress={() => onCall(phone)}
        style={{ backgroundColor: '#22c55e', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>📞 Call {phone}</Text>
      </TouchableOpacity>

      {assignment.whatsapp_sent ? (
        <View style={{ marginBottom: 12, padding: 8, borderRadius: 8, backgroundColor: '#dcfce7', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#16a34a' }}>✓ WhatsApp reminder already sent</Text>
        </View>
      ) : null}

      {/* Service details */}
      <View style={{ backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
        <DetailRow label="Service Due" value={`${fmtDate(c.assumed_next_service_date)} · ${c.assumed_next_service_type || '—'}`} />
        <DetailRow label="Last Service" value={`${fmtDate(c.last_service_date)} · ${c.last_service_type || '—'}`} />
        <DetailRow label="Last Service KM" value={c.last_service_km ? `${c.last_service_km} km` : '—'} />
      </View>

      {/* Previous calls */}
      {assignment.call_count > 0 ? (
        <View style={{ marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#fef3c7' }}>
          <Text style={{ fontSize: 13, color: '#92400e' }}>
            ⚠️ Called {assignment.call_count}x before ({assignment.no_answer_count} no-answers — auto-removes after 3)
          </Text>
          {assignment.call_notes ? <Text style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>Last: {assignment.call_notes}</Text> : null}
        </View>
      ) : null}

      {/* Notes */}
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Call notes…"
        multiline
        style={{ marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 14, minHeight: 60, backgroundColor: '#fff', textAlignVertical: 'top' }}
      />

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ActionBtn label="✅ Booked" color="#16a34a" onPress={onBooked} disabled={busy} />
        <ActionBtn label="📞 Callback" color="#9333ea" onPress={onCallback} disabled={busy} />
        <ActionBtn label="📵 No Answer" color="#ea580c" onPress={() => onStatus('no_answer')} disabled={busy} />
        <ActionBtn label="🚫 Not Reachable" color="#dc2626" onPress={() => onStatus('not_reachable')} disabled={busy} />
        <ActionBtn label="⚠️ Wrong Number" color="#dc2626" onPress={() => onStatus('wrong_number')} disabled={busy} />
        <ActionBtn label="😐 Not Interested" color="#6b7280" onPress={() => onStatus('not_interested')} disabled={busy} />
      </View>
    </View>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
      <Text style={{ fontSize: 13, color: '#9ca3af' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '500', color: '#111827' }}>{value}</Text>
    </View>
  )
}

function ActionBtn({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ width: '48%', paddingVertical: 12, borderRadius: 10, backgroundColor: color, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{label}</Text>
    </TouchableOpacity>
  )
}
