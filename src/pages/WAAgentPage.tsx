import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentConfig {
  id: number
  business_name: string
  agent_name: string
  greeting_message: string
  closing_message: string
  system_prompt: string
  available_branches: string[]
  working_hours: string
  booking_confirm_msg: string
  meta_phone_number_id: string
  meta_access_token: string
  openai_api_key: string
  auto_reply_enabled: boolean
  max_ai_turns: number
  wa_verify_token: string
  daily_slot_capacity: number
  escalation_email: string
  escalation_phone: string
  sa_whatsapp_number: string
  staff_notify_on_escalation: boolean
}

interface Campaign {
  id: number
  name: string
  description: string | null
  status: string
  target_segment: string
  template_message: string
  scheduled_at: string | null
  total_contacts: number
  sent_count: number
  delivered_count: number
  replied_count: number
  booked_count: number
  created_at: string
}

interface Conversation {
  id: number
  phone: string
  customer_name: string | null
  reg_number: string | null
  model: string | null
  status: string
  stage: string
  ai_turns: number
  last_message_at: string
  campaign_id: number | null
  booking_id: number | null
  preferred_date: string | null
  preferred_time: string | null
  preferred_branch: string | null
}

interface WAMessage {
  id: number
  conversation_id: number
  direction: string
  sender: string
  body: string
  ai_generated: boolean
  status: string
  created_at: string
}

interface ServiceDataRow {
  id: number
  cust_first_name: string
  cust_last_name: string
  cust_mobile_no: string
  registration_no: string | null
  ppl: string | null
  pl: string | null
  vehicle_sale_date: string | null
  scheduled_next_service_date: string | null
  last_service_date: string | null
}

type Tab = 'dashboard' | 'campaigns' | 'conversations' | 'followups' | 'settings' | 'test'

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  Open:       { bg: '#eff6ff', color: '#2563eb' },
  Booked:     { bg: '#dcfce7', color: '#15803d' },
  Closed:     { bg: '#f1f5f9', color: '#64748b' },
  'Opted-Out':{ bg: '#fef2f2', color: '#dc2626' },
  Escalated:  { bg: '#fffbeb', color: '#d97706' },
  Draft:      { bg: '#f1f5f9', color: '#64748b' },
  Scheduled:  { bg: '#eff6ff', color: '#2563eb' },
  Running:    { bg: '#fffbeb', color: '#d97706' },
  Completed:  { bg: '#dcfce7', color: '#15803d' },
  Paused:     { bg: '#fef2f2', color: '#dc2626' },
}

const SEGMENTS = ['All', 'DueForService', 'NoService6M', 'NoService12M', 'FreeService']
const SEGMENT_LABELS: Record<string, string> = {
  All: 'All Customers',
  DueForService: 'Due for Service (next 30 days)',
  NoService6M: 'No Service in 6+ Months',
  NoService12M: 'No Service in 12+ Months',
  FreeService: 'Free Service Pending',
}

const DEFAULT_TEMPLATE = `Hello {{name}}! 👋

I'm {{agent}} from *{{business}}*.

Your *{{model}}* ({{reg_no}}) is due for service.

🔧 Book your appointment now and we'll take care of everything!

📍 Branches: {{branch}}
⏰ Working Hours: Mon–Sat, 9AM–6PM

Reply *YES* to book your appointment, or let me know a convenient date! 😊`

export default function WAAgentPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<WAMessage[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Campaign creation
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campaignForm, setCampaignForm] = useState({
    name: '', description: '', target_segment: 'DueForService', template_message: DEFAULT_TEMPLATE, scheduled_at: '',
  })
  const [previewContacts, setPreviewContacts] = useState<ServiceDataRow[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sendingCampaign, setSendingCampaign] = useState<number | null>(null)
  const [manualMsg, setManualMsg] = useState('')
  const [sendingManual, setSendingManual] = useState(false)
  const [convFilter, setConvFilter] = useState('all')
  // Test simulator state
  const [testPhone, setTestPhone] = useState('9999999999')
  const [testMessage, setTestMessage] = useState('')
  const [testChat, setTestChat] = useState<Array<{role:'user'|'agent'; text:string; ts:string}>>([])
  const [testLoading, setTestLoading] = useState(false)
  const [testConvId, setTestConvId] = useState<number|null>(null)
  // Follow-up state
  const [followupSteps, setFollowupSteps] = useState<Array<{id:number;day_offset:number;message_template:string;sort_order:number;is_active:boolean}>>([])
  const [followupQueue, setFollowupQueue] = useState<Array<{id:number;phone:string;customer_name:string;model:string;scheduled_at:string;status:string;skip_reason:string;wa_followup_steps:{message_template:string;day_offset:number}}>>([])
  const [enrollingCamp, setEnrollingCamp] = useState<number|null>(null)
  const [followupFilter, setFollowupFilter] = useState('pending')
  const [editingStep, setEditingStep] = useState<number|null>(null)
  const [stepDraft, setStepDraft] = useState('')
  const [savingStep, setSavingStep] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => { void loadAll() }, [])
  useEffect(() => { if (selectedConv) void loadMessages(selectedConv.id) }, [selectedConv])

  async function loadAll() {
    const [cfgRes, campRes, convRes, stepsRes, queueRes] = await Promise.all([
      supabase.from('wa_agent_config').select('*').eq('id', 1).single(),
      supabase.from('wa_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('wa_conversations').select('*').order('last_message_at', { ascending: false }).limit(100),
      supabase.from('wa_followup_steps').select('*').eq('sequence_id', 1).order('sort_order'),
      supabase.from('wa_followup_queue').select('*, wa_followup_steps!step_id(message_template,day_offset)').order('scheduled_at', { ascending: false }).limit(200),
    ])
    if (cfgRes.data)  setConfig(cfgRes.data as AgentConfig)
    if (campRes.data) setCampaigns(campRes.data as Campaign[])
    if (convRes.data) setConversations(convRes.data as Conversation[])
    if (stepsRes.data) setFollowupSteps(stepsRes.data as typeof followupSteps)
    if (queueRes.data) setFollowupQueue(queueRes.data as typeof followupQueue)
  }

  async function loadMessages(convId: number) {
    const { data } = await supabase.from('wa_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true })
    setMessages((data || []) as WAMessage[])
  }

  // ── Save config ─────────────────────────────────────────────────────────────
  async function saveConfig() {
    if (!config) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('wa_agent_config').update({ ...config, updated_at: new Date().toISOString() }).eq('id', 1)
    if (err) setError(err.message)
    else showToast('✅ Settings saved!')
    setSaving(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Preview segment contacts ─────────────────────────────────────────────────
  async function loadPreview(segment: string) {
    setLoadingPreview(true)
    const today = new Date()
    let query = supabase.from('all_service_data').select('id, cust_first_name, cust_last_name, cust_mobile_no, registration_no, ppl, pl, vehicle_sale_date, scheduled_next_service_date, last_service_date').not('cust_mobile_no', 'is', null).neq('cust_mobile_no', '').limit(20)

    if (segment === 'DueForService') {
      const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
      const f = today.toISOString().split('T')[0].replace(/-/g, '/')
      const t = in30.toISOString().split('T')[0].replace(/-/g, '/')
      query = query.gte('scheduled_next_service_date', f).lte('scheduled_next_service_date', t)
    } else if (segment === 'NoService6M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 6)
      query = query.lt('last_service_date', d.toISOString().split('T')[0].replace(/-/g, '/'))
    } else if (segment === 'NoService12M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 12)
      query = query.lt('last_service_date', d.toISOString().split('T')[0].replace(/-/g, '/'))
    } else if (segment === 'FreeService') {
      query = query.or('first_free_service_done_flag.eq.N,second_free_service_done_flag.eq.N,third_free_service_done_flag.eq.N')
    }

    const { data } = await query
    setPreviewContacts((data || []) as ServiceDataRow[])
    setLoadingPreview(false)
  }

  // ── Create campaign + populate contacts ─────────────────────────────────────
  async function createCampaign() {
    if (!campaignForm.name.trim()) { setError('Campaign name required'); return }
    if (!campaignForm.template_message.trim()) { setError('Message template required'); return }
    setSaving(true)
    setError('')
    const today = new Date()

    // 1. Create campaign
    const { data: camp, error: campErr } = await supabase.from('wa_campaigns').insert([{
      name: campaignForm.name,
      description: campaignForm.description || null,
      target_segment: campaignForm.target_segment,
      template_message: campaignForm.template_message,
      scheduled_at: campaignForm.scheduled_at || null,
      status: 'Draft',
    }]).select().single()
    if (campErr || !camp) { setError(campErr?.message || 'Failed to create campaign'); setSaving(false); return }

    // 2. Fetch contacts
    let query = supabase.from('all_service_data')
      .select('id, cust_first_name, cust_last_name, cust_mobile_no, registration_no, ppl, pl, vehicle_sale_date, last_service_date, scheduled_next_service_date')
      .not('cust_mobile_no', 'is', null).neq('cust_mobile_no', '').limit(1000)

    if (campaignForm.target_segment === 'DueForService') {
      const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
      query = query.gte('scheduled_next_service_date', today.toISOString().split('T')[0].replace(/-/g, '/')).lte('scheduled_next_service_date', in30.toISOString().split('T')[0].replace(/-/g, '/'))
    } else if (campaignForm.target_segment === 'NoService6M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 6)
      query = query.lt('last_service_date', d.toISOString().split('T')[0].replace(/-/g, '/'))
    } else if (campaignForm.target_segment === 'NoService12M') {
      const d = new Date(today); d.setMonth(d.getMonth() - 12)
      query = query.lt('last_service_date', d.toISOString().split('T')[0].replace(/-/g, '/'))
    } else if (campaignForm.target_segment === 'FreeService') {
      query = query.or('first_free_service_done_flag.eq.N,second_free_service_done_flag.eq.N')
    }

    const { data: contacts } = await query
    const rows = (contacts || []).map((c: ServiceDataRow) => ({
      campaign_id: (camp as Campaign).id,
      phone: c.cust_mobile_no.replace(/\D/g, ''),
      customer_name: `${c.cust_first_name || ''} ${c.cust_last_name || ''}`.trim(),
      reg_number: c.registration_no,
      model: c.ppl,
      service_due_date: c.scheduled_next_service_date,
      status: 'Pending',
    }))

    if (rows.length > 0) {
      // Batch insert contacts in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from('wa_campaign_contacts').insert(rows.slice(i, i + 500))
      }
    }

    await supabase.from('wa_campaigns').update({ total_contacts: rows.length }).eq('id', (camp as Campaign).id)

    showToast(`✅ Campaign created with ${rows.length} contacts!`)
    setShowCampaignForm(false)
    setCampaignForm({ name: '', description: '', target_segment: 'DueForService', template_message: DEFAULT_TEMPLATE, scheduled_at: '' })
    await loadAll()
    setSaving(false)
  }

  // ── Send campaign batch ─────────────────────────────────────────────────────
  async function sendCampaignBatch(campaignId: number) {
    setSendingCampaign(campaignId)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('wa-send-campaign', {
        body: { campaign_id: campaignId, batch_size: 30, delay_ms: 800 },
      })
      if (fnErr) setError(fnErr.message || 'Send failed')
      else if (data?.ok) showToast(`✅ Sent: ${data.sent}, Failed: ${data.failed}`)
      else setError(data?.error || 'Send failed')
    } catch (e) {
      setError('Network error. Check edge function deployment.')
    }
    await loadAll()
    setSendingCampaign(null)
  }

  // ── Send manual message from inbox ─────────────────────────────────────────
  async function sendManualMessage() {
    if (!selectedConv || !manualMsg.trim() || !config?.meta_phone_number_id || !config?.meta_access_token) return
    setSendingManual(true)
    // Save to DB first
    await supabase.from('wa_messages').insert([{
      conversation_id: selectedConv.id,
      direction: 'outbound',
      sender: 'staff',
      body: manualMsg.trim(),
      ai_generated: false,
      status: 'sent',
    }])
    // Send via Meta (call backend function)
    try {
      // Message already saved to DB above; in future hook into send-campaign fn
    } catch { /* still saved to DB */ }
    setManualMsg('')
    await loadMessages(selectedConv.id)
    setSendingManual(false)
  }

  // ── Test simulator ─────────────────────────────────────────────────────────
  async function sendTestMessage() {
    if (!testMessage.trim() || !config) return
    setTestLoading(true)
    const userMsg = testMessage.trim()
    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    setTestChat(p => [...p, { role: 'user', text: userMsg, ts }])
    setTestMessage('')

    // Simulate inbound message by directly calling the webhook
    try {
      // Save message to DB manually (simulating webhook)
      let convId = testConvId
      if (!convId) {
        // Create/get conv for test phone
        const { data: existingConv } = await supabase.from('wa_conversations').select('id,stage,model,reg_number,customer_name,preferred_date,preferred_branch,ai_turns,status').eq('phone', testPhone).limit(1)
        if (existingConv?.[0]) {
          convId = existingConv[0].id as number
        } else {
          const { data: newConv } = await supabase.from('wa_conversations').insert([{
            phone: testPhone, customer_name: 'Test Customer', model: 'Nexon', reg_number: 'RJ14XX9999',
            status: 'Open', stage: 'intro', ai_turns: 0,
          }]).select('id')
          convId = newConv?.[0]?.id as number
        }
        setTestConvId(convId)
      }

      if (!convId) { setTestLoading(false); return }

      // Save inbound
      await supabase.from('wa_messages').insert([{
        conversation_id: convId, direction: 'inbound', sender: 'customer', body: userMsg, ai_generated: false, status: 'delivered',
      }])
      await supabase.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

      // Call edge function to get AI reply
      const { data: fnData } = await supabase.functions.invoke('wa-test-reply', {
        body: { conversation_id: convId, message: userMsg },
      })

      // Fallback: read latest outbound message from DB (written by edge fn or test fn)
      await new Promise(r => setTimeout(r, 1200))
      const { data: latestMsgs } = await supabase.from('wa_messages')
        .select('body,direction,created_at').eq('conversation_id', convId)
        .eq('direction', 'outbound').order('created_at', { ascending: false }).limit(1)

      const reply = latestMsgs?.[0]?.body || fnData?.reply || "Processing..."
      const replyTs = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      setTestChat(p => [...p, { role: 'agent', text: reply, ts: replyTs }])

      // Refresh conversations
      await loadAll()
    } catch (e) {
      setTestChat(p => [...p, { role: 'agent', text: '⚠️ Error: ' + String(e), ts: new Date().toLocaleTimeString() }])
    }
    setTestLoading(false)
  }

  async function resetTestConv() {
    if (!testConvId) return
    await supabase.from('wa_messages').delete().eq('conversation_id', testConvId)
    await supabase.from('wa_conversations').update({ status: 'Open', stage: 'intro', ai_turns: 0, booking_id: null, preferred_date: null, preferred_branch: null, preferred_time: null }).eq('id', testConvId)
    setTestChat([])
    showToast('🔄 Test conversation reset')
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: conversations.length,
    open: conversations.filter(c => c.status === 'Open').length,
    booked: conversations.filter(c => c.status === 'Booked').length,
    escalated: conversations.filter(c => c.status === 'Escalated').length,
    optedOut: conversations.filter(c => c.status === 'Opted-Out').length,
    totalCampaigns: campaigns.length,
    runningCampaigns: campaigns.filter(c => c.status === 'Running').length,
    totalSent: campaigns.reduce((s, c) => s + (c.sent_count || 0), 0),
    totalBooked: campaigns.reduce((s, c) => s + (c.booked_count || 0), 0),
  }), [conversations, campaigns])

  const filteredConvs = useMemo(() => {
    if (convFilter === 'all') return conversations
    return conversations.filter(c => c.status.toLowerCase() === convFilter.toLowerCase())
  }, [conversations, convFilter])

  // ─── Render ────────────────────────────────────────────────────────────────
  const TAB_STYLE = (t: Tab) => ({
    padding: '0.4rem 0.9rem', border: 'none', background: tab === t ? '#2563eb' : 'transparent',
    color: tab === t ? '#fff' : '#64748b', borderRadius: '6px', cursor: 'pointer',
    fontWeight: 700, fontSize: '0.8rem', transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999, background: '#1e293b', color: '#fff', padding: '0.6rem 1.1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontSize: '1.2rem' }}>🤖</span>
        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>WA AI Agent</span>
        <div style={{ display: 'flex', gap: '0.2rem', background: '#f1f5f9', borderRadius: '8px', padding: '0.25rem', marginLeft: '0.5rem' }}>
          {(['dashboard', 'campaigns', 'conversations', 'followups', 'settings', 'test'] as Tab[]).map(t => (
            <button key={t} style={TAB_STYLE(t)} onClick={() => setTab(t)}>
              {t === 'dashboard' ? '📊 Dashboard' : t === 'campaigns' ? '📣 Campaigns' : t === 'conversations' ? '💬 Inbox' : t === 'followups' ? '🔁 Follow-ups' : t === 'test' ? '🧪 Test AI' : '⚙️ Settings'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: config?.auto_reply_enabled ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
          <span style={{ color: '#64748b' }}>AI {config?.auto_reply_enabled ? 'Active' : 'Paused'}</span>
        </div>
        <button className="btn btn--sm" style={{ background: config?.auto_reply_enabled ? '#fef2f2' : '#f0fdf4', color: config?.auto_reply_enabled ? '#dc2626' : '#16a34a', border: `1px solid ${config?.auto_reply_enabled ? '#fca5a5' : '#86efac'}`, fontWeight: 700 }}
          onClick={async () => {
            if (!config) return
            const updated = { ...config, auto_reply_enabled: !config.auto_reply_enabled }
            setConfig(updated)
            await supabase.from('wa_agent_config').update({ auto_reply_enabled: updated.auto_reply_enabled }).eq('id', 1)
            showToast(updated.auto_reply_enabled ? '✅ AI Agent activated' : '⏸ AI Agent paused')
          }}>
          {config?.auto_reply_enabled ? '⏸ Pause AI' : '▶ Activate AI'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.4rem 1rem', fontSize: '0.78rem', borderBottom: '1px solid #fca5a5', flexShrink: 0 }}>
          ⚠️ {error} <button onClick={() => setError('')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>

        {/* ══ DASHBOARD ══ */}
        {tab === 'dashboard' && (
          <div>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Total Conversations', value: stats.total, color: '#2563eb', icon: '💬' },
                { label: 'Open / Chatting', value: stats.open, color: '#d97706', icon: '🔄' },
                { label: 'Booked via WA', value: stats.booked, color: '#16a34a', icon: '✅', bold: true },
                { label: 'Escalated', value: stats.escalated, color: '#7c3aed', icon: '🙋' },
                { label: 'Opted Out', value: stats.optedOut, color: '#dc2626', icon: '🚫' },
                { label: 'Campaigns', value: stats.totalCampaigns, color: '#0284c7', icon: '📣' },
                { label: 'Messages Sent', value: stats.totalSent.toLocaleString(), color: '#475569', icon: '📤' },
                { label: 'Bookings Created', value: stats.totalBooked, color: '#15803d', icon: '🎯', bold: true },
              ].map(({ label, value, color, icon, bold }) => (
                <div key={label} style={{ background: '#fff', border: `1px solid ${color}22`, borderRadius: '10px', padding: '0.85rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>{icon}</div>
                  <div style={{ fontSize: bold ? '1.6rem' : '1.4rem', fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Recent conversations */}
            <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>🕐 Recent Conversations</span>
                <button className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }} onClick={() => setTab('conversations')}>View All →</button>
              </div>
              {conversations.slice(0, 8).map(c => {
                const sc = STATUS_COLOR[c.status] ?? STATUS_COLOR.Closed
                return (
                  <div key={c.id} onClick={() => { setSelectedConv(c); setTab('conversations') }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: sc.bg, color: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
                      {(c.customer_name || c.phone).charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>{c.customer_name || c.phone}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{c.model || ''} · {c.phone}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '0.15rem 0.5rem', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700 }}>{c.status}</span>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>{new Date(c.last_message_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    </div>
                  </div>
                )
              })}
              {conversations.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>No conversations yet. Launch a campaign to get started!</div>}
            </div>
          </div>
        )}

        {/* ══ CAMPAIGNS ══ */}
        {tab === 'campaigns' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>📣 Campaigns</span>
              <button className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }} onClick={() => setShowCampaignForm(true)}>+ New Campaign</button>
            </div>

            {/* Campaign creation form */}
            {showCampaignForm && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.25rem', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>📣 New Campaign</span>
                  <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }} onClick={() => setShowCampaignForm(false)}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label className="field">
                    <span className="label">Campaign Name *</span>
                    <input className="inp" placeholder="e.g. June Service Reminder" value={campaignForm.name} onChange={e => setCampaignForm(p => ({ ...p, name: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="label">Target Segment *</span>
                    <select className="inp" value={campaignForm.target_segment} onChange={e => { setCampaignForm(p => ({ ...p, target_segment: e.target.value })); void loadPreview(e.target.value) }}>
                      {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ gridColumn: 'span 2' }}>
                    <span className="label">Description</span>
                    <input className="inp" placeholder="Optional description" value={campaignForm.description} onChange={e => setCampaignForm(p => ({ ...p, description: e.target.value }))} />
                  </label>
                </div>

                {/* Template */}
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span className="label">📝 Message Template</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: '#94a3b8' }}>Variables: {'{{name}} {{model}} {{reg_no}} {{service_due}} {{agent}} {{business}} {{branch}}'}</span>
                  </div>
                  <textarea className="inp" rows={8} value={campaignForm.template_message}
                    onChange={e => setCampaignForm(p => ({ ...p, template_message: e.target.value }))}
                    style={{ fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                </div>

                {/* Preview */}
                <div style={{ marginTop: '0.75rem', background: '#f8fafc', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#475569' }}>👥 Contact Preview ({previewContacts.length} shown)</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => void loadPreview(campaignForm.target_segment)} disabled={loadingPreview}>
                      {loadingPreview ? 'Loading…' : '🔍 Preview'}
                    </button>
                  </div>
                  {previewContacts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '140px', overflow: 'auto' }}>
                      {previewContacts.slice(0, 8).map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: '1rem', fontSize: '0.73rem', color: '#475569' }}>
                          <span style={{ fontWeight: 600 }}>{c.cust_first_name} {c.cust_last_name}</span>
                          <span>{c.cust_mobile_no}</span>
                          <span style={{ color: '#94a3b8' }}>{c.ppl} · {c.scheduled_next_service_date || 'No date'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setShowCampaignForm(false)}>Cancel</button>
                  <button className="btn btn--primary" onClick={createCampaign} disabled={saving}>{saving ? 'Creating…' : '✅ Create Campaign'}</button>
                </div>
              </div>
            )}

            {/* Campaign list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {campaigns.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>No campaigns yet. Create your first outreach campaign!</div>}
              {campaigns.map(camp => {
                const sc = STATUS_COLOR[camp.status] ?? STATUS_COLOR.Draft
                const rate = camp.total_contacts > 0 ? Math.round((camp.booked_count / camp.total_contacts) * 100) : 0
                return (
                  <div key={camp.id} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{camp.name}</span>
                          <span style={{ background: sc.bg, color: sc.color, padding: '0.12rem 0.45rem', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700 }}>{camp.status}</span>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '0.3rem' }}>{SEGMENT_LABELS[camp.target_segment] || camp.target_segment}</span>
                        </div>
                        {camp.description && <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>{camp.description}</div>}
                        {/* Stats row */}
                        <div style={{ display: 'flex', gap: '1.2rem', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                          {[
                            { label: 'Contacts', value: camp.total_contacts, color: '#475569' },
                            { label: 'Sent', value: camp.sent_count, color: '#2563eb' },
                            { label: 'Delivered', value: camp.delivered_count, color: '#0284c7' },
                            { label: 'Replied', value: camp.replied_count, color: '#7c3aed' },
                            { label: 'Booked ✅', value: camp.booked_count, color: '#15803d' },
                            { label: 'Conv. Rate', value: `${rate}%`, color: rate > 5 ? '#15803d' : '#d97706' },
                          ].map(({ label, value, color }) => (
                            <div key={label}>
                              <span style={{ fontWeight: 800, color }}>{value}</span>
                              <span style={{ color: '#94a3b8', marginLeft: '0.25rem' }}>{label}</span>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        {camp.total_contacts > 0 && (
                          <div style={{ marginTop: '0.5rem', background: '#f1f5f9', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#2563eb', width: `${Math.min(100, Math.round((camp.sent_count / camp.total_contacts) * 100))}%`, transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
                        {(camp.status === 'Draft' || camp.status === 'Paused') && (
                          <button
                            className="btn btn--sm"
                            style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
                            onClick={() => sendCampaignBatch(camp.id)}
                            disabled={sendingCampaign === camp.id}>
                            {sendingCampaign === camp.id ? '⏳ Sending…' : '▶ Send Batch'}
                          </button>
                        )}
                        {camp.status === 'Running' && (
                          <button
                            className="btn btn--sm"
                            style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', fontWeight: 700 }}
                            onClick={() => sendCampaignBatch(camp.id)}
                            disabled={sendingCampaign === camp.id}>
                            {sendingCampaign === camp.id ? '⏳ Sending…' : '▶ Next Batch'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ CONVERSATIONS INBOX ══ */}
        {tab === 'conversations' && (
          <div style={{ display: 'flex', gap: '0.75rem', height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
            {/* Left: conversation list */}
            <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '0.65rem 0.85rem', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>💬 Inbox</div>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {['all', 'Open', 'Booked', 'Escalated', 'Opted-Out'].map(f => (
                    <button key={f} onClick={() => setConvFilter(f)}
                      style={{ padding: '0.15rem 0.45rem', borderRadius: '12px', border: '1px solid', fontSize: '0.67rem', fontWeight: 700, cursor: 'pointer', background: convFilter === f ? '#2563eb' : '#f8fafc', color: convFilter === f ? '#fff' : '#64748b', borderColor: convFilter === f ? '#2563eb' : '#e2e8f0' }}>
                      {f === 'all' ? 'All' : f}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {filteredConvs.map(c => {
                  const sc = STATUS_COLOR[c.status] ?? STATUS_COLOR.Closed
                  const isSelected = selectedConv?.id === c.id
                  return (
                    <div key={c.id} onClick={() => setSelectedConv(c)}
                      style={{ padding: '0.7rem 0.85rem', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: isSelected ? '#eff6ff' : 'white', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: sc.bg, color: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0 }}>
                          {(c.customer_name || c.phone).charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name || c.phone}</div>
                          <div style={{ fontSize: '0.67rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.model || ''} {c.reg_number ? `· ${c.reg_number}` : ''}</div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '0.1rem 0.35rem', borderRadius: '10px', fontSize: '0.6rem', fontWeight: 700 }}>{c.status}</span>
                          <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.15rem' }}>{new Date(c.last_message_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredConvs.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>No conversations</div>}
              </div>
            </div>

            {/* Right: chat view */}
            {selectedConv ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {/* Chat header */}
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0, background: '#f8fafc' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                    {(selectedConv.customer_name || selectedConv.phone).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1e293b' }}>{selectedConv.customer_name || selectedConv.phone}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{selectedConv.phone} · {selectedConv.model || ''} {selectedConv.reg_number || ''} · {selectedConv.ai_turns} AI turns</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {selectedConv.booking_id && <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700 }}>✅ Booked #{selectedConv.booking_id}</span>}
                  {/* Quick status change */}
                  <select
                    value={selectedConv.status}
                    onChange={async e => {
                      await supabase.from('wa_conversations').update({ status: e.target.value }).eq('id', selectedConv.id)
                      setSelectedConv(p => p ? { ...p, status: e.target.value } : p)
                      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, status: e.target.value } : c))
                    }}
                    className="inp" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', width: '120px' }}>
                    {Object.keys(STATUS_COLOR).map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: '#f0f2f5' }}>
                  {messages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', padding: '2rem' }}>No messages yet</div>}
                  {messages.map(msg => {
                    const isOut = msg.direction === 'outbound'
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '70%', background: isOut ? '#dcfce7' : '#fff',
                          borderRadius: isOut ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          padding: '0.55rem 0.8rem', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        }}>
                          {msg.ai_generated && <div style={{ fontSize: '0.62rem', color: '#16a34a', fontWeight: 700, marginBottom: '0.2rem' }}>🤖 AI Agent</div>}
                          {msg.sender === 'staff' && <div style={{ fontSize: '0.62rem', color: '#7c3aed', fontWeight: 700, marginBottom: '0.2rem' }}>👤 Staff</div>}
                          <div style={{ fontSize: '0.82rem', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.body}</div>
                          <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.25rem', textAlign: 'right' }}>
                            {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            {isOut && <span style={{ marginLeft: '0.3rem' }}>{msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Manual reply input */}
                <div style={{ padding: '0.65rem 0.85rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', flexShrink: 0, background: '#fff' }}>
                  <textarea
                    value={manualMsg}
                    onChange={e => setManualMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendManualMessage() } }}
                    placeholder="Type a manual reply (overrides AI)… Enter to send"
                    className="inp"
                    rows={2}
                    style={{ flex: 1, resize: 'none', fontSize: '0.82rem' }}
                  />
                  <button
                    className="btn btn--sm"
                    style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 700, alignSelf: 'flex-end', padding: '0.5rem 0.9rem' }}
                    onClick={sendManualMessage}
                    disabled={sendingManual || !manualMsg.trim()}>
                    {sendingManual ? '⏳' : '💬 Send'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: '0.5rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '3rem' }}>💬</div>
                <div style={{ fontWeight: 600 }}>Select a conversation</div>
              </div>
            )}
          </div>
        )}


        {/* ══ FOLLOW-UPS ══ */}
        {tab === 'followups' && (
          <div>
            {/* ── Header ──────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>🔁 Automated Follow-up & Reminders</span>
              <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600 }}>Generates 20–40% more bookings</span>
            </div>

            {/* ── How it works banner ──────────────────────────────────── */}
            <div style={{ background: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#1e40af' }}>
              <strong>How it works:</strong> When you run a campaign, click <em>Enroll in Follow-up</em> — the AI automatically sends Day 1 → Day 3 → Day 7 reminders to customers who haven't booked yet. Once a customer books, all pending messages are skipped.
            </div>

            {/* ── Message Sequence Config ──────────────────────────────── */}
            <Section title="📝 Message Sequence (Edit Templates)">
              {followupSteps.map(step => (
                <div key={step.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.65rem', background: step.is_active ? '#fff' : '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    <span style={{ background: '#2563eb', color: '#fff', borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 700 }}>Day {step.day_offset}</span>
                    {!step.is_active && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>DISABLED</span>}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.72rem' }}
                        onClick={() => { setEditingStep(step.id); setStepDraft(step.message_template) }}>
                        ✏️ Edit
                      </button>
                      <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.72rem', color: step.is_active ? '#ef4444' : '#16a34a' }}
                        onClick={async () => {
                          await supabase.from('wa_followup_steps').update({ is_active: !step.is_active }).eq('id', step.id)
                          await loadAll()
                        }}>
                        {step.is_active ? '⏸ Disable' : '▶ Enable'}
                      </button>
                    </div>
                  </div>
                  {editingStep === step.id ? (
                    <div>
                      <textarea className="inp" rows={4} style={{ fontSize: '0.78rem', fontFamily: 'monospace', width: '100%', resize: 'vertical' }}
                        value={stepDraft} onChange={e => setStepDraft(e.target.value)} />
                      <div style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.3rem 0 0.5rem' }}>
                        Variables: <code>{'{{name}}'}</code> <code>{'{{model}}'}</code> <code>{'{{reg_no}}'}</code> <code>{'{{branches}}'}</code> <code>{'{{agent}}'}</code>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn--primary btn--sm" style={{ fontSize: '0.75rem' }} disabled={savingStep}
                          onClick={async () => {
                            setSavingStep(true)
                            await supabase.from('wa_followup_steps').update({ message_template: stepDraft }).eq('id', step.id)
                            setEditingStep(null); setSavingStep(false); await loadAll()
                          }}>
                          {savingStep ? 'Saving…' : '💾 Save'}
                        </button>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.75rem' }} onClick={() => setEditingStep(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.77rem', color: '#374151', whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '0.5rem 0.65rem', borderRadius: '6px', lineHeight: 1.5 }}>
                      {step.message_template}
                    </div>
                  )}
                </div>
              ))}
            </Section>

            {/* ── Enroll Campaign ─────────────────────────────────────── */}
            <Section title="🚀 Enroll Campaign in Follow-up Sequence">
              {campaigns.filter(c => ['Completed','Running'].includes(c.status)).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No completed campaigns yet. Run a campaign first, then enroll here.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {campaigns.filter(c => ['Completed','Running'].includes(c.status)).map(camp => (
                    <div key={camp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{camp.name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {camp.sent_count || 0} sent · {camp.booked_count || 0} booked · {camp.status}
                        </div>
                      </div>
                      <button className="btn btn--primary btn--sm" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                        disabled={enrollingCamp === camp.id}
                        onClick={async () => {
                          setEnrollingCamp(camp.id)
                          const { data } = await supabase.auth.getSession()
                          const token = data.session?.access_token
                          const res = await fetch(`https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/wa-followup-cron`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ enroll_campaign_id: camp.id, sequence_id: 1 }),
                          })
                          const result = await res.json()
                          setEnrollingCamp(null)
                          setToast(result.error ? `❌ ${result.error}` : `✅ Enrolled ${result.enrolled || 0} contacts — Day 1/3/7 follow-ups scheduled!`)
                          await loadAll()
                        }}>
                        {enrollingCamp === camp.id ? '⏳ Enrolling…' : '🔁 Enroll Follow-ups'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── Queue Stats ──────────────────────────────────────────── */}
            <Section title="📊 Follow-up Queue">
              {(() => {
                const pending  = followupQueue.filter(q => q.status === 'pending').length
                const sent     = followupQueue.filter(q => q.status === 'sent').length
                const skipped  = followupQueue.filter(q => q.status === 'skipped').length
                const failed   = followupQueue.filter(q => q.status === 'failed').length
                return (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                      {[
                        { label: 'Pending', val: pending, color: '#f59e0b', bg: '#fffbeb' },
                        { label: 'Sent', val: sent, color: '#16a34a', bg: '#dcfce7' },
                        { label: 'Skipped (Booked)', val: skipped, color: '#64748b', bg: '#f1f5f9' },
                        { label: 'Failed', val: failed, color: '#dc2626', bg: '#fee2e2' },
                      ].map(s => (
                        <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: '8px', padding: '0.5rem 0.85rem', textAlign: 'center', minWidth: '80px' }}>
                          <div style={{ fontWeight: 800, fontSize: '1.3rem', color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Filter bar */}
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
                      {['all','pending','sent','skipped','failed'].map(f => (
                        <button key={f} onClick={() => setFollowupFilter(f)}
                          style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.72rem',
                            background: followupFilter === f ? '#2563eb' : '#f8fafc', color: followupFilter === f ? '#fff' : '#475569' }}>
                          {f.charAt(0).toUpperCase()+f.slice(1)}
                        </button>
                      ))}
                      <button className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto', fontSize: '0.72rem' }} onClick={() => loadAll()}>🔄 Refresh</button>
                    </div>
                    {/* Queue table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['Customer','Phone','Vehicle','Day','Scheduled At','Status',''].map(h => (
                              <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {followupQueue
                            .filter(q => followupFilter === 'all' || q.status === followupFilter)
                            .slice(0, 50)
                            .map(q => {
                              const statusColor = q.status === 'pending' ? '#f59e0b' : q.status === 'sent' ? '#16a34a' : q.status === 'skipped' ? '#94a3b8' : '#dc2626'
                              const scheduledDate = new Date(q.scheduled_at)
                              const isPast = scheduledDate < new Date()
                              return (
                                <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '0.4rem 0.6rem' }}>{q.customer_name || '—'}</td>
                                  <td style={{ padding: '0.4rem 0.6rem', color: '#475569' }}>{q.phone}</td>
                                  <td style={{ padding: '0.4rem 0.6rem' }}>{q.model || '—'}</td>
                                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                                    <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '20px', padding: '0.1rem 0.45rem', fontWeight: 700 }}>
                                      D{q.wa_followup_steps?.day_offset ?? '?'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.4rem 0.6rem', color: isPast && q.status === 'pending' ? '#dc2626' : '#475569' }}>
                                    {scheduledDate.toLocaleDateString('en-IN', { day:'numeric', month:'short' })} {scheduledDate.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
                                    {isPast && q.status === 'pending' && <span style={{ fontSize: '0.65rem', color: '#dc2626' }}> (overdue)</span>}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.6rem' }}>
                                    <span style={{ color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>{q.status}</span>
                                    {q.skip_reason && <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{q.skip_reason}</div>}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.6rem' }}>
                                    {q.status === 'pending' && (
                                      <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.68rem', color: '#dc2626' }}
                                        onClick={async () => {
                                          await supabase.from('wa_followup_queue').update({ status: 'skipped', skip_reason: 'manual_cancel' }).eq('id', q.id)
                                          await loadAll()
                                        }}>Cancel</button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                      {followupQueue.filter(q => followupFilter === 'all' || q.status === followupFilter).length === 0 && (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', margin: '1.5rem 0' }}>No follow-ups in this view. Enroll a campaign above to get started.</p>
                      )}
                    </div>
                  </div>
                )
              })()}
            </Section>
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {tab === 'settings' && config && (
          <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>⚙️ Agent Settings</span>
              <button className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }} onClick={saveConfig} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save Settings'}
              </button>
            </div>

            {/* Meta API */}
            <Section title="📱 Meta WhatsApp API">
              {/* Webhook URL info box */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 0.9rem', marginBottom: '0.85rem', fontSize: '0.78rem', color: '#1e40af' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>📋 How to connect Meta WhatsApp</div>
                <div style={{ marginBottom: '0.25rem' }}>1. Go to <strong>Meta Business Suite → WhatsApp → Configuration</strong></div>
                <div style={{ marginBottom: '0.25rem' }}>2. Set Webhook URL to:</div>
                <div style={{ background: '#fff', border: '1px solid #93c5fd', borderRadius: '5px', padding: '0.3rem 0.55rem', fontFamily: 'monospace', fontSize: '0.75rem', marginBottom: '0.35rem', wordBreak: 'break-all', color: '#1e3a8a' }}>
                  https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/wa-webhook
                </div>
                <div style={{ marginBottom: '0.25rem' }}>3. Set Verify Token to the value below (must match exactly)</div>
                <div style={{ marginBottom: '0.25rem' }}>4. Subscribe to: <strong>messages</strong></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <label className="field">
                  <span className="label">Phone Number ID</span>
                  <input className="inp" placeholder="From Meta → API Setup" value={config.meta_phone_number_id || ''} onChange={e => setConfig(p => p ? { ...p, meta_phone_number_id: e.target.value } : p)} />
                </label>
                <label className="field">
                  <span className="label">Permanent Access Token</span>
                  <input className="inp" type="password" placeholder="EAA…" value={config.meta_access_token || ''} onChange={e => setConfig(p => p ? { ...p, meta_access_token: e.target.value } : p)} />
                </label>
                <label className="field" style={{ gridColumn: 'span 2' }}>
                  <span className="label">Webhook Verify Token <span style={{ color: '#94a3b8', fontWeight: 400 }}>(paste this exact value in Meta Dashboard)</span></span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input className="inp" style={{ flex: 1 }} placeholder="e.g. techwheels_wa_2026" value={config.wa_verify_token || ''} onChange={e => setConfig(p => p ? { ...p, wa_verify_token: e.target.value } : p)} />
                    <button type="button" className="btn btn--ghost btn--sm"
                      onClick={() => {
                        const token = Math.random().toString(36).slice(2) + '_tw_' + Date.now().toString(36)
                        setConfig(p => p ? { ...p, wa_verify_token: token } : p)
                      }}
                      title="Generate a random token">🔀 Generate</button>
                    <button type="button" className="btn btn--ghost btn--sm"
                      onClick={() => { navigator.clipboard.writeText(config.wa_verify_token || ''); showToast('✅ Copied!') }}
                      title="Copy token">📋 Copy</button>
                  </div>
                </label>
              </div>
            </Section>

            {/* OpenAI */}
            <Section title="🧠 OpenAI API (AI Replies)">
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.55rem 0.85rem', marginBottom: '0.65rem', fontSize: '0.75rem', color: '#14532d' }}>
                Get your API key from <strong>platform.openai.com → API Keys</strong>. The agent uses <strong>gpt-4o-mini</strong> (very cost-effective — ~₹0.05 per conversation).
              </div>
              <label className="field">
                <span className="label">OpenAI API Key</span>
                <input className="inp" type="password" placeholder="sk-proj-…" value={config.openai_api_key || ''} onChange={e => setConfig(p => p ? { ...p, openai_api_key: e.target.value } : p)} />
              </label>
            </Section>

            {/* Agent Identity */}
            <Section title="🤖 Agent Identity">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <label className="field">
                  <span className="label">Agent Name</span>
                  <input className="inp" placeholder="e.g. Riya" value={config.agent_name} onChange={e => setConfig(p => p ? { ...p, agent_name: e.target.value } : p)} />
                </label>
                <label className="field">
                  <span className="label">Business Name</span>
                  <input className="inp" placeholder="e.g. Techwheels Service" value={config.business_name} onChange={e => setConfig(p => p ? { ...p, business_name: e.target.value } : p)} />
                </label>
                <label className="field">
                  <span className="label">Working Hours</span>
                  <input className="inp" placeholder="Mon-Sat 9AM-6PM" value={config.working_hours} onChange={e => setConfig(p => p ? { ...p, working_hours: e.target.value } : p)} />
                </label>
                <label className="field">
                  <span className="label">Max AI Turns per Conversation</span>
                  <input className="inp" type="number" min={3} max={25} value={config.max_ai_turns} onChange={e => setConfig(p => p ? { ...p, max_ai_turns: parseInt(e.target.value) || 10 } : p)} />
                </label>
                <label className="field" style={{ gridColumn: 'span 2' }}>
                  <span className="label">Available Branches (comma separated)</span>
                  <input className="inp" value={(config.available_branches || []).join(', ')} onChange={e => setConfig(p => p ? { ...p, available_branches: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : p)} />
                </label>
              </div>
            </Section>

            {/* AI System Prompt */}
            <Section title="💬 AI System Prompt">
              <div style={{ fontSize: '0.73rem', color: '#64748b', marginBottom: '0.5rem' }}>This is the core instruction given to the AI. Edit to change its personality, language, and rules.</div>
              <textarea className="inp" rows={8} value={config.system_prompt} onChange={e => setConfig(p => p ? { ...p, system_prompt: e.target.value } : p)} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }} />
            </Section>

            {/* Messages */}
            <Section title="📨 Message Templates">
              <label className="field">
                <span className="label">Greeting Message (First outreach)</span>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Variables: {'{{name}} {{model}} {{reg_no}} {{service_due}}'}</div>
                <textarea className="inp" rows={3} value={config.greeting_message} onChange={e => setConfig(p => p ? { ...p, greeting_message: e.target.value } : p)} style={{ resize: 'vertical' }} />
              </label>
              <label className="field" style={{ marginTop: '0.65rem' }}>
                <span className="label">Booking Confirmation Message</span>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Variables: {'{{booking_id}} {{reg_no}} {{model}} {{date}} {{time}} {{branch}} {{sa_name}}'}</div>
                <textarea className="inp" rows={5} value={config.booking_confirm_msg} onChange={e => setConfig(p => p ? { ...p, booking_confirm_msg: e.target.value } : p)} style={{ resize: 'vertical' }} />
              </label>
              <label className="field" style={{ marginTop: '0.65rem' }}>
                <span className="label">Closing / Thank You Message</span>
                <textarea className="inp" rows={2} value={config.closing_message} onChange={e => setConfig(p => p ? { ...p, closing_message: e.target.value } : p)} style={{ resize: 'vertical' }} />
              </label>
            </Section>


            <Section title="🚨 Escalation & Slot Settings">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label className="field">
                  <span className="label">Daily Slot Capacity (per branch)</span>
                  <input className="inp" type="number" min={1} max={200}
                    value={config.daily_slot_capacity ?? 40}
                    onChange={e => setConfig(p => p ? { ...p, daily_slot_capacity: Number(e.target.value) } : p)} />
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>AI will suggest next day if this many bookings exist for that date</div>
                </label>
                <label className="field">
                  <span className="label">SA WhatsApp Number (for alerts)</span>
                  <input className="inp" placeholder="919876543210 (with country code)" value={config.sa_whatsapp_number ?? ''}
                    onChange={e => setConfig(p => p ? { ...p, sa_whatsapp_number: e.target.value } : p)} />
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>AI will forward escalations to this WA number</div>
                </label>
                <label className="field">
                  <span className="label">Escalation Email</span>
                  <input className="inp" type="email" placeholder="service@techwheels.in" value={config.escalation_email ?? ''}
                    onChange={e => setConfig(p => p ? { ...p, escalation_email: e.target.value } : p)} />
                </label>
                <label className="field">
                  <span className="label">Escalation Contact Phone</span>
                  <input className="inp" placeholder="9876543210" value={config.escalation_phone ?? ''}
                    onChange={e => setConfig(p => p ? { ...p, escalation_phone: e.target.value } : p)} />
                </label>
              </div>
              <label className="field" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={config.staff_notify_on_escalation ?? true}
                  onChange={e => setConfig(p => p ? { ...p, staff_notify_on_escalation: e.target.checked } : p)} />
                <span style={{ fontSize: '0.82rem' }}>Notify staff (WA + email) when AI escalates a customer</span>
              </label>
            </Section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn--primary" onClick={saveConfig} disabled={saving}>{saving ? 'Saving…' : '💾 Save All Settings'}</button>
            </div>
          </div>
        )}

        {/* ══ TEST SIMULATOR ══ */}
        {tab === 'test' && (
          <div style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.85rem', gap: '0.75rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>🧪 Test AI Agent</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>Simulates real WhatsApp conversation</span>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#92400e' }}>
              ⚡ This uses the real AI + DB — enter any test phone number. Set your OpenAI key in Settings first. Messages here also appear in the Inbox.
            </div>

            {/* Config */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.85rem', display: 'flex', gap: '0.65rem', alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1, margin: 0 }}>
                <span className="label">Test Phone Number</span>
                <input className="inp" value={testPhone} onChange={e => setTestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" maxLength={10} />
              </label>
              <button className="btn btn--ghost btn--sm" onClick={resetTestConv} disabled={!testConvId} style={{ marginBottom: '1px' }}>🔄 Reset</button>
            </div>

            {/* Chat window */}
            <div style={{ background: '#e5ddd5', borderRadius: '10px', overflow: 'hidden', border: '1px solid #d1d5db', marginBottom: '0.75rem' }}>
              {/* WA-style header */}
              <div style={{ background: '#075e54', color: '#fff', padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🤖</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{config?.agent_name || 'Riya'} — WA AI Agent</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{testLoading ? 'typing...' : 'online'}</div>
                </div>
              </div>
              {/* Messages */}
              <div style={{ height: '350px', overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: '#e5ddd5' }}>
                {testChat.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#666', fontSize: '0.78rem', padding: '2rem' }}>
                    Start typing to test the AI agent conversation flow
                  </div>
                )}
                {testChat.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '78%', background: m.role === 'user' ? '#dcf8c6' : '#fff',
                      borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                      padding: '0.5rem 0.75rem', boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                    }}>
                      {m.role === 'agent' && <div style={{ fontSize: '0.65rem', color: '#075e54', fontWeight: 700, marginBottom: '0.15rem' }}>🤖 {config?.agent_name || 'Riya'}</div>}
                      <div style={{ fontSize: '0.83rem', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{m.text}</div>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', textAlign: 'right', marginTop: '0.2rem' }}>{m.ts}</div>
                    </div>
                  </div>
                ))}
                {testLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ background: '#fff', borderRadius: '10px 10px 10px 2px', padding: '0.5rem 0.9rem', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '16px' }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8', animation: `bounce 1s ${i*0.2}s infinite` }} />)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Input */}
              <div style={{ background: '#f0f0f0', padding: '0.55rem 0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <textarea
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendTestMessage() } }}
                  placeholder="Type a message as customer… (Enter to send)"
                  className="inp"
                  rows={2}
                  style={{ flex: 1, resize: 'none', fontSize: '0.85rem', borderRadius: '20px', padding: '0.45rem 0.85rem' }}
                />
                <button
                  onClick={sendTestMessage}
                  disabled={testLoading || !testMessage.trim()}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', background: testLoading || !testMessage.trim() ? '#94a3b8' : '#25D366', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ➤
                </button>
              </div>
            </div>

            {/* Quick test prompts */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem' }}>💡 Quick test messages (click to use):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {[
                  'Hi',
                  'Yes, I want to book a service',
                  'Next Monday works for me',
                  'Morning slot please, Sitapura branch',
                  'YES, confirm the booking',
                  'Mujhe service book karni hai',
                  'Kal subah 10 baje Ajmer Road pe',
                ].map(msg => (
                  <button key={msg} onClick={() => setTestMessage(msg)}
                    style={{ padding: '0.2rem 0.55rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.72rem', color: '#475569', cursor: 'pointer' }}>
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '1rem 1.1rem', marginBottom: '0.85rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>{title}</div>
      {children}
    </div>
  )
}
