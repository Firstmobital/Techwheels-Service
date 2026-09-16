import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ServiceEstimateBuilderModal } from './ServiceEstimateBuilderModal'
import { fetchAllEstimates, type CustomerEstimateRecord } from '../lib/estimates'

interface CustomerPortalAdminModalProps {
  isOpen: boolean
  onClose: () => void
  isAdmin?: boolean
  initialRegNumber?: string
  initialTab?: string
}

interface ComplaintRecord {
  id?: number
  vehicle_registration_number: string
  customer_name: string | null
  mobile_number: string | null
  feedback_text: string
  service_type: string | null
  service_advisor_name: string | null
  branch: string | null
  complaint_date_time: string | null
  created_at?: string | null
  mode?: string | null
}

interface ReceptionVehicleInfo {
  reg_number: string
  model: string | null
  customer_name: string | null
  mobile_number: string | null
  jc_number: string | null
  km_reading: number | null
  sa_name: string | null
  sa_display_name: string | null
  branch: string | null
  service_type: string | null
  created_at: string
}

export function CustomerPortalAdminModal({
  isOpen,
  onClose,
  initialRegNumber,
}: CustomerPortalAdminModalProps) {
  const [currentReg, setCurrentReg] = useState(initialRegNumber || '')
  const [searchInput, setSearchInput] = useState(initialRegNumber || '')
  const [loading, setLoading] = useState(false)
  const [vehicleInfo, setVehicleInfo] = useState<ReceptionVehicleInfo | null>(null)
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([])
  const [estimateRecord, setEstimateRecord] = useState<CustomerEstimateRecord | null>(null)
  const [showEstimateBuilder, setShowEstimateBuilder] = useState(false)

  const loadDataForVehicle = useCallback(async (regNo: string) => {
    const norm = regNo.trim().toUpperCase().replace(/[\s-]/g, '')
    if (!norm) {
      setVehicleInfo(null)
      setComplaints([])
      setEstimateRecord(null)
      return
    }

    setLoading(true)
    try {
      // 1. Fetch reception details for this vehicle
      const { data: recData } = await supabase
        .from('service_reception_entries')
        .select('*')
        .ilike('reg_number', `%${regNo.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      if (recData && recData.length > 0) {
        setVehicleInfo(recData[0] as ReceptionVehicleInfo)
      } else {
        setVehicleInfo(null)
      }

      // 2. Fetch customer complaints from post_feedback_bot_data
      const { data: botData } = await supabase
        .from('post_feedback_bot_data')
        .select('*')
        .ilike('vehicle_registration_number', `%${regNo.trim()}%`)
        .order('complaint_date_time', { ascending: false })
        .limit(20)

      let parsedComplaints: ComplaintRecord[] = []
      let botEstimateDecision: { status: 'Approved' | 'Rejected'; reason?: string; dt?: string } | null = null

      if (botData) {
        for (const row of botData) {
          if (row.mode === 'customer_estimate_approval' || row.mode === 'customer_estimate_rejection') {
            if (!botEstimateDecision) {
              const isApproved = row.mode === 'customer_estimate_approval'
              let rReason = undefined
              if (!isApproved && row.feedback_text) {
                const rMatch = row.feedback_text.match(/Reason:\s*(.+)$/i)
                rReason = rMatch ? rMatch[1].trim() : row.feedback_text
              }
              botEstimateDecision = {
                status: isApproved ? 'Approved' : 'Rejected',
                reason: rReason,
                dt: row.complaint_date_time || row.created_at,
              }
            }
            continue
          }

          if (row.mode === 'customer_estimate_payload' || row.mode === 'customer_payment_payload') continue
          if (row.feedback_text?.trim().startsWith('{')) continue

          // Strictly filter for actual problem/complaint records, do NOT treat customer reviews / feedback as problems
          const isConcern =
            row.mode === 'customer_portal_concern' ||
            row.mode === 'customer_complaint' ||
            row.mode === 'customer_complaint_portal' ||
            row.mode === 'customer_mobile_pwa' ||
            String(row.service_type || '').toLowerCase().includes('issues') ||
            String(row.service_type || '').toLowerCase().includes('concern') ||
            String(row.service_type || '').toLowerCase().includes('complaint') ||
            String(row.feedback_text || '').includes('Issue:') ||
            String(row.feedback_text || '').includes('[Complaint') ||
            String(row.feedback_text || '').includes('Point 1:')

          if (!isConcern) continue

          parsedComplaints.push(row as ComplaintRecord)
        }
      }
      setComplaints(parsedComplaints)

      // 3. Fetch latest estimate record
      const allEstimates = await fetchAllEstimates()
      const match = allEstimates.find(
        (e) => e.vehicle_registration_number?.trim().toUpperCase().replace(/[\s-]/g, '') === norm
      )

      if (match) {
        if (botEstimateDecision && match.status !== botEstimateDecision.status) {
          setEstimateRecord({
            ...match,
            status: botEstimateDecision.status,
            rejection_reason: botEstimateDecision.reason || match.rejection_reason,
            approved_at: botEstimateDecision.status === 'Approved' ? (botEstimateDecision.dt || match.approved_at) : match.approved_at,
          })
        } else {
          setEstimateRecord(match)
        }
      } else if (botEstimateDecision) {
        setEstimateRecord({
          estimate_no: `EST-${norm}`,
          vehicle_registration_number: norm,
          items: [],
          subtotal: 0,
          discount: 0,
          gst_tax: 0,
          grand_total: 0,
          status: botEstimateDecision.status,
          rejection_reason: botEstimateDecision.reason,
          approved_at: botEstimateDecision.status === 'Approved' ? botEstimateDecision.dt : undefined,
        })
      } else {
        setEstimateRecord(null)
      }
    } catch (err) {
      console.warn('Error loading customer vehicle problems:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const reg = initialRegNumber || ''
    setCurrentReg(reg)
    setSearchInput(reg)
    void loadDataForVehicle(reg)
  }, [isOpen, initialRegNumber, loadDataForVehicle])

  if (!isOpen) return null

  // Parse problem issues list from feedback text
  function parseProblems(feedbackText: string | null | undefined): { issues: string[]; km?: string } {
    if (!feedbackText) return { issues: [] }
    const text = feedbackText.trim()

    const issueMatch = text.match(/Issue:\s*([^|]+)/i)
    const kmMatch = text.match(/KM:\s*([^|]+)/i)
    const km = kmMatch ? kmMatch[1].trim() : undefined

    if (issueMatch) {
      const parts = issueMatch[1]
        .split(/;\s*|\s+(?=\d+\.\s+)/)
        .map((p) => p.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean)
      if (parts.length > 0) return { issues: parts, km }
    }

    const clean = text.replace(/^\[Complaint\s*-[^\]]+\]\s*/i, '').replace(/^Customer Remark[^:]*:\s*/i, '').trim()
    return { issues: clean ? [clean] : [], km }
  }

  const activeReg = currentReg || vehicleInfo?.reg_number || 'Vehicle'
  const activeModel = vehicleInfo?.model || 'Tata Vehicle'
  const activeOwner = vehicleInfo?.customer_name || complaints[0]?.customer_name || 'Customer'
  const activePhone = vehicleInfo?.mobile_number || complaints[0]?.mobile_number || '—'
  const activeJc = vehicleInfo?.jc_number
  const activeKm = vehicleInfo?.km_reading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* ── HEADER ── */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-xl shadow-xs">
              🚗
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wider text-white">
                  {activeReg}
                </h2>
                {activeJc && (
                  <span className="bg-white/20 text-white text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border border-white/20">
                    JC #{activeJc}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">
                {activeModel} · {activeOwner} ({activePhone})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ── SEARCH & SWITCH REGISTRATION (IF NEEDED) ── */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (searchInput.trim()) {
                setCurrentReg(searchInput.trim())
                void loadDataForVehicle(searchInput.trim())
              }
            }}
            className="flex items-center gap-2 flex-1"
          >
            <span className="text-xs text-slate-500 font-bold">Vehicle Reg:</span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="e.g. RJ60CH9549"
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
            <button
              type="submit"
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          <button
            onClick={() => void loadDataForVehicle(currentReg)}
            className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            🔄 Refresh
          </button>
        </div>

        {/* ── MAIN BODY ── */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-500 font-bold text-sm">
              Loading customer problem details...
            </div>
          ) : (
            <>
              {/* 1. ESTIMATE APPROVAL / REJECTION STATUS CARD */}
              <div className="rounded-xl border p-4 bg-slate-50/50">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                  Quotation & Approval Status
                </div>

                {estimateRecord ? (
                  <div
                    className={`rounded-xl p-3.5 border flex items-start justify-between gap-3 ${
                      estimateRecord.status === 'Approved'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : estimateRecord.status === 'Rejected'
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : 'bg-blue-50 border-blue-300 text-blue-900'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-black text-sm">
                        <span>
                          {estimateRecord.status === 'Approved'
                            ? '✅'
                            : estimateRecord.status === 'Rejected'
                            ? '❌'
                            : '⏳'}
                        </span>
                        <span>
                          {estimateRecord.status === 'Approved'
                            ? 'Estimate Approved by Customer'
                            : estimateRecord.status === 'Rejected'
                            ? 'Estimate Rejected by Customer'
                            : 'Estimate Sent (Awaiting Customer Decision)'}
                        </span>
                      </div>

                      {estimateRecord.grand_total > 0 && (
                        <div className="text-xs font-bold mt-1 font-mono">
                          Approved Amount: ₹{estimateRecord.grand_total.toLocaleString('en-IN')}
                        </div>
                      )}

                      {estimateRecord.rejection_reason && (
                        <div className="text-xs text-rose-700 mt-1 font-semibold italic bg-rose-100/60 p-2 rounded-lg">
                          Rejection Reason: "{estimateRecord.rejection_reason}"
                        </div>
                      )}

                      {estimateRecord.approved_at && (
                        <div className="text-[11px] text-emerald-700 mt-1 font-medium">
                          Approved at: {new Date(estimateRecord.approved_at).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setShowEstimateBuilder(true)}
                      className="bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      View / Edit Quote
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="text-xs text-slate-600 font-medium">
                      No digital quotation sent yet for this job card.
                    </div>
                    <button
                      onClick={() => setShowEstimateBuilder(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      + Create Quotation
                    </button>
                  </div>
                )}
              </div>

              {/* 2. CUSTOMER REPORTED PROBLEMS & COMPLAINTS */}
              <div className="rounded-xl border border-slate-200 p-4 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🚨</span>
                    <h3 className="text-sm font-black text-slate-900">
                      Customer Problem Details
                    </h3>
                  </div>
                  {activeKm && (
                    <span className="bg-amber-100 text-amber-900 text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                      KM: {activeKm}
                    </span>
                  )}
                </div>

                {complaints.length > 0 ? (
                  <div className="space-y-3">
                    {complaints.map((comp, cIdx) => {
                      const parsed = parseProblems(comp.feedback_text)
                      return (
                        <div
                          key={comp.id || cIdx}
                          className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-rose-800">
                              Submission #{cIdx + 1}
                              {comp.service_type ? ` · ${comp.service_type}` : ''}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {comp.complaint_date_time
                                ? new Date(comp.complaint_date_time).toLocaleString('en-IN')
                                : 'Recent'}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {parsed.issues.map((issue, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs text-slate-900">
                                <span className="font-bold text-rose-600">{idx + 1}.</span>
                                <span className="font-semibold leading-relaxed">{issue}</span>
                              </div>
                            ))}
                          </div>

                          {comp.service_advisor_name && (
                            <div className="mt-2 pt-2 border-t border-rose-200/60 text-[11px] text-slate-600">
                              Assigned Advisor: <span className="font-bold">{comp.service_advisor_name}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center">
                    <span className="text-2xl block mb-1">📋</span>
                    <p className="text-xs font-bold text-slate-700">
                      No customer complaints recorded for {activeReg}.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Submissions from the Customer App ("Tell Us Your Problem") will appear here automatically.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="bg-slate-100 px-6 py-3.5 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-black text-white px-5 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Estimate Builder Modal if opened */}
      {showEstimateBuilder && (
        <ServiceEstimateBuilderModal
          isOpen={showEstimateBuilder}
          onClose={() => {
            setShowEstimateBuilder(false)
            void loadDataForVehicle(currentReg)
          }}
          vehicleReg={activeReg}
          customerName={activeOwner}
          customerPhone={activePhone}
          problemDescription={complaints[0]?.feedback_text || 'Regular Service Inspection'}
          complaintId={complaints[0]?.id}
          onEstimateSent={() => {
            setShowEstimateBuilder(false)
            void loadDataForVehicle(currentReg)
          }}
        />
      )}
    </div>
  )
}
