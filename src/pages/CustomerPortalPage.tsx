import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerVehicle } from '../lib/api/customer'
import {
  fetchEstimatesForVehicle,
  updateEstimateApproval,
  type CustomerEstimateRecord,
} from '../lib/estimates'
import {
  fetchIssuedGatePass,
  type IssuedGatePassRecord,
} from '../lib/gatepass'

interface CustomerPortalPageProps {
  vehicle: CustomerVehicle
  allVehicles?: CustomerVehicle[]
  onLogout: () => void
  onSelectVehicle?: (v: CustomerVehicle) => void
}

type CustomerTab = 'dashboard' | 'estimate' | 'complaint' | 'gatepass' | 'feedback'

interface ProblemItem {
  id: string
  text: string
  category: string
}

const PRESET_CONCERN_CHIPS = [
  { label: 'Periodic Service', icon: '🛢️', category: 'Service' },
  { label: 'Brake Noise / Weak', icon: '🛑', category: 'Brakes' },
  { label: 'AC Not Cooling', icon: '❄️', category: 'AC & Climate' },
  { label: 'Wheel Alignment', icon: '🛞', category: 'Suspension' },
  { label: 'Battery / Starting', icon: '⚡', category: 'Electrical' },
  { label: 'Suspension Noise', icon: '🚗', category: 'Suspension' },
  { label: 'Body Scratch / Dent', icon: '🛠️', category: 'Bodyshop' },
  { label: 'Foam Wash & Polish', icon: '🧼', category: 'Cleaning' },
]

export default function CustomerPortalPage({
  vehicle: initialVehicle,
  allVehicles = [],
  onLogout,
  onSelectVehicle,
}: CustomerPortalPageProps) {
  const [vehicle, setVehicle] = useState<CustomerVehicle>(initialVehicle)
  const [activeTab, setActiveTab] = useState<CustomerTab>('dashboard')

  // Live Estimates State
  const [liveEstimates, setLiveEstimates] = useState<CustomerEstimateRecord[]>([])
  const [_loadingEstimates, setLoadingEstimates] = useState(false)
  const [approvingEstNo, setApprovingEstNo] = useState<string | null>(null)
  const [rejectingEstNo, setRejectingEstNo] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectBox, setShowRejectBox] = useState(false)

  // Live Gate Pass State (Accounts Module Sync)
  const [issuedGatePass, setIssuedGatePass] = useState<IssuedGatePassRecord | null>(null)
  const [_loadingGatePass, setLoadingGatePass] = useState(false)

  // Multi-Problem List State (Customer Problem Submission)
  const [problemList, setProblemList] = useState<ProblemItem[]>([
    { id: 'prob-1', text: '', category: 'General' },
  ])
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [complaintKm, setComplaintKm] = useState(vehicle.km_reading || '')
  const [complaintSubmitting, setComplaintSubmitting] = useState(false)
  const [complaintSuccess, setComplaintSuccess] = useState(false)

  // Feedback states
  const [rating, setRating] = useState(5)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState(false)

  // Multi-vehicle modal
  const [showVehiclePicker, setShowVehiclePicker] = useState(false)

  // Sync initial vehicle update
  useEffect(() => {
    setVehicle(initialVehicle)
    setComplaintKm(initialVehicle.km_reading || '')
  }, [initialVehicle])

  // Load Live Estimates from Supabase
  async function loadVehicleEstimates() {
    if (!vehicle.reg_number) return
    setLoadingEstimates(true)
    try {
      const list = await fetchEstimatesForVehicle(vehicle.reg_number)
      setLiveEstimates(list)
    } catch (err) {
      console.warn('Failed to fetch vehicle estimates:', err)
    } finally {
      setLoadingEstimates(false)
    }
  }

  // Load Live Gate Pass from Accounts Module
  async function loadVehicleGatePass() {
    if (!vehicle.reg_number) return
    setLoadingGatePass(true)
    try {
      const gp = await fetchIssuedGatePass(vehicle.reg_number)
      setIssuedGatePass(gp)
    } catch (err) {
      console.warn('Failed to fetch gatepass:', err)
    } finally {
      setLoadingGatePass(false)
    }
  }

  useEffect(() => {
    void loadVehicleEstimates()
    void loadVehicleGatePass()

    // Realtime Supabase Sync for live estimates, gatepass & complaints
    const channel = supabase
      .channel(`cust-portal-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void loadVehicleEstimates()
          void loadVehicleGatePass()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_card_closed_data' },
        () => {
          void loadVehicleGatePass()
        }
      )
      .subscribe()

    // Local custom event broadcasts
    function handleEstimateBroadcast() {
      void loadVehicleEstimates()
    }
    function handleGatePassBroadcast() {
      void loadVehicleGatePass()
    }

    window.addEventListener('techwheels_estimate_updated', handleEstimateBroadcast)
    window.addEventListener('techwheels_gatepass_issued', handleGatePassBroadcast)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_estimate_updated', handleEstimateBroadcast)
      window.removeEventListener('techwheels_gatepass_issued', handleGatePassBroadcast)
    }
  }, [vehicle.reg_number])

  // Active latest estimate from Advisor
  const latestLiveEstimate = liveEstimates.length > 0 ? liveEstimates[0] : null

  // Gate Pass effective state
  const effectiveGatePassIssued = Boolean(
    issuedGatePass || vehicle.gate_pass_issued || vehicle.invoice_done_at
  )
  const effectiveGatePassNo =
    issuedGatePass?.gate_pass_no ||
    vehicle.gate_pass_number ||
    (vehicle.jc_number ? `GP-${vehicle.jc_number.replace(/[^0-9]/g, '').slice(-5)}` : 'GP-84920')

  // Handle Customer Approval of Estimate
  async function handleApprove(est: CustomerEstimateRecord) {
    setApprovingEstNo(est.estimate_no)
    try {
      await updateEstimateApproval(est.estimate_no, 'Approved')

      const botRow = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || null,
        rating: 5,
        feedback_text: `[Estimate Approved] Customer approved Estimate #${est.estimate_no} (₹${est.grand_total.toLocaleString()}) via Mobile App.`,
        service_type: `Estimate #${est.estimate_no} Approved`,
        service_advisor_name: vehicle.sa_name || est.service_advisor_name || null,
        branch: vehicle.branch || est.branch || null,
        mode: 'customer_estimate_approval',
        complaint_date_time: new Date().toISOString(),
      }
      await supabase.from('post_feedback_bot_data').insert([botRow])
      await loadVehicleEstimates()
    } catch (err) {
      console.error('Estimate approval error:', err)
    } finally {
      setApprovingEstNo(null)
    }
  }

  // Handle Customer Rejection / Change Request
  async function handleReject(est: CustomerEstimateRecord) {
    if (!rejectReason.trim()) return
    setRejectingEstNo(est.estimate_no)
    try {
      await updateEstimateApproval(est.estimate_no, 'Rejected', rejectReason.trim())

      const botRow = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || null,
        rating: 3,
        feedback_text: `[Estimate Rejected/Change Request] Estimate #${est.estimate_no} rejected. Reason: ${rejectReason.trim()}`,
        service_type: `Estimate #${est.estimate_no} Rejected`,
        service_advisor_name: vehicle.sa_name || est.service_advisor_name || null,
        branch: vehicle.branch || est.branch || null,
        mode: 'customer_estimate_rejection',
        complaint_date_time: new Date().toISOString(),
      }
      await supabase.from('post_feedback_bot_data').insert([botRow])

      setShowRejectBox(false)
      setRejectReason('')
      await loadVehicleEstimates()
    } catch (err) {
      console.error('Estimate rejection error:', err)
    } finally {
      setRejectingEstNo(null)
    }
  }

  // Multi-problem helpers
  function addProblemRow(initialCategory = 'General', initialText = '') {
    setProblemList((prev) => [
      ...prev,
      { id: `prob-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, text: initialText, category: initialCategory },
    ])
  }

  function handleAddChip(chip: { label: string; category: string }) {
    // If the first empty row exists, populate it, otherwise add new
    if (problemList.length === 1 && !problemList[0].text.trim()) {
      setProblemList([{ id: problemList[0].id, text: chip.label, category: chip.category }])
    } else {
      addProblemRow(chip.category, chip.label)
    }
  }

  function removeProblemRow(id: string) {
    if (problemList.length <= 1) {
      setProblemList([{ id: `prob-${Date.now()}`, text: '', category: 'General' }])
      return
    }
    setProblemList((prev) => prev.filter((p) => p.id !== id))
  }

  function updateProblemRow(id: string, field: 'text' | 'category', value: string) {
    setProblemList((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  async function handleMultiProblemSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validProblems = problemList.filter((p) => p.text.trim().length > 0)
    if (validProblems.length === 0) return

    setComplaintSubmitting(true)
    try {
      const formattedProblems = validProblems
        .map((p, idx) => `${idx + 1}. ${p.text.trim()} [${p.category}]`)
        .join(' ; ')

      const primaryCategory = validProblems[0]?.category || 'Customer Problems'

      const feedbackBody = `[Complaint - ${primaryCategory}] KM: ${complaintKm || 'N/A'} | Issues: ${formattedProblems}${
        additionalNotes.trim() ? ` | Notes: ${additionalNotes.trim()}` : ''
      }`

      const row = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || null,
        rating: 5,
        feedback_text: feedbackBody,
        service_type: `Complaint: ${primaryCategory}`,
        service_advisor_name: vehicle.sa_name || null,
        branch: vehicle.branch || null,
        mode: 'customer_app_problem',
        primary_complaint_area: primaryCategory,
        complaint_date_time: new Date().toISOString(),
      }

      await supabase.from('post_feedback_bot_data').insert([row])
      setComplaintSuccess(true)
      setProblemList([{ id: `prob-${Date.now()}`, text: '', category: 'General' }])
      setAdditionalNotes('')
      setTimeout(() => setComplaintSuccess(false), 5000)
    } catch (err) {
      console.error('Problem submit error:', err)
    } finally {
      setComplaintSubmitting(false)
    }
  }

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!feedbackText.trim()) return

    setFeedbackSubmitting(true)
    try {
      const botRow = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || null,
        mobile_number: vehicle.owner_phone || null,
        rating,
        feedback_text: feedbackText.trim(),
        service_type: vehicle.service_type || 'Customer Service',
        service_advisor_name: vehicle.sa_name || null,
        branch: vehicle.branch || null,
        mode: 'customer_mobile_app',
        complaint_date_time: new Date().toISOString(),
      }

      await supabase.from('post_feedback_bot_data').insert([botRow])
      setFeedbackSuccess(true)
      setFeedbackText('')
      setTimeout(() => setFeedbackSuccess(false), 4000)
    } catch (err) {
      console.error('Feedback submit error:', err)
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  // Cost calculations
  const totalEstimatedValue = latestLiveEstimate
    ? latestLiveEstimate.grand_total
    : Number(vehicle.billed_amount || (vehicle.invoice_done_at ? 4850 : 3850))

  const effectiveReceived = Number(
    vehicle.amount_received || (vehicle.payment_status === 'Paid' ? totalEstimatedValue : 0)
  )
  const balanceDue = Math.max(0, totalEstimatedValue - effectiveReceived)

  const isPendingApproval = latestLiveEstimate
    ? latestLiveEstimate.status === 'Sent' || latestLiveEstimate.status === 'Draft'
    : false

  // Service Stage calculation (0 to 4)
  const currentStageIndex = useMemo(() => {
    if (effectiveGatePassIssued) return 4
    if (vehicle.washing_status === 'Completed' || vehicle.qc_status === 'Passed') return 3
    if (vehicle.invoice_done_at || vehicle.payment_status) return 2
    if (latestLiveEstimate || vehicle.jc_number) return 1
    return 0
  }, [effectiveGatePassIssued, vehicle.washing_status, vehicle.qc_status, vehicle.invoice_done_at, vehicle.payment_status, latestLiveEstimate, vehicle.jc_number])

  const stages = [
    { label: 'Intake', desc: 'Vehicle Received at Workshop', icon: '📥' },
    { label: 'Estimate', desc: 'Inspection & Parts Estimation', icon: '📋' },
    { label: 'Repairs', desc: 'Technician Work In Progress', icon: '🔧' },
    { label: 'QC & Wash', desc: 'Quality Check & Foam Wash', icon: '✨' },
    { label: 'Ready', desc: 'Gate Pass & Release Ready', icon: '🎫' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans safe-mobile-container selection:bg-blue-600/30">
      {/* Background Decorative Ambient Mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-3 pb-8 space-y-4">
        {/* ── TOP APP BAR: BRAND & VEHICLE HERO CARD ── */}
        <div className="mobile-glass-dark rounded-3xl p-5 shadow-2xl relative overflow-hidden border border-white/10">
          {/* Subtle Top Gradient Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

          {/* Brand Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 ring-2 ring-white/15">
                <span className="text-xl">🚘</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Tata Motors Service</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-live-indicator" />
                </div>
                <h1 className="text-base font-extrabold text-white tracking-tight">Techwheels Service</h1>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="tap-bounce px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-xs font-semibold text-slate-300 border border-white/10 flex items-center gap-1 transition"
            >
              <span>Logout</span>
            </button>
          </div>

          {/* Vehicle Main Info Box */}
          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-black text-white tracking-wider bg-slate-900/80 px-3 py-1 rounded-xl border border-white/10 shadow-inner">
                  {vehicle.reg_number}
                </span>
                {Boolean(vehicle.remark?.toLowerCase().includes('revisit')) && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Revisit
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-300 font-medium">
                {vehicle.model || 'Tata Vehicle'} {vehicle.variant ? `· ${vehicle.variant}` : ''}
              </p>
            </div>

            {/* Switch Vehicle Button for multi-car users */}
            {allVehicles.length > 1 && (
              <button
                type="button"
                onClick={() => setShowVehiclePicker(true)}
                className="tap-bounce px-3 py-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-400/30 text-xs font-bold flex flex-col items-center gap-0.5"
              >
                <span>Switch</span>
                <span className="text-[10px] opacity-75">{allVehicles.length} Cars</span>
              </button>
            )}
          </div>

          {/* Key Info Grid */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 pt-3 border-t border-white/10 text-xs">
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Service Advisor</span>
              <span className="font-bold text-slate-200 truncate block mt-0.5">
                {vehicle.sa_display_name || vehicle.sa_name || 'Assigned SA'}
              </span>
            </div>
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Job Card No.</span>
              <span className="font-mono font-bold text-amber-300 truncate block mt-0.5">
                {vehicle.jc_number || 'JC-Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* ── ACTION REQUIRED BANNER (IF ESTIMATE PENDING) ── */}
        {isPendingApproval && latestLiveEstimate && (
          <div
            onClick={() => setActiveTab('estimate')}
            className="tap-bounce bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-600/20 border border-amber-500/40 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-amber-500/10 cursor-pointer animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/30 flex items-center justify-center text-xl ring-1 ring-amber-400/40">
                ⏳
              </div>
              <div>
                <div className="text-xs font-extrabold text-amber-300 uppercase tracking-wider">
                  Estimate Approval Needed
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  ₹{latestLiveEstimate.grand_total.toLocaleString('en-IN')} (Est #{latestLiveEstimate.estimate_no})
                </div>
              </div>
            </div>
            <span className="bg-amber-500 text-slate-950 font-extrabold text-xs px-3 py-1.5 rounded-xl shadow-md">
              Review ➔
            </span>
          </div>
        )}

        {/* ── TAB 1: LIVE VEHICLE PROGRESS & OVERVIEW ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 5-Stage Visual Journey Stepper */}
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>🚀</span> Live Service Journey
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  Stage {currentStageIndex + 1} of 5
                </span>
              </div>

              {/* Progress Line */}
              <div className="relative flex justify-between items-center mb-6 px-2">
                <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-1 bg-slate-800 z-0 rounded-full" />
                <div
                  className="absolute top-1/2 left-4 -translate-y-1/2 h-1 bg-gradient-to-r from-blue-500 to-emerald-500 z-0 rounded-full transition-all duration-500"
                  style={{ width: `${(currentStageIndex / (stages.length - 1)) * 90}%` }}
                />

                {stages.map((stg, i) => {
                  const isDone = i < currentStageIndex
                  const isCurrent = i === currentStageIndex
                  return (
                    <div key={stg.label} className="relative z-10 flex flex-col items-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 shadow-md ${
                          isDone
                            ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20'
                            : isCurrent
                            ? 'bg-blue-600 text-white ring-4 ring-blue-500/40 scale-110 pulse-live-indicator'
                            : 'bg-slate-800 text-slate-500 border border-white/10'
                        }`}
                      >
                        {isDone ? '✓' : stg.icon}
                      </div>
                      <span
                        className={`text-[10px] mt-2 font-bold tracking-tight ${
                          isCurrent ? 'text-blue-400 font-extrabold' : isDone ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {stg.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Current Status Callout */}
              <div className="bg-slate-900/90 rounded-2xl p-4 border border-white/10 flex items-start gap-3">
                <span className="text-2xl mt-0.5">{stages[currentStageIndex].icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">
                    Current Stage: {stages[currentStageIndex].label}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {stages[currentStageIndex].desc}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Action Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('complaint')}
                className="tap-bounce mobile-glass-dark p-4 rounded-2xl border border-white/10 text-left flex flex-col justify-between hover:border-blue-500/30"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl mb-3">
                  🚨
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Report Issues</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Add vehicle problems & concerns</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('estimate')}
                className="tap-bounce mobile-glass-dark p-4 rounded-2xl border border-white/10 text-left flex flex-col justify-between hover:border-blue-500/30"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl mb-3">
                  📋
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Estimates & Bills</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">View itemized parts & approve</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('gatepass')}
                className="tap-bounce mobile-glass-dark p-4 rounded-2xl border border-white/10 text-left flex flex-col justify-between hover:border-blue-500/30"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl mb-3">
                  🎫
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Digital Gate Pass</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {effectiveGatePassIssued ? 'Pass ready for exit' : 'Check release status'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('feedback')}
                className="tap-bounce mobile-glass-dark p-4 rounded-2xl border border-white/10 text-left flex flex-col justify-between hover:border-blue-500/30"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl mb-3">
                  ⭐
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Service Rating</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Rate advisor & quality</p>
                </div>
              </button>
            </div>

            {/* Financial Summary Card */}
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>💳</span> Billing & Settlement Summary
              </h3>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Estimated</span>
                  <div className="text-sm font-black text-white mt-1">
                    ₹{totalEstimatedValue.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Paid / Settled</span>
                  <div className="text-sm font-black text-emerald-400 mt-1">
                    ₹{effectiveReceived.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase">Balance Due</span>
                  <div className="text-sm font-black text-amber-400 mt-1">
                    ₹{balanceDue.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: ESTIMATES & APPROVALS ── */}
        {activeTab === 'estimate' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {liveEstimates.length === 0 ? (
              <div className="mobile-glass-dark rounded-3xl p-8 border border-white/10 text-center space-y-3">
                <div className="text-4xl">📋</div>
                <h3 className="text-base font-bold text-white">No Estimate Generated Yet</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Your Service Advisor is currently inspecting the vehicle and will generate an itemized estimate shortly.
                </p>
              </div>
            ) : (
              liveEstimates.map((est) => {
                const isPending = est.status === 'Sent' || est.status === 'Draft'
                const isApproved = est.status === 'Approved'
                const isRejected = est.status === 'Rejected'

                return (
                  <div
                    key={est.estimate_no}
                    className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 relative overflow-hidden"
                  >
                    {/* Status Ribbon */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div>
                        <div className="text-[11px] font-mono text-slate-400">Estimate #{est.estimate_no}</div>
                        <div className="text-sm font-bold text-white">{est.model || 'Repair Estimate'}</div>
                      </div>
                      <span
                        className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                          isApproved
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : isRejected
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 pulse-live-indicator'
                        }`}
                      >
                        {isApproved ? '✓ Approved' : isRejected ? '✕ Rejected' : 'Action Required'}
                      </span>
                    </div>

                    {/* Itemized Parts Table */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-300">Itemized Parts & Services</div>
                      <div className="bg-slate-900/90 rounded-2xl p-3 border border-white/5 space-y-2 text-xs">
                        {est.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                            <div>
                              <div className="font-semibold text-slate-200">{item.description}</div>
                              <div className="text-[10px] text-slate-500">
                                Qty: {item.quantity} · Type: {item.type} · Rate: ₹{item.unit_price}
                              </div>
                            </div>
                            <div className="font-mono font-bold text-slate-200">
                              ₹{item.total.toLocaleString('en-IN')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cost Breakdown */}
                    <div className="bg-slate-900/60 p-3 rounded-2xl border border-white/5 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Subtotal</span>
                        <span className="font-mono">₹{est.subtotal.toLocaleString('en-IN')}</span>
                      </div>
                      {est.discount > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Discount</span>
                          <span className="font-mono">-₹{est.discount.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-400">
                        <span>GST / Taxes</span>
                        <span className="font-mono">₹{est.gst_tax.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm text-white pt-2 border-t border-white/10">
                        <span>Grand Total</span>
                        <span className="font-mono text-blue-400 font-extrabold text-base">
                          ₹{est.grand_total.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Approval / Rejection Buttons (If Pending) */}
                    {isPending && (
                      <div className="pt-2 space-y-2">
                        {showRejectBox ? (
                          <div className="bg-slate-900 p-3 rounded-2xl border border-rose-500/30 space-y-2">
                            <label className="text-xs font-bold text-rose-300">Reason for Rejection / Change Request:</label>
                            <textarea
                              rows={2}
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="e.g. Please remove optional accessories or check battery again..."
                              className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setShowRejectBox(false)}
                                className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-slate-300"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!rejectReason.trim() || rejectingEstNo === est.estimate_no}
                                onClick={() => handleReject(est)}
                                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white disabled:opacity-50"
                              >
                                {rejectingEstNo === est.estimate_no ? 'Submitting...' : 'Confirm Reject'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setShowRejectBox(true)}
                              className="tap-bounce py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition"
                            >
                              ✕ Request Changes
                            </button>
                            <button
                              type="button"
                              disabled={approvingEstNo === est.estimate_no}
                              onClick={() => handleApprove(est)}
                              className="tap-bounce py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
                            >
                              {approvingEstNo === est.estimate_no ? 'Approving...' : '✓ Approve Estimate'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── TAB 3: REPORT PROBLEMS & CONCERNS ── */}
        {activeTab === 'complaint' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>🚨</span> Tell Us Your Vehicle Concerns
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Directly notify your Service Advisor before or during vehicle service.
                </p>
              </div>

              {/* Quick Concern Preset Chips */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Quick-Tap Common Concerns:
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CONCERN_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleAddChip(chip)}
                      className="tap-bounce px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{chip.icon}</span>
                      <span>{chip.label}</span>
                      <span className="text-blue-400 font-bold ml-0.5">+</span>
                    </button>
                  ))}
                </div>
              </div>

              {complaintSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-2xl p-4 text-xs text-emerald-300 font-bold flex items-center gap-2">
                  <span>✓</span> Problems submitted successfully! Your advisor has received this list.
                </div>
              )}

              <form onSubmit={handleMultiProblemSubmit} className="space-y-3">
                {/* Odometer KM Reading */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Current KM Reading (Odometer):
                  </label>
                  <input
                    type="text"
                    value={complaintKm}
                    onChange={(e) => setComplaintKm(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 34500"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>

                {/* Problem Items List */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300">
                      Problem List ({problemList.filter((p) => p.text.trim()).length} Entered):
                    </label>
                    <button
                      type="button"
                      onClick={() => addProblemRow()}
                      className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      + Add Another Issue
                    </button>
                  </div>

                  {problemList.map((prob, idx) => (
                    <div key={prob.id} className="bg-slate-900/90 rounded-2xl p-3 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400">Problem #{idx + 1}</span>
                        {problemList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeProblemRow(prob.id)}
                            className="text-[11px] font-bold text-rose-400 hover:text-rose-300"
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={prob.text}
                            onChange={(e) => updateProblemRow(prob.id, 'text', e.target.value)}
                            placeholder="Describe issue (e.g. noise on braking)..."
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <select
                            value={prob.category}
                            onChange={(e) => updateProblemRow(prob.id, 'category', e.target.value)}
                            className="w-full bg-slate-950 border border-white/10 rounded-xl px-2 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                          >
                            <option value="General">General</option>
                            <option value="Engine">Engine</option>
                            <option value="Brakes">Brakes</option>
                            <option value="AC & Climate">AC</option>
                            <option value="Suspension">Suspension</option>
                            <option value="Electrical">Electrical</option>
                            <option value="Bodyshop">Bodyshop</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Special Instructions (Optional):
                  </label>
                  <textarea
                    rows={2}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="e.g. Please deliver vehicle before 5:00 PM today..."
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={complaintSubmitting || problemList.every((p) => !p.text.trim())}
                  className="tap-bounce w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 disabled:opacity-50 transition"
                >
                  {complaintSubmitting ? 'Sending to Advisor...' : '🚀 Submit Vehicle Problems'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB 4: DIGITAL GATE PASS ── */}
        {activeTab === 'gatepass' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="mobile-glass-dark rounded-3xl p-6 border border-white/10 shadow-2xl text-center relative overflow-hidden space-y-5">
              {/* Status Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="text-left">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Exit Authorization</span>
                  <h3 className="text-sm font-extrabold text-white">Digital Gate Pass</h3>
                </div>
                <span
                  className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                    effectiveGatePassIssued
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {effectiveGatePassIssued ? '✓ Ready For Release' : '⏳ In Workshop'}
                </span>
              </div>

              {/* QR Code Pass Box */}
              <div className="bg-white p-6 rounded-3xl inline-block shadow-2xl ring-4 ring-white/10 max-w-xs mx-auto">
                <div className="w-48 h-48 mx-auto bg-slate-950 rounded-2xl flex flex-col items-center justify-center p-4 border-2 border-slate-900">
                  {/* Generated Simulated High-Security QR SVG */}
                  <svg className="w-full h-full text-white" viewBox="0 0 100 100" fill="currentColor">
                    <rect x="5" y="5" width="28" height="28" rx="4" />
                    <rect x="9" y="9" width="20" height="20" fill="#020617" />
                    <rect x="13" y="13" width="12" height="12" />
                    <rect x="67" y="5" width="28" height="28" rx="4" />
                    <rect x="71" y="9" width="20" height="20" fill="#020617" />
                    <rect x="75" y="13" width="12" height="12" />
                    <rect x="5" y="67" width="28" height="28" rx="4" />
                    <rect x="9" y="71" width="20" height="20" fill="#020617" />
                    <rect x="13" y="75" width="12" height="12" />
                    <rect x="42" y="15" width="16" height="16" />
                    <rect x="42" y="42" width="16" height="16" />
                    <rect x="15" y="42" width="16" height="16" />
                    <rect x="67" y="42" width="16" height="16" />
                    <rect x="42" y="67" width="16" height="16" />
                    <rect x="67" y="67" width="16" height="16" />
                  </svg>
                </div>
                <div className="mt-3 font-mono font-black text-slate-950 text-base tracking-wider">
                  {effectiveGatePassNo}
                </div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Verified Gate Exit Security Token
                </div>
              </div>

              {/* Pass Security Details */}
              <div className="bg-slate-900/80 rounded-2xl p-4 border border-white/5 text-xs text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Registration No:</span>
                  <span className="font-mono font-bold text-white">{vehicle.reg_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Job Card:</span>
                  <span className="font-mono font-bold text-amber-300">{vehicle.jc_number || 'JC-Active'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Status:</span>
                  <span className="font-bold text-emerald-400">
                    {balanceDue === 0 ? '✓ Fully Settled (₹0 Balance)' : `Pending ₹${balanceDue.toLocaleString('en-IN')}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Issued By:</span>
                  <span className="text-slate-200">{issuedGatePass?.issued_by || 'Accounts Desk'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: SERVICE FEEDBACK ── */}
        {activeTab === 'feedback' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>⭐</span> Rate Your Workshop Experience
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Your direct feedback helps us maintain premium Tata Motors quality standards.
                </p>
              </div>

              {feedbackSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-2xl p-4 text-xs text-emerald-300 font-bold flex items-center gap-2">
                  <span>✓</span> Thank you for your valuable feedback!
                </div>
              )}

              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                {/* Star Rating Picker */}
                <div className="text-center py-2">
                  <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Overall Rating</div>
                  <div className="flex justify-center gap-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRating(s)}
                        className={`text-3xl transition-transform ${s <= rating ? 'scale-110' : 'opacity-30'}`}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                  <div className="text-xs font-extrabold text-amber-400 mt-2">
                    {rating === 5 ? '🌟 Excellent Experience' : rating === 4 ? '👍 Very Good' : rating === 3 ? '👌 Average' : '⚠️ Needs Improvement'}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Your Remarks / Feedback:
                  </label>
                  <textarea
                    rows={4}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell us about the advisor interaction, wash quality, timing..."
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={feedbackSubmitting || !feedbackText.trim()}
                  className="tap-bounce w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
                >
                  {feedbackSubmitting ? 'Submitting Feedback...' : '⭐ Submit Star Rating'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── FLOATING GLASS BOTTOM NAVIGATION DOCK ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-1 pointer-events-none safe-bottom">
        <div className="max-w-md mx-auto pointer-events-auto mobile-glass-nav rounded-3xl p-1.5 sm:p-2 grid grid-cols-5 gap-1 items-center border border-white/10 shadow-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition w-full ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-lg">🏠</span>
            <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('estimate')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition relative w-full ${
              activeTab === 'estimate' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-lg">📋</span>
            <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">Estimates</span>
            {isPendingApproval && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 pulse-live-indicator" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('complaint')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition w-full ${
              activeTab === 'complaint' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-lg">🚨</span>
            <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">Issues</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gatepass')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition relative w-full ${
              activeTab === 'gatepass' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-lg">🎫</span>
            <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">Gate Pass</span>
            {effectiveGatePassIssued && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-400 pulse-live-indicator" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition w-full ${
              activeTab === 'feedback' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-lg">⭐</span>
            <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">Review</span>
          </button>
        </div>
      </div>

      {/* Multi-vehicle Switcher Modal */}
      {showVehiclePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-2xl space-y-3 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">Select Vehicle</h3>
              <button
                type="button"
                onClick={() => setShowVehiclePicker(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕ Close
              </button>
            </div>
            <div className="space-y-2">
              {allVehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onSelectVehicle?.(v)
                    setShowVehiclePicker(false)
                  }}
                  className={`w-full p-3 rounded-2xl text-left border flex justify-between items-center transition ${
                    v.reg_number === vehicle.reg_number
                      ? 'bg-blue-600/30 border-blue-400 text-white'
                      : 'bg-slate-900 border-white/5 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold">{v.reg_number}</div>
                    <div className="text-[11px] text-slate-400">{v.model || 'Tata Vehicle'}</div>
                  </div>
                  {v.reg_number === vehicle.reg_number && <span className="text-blue-400 font-bold">✓ Active</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
