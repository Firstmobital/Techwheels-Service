import { useState, useEffect } from 'react'
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
  const [loadingEstimates, setLoadingEstimates] = useState(false)
  const [approvingEstNo, setApprovingEstNo] = useState<string | null>(null)
  const [rejectingEstNo, setRejectingEstNo] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectBox, setShowRejectBox] = useState(false)

  // Live Gate Pass State (Accounts Module Sync)
  const [issuedGatePass, setIssuedGatePass] = useState<IssuedGatePassRecord | null>(null)
  const [loadingGatePass, setLoadingGatePass] = useState(false)

  // Multi-Problem List State (Customer Problem Submission)
  const [problemList, setProblemList] = useState<ProblemItem[]>([
    { id: 'prob-1', text: '', category: 'Engine' },
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

  // Sync active vehicle data
  useEffect(() => {
    setVehicle(initialVehicle)
  }, [initialVehicle])

  // Load Live Estimates for this vehicle
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
      .channel(`customer-portal-realtime-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_estimates' },
        () => {
          void loadVehicleEstimates()
        }
      )
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
        { event: '*', schema: 'public', table: 'service_reception_entries' },
        () => {
          void loadVehicleGatePass()
        }
      )
      .subscribe()

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

      // Record approval log into feedback table for full traceability
      const botRow = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || null,
        rating: 5,
        feedback_text: `[Estimate Approved] Customer approved Estimate #${est.estimate_no} (₹${est.grand_total.toLocaleString()}) via Customer Portal.`,
        service_type: `Estimate #${est.estimate_no} Approved`,
        service_advisor_name: vehicle.sa_name || est.service_advisor_name || null,
        branch: vehicle.branch || est.branch || null,
        mode: 'customer_estimate_approval',
        complaint_date_time: new Date().toISOString(),
      }
      await supabase.from('post_feedback_bot_data').insert([botRow])

      // Re-fetch to update state
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
  function addProblemRow() {
    setProblemList((prev) => [
      ...prev,
      { id: `prob-${Date.now()}`, text: '', category: 'General' },
    ])
  }

  function removeProblemRow(id: string) {
    if (problemList.length <= 1) return
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
      // Format as: 1. <desc1> ; 2. <desc2>
      const formattedProblems = validProblems
        .map((p, idx) => `${idx + 1}. ${p.text.trim()} [${p.category}]`)
        .join(' ; ')

      const primaryCategory = validProblems[0]?.category || 'Customer Problems'

      const feedbackBody = `[Complaint - ${primaryCategory}] KM: ${complaintKm || 'N/A'} | Issue: ${formattedProblems}${
        additionalNotes.trim() ? ` | Additional: ${additionalNotes.trim()}` : ''
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
        mode: 'customer_complaint_portal',
        primary_complaint_area: primaryCategory,
        complaint_date_time: new Date().toISOString(),
      }

      await supabase.from('post_feedback_bot_data').insert([row])
      setComplaintSuccess(true)
      setProblemList([{ id: `prob-${Date.now()}`, text: '', category: 'Engine' }])
      setAdditionalNotes('')
      setTimeout(() => setComplaintSuccess(false), 5000)
    } catch (err) {
      console.error('Complaint submit error:', err)
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
        mode: 'customer_mobile_pwa',
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

  // Cost calculation
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

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 12px 60px' }}>
      {/* Top Banner & Vehicle Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#fff',
          borderRadius: 20,
          padding: '20px 22px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.25)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🚘</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.5px' }} className="font-mono">
                {vehicle.reg_number}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {vehicle.model || 'Tata Vehicle'} · {vehicle.variant || 'Standard Edition'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              borderRadius: 10,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ Exit Portal
          </button>
        </div>

        {/* Customer Details Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            background: 'rgba(255,255,255,0.06)',
            padding: '12px 14px',
            borderRadius: 14,
            fontSize: 12,
          }}
        >
          <div>
            <div style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: 600 }}>CUSTOMER</div>
            <div style={{ fontWeight: 700, color: '#f8fafc' }}>{vehicle.owner_name || 'Customer'}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: 600 }}>SERVICE ADVISOR</div>
            <div style={{ fontWeight: 700, color: '#38bdf8' }}>{vehicle.sa_display_name || vehicle.sa_name || 'Assigned Advisor'}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: 600 }}>JOB CARD NO</div>
            <div style={{ fontWeight: 700, color: '#facc15' }} className="font-mono">{vehicle.jc_number || 'JC In-Progress'}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 10.5, fontWeight: 600 }}>WORKSHOP BRANCH</div>
            <div style={{ fontWeight: 700, color: '#f8fafc' }}>{vehicle.branch || 'Sitapura Workshop'}</div>
          </div>
        </div>

        {/* Multi-vehicle picker if customer has multiple registered vehicles */}
        {allVehicles.length > 1 && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#94a3b8' }}>Switch Vehicle:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allVehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVehicle?.(v)}
                  style={{
                    background: v.reg_number === vehicle.reg_number ? '#2563eb' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {v.reg_number}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 16,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'dashboard' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'dashboard' ? '#fff' : '#475569',
          }}
        >
          📊 Live Job Card
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('estimate')}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'estimate' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'estimate' ? '#fff' : '#475569',
            position: 'relative',
          }}
        >
          📑 Estimate & Bills
          {isPendingApproval && (
            <span
              style={{
                marginLeft: 6,
                background: '#f59e0b',
                color: '#fff',
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 10,
                fontWeight: 900,
              }}
            >
              Action Required
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('complaint')}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'complaint' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'complaint' ? '#fff' : '#475569',
          }}
        >
          🚨 Tell Us Your Problem
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gatepass')}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'gatepass' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'gatepass' ? '#fff' : '#475569',
          }}
        >
          🎫 Digital Gate Pass
          {effectiveGatePassIssued && (
            <span
              style={{
                marginLeft: 6,
                background: '#16a34a',
                color: '#fff',
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 10,
                fontWeight: 900,
              }}
            >
              Ready
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feedback')}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'feedback' ? '#2563eb' : '#f1f5f9',
            color: activeTab === 'feedback' ? '#fff' : '#475569',
          }}
        >
          ⭐ Service Feedback
        </button>
      </div>

      {/* TAB 1: LIVE JOB CARD DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Pending Estimate Approval Alert Banner */}
          {isPendingApproval && latestLiveEstimate && (
            <div
              style={{
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: '1px solid #fde68a',
                borderRadius: 16,
                padding: '16px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.12)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 26 }}>⏳</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#92400e' }}>
                    Repair Estimate Received: ₹{latestLiveEstimate.grand_total.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 1 }}>
                    Service Advisor sent Estimate #{latestLiveEstimate.estimate_no}. Your approval is requested.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('estimate')}
                style={{
                  background: '#d97706',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Review & Approve →
              </button>
            </div>
          )}

          {/* Service Progress Card */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
              🔄 Live Service Progress Tracker
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Service Type</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0284c7', marginTop: 2 }}>{vehicle.service_type || 'General Service'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Current Odometer</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{vehicle.km_reading ? `${vehicle.km_reading.toLocaleString()} KM` : 'Recorded'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Estimate Amount</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  ₹{totalEstimatedValue.toLocaleString()}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Gate Pass Status</div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: effectiveGatePassIssued ? '#16a34a' : '#d97706',
                    marginTop: 2,
                  }}
                >
                  {effectiveGatePassIssued ? 'Issued (Ready)' : 'Under Service'}
                </div>
              </div>
            </div>

            {vehicle.remark && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#1e40af' }}>
                📌 <strong>Advisor Note:</strong> {vehicle.remark}
              </div>
            )}
          </div>

          {/* Quick Action Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <button
              type="button"
              onClick={() => setActiveTab('estimate')}
              style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: 16,
                padding: 16,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>📑</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>Estimate & Bills</div>
              <div style={{ fontSize: 11.5, color: '#2563eb', marginTop: 2 }}>
                {latestLiveEstimate
                  ? `Estimate #${latestLiveEstimate.estimate_no} (${latestLiveEstimate.status})`
                  : 'View service cost breakdown, approve estimate & view invoice'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('complaint')}
              style={{
                background: 'linear-gradient(135deg, #fef2f2 0%, #ffe4e6 100%)',
                border: '1px solid #fecdd3',
                borderRadius: 16,
                padding: 16,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>🚨</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#9f1239' }}>Tell Us Your Problem</div>
              <div style={{ fontSize: 11.5, color: '#be123c', marginTop: 2 }}>Submit multiple issues directly to advisor & workshop team</div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gatepass')}
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '1px solid #bbf7d0',
                borderRadius: 16,
                padding: 16,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>🎫</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#14532d' }}>Digital Gate Pass</div>
              <div style={{ fontSize: 11.5, color: '#15803d', marginTop: 2 }}>
                {effectiveGatePassIssued ? 'Pass Active - QR ready for exit' : 'View QR verification pass for vehicle release'}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: ESTIMATE & INVOICE WINDOW (LIVE SYNCED WITH ADMIN) */}
      {activeTab === 'estimate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary Box */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>📑 Service Estimate & Quotation</h2>
                  {latestLiveEstimate && (
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {latestLiveEstimate.estimate_no}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {latestLiveEstimate
                    ? `Created by Service Advisor on ${new Date(latestLiveEstimate.created_at || latestLiveEstimate.updated_at || Date.now()).toLocaleDateString()}`
                    : 'Transparent cost estimate for your vehicle maintenance and repairs.'}
                </p>
              </div>

              {/* Status Badge */}
              <span
                style={{
                  background:
                    latestLiveEstimate?.status === 'Approved'
                      ? '#dcfce7'
                      : latestLiveEstimate?.status === 'Rejected'
                      ? '#fee2e2'
                      : '#fef3c7',
                  color:
                    latestLiveEstimate?.status === 'Approved'
                      ? '#15803d'
                      : latestLiveEstimate?.status === 'Rejected'
                      ? '#b91c1c'
                      : '#b45309',
                  padding: '4px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  border: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                {latestLiveEstimate?.status === 'Approved'
                  ? '✅ APPROVED'
                  : latestLiveEstimate?.status === 'Rejected'
                  ? '❌ REJECTED'
                  : '⏳ AWAITING APPROVAL'}
              </span>
            </div>

            {/* Financial Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TOTAL ESTIMATE</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                  ₹{totalEstimatedValue.toLocaleString()}
                </div>
              </div>

              <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 12, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>AMOUNT RECEIVED</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#166534', marginTop: 4 }}>
                  ₹{effectiveReceived.toLocaleString()}
                </div>
              </div>

              <div
                style={{
                  background: balanceDue > 0 ? '#fef2f2' : '#f8fafc',
                  padding: 14,
                  borderRadius: 12,
                  border: balanceDue > 0 ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: 11, color: balanceDue > 0 ? '#b91c1c' : '#64748b', fontWeight: 600 }}>
                  BALANCE DUE
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: balanceDue > 0 ? '#dc2626' : '#1e293b', marginTop: 4 }}>
                  ₹{balanceDue.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Itemized Estimate Breakdown Table */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#334155', borderBottom: '1px solid #e2e8f0' }}>
                Estimated Service Scope & Spares
              </div>

              {latestLiveEstimate && latestLiveEstimate.items && latestLiveEstimate.items.length > 0 ? (
                /* Render Real Live Items sent by Advisor */
                <>
                  {latestLiveEstimate.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12.5,
                      }}
                    >
                      <div>
                        <div style={{ color: '#1e293b', fontWeight: 600 }}>
                          {item.type === 'part' ? '⚙️' : '🔧'} {item.description}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Qty: {item.quantity} × ₹{item.unit_price.toLocaleString()} ({item.type === 'part' ? 'Genuine Part' : 'Labour & Fitting'})
                        </div>
                      </div>
                      <span style={{ fontWeight: 800, color: '#0f172a' }}>₹{item.total.toLocaleString()}</span>
                    </div>
                  ))}

                  {latestLiveEstimate.gst_tax > 0 && (
                    <div style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                      <span>Taxes & GST (18%)</span>
                      <span style={{ fontWeight: 600 }}>₹{latestLiveEstimate.gst_tax.toLocaleString()}</span>
                    </div>
                  )}

                  {latestLiveEstimate.discount > 0 && (
                    <div style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#16a34a' }}>
                      <span>Special Workshop Discount</span>
                      <span style={{ fontWeight: 700 }}>-₹{latestLiveEstimate.discount.toLocaleString()}</span>
                    </div>
                  )}

                  <div style={{ padding: '12px 14px', background: '#faf5ff', display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 900, color: '#6b21a8' }}>
                    <span>Grand Total Estimated Value</span>
                    <span>₹{latestLiveEstimate.grand_total.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                /* Fallback Default Service Items */
                <>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#334155' }}>🔧 Periodic Inspection & General Service Labour</span>
                    <span style={{ fontWeight: 700 }}>₹1,650</span>
                  </div>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#334155' }}>🛢️ Engine Oil, Synthetic Lubricants & Oil Filter</span>
                    <span style={{ fontWeight: 700 }}>₹1,450</span>
                  </div>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#334155' }}>🧼 Complete Foam Washing, Vacuuming & Sanitization</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>Complimentary (Free)</span>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#faf5ff', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: '#6b21a8' }}>
                    <span>Total Estimated Job Value</span>
                    <span>₹{totalEstimatedValue.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            {/* Estimate Approval & Decision Box (Realtime Connected to Admin) */}
            <div
              style={{
                background:
                  latestLiveEstimate?.status === 'Approved'
                    ? '#f0fdf4'
                    : latestLiveEstimate?.status === 'Rejected'
                    ? '#fef2f2'
                    : '#eff6ff',
                border:
                  latestLiveEstimate?.status === 'Approved'
                    ? '1px solid #bbf7d0'
                    : latestLiveEstimate?.status === 'Rejected'
                    ? '1px solid #fecdd3'
                    : '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>
                  {latestLiveEstimate?.status === 'Approved'
                    ? '✅'
                    : latestLiveEstimate?.status === 'Rejected'
                    ? '❌'
                    : '✍️'}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color:
                        latestLiveEstimate?.status === 'Approved'
                          ? '#166534'
                          : latestLiveEstimate?.status === 'Rejected'
                          ? '#991b1b'
                          : '#1e40af',
                    }}
                  >
                    {latestLiveEstimate?.status === 'Approved'
                      ? 'Estimate Approved by Customer'
                      : latestLiveEstimate?.status === 'Rejected'
                      ? 'Estimate Change Requested / Rejected'
                      : 'Digital Estimate Approval Required'}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color:
                        latestLiveEstimate?.status === 'Approved'
                          ? '#15803d'
                          : latestLiveEstimate?.status === 'Rejected'
                          ? '#b91c1c'
                          : '#3b82f6',
                      marginTop: 2,
                    }}
                  >
                    {latestLiveEstimate?.status === 'Approved'
                      ? `Thank you! Your approval was submitted on ${new Date(latestLiveEstimate.approved_at || latestLiveEstimate.updated_at || Date.now()).toLocaleString()}. The Service Advisor & workshop team are actively working.`
                      : latestLiveEstimate?.status === 'Rejected'
                      ? `Reason: "${latestLiveEstimate.rejection_reason || 'Modification requested'}". Your Advisor has been notified to revise the quote.`
                      : 'Please review the scope and parts above. Approving allows the workshop team to start work immediately.'}
                  </div>
                </div>
              </div>

              {/* Action Buttons if not approved */}
              {latestLiveEstimate && latestLiveEstimate.status !== 'Approved' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleApprove(latestLiveEstimate)}
                    disabled={approvingEstNo === latestLiveEstimate.estimate_no}
                    style={{
                      background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: 10,
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                    }}
                  >
                    {approvingEstNo === latestLiveEstimate.estimate_no
                      ? 'Submitting Approval…'
                      : `✓ Approve Estimate (₹${latestLiveEstimate.grand_total.toLocaleString()})`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRejectBox(!showRejectBox)}
                    style={{
                      background: '#fff',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      padding: '10px 16px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {showRejectBox ? 'Cancel' : '✕ Request Modification / Reject'}
                  </button>
                </div>
              )}

              {/* Rejection / Modification Input Box */}
              {showRejectBox && latestLiveEstimate && latestLiveEstimate.status !== 'Approved' && (
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #fecdd3',
                    borderRadius: 10,
                    padding: 12,
                    marginTop: 8,
                  }}
                >
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', display: 'block', marginBottom: 4 }}>
                    Please specify why you want modifications or rejection:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please remove wiper replacement / price is too high / check only oil change..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleReject(latestLiveEstimate)}
                      disabled={rejectingEstNo === latestLiveEstimate.estimate_no || !rejectReason.trim()}
                      style={{
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {rejectingEstNo === latestLiveEstimate.estimate_no ? 'Submitting…' : 'Send Rejection to Advisor'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Documents & Links */}
            {(vehicle.estimate_drive_url || vehicle.invoice_drive_url) && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {vehicle.estimate_drive_url && (
                  <a
                    href={vehicle.estimate_drive_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#f1f5f9',
                      color: '#1e293b',
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    📥 Open Digital Estimate Document
                  </a>
                )}
                {vehicle.invoice_drive_url && (
                  <a
                    href={vehicle.invoice_drive_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#f1f5f9',
                      color: '#1e293b',
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    📄 Open Final Tax Invoice
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TELL US YOUR PROBLEM (MULTI-PROBLEM NUMBERED LIST) */}
      {activeTab === 'complaint' && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>🚨 Tell Us Your Problem (गाड़ी की समस्याएं दर्ज करें)</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Aap apni gadi me aane wali sabhi problems list-wise add kar sakte hain. Advisor aur workshop team har problem ko inspect karegi.
            </p>
          </div>

          {complaintSuccess && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              ✅ All problems successfully submitted! Your Service Advisor ({vehicle.sa_display_name || vehicle.sa_name || 'Advisor'}) and Bodyshop Admin Hub have received your numbered list in real-time.
            </div>
          )}

          <form onSubmit={handleMultiProblemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Numbered Problems List Builder */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12.5, fontWeight: 800, color: '#1e293b' }}>
                  List of Problems / Issues ({problemList.length}) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={addProblemRow}
                  style={{
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>+</span> Add Another Problem (और समस्या जोड़ें)
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {problemList.map((prob, idx) => (
                  <div
                    key={prob.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      background: '#f8fafc',
                      padding: 10,
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <span
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>

                    <input
                      type="text"
                      placeholder={`Problem ${idx + 1}: e.g. Brake vibration / Pickup low / AC not cooling`}
                      value={prob.text}
                      onChange={(e) => updateProblemRow(prob.id, 'text', e.target.value)}
                      required={idx === 0}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 12.5,
                        fontWeight: 500,
                        background: '#fff',
                      }}
                    />

                    <select
                      value={prob.category}
                      onChange={(e) => updateProblemRow(prob.id, 'category', e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#fff',
                        maxWidth: 140,
                      }}
                    >
                      <option value="Engine">Engine</option>
                      <option value="AC">AC / Climate</option>
                      <option value="Brake">Brake / ABS</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Suspension">Suspension</option>
                      <option value="Bodyshop">Bodyshop/Dent</option>
                      <option value="Noise">Noise/Vibration</option>
                      <option value="General">General</option>
                    </select>

                    {problemList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeProblemRow(prob.id)}
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: 6,
                          width: 28,
                          height: 28,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                        title="Remove problem"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Current KM Reading */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Current KM Reading (Odometer)
              </label>
              <input
                type="number"
                placeholder="e.g. 14200"
                value={complaintKm}
                onChange={(e) => setComplaintKm(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
              />
            </div>

            {/* Additional Notes */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Additional Notes or Special Instructions (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Any special remarks for Service Advisor or Technician..."
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <button
              type="submit"
              disabled={complaintSubmitting || !problemList.some((p) => p.text.trim().length > 0)}
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              }}
            >
              {complaintSubmitting ? 'Submitting Problem List…' : 'Submit Problem List to Workshop Team →'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: DIGITAL GATE PASS (ACCOUNTS MODULE LIVE SYNC) */}
      {activeTab === 'gatepass' && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎫</div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Digital Security Gate Pass</h2>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 2, marginBottom: 16 }}>
            Official security exit verification pass connected live with the Accounts & Settlement Desk.
          </p>

          {effectiveGatePassIssued ? (
            /* ACTIVE ISSUED GATE PASS CARD */
            <div
              style={{
                maxWidth: 380,
                margin: '0 auto',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#fff',
                borderRadius: 20,
                padding: '24px 22px',
                textAlign: 'left',
                boxShadow: '0 12px 36px rgba(15, 23, 42, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Security Hologram Strip */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: 'linear-gradient(90deg, #38bdf8 0%, #4ade80 50%, #facc15 100%)',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 900, letterSpacing: '1px' }}>
                  SECURITY CLEARANCE PASS
                </span>
                <span
                  style={{
                    fontSize: 11,
                    background: '#16a34a',
                    color: '#fff',
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontWeight: 900,
                  }}
                >
                  🟢 READY FOR EXIT
                </span>
              </div>

              <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }} className="font-mono text-emerald-400">
                {effectiveGatePassNo}
              </div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 16 }}>
                Vehicle: <strong style={{ color: '#fff', fontSize: 13.5 }}>{vehicle.reg_number}</strong> ({vehicle.model || 'Tata Motors'})
              </div>

              {/* QR Code / Security Token Bar */}
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    background: '#0f172a',
                    color: '#38bdf8',
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    fontWeight: 900,
                  }}
                >
                  QR
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Gate Security Auth Token
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }} className="font-mono">
                    {issuedGatePass?.qr_token || `GP_AUTH_${effectiveGatePassNo}_${vehicle.reg_number}_SECURE`}
                  </div>
                </div>
              </div>

              {/* Details table */}
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Job Card:</span>
                  <span style={{ fontWeight: 700 }} className="font-mono">{issuedGatePass?.job_card_no || vehicle.jc_number || 'JC-2026'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Invoice No:</span>
                  <span style={{ fontWeight: 700 }} className="font-mono">{issuedGatePass?.invoice_no || 'INV-2026-FINAL'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Amount Paid:</span>
                  <span style={{ fontWeight: 800, color: '#4ade80' }}>₹{(issuedGatePass?.amount_received || totalEstimatedValue).toLocaleString()} (Settled)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Authorized By:</span>
                  <span style={{ fontWeight: 700 }}>{issuedGatePass?.issued_by || 'Accounts & Billing Desk'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Issued At:</span>
                  <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{issuedGatePass?.issued_at || new Date().toLocaleString()}</span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    width: '100%',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  🖨️ Print / Save Gate Pass Receipt
                </button>
              </div>
            </div>
          ) : (
            /* PENDING CLEARANCE STATE */
            <div
              style={{
                maxWidth: 420,
                margin: '0 auto',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 20,
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                ⏳ Gate Pass Status: Awaiting Accounts Clearance
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>1. Vehicle Reception Intake Completed</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>2. Workshop Repair & Quality Check (Pass)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: '#d97706', fontWeight: 900 }}>⏳</span>
                  <span style={{ color: '#92400e', fontWeight: 600 }}>3. Accounts Desk Payment Settlement</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 900 }}>○</span>
                  <span style={{ color: '#64748b' }}>4. Security Gate Pass QR Release</span>
                </div>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, fontSize: 12, color: '#1e40af', lineHeight: 1.45 }}>
                💡 <strong>Note:</strong> Jaise hi Accounts Desk par aapka bill generate aur verify hoga, aapka Digital QR Gate Pass yahan live real-time me generate ho jayega.
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SERVICE FEEDBACK */}
      {activeTab === 'feedback' && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>⭐ Rate Your Service Experience</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Share your feedback to help us continuously improve our service quality.
            </p>
          </div>

          {feedbackSuccess && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              ✅ Thank you for your feedback! Your rating has been submitted to management.
            </div>
          )}

          <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Rating
              </label>
              <div style={{ display: 'flex', gap: 8, fontSize: 28, cursor: 'pointer' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    onClick={() => setRating(star)}
                    style={{ color: star <= rating ? '#f59e0b' : '#cbd5e1' }}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Your Comments <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                placeholder="How was your service experience with our advisor and workshop team?"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <button
              type="submit"
              disabled={feedbackSubmitting || !feedbackText.trim()}
              style={{
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {feedbackSubmitting ? 'Submitting Feedback…' : 'Submit Rating & Feedback →'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
