import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ServiceEstimateBuilderModal } from './ServiceEstimateBuilderModal'
import {
  fetchAllEstimates,
  type CustomerEstimateRecord,
} from '../lib/estimates'

interface CustomerPortalAdminModalProps {
  isOpen: boolean
  onClose: () => void
  isAdmin?: boolean
  initialRegNumber?: string
  initialTab?: 'overview' | 'complaints' | 'live_preview'
}

interface ComplaintRecord {
  id?: number
  vehicle_registration_number: string
  customer_name: string | null
  mobile_number: string | null
  rating: number
  feedback_text: string
  service_type: string | null
  service_advisor_name: string | null
  branch: string | null
  primary_complaint_area: string | null
  complaint_date_time: string | null
  created_at?: string | null
  mode?: string | null
  source_feedback_message_id?: number | null
}

export function CustomerPortalAdminModal({
  isOpen,
  onClose,
  isAdmin = true,
  initialRegNumber,
  initialTab,
}: CustomerPortalAdminModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'complaints' | 'live_preview'>(
    initialTab || (initialRegNumber ? 'complaints' : 'complaints')
  )
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([])
  const [loadingComplaints, setLoadingComplaints] = useState(false)
  const [filterSource, setFilterSource] = useState<'app_only' | 'all'>('app_only')
  const [complaintSearch, setComplaintSearch] = useState(initialRegNumber || '')
  const [selectedProblemForEstimate, setSelectedProblemForEstimate] = useState<ComplaintRecord | null>(null)
  const [estimatesMap, setEstimatesMap] = useState<Record<string, CustomerEstimateRecord>>({})
  
  // Search vehicle test link
  const [testRegNumber, setTestRegNumber] = useState('RJ14TEST01')
  const [copiedLink, setCopiedLink] = useState(false)

  const portalUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5174` : 'http://localhost:5174'

  async function loadEstimates() {
    const list = await fetchAllEstimates()
    const map: Record<string, CustomerEstimateRecord> = {}
    for (const est of list) {
      if (est.complaint_id) {
        map[`complaint_${est.complaint_id}`] = est
      }
      if (est.estimate_no) {
        map[`estno_${est.estimate_no}`] = est
      }
      if (est.vehicle_registration_number) {
        const vReg = est.vehicle_registration_number.trim().toUpperCase()
        if (!map[`vreg_${vReg}`]) {
          map[`vreg_${vReg}`] = est
        }
      }
    }
    setEstimatesMap(map)
  }

  async function fetchComplaints() {
    setLoadingComplaints(true)
    try {
      const { data, error } = await supabase
        .from('post_feedback_bot_data')
        .select('*')
        .neq('mode', 'customer_estimate_payload')
        .order('complaint_date_time', { ascending: false })
        .limit(100)

      if (!error && data) {
        // Exclude any estimate sync rows from complaints list
        const cleanList = (data as ComplaintRecord[]).filter(
          (c) => c.mode !== 'customer_estimate_payload' && !c.feedback_text?.startsWith('{"estimate_no"')
        )
        setComplaints(cleanList)
      }
      await loadEstimates()
    } catch (err) {
      console.warn('Failed to load complaints from post_feedback_bot_data:', err)
    } finally {
      setLoadingComplaints(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    if (initialTab) {
      setActiveTab(initialTab)
    } else if (initialRegNumber) {
      setActiveTab('complaints')
    }
    if (initialRegNumber) {
      setComplaintSearch(initialRegNumber)
    }
    void fetchComplaints()

    // Realtime Supabase Sync for instant updates when customer submits a problem
    const channel = supabase
      .channel('customer-complaints-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void fetchComplaints()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_estimates' },
        () => {
          void loadEstimates()
        }
      )
      .subscribe()

    function handleEstimateSync() {
      void loadEstimates()
    }

    window.addEventListener('techwheels_estimate_updated', handleEstimateSync)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_estimate_updated', handleEstimateSync)
    }
  }, [isOpen])

  if (!isOpen) return null

  // Determine if a record is from the Customer / Bodyshop App
  const isFromCustomerApp = (c: ComplaintRecord) => {
    if (c.mode === 'customer_estimate_payload' || c.feedback_text?.startsWith('{"estimate_no"')) {
      return false
    }
    if (c.mode === 'customer_complaint_portal' || c.mode === 'customer_mobile_pwa' || c.mode === 'customer_booking_pwa') {
      return true
    }
    if (c.feedback_text?.startsWith('[Complaint') || c.feedback_text?.includes('[Sandbox Test]')) {
      return true
    }
    return false
  }

  const appOnlyComplaints = complaints.filter(isFromCustomerApp)

  const displayedComplaints = (filterSource === 'app_only' ? appOnlyComplaints : complaints).filter((c) => {
    if (!complaintSearch) return true
    const q = complaintSearch.toLowerCase()
    return (
      c.vehicle_registration_number?.toLowerCase().includes(q) ||
      c.customer_name?.toLowerCase().includes(q) ||
      c.feedback_text?.toLowerCase().includes(q) ||
      c.mobile_number?.includes(q)
    )
  })

  // Format problem text cleanly without raw technical prefixes
  function renderCleanDescription(text: string) {
    if (!text) return <span className="text-gray-400 italic">No description</span>

    if (text.startsWith('[Complaint')) {
      const issueMatch = text.match(/Issue:\s*([^|]+)/i)
      const kmMatch = text.match(/KM:\s*([^|]+)/i)
      const addMatch = text.match(/Additional:\s*(.+)/i)

      const issueText = issueMatch ? issueMatch[1].trim() : text
      const km = kmMatch ? kmMatch[1].trim() : null
      const add = addMatch && addMatch[1].trim() !== 'None' && addMatch[1].trim() !== 'undefined' ? addMatch[1].trim() : null

      return (
        <div className="space-y-0.5">
          <div className="font-semibold text-gray-900 line-clamp-2">{issueText}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500">
            {km && km !== 'N/A' && (
              <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-slate-700 font-bold">
                ⚡ {km} KM
              </span>
            )}
            {add && (
              <span className="text-gray-500 italic truncate max-w-[200px]" title={add}>
                Note: {add}
              </span>
            )}
          </div>
        </div>
      )
    }

    return <div className="font-semibold text-gray-800 line-clamp-2">{text}</div>
  }

  function handleCopyCustomerLink() {
    const link = `${portalUrl}/?reg=${testRegNumber.trim().toUpperCase()}`
    void navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <div className="flex h-[90vh] max-h-[820px] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold shadow-md">
              🚗
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Customer Form & Bodyshop Admin Hub</h2>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/40">
                  {isAdmin ? 'Admin Scope' : 'Advisor Scope'}
                </span>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-300 border border-blue-400/30">
                  🟢 Live Realtime Sync
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Manage customer problem submissions from Bodyshop app, review feedback & access pricing catalogue
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('complaints')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'complaints'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>🚨</span> App Problems & Submissions ({appOnlyComplaints.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              📊 Overview & Share Link
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('live_preview')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'live_preview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>📱</span> Embedded Customer App View
            </button>
          </div>

          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            Launch Web App ↗
          </a>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: OVERVIEW & SHARE */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Launch Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="text-2xl mb-1">📱</div>
                  <div className="text-sm font-bold text-blue-950">Customer Web Application</div>
                  <div className="text-xs text-blue-700 mt-1 mb-3">
                    Customer portal for "Tell Us Your Problem", Estimates & Gate Pass
                  </div>
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    Open on Port 5174 ↗
                  </a>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="text-2xl mb-1">💬</div>
                  <div className="text-sm font-bold text-emerald-950">App Form Submissions</div>
                  <div className="text-xs text-emerald-700 mt-1 mb-3">
                    Live submissions from Bodyshop & Customer Service App
                  </div>
                  <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
                    {appOnlyComplaints.length} App Submissions Logged
                  </span>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <div className="text-2xl mb-1">📱</div>
                  <div className="text-sm font-bold text-indigo-950">Customer Mobile App</div>
                  <div className="text-xs text-indigo-700 mt-1 mb-3">
                    Live customer app running on Port 5174 with instant reception sync
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('live_preview')}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
                  >
                    Open Live Preview →
                  </button>
                </div>
              </div>

              {/* Share Customer Link Generator */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  📤 Send Customer Portal Link to Customer
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Generate a direct access link for the customer to submit problems, review estimates or download gate pass.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-48">
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      Registration Number
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono font-bold uppercase text-gray-900 focus:border-blue-500 focus:outline-none"
                      value={testRegNumber}
                      onChange={(e) => setTestRegNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. RJ14TEST01"
                    />
                  </div>

                  <div className="flex-1 min-w-[280px]">
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      Direct Customer URL
                    </label>
                    <input
                      type="text"
                      readOnly
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-600"
                      value={`${portalUrl}/?reg=${testRegNumber.trim().toUpperCase()}`}
                    />
                  </div>

                  <div className="pt-5">
                    <button
                      type="button"
                      onClick={handleCopyCustomerLink}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 flex items-center gap-1.5"
                    >
                      {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPLAINTS LIST */}
          {activeTab === 'complaints' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>🚨 Live Customer Submissions & Problems</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Showing submissions entered via Bodyshop & Customer Services App ("Tell Us Your Problem" / Feedback)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Filter source toggle */}
                  <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 shadow-sm text-xs">
                    <button
                      type="button"
                      onClick={() => setFilterSource('app_only')}
                      className={`px-3 py-1 font-bold rounded-md transition ${
                        filterSource === 'app_only'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      📱 Bodyshop App Only ({appOnlyComplaints.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterSource('all')}
                      className={`px-3 py-1 font-medium rounded-md transition ${
                        filterSource === 'all'
                          ? 'bg-slate-700 text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      🌐 All Bot History ({complaints.length})
                    </button>
                  </div>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={() => void fetchComplaints()}
                    disabled={loadingComplaints}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50"
                  >
                    <span className={loadingComplaints ? 'animate-spin' : ''}>🔄</span>
                    Refresh
                  </button>

                  <a
                    href={`${portalUrl}/complaint`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-rose-700 flex items-center gap-1"
                  >
                    + Submit New Problem ↗
                  </a>
                </div>
              </div>

              {/* Search within complaints */}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                  placeholder="Filter by vehicle reg, customer name, issue..."
                  value={complaintSearch}
                  onChange={(e) => setComplaintSearch(e.target.value)}
                />
              </div>

              {loadingComplaints ? (
                <div className="py-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
                  <span className="text-2xl animate-spin">⏳</span>
                  <span>Fetching live data from database…</span>
                </div>
              ) : displayedComplaints.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50/50 p-8 text-center space-y-3">
                  <div className="text-3xl">📱</div>
                  <div className="text-sm font-bold text-gray-800">
                    {filterSource === 'app_only'
                      ? 'No Bodyshop App Submissions Yet'
                      : 'No records found'}
                  </div>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    {filterSource === 'app_only'
                      ? 'Jab bhi customer Bodyshop App ("Tell Us Your Problem" ya Feedback form) me problem submit karega, woh instant yahan real-time me show hoga.'
                      : 'Koi bhi feedback ya problem record nahi mila.'}
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <a
                      href={`${portalUrl}/complaint`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                    >
                      🚀 Open Customer Complaint Form ({portalUrl}/complaint)
                    </a>
                    {filterSource === 'app_only' && (
                      <button
                        type="button"
                        onClick={() => setFilterSource('all')}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        View All Bot History ({complaints.length})
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5">Source / Date</th>
                        <th className="px-3 py-2.5">Vehicle Reg</th>
                        <th className="px-3 py-2.5">Customer / Phone</th>
                        <th className="px-3 py-2.5">Category</th>
                        <th className="px-3 py-2.5">Description / Remark</th>
                        <th className="px-3 py-2.5 text-center">Parts Estimate & Approval</th>
                        <th className="px-3 py-2.5">Advisor / Branch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedComplaints.map((c, i) => {
                        const isApp =
                          c.mode === 'customer_app_problem' ||
                          c.mode === 'customer_app_complaint' ||
                          c.mode === 'customer_app' ||
                          Boolean(c.primary_complaint_area && c.primary_complaint_area.toLowerCase().includes('app'))
                        const isProblemForm =
                          c.mode === 'customer_app_problem' ||
                          Boolean(c.primary_complaint_area && c.primary_complaint_area.toLowerCase().includes('problem'))
                        const normReg = c.vehicle_registration_number ? c.vehicle_registration_number.trim().toUpperCase() : ''
                        const est = (c.id ? estimatesMap[`complaint_${c.id}`] : undefined) ||
                                    (normReg ? estimatesMap[`vreg_${normReg}`] : undefined)
                        
                        return (
                          <tr
                            key={c.id || i}
                            onClick={() => setSelectedProblemForEstimate(c)}
                            className={`cursor-pointer transition ${
                              isApp ? 'bg-blue-50/30 hover:bg-blue-100/50' : 'hover:bg-gray-50/80'
                            }`}
                          >
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="mb-0.5">
                                {isProblemForm ? (
                                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                                    📱 App Problem
                                  </span>
                                ) : isApp ? (
                                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 border border-indigo-200">
                                    ⭐ App Feedback
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                                    🤖 Bot Record
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {c.complaint_date_time ? new Date(c.complaint_date_time).toLocaleString() : 'Recent'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                              {c.vehicle_registration_number}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-gray-900">{c.customer_name || 'Customer'}</div>
                              <div className="text-[11px] text-gray-500">{c.mobile_number || '—'}</div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                                {c.primary_complaint_area || c.service_type || 'General'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 max-w-sm" title={c.feedback_text}>
                              {renderCleanDescription(c.feedback_text)}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {est ? (
                                est.status === 'Approved' ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProblemForEstimate(c)}
                                    className="rounded-lg bg-emerald-100 border border-emerald-300 px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-xs hover:bg-emerald-200 flex items-center gap-1 mx-auto"
                                  >
                                    <span>✅ Approved</span>
                                    <span className="font-mono font-extrabold text-emerald-800">₹{est.grand_total.toLocaleString()}</span>
                                  </button>
                                ) : est.status === 'Rejected' ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProblemForEstimate(c)}
                                    className="rounded-lg bg-rose-100 border border-rose-300 px-2.5 py-1 text-xs font-bold text-rose-900 shadow-xs hover:bg-rose-200 flex items-center gap-1 mx-auto"
                                  >
                                    <span>❌ Rejected</span>
                                    <span>· Revise</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProblemForEstimate(c)}
                                    className="rounded-lg bg-amber-100 border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-200 flex items-center gap-1 mx-auto"
                                  >
                                    <span>⏳ Sent</span>
                                    <span className="font-mono text-amber-800">₹{est.grand_total.toLocaleString()}</span>
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSelectedProblemForEstimate(c)}
                                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-blue-700 flex items-center gap-1 mx-auto"
                                >
                                  <span>📝</span>
                                  <span>Create Estimate</span>
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                              <div>{c.service_advisor_name || 'Advisor'}</div>
                              <div className="text-[11px] text-gray-400">{c.branch || 'Workshop'}</div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE EMBEDDED PREVIEW */}
          {activeTab === 'live_preview' && (
            <div className="h-full flex flex-col space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-600 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                <span>
                  Showing live embedded Customer Web App (<strong className="font-mono text-blue-700">{portalUrl}</strong>)
                </span>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-blue-600 hover:underline"
                >
                  Open in New Tab ↗
                </a>
              </div>
              <div className="flex-1 rounded-xl border border-gray-300 overflow-hidden shadow-inner min-h-[480px]">
                <iframe
                  src={portalUrl}
                  title="Customer Portal Preview"
                  className="w-full h-full min-h-[480px] border-0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3 text-xs text-gray-500">
          <div>
            Techwheels Service Advisor · Bodyshop Customer Service Portal Hub
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-200 px-4 py-1.5 font-bold text-gray-700 hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>

      {/* Interactive Service Estimate Builder Modal on Problem Click */}
      {selectedProblemForEstimate && (
        <ServiceEstimateBuilderModal
          isOpen={Boolean(selectedProblemForEstimate)}
          onClose={() => setSelectedProblemForEstimate(null)}
          vehicleReg={selectedProblemForEstimate.vehicle_registration_number}
          customerName={selectedProblemForEstimate.customer_name || 'Customer'}
          customerPhone={selectedProblemForEstimate.mobile_number || ''}
          problemDescription={selectedProblemForEstimate.feedback_text}
          category={selectedProblemForEstimate.primary_complaint_area || selectedProblemForEstimate.service_type || 'General'}
          complaintId={selectedProblemForEstimate.id}
          onEstimateSent={() => {
            void loadEstimates()
          }}
        />
      )}
    </div>
  )
}

