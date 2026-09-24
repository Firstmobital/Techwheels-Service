import { useState, useEffect, useMemo, useRef } from 'react'
import { App as CapApp } from '@capacitor/app'
import { supabase } from '../lib/supabase'
import {
  fetchEstimatesForVehicle,
  updateEstimateApproval,
  type CustomerEstimateRecord,
} from '../lib/estimates'
import {
  fetchIssuedGatePass,
  type IssuedGatePassRecord,
} from '../lib/gatepass'
import {
  fetchVehicleServiceHistory,
  cleanAdvisorPersonName,
  extractKmFromFeedback,
  type CustomerVehicle,
  type PastServiceRecord,
} from '../lib/api/customer'
import {
  customerGetActiveJob,
  customerGetGatePass,
  customerGetServiceHistory,
  customerListEstimates,
  customerSetEstimateDecision,
  customerSubmitComplaint,
  customerSubmitFeedback,
} from '../lib/api/customerAuth'

interface CustomerPortalPageProps {
  vehicle: CustomerVehicle
  allVehicles?: CustomerVehicle[]
  sessionToken?: string | null
  onLogout: () => void
  onSelectVehicle?: (v: CustomerVehicle) => void
}

type CustomerTab = 'dashboard' | 'estimate' | 'complaint' | 'escalation' | 'feedback'

export interface CustomerConcernRecord {
  id: string | number
  created_at: string
  problems: string[]
  additional_notes?: string | null
  advisor_solution?: string | null
  advisor_name?: string | null
  status?: string
}

interface ProblemItem {
  id: string
  text: string
}

export default function CustomerPortalPage({
  vehicle: initialVehicle,
  allVehicles = [],
  sessionToken = null,
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

  // Permanent Service History Records (Lifetime past visits)
  const [serviceHistory, setServiceHistory] = useState<PastServiceRecord[]>([])
  const [_loadingHistory, setLoadingHistory] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  // Online Payment Settlement Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Official Vehicle Gatepass Modal & Accounts Clearance State
  const [issuedGatePass, setIssuedGatePass] = useState<IssuedGatePassRecord | null>(null)
  const [showGatepassModal, setShowGatepassModal] = useState(false)
  const [showPendingApprovalModal, setShowPendingApprovalModal] = useState(false)

  // Multi-Problem List State (Customer Problem Submission)
  const [problemList, setProblemList] = useState<ProblemItem[]>([
    { id: 'prob-1', text: '' },
  ])
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [complaintSubmitting, setComplaintSubmitting] = useState(false)
  const [complaintSuccess, setComplaintSuccess] = useState(false)
  const [reportedConcerns, setReportedConcerns] = useState<CustomerConcernRecord[]>([])
  const [_loadingConcerns, setLoadingConcerns] = useState(false)

  // Voice Input Speech-to-Text State (Continuous until user manually stops)
  const [isListening, setIsListening] = useState(false)
  const [listeningTarget, setListeningTarget] = useState<string | null>(null)
  const [voiceStatusMsg, setVoiceStatusMsg] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const isUserActiveListeningRef = useRef<boolean>(false)
  const listeningTargetRef = useRef<string | null>(null)
  const initialBaseTextRef = useRef<string>('')
  const accumulatedFinalRef = useRef<string>('')

  // Feedback states
  const [rating, setRating] = useState(5)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState(false)

  // Escalation Matrix Form State (Pre-service Call & Mail)
  const [escalationTarget, setEscalationTarget] = useState<'crm' | 'sm' | 'gm' | 'tataccm' | 'tataregional'>('crm')
  const [escalationSubject, setEscalationSubject] = useState('')
  const [escalationMessage, setEscalationMessage] = useState('')
  const [escalationSubmitting, setEscalationSubmitting] = useState(false)
  const [escalationSuccess, setEscalationSuccess] = useState(false)

  // Multi-vehicle modal
  const [showVehiclePicker, setShowVehiclePicker] = useState(false)

  // 3-Line Hamburger Slide-Over Menu Drawer
  const [showMenuDrawer, setShowMenuDrawer] = useState(false)

  // Interactive Service Stage Details Modal State (0: Intake, 1: Job Card, 2: Estimate, 3: Repairs, 4: Ready)
  const [selectedStageModal, setSelectedStageModal] = useState<number | null>(null)

  // Sync initial vehicle update
  useEffect(() => {
    setVehicle(initialVehicle)
  }, [initialVehicle])

  const activeTabRef = useRef<CustomerTab>(activeTab)
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  // ── BACK BUTTON HANDLING: Go to Overview (Home) tab if inside any sub-window ──
  useEffect(() => {
    let listenerHandle: any = null

    // 1. Native Android Hardware/Gesture Back Button Listener via Capacitor
    try {
      CapApp.addListener('backButton', () => {
        if (selectedStageModal !== null) {
          setSelectedStageModal(null)
        } else if (showMenuDrawer) {
          setShowMenuDrawer(false)
        } else if (showPendingApprovalModal) {
          setShowPendingApprovalModal(false)
        } else if (showGatepassModal) {
          setShowGatepassModal(false)
        } else if (showPaymentModal) {
          setShowPaymentModal(false)
        } else if (showHistoryModal) {
          setShowHistoryModal(false)
        } else if (showVehiclePicker) {
          setShowVehiclePicker(false)
        } else if (activeTabRef.current !== 'dashboard') {
          setActiveTab('dashboard')
        } else {
          CapApp.exitApp()
        }
      }).then((handle) => {
        listenerHandle = handle
      }).catch((err) => {
        console.warn('Capacitor backButton setup error:', err)
      })
    } catch (e) {
      console.warn('CapApp listener error:', e)
    }

    // 2. Browser History fallback
    const handlePopState = (e: PopStateEvent) => {
      if (selectedStageModal !== null) {
        setSelectedStageModal(null)
      } else if (showPendingApprovalModal) {
        setShowPendingApprovalModal(false)
      } else if (showGatepassModal) {
        setShowGatepassModal(false)
      } else if (showPaymentModal) {
        setShowPaymentModal(false)
      } else if (showHistoryModal) {
        setShowHistoryModal(false)
      } else if (activeTabRef.current !== 'dashboard') {
        e.preventDefault()
        setActiveTab('dashboard')
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove()
      }
      window.removeEventListener('popstate', handlePopState)
    }
  }, [selectedStageModal, showPendingApprovalModal, showGatepassModal, showPaymentModal, showHistoryModal, showMenuDrawer, showVehiclePicker])

  // Sync browser history state when activeTab changes
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      window.history.pushState({ tab: activeTab }, '', window.location.href)
    }
  }, [activeTab])

  // Load Live Estimates from Supabase
  async function loadVehicleEstimates() {
    if (!vehicle.reg_number) return
    setLoadingEstimates(true)
    try {
      if (sessionToken) {
        const list = await customerListEstimates(sessionToken, vehicle.reg_number)
        setLiveEstimates(
          list
            .map((row): CustomerEstimateRecord | null => {
              const estimateNo = String(row.estimate_no || row.estimate_id || '')
              if (!estimateNo) return null
              return {
                estimate_no: estimateNo,
                vehicle_registration_number: String(row.reg_number || row.vehicle_registration_number || vehicle.reg_number),
                items: Array.isArray(row.items) ? (row.items as CustomerEstimateRecord['items']) : [],
                subtotal: Number(row.subtotal || 0),
                discount: Number(row.discount || 0),
                gst_tax: Number(row.gst_tax || 0),
                grand_total: Number(row.grand_total || 0),
                status: (row.status as CustomerEstimateRecord['status']) || 'Sent',
                created_at: (row.created_at as string | null) || null,
              }
            })
            .filter((row): row is CustomerEstimateRecord => row !== null)
        )
        return
      }
      const list = await fetchEstimatesForVehicle(vehicle.reg_number)
      setLiveEstimates(list)
    } catch (err) {
      console.warn('Failed to fetch vehicle estimates:', err)
    } finally {
      setLoadingEstimates(false)
    }
  }

  // Load Lifetime Vehicle Service History
  async function loadServiceHistory() {
    if (!vehicle.reg_number) return
    setLoadingHistory(true)
    try {
      if (sessionToken) {
        const hist = await customerGetServiceHistory(sessionToken, vehicle.reg_number)
        setServiceHistory(
          hist.map((row) => ({
            id: String(row.id || ''),
            service_date: row.service_date
              ? new Date(String(row.service_date)).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Completed',
            jc_number: String(row.jc_number || ''),
            service_type: String(row.service_type || 'Service'),
            km_reading: row.km_reading == null ? null : Number(row.km_reading),
            service_advisor: String(row.service_advisor || ''),
            total_amount: row.total_amount == null ? 0 : Number(row.total_amount),
            status: String(row.status || 'Delivered') === 'In service' ? 'Completed' : 'Delivered',
            invoice_no: (row.invoice_no as string | null) || null,
          })) as PastServiceRecord[]
        )
        return
      }
      const hist = await fetchVehicleServiceHistory(vehicle.reg_number)
      setServiceHistory(hist)
    } catch (err) {
      console.warn('Failed to fetch service history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  // ── DYNAMIC DATABASE FETCH: LIVE CUSTOMER REPORTED CONCERNS & ADVISOR SOLUTIONS ──
  async function loadCustomerReportedConcerns() {
    if (!vehicle.reg_number && !vehicle.owner_phone) return
    setLoadingConcerns(true)
    const regNorm = (vehicle.reg_number || '').trim().toUpperCase().replace(/\s+/g, '')
    const phoneNorm = (vehicle.owner_phone || '').replace(/[^0-9]/g, '').slice(-10)

    try {
      const orParts: string[] = []
      if (regNorm) {
        orParts.push(`vehicle_registration_number.ilike.%${regNorm}%`)
        orParts.push(`feedback_text.ilike.%${regNorm}%`)
      }
      if (phoneNorm) {
        orParts.push(`mobile_number.ilike.%${phoneNorm}%`)
      }

      if (orParts.length > 0) {
        const { data, error } = await supabase
          .from('post_feedback_bot_data')
          .select('*')
          .or(orParts.join(','))
          .order('created_at', { ascending: false })
          .limit(30)

        if (!error && data) {
          const concernRows = data.filter(
            (r) =>
              r.mode === 'customer_portal_concern' ||
              r.mode === 'customer_complaint' ||
              (r.service_type && r.service_type.toLowerCase().includes('issues')) ||
              (r.service_type && r.service_type.toLowerCase().includes('concern')) ||
              (r.feedback_text && (r.feedback_text.includes('Point 1:') || r.feedback_text.includes('"problems":')))
          )

          const parsedList: CustomerConcernRecord[] = []

          for (const row of concernRows) {
            let problems: string[] = []
            let notes: string | null = null
            let solution: string | null = null
            let advisorName: string | null = cleanAdvisorPersonName(row.service_advisor_name) || null
            let status = 'Inspection in Progress'

            const text = row.feedback_text || ''

            if (text.startsWith('{') && text.endsWith('}')) {
              try {
                const parsed = JSON.parse(text)
                if (Array.isArray(parsed.problems)) {
                  problems = parsed.problems.filter(Boolean)
                }
                if (parsed.additional_notes) notes = parsed.additional_notes
                if (parsed.advisor_solution || parsed.solution || parsed.action_taken) {
                  solution = parsed.advisor_solution || parsed.solution || parsed.action_taken
                }
                if (parsed.advisor_name || parsed.sa_name) {
                  advisorName = cleanAdvisorPersonName(parsed.advisor_name || parsed.sa_name) || advisorName
                }
                if (parsed.status) status = parsed.status
              } catch {}
            }

            if (problems.length === 0 && text) {
              const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
              for (const line of lines) {
                if (line.match(/^Point\s*\d+:\s*(.*)/i)) {
                  const m = line.match(/^Point\s*\d+:\s*(.*)/i)
                  if (m && m[1]) problems.push(m[1].trim())
                } else if (line.match(/^Additional Notes:\s*(.*)/i)) {
                  const m = line.match(/^Additional Notes:\s*(.*)/i)
                  if (m && m[1]) notes = m[1].trim()
                } else if (line.match(/^(?:Solution|Advisor Reply|Action Taken):\s*(.*)/i)) {
                  const m = line.match(/^(?:Solution|Advisor Reply|Action Taken):\s*(.*)/i)
                  if (m && m[1]) solution = m[1].trim()
                } else if (!line.startsWith('{')) {
                  problems.push(line)
                }
              }
            }

            if (problems.length > 0 || notes) {
              parsedList.push({
                id: row.id || `con-${Date.now()}-${Math.random()}`,
                created_at: row.complaint_date_time || row.created_at || new Date().toISOString(),
                problems: problems.length > 0 ? problems : [notes || 'Customer Concern'],
                additional_notes: notes,
                advisor_solution: solution,
                advisor_name: advisorName || cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || null,
                status: solution ? 'Resolved & Tested' : status,
              })
            }
          }

          setReportedConcerns(parsedList)
        }
      }
    } catch (err) {
      console.warn('loadCustomerReportedConcerns error:', err)
    } finally {
      setLoadingConcerns(false)
    }
  }

  // ── DYNAMIC DATABASE FETCH: LIVE SERVICE ADVISOR NAME, RECEPTION INTAKE KM, JOB CARD & GATEPASS ──
  async function loadLiveAdvisorAndJobCard() {
    if (!vehicle.reg_number && !vehicle.owner_phone) return
    const regNorm = (vehicle.reg_number || '').trim().toUpperCase().replace(/\s+/g, '')
    const phoneNorm = (vehicle.owner_phone || '').replace(/[^0-9]/g, '').slice(-10)

    try {
      let liveSa: string | null = null
      let liveJc: string | null = null
      let liveKm: number | null = null
      let liveServiceType: string | null = null
      let liveInvoiceDoneAt: string | null = null
      let liveGatePassIssued = false
      let liveGatePassNo: string | null = null

      if (sessionToken && vehicle.reg_number) {
        const active = await customerGetActiveJob(sessionToken, vehicle.reg_number)
        const job = active.job
        if (job) {
          liveSa = cleanAdvisorPersonName((job.sa_display_name as string) || (job.sa_name as string)) 
          liveJc = (job.jc_number as string | null) || null
          liveKm = job.km_reading == null ? null : Number(job.km_reading)
          liveServiceType = (job.service_type as string | null) || null
          liveInvoiceDoneAt = (job.invoice_done_at as string | null) || null
        }
        const gp = await customerGetGatePass(sessionToken, vehicle.reg_number)
        if (gp && gp.gate_pass_no) {
          liveGatePassIssued = true
          liveGatePassNo = String(gp.gate_pass_no)
        }
        setVehicle((prev) => ({
          ...prev,
          sa_name: liveSa || prev.sa_name,
          sa_display_name: liveSa || prev.sa_display_name,
          jc_number: liveJc || prev.jc_number,
          km_reading: liveKm != null && liveKm > 0 ? liveKm : prev.km_reading,
          service_type: liveServiceType || prev.service_type,
          invoice_done_at: liveInvoiceDoneAt || prev.invoice_done_at,
          gate_pass_issued: liveGatePassIssued || prev.gate_pass_issued,
          gate_pass_number: liveGatePassNo || prev.gate_pass_number,
        }))
        return
      }

      // 1. PRIMARY RECEPTION INTAKE SYNC: post_feedback_bot_data with mode 'service_advisor_sync_payload'
      // Strictly represents what Reception / Advisor entered on check-in
      if (regNorm || phoneNorm) {
        const orParts: string[] = []
        if (regNorm) {
          orParts.push(`vehicle_registration_number.ilike.%${regNorm}%`)
          orParts.push(`feedback_text.ilike.%${regNorm}%`)
        }
        if (phoneNorm) {
          orParts.push(`mobile_number.ilike.%${phoneNorm}%`)
          orParts.push(`feedback_text.ilike.%${phoneNorm}%`)
        }
        const { data: fbData } = await supabase
          .from('post_feedback_bot_data')
          .select('*')
          .or(orParts.join(','))
          .order('created_at', { ascending: false })
          .limit(20)

        if (fbData && fbData.length > 0) {
          const sortedFb = [...fbData].sort((a, b) => {
            if (a.mode === 'service_advisor_sync_payload' && b.mode !== 'service_advisor_sync_payload') return -1
            if (b.mode === 'service_advisor_sync_payload' && a.mode !== 'service_advisor_sync_payload') return 1
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          })

          for (const item of sortedFb) {
            const itemSa = cleanAdvisorPersonName(item.service_advisor_name)
            if (!liveSa && itemSa) {
              liveSa = itemSa
            }
            if (liveKm == null) {
              const kmParsed = extractKmFromFeedback(item)
              if (kmParsed != null && kmParsed > 0) {
                liveKm = kmParsed
              }
            }
            if (item.feedback_text && item.feedback_text.startsWith('{')) {
              try {
                const p = JSON.parse(item.feedback_text)
                const candidateSa = cleanAdvisorPersonName(p.sa_name || p.service_advisor_name || p.advisor_name)
                if (!liveSa && candidateSa) liveSa = candidateSa

                const candidateJc = (p.jc_number || p.job_card_no || p.job_card_number || p.job_card || p.jc)?.trim()
                if (!liveJc && candidateJc) liveJc = candidateJc.toUpperCase()

                if (liveKm == null && (p.km_reading || p.km || p.kms || p.kms_driven || p.odometer)) {
                  const kmNum = Number(p.km_reading || p.km || p.kms || p.kms_driven || p.odometer)
                  if (!isNaN(kmNum) && kmNum > 0) liveKm = kmNum
                }
                if (!liveServiceType && (p.service_type || item.service_type)) {
                  liveServiceType = p.service_type || item.service_type
                }
              } catch {
                // ignore
              }
            } else if (item.feedback_text) {
              const matchJc = item.feedback_text.match(/(?:JC|Job\s*Card|JobCard|JC\s*Number|JC\s*No)[-:\s#]+([A-Z0-9-]+)/i)
              if (!liveJc && matchJc && matchJc[1]) liveJc = matchJc[1].toUpperCase()
            }
          }
        }
      }

      // 2. Direct Reception Table: get_customer_live_intake RPC & service_reception_entries
      if (regNorm || phoneNorm) {
        try {
          const { data: rpcData } = await supabase.rpc('get_customer_live_intake', { p_search: regNorm || phoneNorm })
          if (rpcData && rpcData.length > 0) {
            for (const r of rpcData) {
              if (!liveJc && r.jc_number) liveJc = String(r.jc_number).trim().toUpperCase()
              if (!liveSa && (r.sa_display_name || r.sa_name)) {
                const cand = cleanAdvisorPersonName(r.sa_display_name || r.sa_name)
                if (cand) liveSa = cand
              }
              if (liveKm == null && r.km_reading != null && Number(r.km_reading) > 0) {
                liveKm = Number(r.km_reading)
              }
              if (!liveServiceType && r.service_type) liveServiceType = r.service_type
              if (!liveInvoiceDoneAt && r.invoice_done_at) liveInvoiceDoneAt = r.invoice_done_at
            }
          }
        } catch {
          // ignore RPC
        }

        const orParts: string[] = []
        if (regNorm) {
          orParts.push(`reg_number.ilike.%${regNorm}%`)
          orParts.push(`jc_number.ilike.%${regNorm}%`)
        }
        if (phoneNorm) {
          orParts.push(`owner_phone.ilike.%${phoneNorm}%`)
        }

        const { data: recData } = await supabase
          .from('service_reception_entries')
          .select('*')
          .or(orParts.join(','))
          .order('created_at', { ascending: false })
          .limit(10)

        if (recData && recData.length > 0) {
          for (const r of recData) {
            if (!liveJc) {
              const rawJc = (r.jc_number || r.job_card_number || r.job_card_no || r.jc)?.trim()
              if (rawJc) liveJc = rawJc.toUpperCase()
            }
            if (!liveSa && (r.sa_display_name || r.sa_name)) {
              const cand = cleanAdvisorPersonName(r.sa_display_name || r.sa_name)
              if (cand) liveSa = cand
            }
            if (liveKm == null && r.km_reading != null && Number(r.km_reading) > 0) {
              liveKm = Number(r.km_reading)
            }
            if (!liveServiceType && r.service_type) {
              liveServiceType = r.service_type
            }
            if (!liveInvoiceDoneAt && r.invoice_done_at) {
              liveInvoiceDoneAt = r.invoice_done_at
            }
            if (r.gate_pass_issued) {
              liveGatePassIssued = true
              liveGatePassNo = r.gate_pass_number || liveGatePassNo
            }
          }
        }
      }

      // 3. Check customer_estimates for assigned SA name, JC number, & latest km_reading
      if (regNorm) {
        const { data: estData } = await supabase
          .from('customer_estimates')
          .select('estimate_no, service_advisor_name, km_reading, items')
          .ilike('vehicle_registration_number', `%${regNorm}%`)
          .order('created_at', { ascending: false })
          .limit(5)

        if (estData && estData.length > 0) {
          for (const est of estData) {
            if (!liveSa && est.service_advisor_name) {
              const cand = cleanAdvisorPersonName(est.service_advisor_name)
              if (cand) liveSa = cand
            }
            if (liveKm == null && est.km_reading != null && Number(est.km_reading) > 0) {
              liveKm = Number(est.km_reading)
            }
            if (!liveJc && est.estimate_no) {
              const matchJc = est.estimate_no.match(/JC-?([0-9A-Z]+)/i)
              if (matchJc && matchJc[1]) liveJc = matchJc[1].toUpperCase()
            }
          }
        }
      }

      // 4. Check job_card_closed_data for missing JC number / SA name
      if (!liveJc || !liveSa) {
        if (regNorm) {
          const { data: jcData } = await supabase
            .from('job_card_closed_data')
            .select('job_card_number, vehicle_registration_number, sr_assigned_to, closed_date_time, sr_type')
            .ilike('vehicle_registration_number', `%${regNorm}%`)
            .order('closed_date_time', { ascending: false })
            .limit(5)

          if (jcData && jcData.length > 0) {
            for (const j of jcData) {
              if (!liveJc && j.job_card_number) liveJc = String(j.job_card_number).trim().toUpperCase()
              if (!liveSa && j.sr_assigned_to) {
                const cand = cleanAdvisorPersonName(j.sr_assigned_to)
                if (cand) liveSa = cand
              }
              if (!liveServiceType && j.sr_type) liveServiceType = j.sr_type
            }
          }
        }
      }

      // 5. Only fallback to all_service_data if KM was NOT found anywhere in active reception or post_feedback
      if (liveKm == null && regNorm && (!vehicle.km_reading || vehicle.km_reading <= 0)) {
        const { data: allKmData } = await supabase
          .from('all_service_data')
          .select('kms_driven, kms, last_service_km')
          .or(`vehicle_registration_number.ilike.%${regNorm}%,reg_no.ilike.%${regNorm}%`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (allKmData && allKmData.length > 0) {
          const rawKm = allKmData[0].last_service_km || allKmData[0].kms_driven || allKmData[0].kms
          if (rawKm) {
            const parsedKm = Number(String(rawKm).replace(/[^0-9]/g, ''))
            if (!isNaN(parsedKm) && parsedKm > 0) liveKm = parsedKm
          }
        }
      }

      // 6. Fetch official Accounts Gatepass clearance
      if (regNorm) {
        try {
          const gp = await fetchIssuedGatePass(regNorm)
          if (gp && gp.gate_pass_no) {
            setIssuedGatePass(gp)
            liveGatePassIssued = true
            liveGatePassNo = gp.gate_pass_no
            if (gp.job_card_no && !liveJc) liveJc = gp.job_card_no
          }
        } catch (gpErr) {
          console.warn('fetchIssuedGatePass error in portal:', gpErr)
        }
      }

      const cleanSaName = liveSa ? cleanAdvisorPersonName(liveSa) : null

      setVehicle((prev) => {
        const nextVeh: CustomerVehicle = {
          ...prev,
          sa_name: cleanSaName !== null ? cleanSaName : (cleanAdvisorPersonName(prev.sa_name) || null),
          sa_display_name: cleanSaName !== null ? cleanSaName : (cleanAdvisorPersonName(prev.sa_display_name) || null),
          jc_number: liveJc || prev.jc_number,
          km_reading: liveKm != null ? liveKm : prev.km_reading,
          service_type: liveServiceType || prev.service_type,
          invoice_done_at: liveInvoiceDoneAt || prev.invoice_done_at,
          gate_pass_issued: liveGatePassIssued || prev.gate_pass_issued,
          gate_pass_number: liveGatePassNo || prev.gate_pass_number,
        }
        try {
          localStorage.setItem('active_customer_vehicle', JSON.stringify(nextVeh))
        } catch (e) {
          console.warn('Failed to persist active_customer_vehicle:', e)
        }
        return nextVeh
      })
    } catch (err) {
      console.warn('loadLiveAdvisorAndJobCard error:', err)
    }
  }

  // Live Allocated Service Technician & Workshop Bay from Floor Incharge
  const [allocatedTechnician, setAllocatedTechnician] = useState<{
    name: string
    code?: string | null
    bay_no?: string | null
    assigned_at?: string | null
    work_status?: string | null
    out_ts?: string | null
    time_diff?: string | null
    remark?: string | null
  } | null>(null)

  async function loadIssuedGatepass() {
    if (!vehicle.reg_number) return
    try {
      if (sessionToken) {
        const pass = await customerGetGatePass(sessionToken, vehicle.reg_number)
        if (pass && pass.gate_pass_no) {
          setIssuedGatePass(pass as unknown as IssuedGatePassRecord)
          return
        }
      }
      const gp = await fetchIssuedGatePass(vehicle.reg_number)
      if (gp) {
        setIssuedGatePass(gp)
      }
    } catch (err) {
      console.warn('loadIssuedGatepass error:', err)
    }
  }

  async function loadAllocatedTechnician() {
    if (!vehicle.reg_number && !vehicle.jc_number && !vehicle.owner_phone) return
    const regNorm = (vehicle.reg_number || '').trim().toUpperCase().replace(/\s+/g, '')
    const jcNorm = (vehicle.jc_number || '').trim().toUpperCase()
    const phoneNorm = (vehicle.owner_phone || '').replace(/[^0-9]/g, '').slice(-10)

    try {
      // 1. PRIMARY SOURCE: Direct technician_assignments from Floor Incharge
      if (jcNorm) {
        const lastDigits = jcNorm.replace(/[^0-9]/g, '').slice(-6)
        const orClause = lastDigits ? `job_card_number.eq.${jcNorm},job_card_number.ilike.%${lastDigits}%` : `job_card_number.eq.${jcNorm}`
        const { data: assignData, error: assignError } = await supabase
          .from('technician_assignments')
          .select('*')
          .or(orClause)
          .order('id', { ascending: false })
          .limit(1)

        if (!assignError && assignData && assignData.length > 0) {
          const row = assignData[0]
          if (row.technician_name && row.technician_name.toLowerCase() !== 'not required') {
            setAllocatedTechnician({
              name: row.technician_name,
              code: row.technician_code,
              bay_no: row.bay_no,
              assigned_at: row.assigned_at,
              work_status: row.work_status,
              out_ts: row.out_ts,
              time_diff: row.time_diff,
              remark: row.remark,
            })
            return
          }
        }
      }

      // 2. Check post_feedback_bot_data for live Floor Incharge technician allocation payload
      const orParts: string[] = []
      if (regNorm) orParts.push(`vehicle_registration_number.ilike.%${regNorm}%`)
      if (phoneNorm) orParts.push(`mobile_number.ilike.%${phoneNorm}%`)

      if (orParts.length > 0) {
        const { data, error } = await supabase
          .from('post_feedback_bot_data')
          .select('*')
          .eq('mode', 'technician_allocation_payload')
          .or(orParts.join(','))
          .order('complaint_date_time', { ascending: false })
          .limit(1)

        if (!error && data && data.length > 0) {
          const row = data[0]
          try {
            const parsed = JSON.parse(row.feedback_text)
            if (parsed.technician_name && parsed.technician_name.toLowerCase() !== 'not required') {
              setAllocatedTechnician({
                name: parsed.technician_name,
                code: parsed.technician_code,
                bay_no: parsed.bay_no,
                assigned_at: parsed.assigned_at,
                work_status: parsed.status,
                remark: parsed.remark || null,
              })
              return
            }
          } catch {
            if (row.service_advisor_name && row.service_advisor_name.toLowerCase() !== 'not required') {
              setAllocatedTechnician({
                name: row.service_advisor_name,
                bay_no: null,
              })
              return
            }
          }
        }
      }

      // 3. Check service_reception_entries for suggested_technician_name
      if (regNorm) {
        const { data: recData } = await supabase
          .from('service_reception_entries')
          .select('suggested_technician_name, suggested_technician_code, jc_number')
          .eq('reg_number', regNorm)
          .not('suggested_technician_name', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)

        if (recData && recData[0]?.suggested_technician_name) {
          setAllocatedTechnician({
            name: recData[0].suggested_technician_name,
            code: recData[0].suggested_technician_code,
          })
          return
        }
      }
    } catch (err) {
      console.warn('Failed to load allocated technician:', err)
    }
  }

  useEffect(() => {
    void loadVehicleEstimates()
    void loadServiceHistory()
    void loadAllocatedTechnician()
    void loadIssuedGatepass()
    void loadLiveAdvisorAndJobCard()
    void loadCustomerReportedConcerns()

    const channel = supabase
      .channel(`cust-portal-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technician_assignments' },
        () => {
          void loadAllocatedTechnician()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_estimates' },
        () => {
          void loadVehicleEstimates()
          void loadLiveAdvisorAndJobCard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_reception_entries' },
        () => {
          void loadVehicleEstimates()
          void loadAllocatedTechnician()
          void loadIssuedGatepass()
          void loadLiveAdvisorAndJobCard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void loadVehicleEstimates()
          void loadServiceHistory()
          void loadAllocatedTechnician()
          void loadIssuedGatepass()
          void loadLiveAdvisorAndJobCard()
          void loadCustomerReportedConcerns()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_card_closed_data' },
        () => {
          void loadServiceHistory()
          void loadLiveAdvisorAndJobCard()
        }
      )
      .subscribe()

    function handleEstimateBroadcast() {
      void loadVehicleEstimates()
      void loadLiveAdvisorAndJobCard()
    }

    function handleGatepassBroadcast() {
      void loadIssuedGatepass()
      void loadLiveAdvisorAndJobCard()
    }

    window.addEventListener('techwheels_estimate_updated', handleEstimateBroadcast)
    window.addEventListener('techwheels_gatepass_issued', handleGatepassBroadcast)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_estimate_updated', handleEstimateBroadcast)
      window.removeEventListener('techwheels_gatepass_issued', handleGatepassBroadcast)
    }
  }, [vehicle.reg_number])

  // Active latest estimate from Advisor
  const latestLiveEstimate = liveEstimates.length > 0 ? liveEstimates[0] : null

  // Handle Customer Approval of Estimate
  async function handleApprove(est: CustomerEstimateRecord) {
    setApprovingEstNo(est.estimate_no)
    try {
      if (sessionToken) {
        await customerSetEstimateDecision(sessionToken, est.estimate_no, 'approve')
      } else {
        await updateEstimateApproval(est.estimate_no, 'Approved')
      }
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
      if (sessionToken) {
        await customerSetEstimateDecision(sessionToken, est.estimate_no, 'reject', rejectReason.trim())
      } else {
        await updateEstimateApproval(est.estimate_no, 'Rejected', rejectReason.trim())
      }
      setShowRejectBox(false)
      setRejectReason('')
      await loadVehicleEstimates()
    } catch (err) {
      console.error('Estimate rejection error:', err)
    } finally {
      setRejectingEstNo(null)
    }
  }

  // Multi-problem helpers (Clean & category-free)
  function addProblemRow(initialText = '') {
    setProblemList((prev) => [
      ...prev,
      { id: `prob-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, text: initialText },
    ])
  }

  function removeProblemRow(id: string) {
    if (problemList.length <= 1) {
      setProblemList([{ id: `prob-${Date.now()}`, text: '' }])
      return
    }
    setProblemList((prev) => prev.filter((p) => p.id !== id))
  }

  function updateProblemRow(id: string, value: string) {
    setProblemList((prev) =>
      prev.map((p) => (p.id === id ? { ...p, text: value } : p))
    )
  }

  // ── ROBUST CONTINUOUS VOICE SPEECH-TO-TEXT (बोल कर प्रॉब्लम बताएं - जब तक बंद न करें तब तक चले) ──
  function stopVoiceRecognition() {
    isUserActiveListeningRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {}
    setIsListening(false)
    setListeningTarget(null)
    setVoiceStatusMsg(null)
  }

  async function startVoiceRecognition(targetId: string = 'notes') {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition

    // If currently listening to this exact target, toggle stop
    if (isListening && listeningTarget === targetId) {
      stopVoiceRecognition()
      return
    }

    // If listening to a different target, stop previous first
    if (isListening) {
      stopVoiceRecognition()
    }

    // Pre-request microphone stream so browser & Android WebView grant permission automatically
    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      }
    } catch (permErr) {
      console.warn('Microphone permission pre-check:', permErr)
    }

    if (!SpeechRecognition) {
      alert('Voice Speech Recognition is not supported on this browser/device. Please type your concerns.')
      return
    }

    try {
      let currentFieldText = ''
      if (targetId === 'notes') {
        currentFieldText = additionalNotes.trim()
      } else {
        const row = problemList.find((p) => p.id === targetId)
        currentFieldText = row ? row.text.trim() : ''
      }
      initialBaseTextRef.current = currentFieldText
      accumulatedFinalRef.current = ''
      listeningTargetRef.current = targetId
      isUserActiveListeningRef.current = true

      const recognition = new SpeechRecognition()
      recognitionRef.current = recognition
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'hi-IN' // Seamlessly transcribes Hindi, English & mixed Hinglish

      setIsListening(true)
      setListeningTarget(targetId)
      setVoiceStatusMsg('🔴 Mic चालू है (हिंदी / English में बोलते रहें - बंद करने के लिए ⏹️ Stop दबाएं)')

      recognition.onresult = (event: any) => {
        let sessionFinal = ''
        let sessionInterim = ''

        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i]
          if (res.isFinal) {
            sessionFinal += res[0].transcript + ' '
          } else {
            sessionInterim += res[0].transcript
          }
        }

        accumulatedFinalRef.current = sessionFinal

        const prefix = initialBaseTextRef.current ? `${initialBaseTextRef.current} ` : ''
        const fullText = `${prefix}${sessionFinal}${sessionInterim}`.replace(/\s+/g, ' ').trim()

        const currentTarget = listeningTargetRef.current || targetId
        if (currentTarget === 'notes') {
          setAdditionalNotes(fullText)
        } else {
          updateProblemRow(currentTarget, fullText)
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition event:', event.error)
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          isUserActiveListeningRef.current = false
          setIsListening(false)
          setListeningTarget(null)
          setVoiceStatusMsg('⚠️ Mic Permission Denied. Please enable microphone.')
        } else if (event.error === 'no-speech') {
          // Do NOT stop listening! Keep alive while user pauses.
          setVoiceStatusMsg('🎤 Listening... (हिंदी / English में बोलते रहें)')
        } else {
          setVoiceStatusMsg('🎤 Continuous recording active... (बोलते रहें)')
        }
      }

      recognition.onend = () => {
        // CONTINUOUS MODE: If user did NOT explicitly stop, automatically restart so mic stays recording!
        if (isUserActiveListeningRef.current) {
          try {
            if (accumulatedFinalRef.current) {
              const prefix = initialBaseTextRef.current ? `${initialBaseTextRef.current} ` : ''
              initialBaseTextRef.current = `${prefix}${accumulatedFinalRef.current}`.trim()
              accumulatedFinalRef.current = ''
            }
            recognition.start()
          } catch (restartErr) {
            console.warn('Speech recognition auto-restart error:', restartErr)
            setTimeout(() => {
              if (isUserActiveListeningRef.current) {
                try {
                  recognition.start()
                } catch {}
              }
            }, 300)
          }
        } else {
          setIsListening(false)
          setListeningTarget(null)
          setVoiceStatusMsg(null)
        }
      }

      recognition.start()
    } catch (err: any) {
      console.error('Speech recognition start failed:', err)
      isUserActiveListeningRef.current = false
      setIsListening(false)
      setListeningTarget(null)
      setVoiceStatusMsg(null)
      alert('Could not start microphone. Please check app permissions.')
    }
  }

  // Handle Multi-Problem & Voice Concerns Submission
  async function handleProblemSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validProblems = problemList
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0)

    if (validProblems.length === 0 && !additionalNotes.trim()) {
      alert('Kripya kam se kam ek problem dalein ya bol kar batayein.')
      return
    }

    setComplaintSubmitting(true)
    try {
      const allProblemsText = [
        ...validProblems.map((p, idx) => `Point ${idx + 1}: ${p}`),
        additionalNotes.trim() ? `Additional Notes: ${additionalNotes.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      if (sessionToken) {
        await customerSubmitComplaint(sessionToken, vehicle.reg_number, {
          problems: validProblems,
          notes: additionalNotes.trim(),
          text: allProblemsText,
          owner_name: vehicle.owner_name,
          service_type: 'Customer Reported Issues',
          sa_name: vehicle.sa_name,
          branch: vehicle.branch,
          model: vehicle.model,
        })
      } else {
        const botRow = {
          vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
          customer_name: vehicle.owner_name || 'Customer',
          mobile_number: vehicle.owner_phone || null,
          rating: 4,
          feedback_text: allProblemsText,
          service_type: 'Customer Reported Issues',
          service_advisor_name: vehicle.sa_name || null,
          branch: vehicle.branch || null,
          mode: 'customer_portal_concern',
          complaint_date_time: new Date().toISOString(),
        }
        await supabase.from('post_feedback_bot_data').insert([botRow])
      }

      setComplaintSuccess(true)
      setProblemList([{ id: `prob-${Date.now()}`, text: '' }])
      setAdditionalNotes('')
      await loadCustomerReportedConcerns()
      setTimeout(() => setComplaintSuccess(false), 5000)
    } catch (err) {
      console.error('Problem submit error:', err)
      alert('Error sending issues. Please check internet connection.')
    } finally {
      setComplaintSubmitting(false)
    }
  }

  // Handle Feedback Submission
  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!feedbackText.trim()) return

    setFeedbackSubmitting(true)
    try {
      if (sessionToken) {
        await customerSubmitFeedback(sessionToken, vehicle.reg_number, {
          text: feedbackText.trim(),
          rating,
          owner_name: vehicle.owner_name,
          service_type: vehicle.service_type || 'General Service',
          sa_name: vehicle.sa_name,
          branch: vehicle.branch,
          model: vehicle.model,
        })
      } else {
        const botRow = {
          vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
          customer_name: vehicle.owner_name || 'Customer',
          mobile_number: vehicle.owner_phone || null,
          rating,
          feedback_text: feedbackText.trim(),
          service_type: vehicle.service_type || 'General Service',
          service_advisor_name: vehicle.sa_name || null,
          branch: vehicle.branch || null,
          mode: 'customer_portal_feedback',
          complaint_date_time: new Date().toISOString(),
        }
        await supabase.from('post_feedback_bot_data').insert([botRow])
      }
      setFeedbackSuccess(true)
      setFeedbackText('')
      setTimeout(() => setFeedbackSuccess(false), 5000)
    } catch (err) {
      console.error('Feedback submit error:', err)
      alert('Error submitting review. Please try again.')
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  // ── OFFICIAL HELPDESK & ESCALATION MATRIX CONTACT CONFIGURATION ──
  const dealershipEscalationTiers = [
    {
      level: 'Level 1: Customer Relationship Manager',
      title: 'Payal Makhija',
      role: 'Customer Relationship Manager (CRM)',
      desc: 'Vehicle service queries, appointment coordination, delay issues & immediate customer support.',
      phone: '9116667296',
      email: 'Crmservice@techwheels.in',
      whatsapp: '9116667296',
      badge: 'Level 1 · CRM Desk',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      icon: '👩‍💼',
    },
    {
      level: 'Level 2: Service Manager',
      title: 'Govind Singh',
      role: 'Service Manager (Workshop Operations)',
      desc: 'Technical disputes, estimation queries, repair quality oversight & workshop floor management.',
      phone: '9116667274',
      email: 'service@techwheels.in',
      whatsapp: '9116667274',
      badge: 'Level 2 · Service Head',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: '👨‍💼',
    },
    {
      level: 'Level 3: General Manager',
      title: 'Mr Rajesh Panday',
      role: 'General Manager (Dealership Head)',
      desc: 'Executive escalation, unresolved customer grievances, critical repeat issues & billing disputes.',
      phone: '9257051606',
      email: 'gmservice@techwheels.in',
      whatsapp: '9257051606',
      badge: 'Level 3 · Dealership GM',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      icon: '🏛️',
    },
  ]

  const tataMotorsEscalationTiers = [
    {
      level: 'Level 1: Tata Motors Customer Care Manager',
      title: 'Mr Akshay Jethalia',
      role: 'Customer Care Manager (Tata Motors Official)',
      desc: 'Official Tata Motors OEM customer care, warranty policies, vehicle escalation & direct OEM assistance.',
      phone: '9328726988',
      email: 'AJJ820986@tatamotors.com',
      whatsapp: '9328726988',
      badge: 'Tata Motors · Level 1',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      icon: '🚘',
    },
    {
      level: 'Level 2: Tata Motors Regional Customer Care Manager',
      title: 'Mr Gurmeet Singh',
      role: 'Regional Customer Care Manager (Tata Motors Official)',
      desc: 'Regional OEM leadership intervention for state-level unresolved customer complaints and vehicle warranty escalations.',
      phone: '8288004301',
      email: 'gumeet.singh@tatamotors.com',
      whatsapp: '8288004301',
      badge: 'Tata Motors · Regional Head',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: '🌐',
    },
  ]

  // Handle Escalation Submission (Direct DB Sync + Native Email Launch)
  async function handleEscalationSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!escalationMessage.trim()) {
      alert('Kripya apna problem / query detail me likhein.')
      return
    }

    setEscalationSubmitting(true)
    try {
      const targetEmails: Record<string, string> = {
        crm: 'Crmservice@techwheels.in',
        sm: 'service@techwheels.in',
        gm: 'gmservice@techwheels.in',
        tataccm: 'AJJ820986@tatamotors.com',
        tataregional: 'gumeet.singh@tatamotors.com',
      }

      const targetLabels: Record<string, string> = {
        crm: 'Payal Makhija (CRM)',
        sm: 'Govind Singh (Service Manager)',
        gm: 'Mr Rajesh Panday (General Manager)',
        tataccm: 'Mr Akshay Jethalia (Tata Motors CCM)',
        tataregional: 'Mr Gurmeet Singh (Tata Motors RCCM)',
      }

      const chosenEmail = targetEmails[escalationTarget] || 'Crmservice@techwheels.in'
      const chosenLabel = targetLabels[escalationTarget] || 'Management Desk'

      const syncRow = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || null,
        rating: 1,
        feedback_text: `[ESCALATION TO: ${chosenLabel}]\nSubject: ${escalationSubject.trim() || 'Customer Helpdesk Concern'}\nDetails: ${escalationMessage.trim()}`,
        service_type: `Escalation: ${chosenLabel}`,
        service_advisor_name: vehicle.sa_name || null,
        branch: vehicle.branch || null,
        mode: 'customer_escalation_payload',
        complaint_date_time: new Date().toISOString(),
      }

      // Persist escalation to database so workshop management receives it immediately
      await supabase.from('post_feedback_bot_data').insert([syncRow])
      setEscalationSuccess(true)

      // Launch native device email composer pre-populated with vehicle details
      const mailtoUrl = `mailto:${chosenEmail}?subject=${encodeURIComponent(
        `[PRIORITY HELPDESK] ${vehicle.reg_number} - ${escalationSubject.trim() || 'Service Query'}`
      )}&body=${encodeURIComponent(
        `Dear ${chosenLabel},\n\nVehicle Registration: ${vehicle.reg_number}\nModel: ${vehicle.model || 'Tata Vehicle'}\nOwner Name: ${vehicle.owner_name || 'Customer'}\nContact Mobile: ${vehicle.owner_phone || ''}\nJob Card: ${vehicle.jc_number || 'Active Service'}\n\nQuery / Concern Details:\n${escalationMessage.trim()}\n\nRegards,\n${vehicle.owner_name || 'Customer'}`
      )}`

      window.location.href = mailtoUrl

      setEscalationSubject('')
      setEscalationMessage('')
      setTimeout(() => setEscalationSuccess(false), 5000)
    } catch (err) {
      console.error('Escalation submit error:', err)
      alert('Failed to log escalation. Please use direct phone call.')
    } finally {
      setEscalationSubmitting(false)
    }
  }

  // Cost calculations strictly from database / live estimate
  const totalEstimatedValue = latestLiveEstimate
    ? latestLiveEstimate.grand_total
    : Number(vehicle.billed_amount || 0)

  const effectiveReceived = Number(
    vehicle.amount_received || (vehicle.payment_status === 'Paid' ? totalEstimatedValue : 0)
  )
  const balanceDue = Math.max(0, totalEstimatedValue - effectiveReceived)

  const isGatepassAccountsApproved = Boolean(
    issuedGatePass?.gate_pass_no ||
    (vehicle.gate_pass_issued && (vehicle.gate_pass_number || issuedGatePass?.gate_pass_no))
  )

  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card'>('upi')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardPaying, setCardPaying] = useState(false)

  // ── OFFICIAL GATEPASS HTML TEMPLATE GENERATOR (MATCHING WORKSHOP SPEC) ──
  const effectiveJcNumber = issuedGatePass?.job_card_no || vehicle.jc_number || '—'
  const effectiveInvoiceNumber = issuedGatePass?.invoice_no || (vehicle.invoice_done_at ? `INV-${(vehicle.jc_number || vehicle.reg_number).replace(/[^A-Z0-9]/g, '')}` : '—')
  const effectiveInvoiceDate = issuedGatePass?.invoice_date || (vehicle.invoice_done_at ? new Date(vehicle.invoice_done_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
  const effectiveBilledMoney = (issuedGatePass?.billed_amount != null && issuedGatePass.billed_amount > 0)
    ? issuedGatePass.billed_amount
    : totalEstimatedValue
  const effectiveReceivedMoney = (issuedGatePass?.amount_received != null && issuedGatePass.amount_received > 0)
    ? issuedGatePass.amount_received
    : ((vehicle.payment_status === 'Paid' || balanceDue === 0 || effectiveReceived > 0)
        ? (effectiveReceived > 0 ? effectiveReceived : effectiveBilledMoney)
        : 0)
  const effectiveRemainingMoney = Math.max(0, effectiveBilledMoney - effectiveReceivedMoney)

  function generateOfficialGatepassHtml(): string {
    const printed = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    const saNameClean = cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || '—'

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gatepass · ${effectiveJcNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 24px; line-height: 1.4; background: #fff; }
    .header-top { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; letter-spacing: 0.04em; color: #000; text-transform: uppercase; }
    .sub { color: #555; margin: 0 0 16px; font-size: 12.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { text-align: left; padding: 7px 10px; border: 1px solid #d4d4d8; font-size: 12.5px; vertical-align: middle; }
    th { width: 32%; background: #f8fafc; font-weight: 600; color: #1e293b; }
    td { color: #0f172a; }
    .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 48px; padding-top: 8px; }
    .signs div { border-top: 1px solid #111; padding-top: 6px; font-size: 11.5px; color: #333; font-weight: 500; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    .btn { background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
    .btn-close { background: #64748b; }
    @media print {
      .actions { display: none !important; }
      body { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.print()">🖨️ Print / Save PDF</button>
    <button class="btn btn-close" onclick="try { parent.document.getElementById('accounts-gatepass-frame')?.remove() } catch (e) {} window.close()">Close</button>
  </div>
  <div class="header-top">
    <span>${printed}</span>
    <span>Gatepass · ${effectiveJcNumber}</span>
  </div>
  <h1>VEHICLE GATEPASS</h1>
  <p class="sub">Techwheels Service · Mechanical · Printed ${printed}</p>
  <table>
    <tr><th>Job card</th><td><strong>${effectiveJcNumber}</strong></td></tr>
    <tr><th>Registration</th><td><strong>${vehicle.reg_number}</strong></td></tr>
    <tr><th>Owner</th><td>${vehicle.owner_name || 'Customer'}</td></tr>
    <tr><th>Service / Branch / SA</th><td>${vehicle.service_type || 'Paid Service'} · ${vehicle.branch || 'Main Workshop'} · ${saNameClean}</td></tr>
    <tr><th>Invoice number</th><td>${effectiveInvoiceNumber}</td></tr>
    <tr><th>Invoice date</th><td>${effectiveInvoiceDate}</td></tr>
    <tr><th>Billed amount</th><td>₹${effectiveBilledMoney.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    <tr><th>Amount received</th><td>₹${effectiveReceivedMoney.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    <tr><th>Remaining</th><td>₹${effectiveRemainingMoney.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    <tr><th>Payment status</th><td><span style="text-transform: lowercase; font-weight: 600; color: #16a34a;">${effectiveRemainingMoney === 0 ? 'received' : 'pending'}</span></td></tr>
  </table>
  <div class="signs">
    <div>Accounts</div>
    <div>Security / Gate</div>
    <div>Customer</div>
  </div>
</body>
</html>`
  }

  function downloadOrPrintGatepass() {
    if (!isGatepassAccountsApproved) {
      setShowPendingApprovalModal(true)
      return
    }
    const html = generateOfficialGatepassHtml()
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      // In native Android WebView fallback, render in modal
      setShowGatepassModal(true)
      return
    }
    win.focus()
  }

  // Handle Online Bill Payment Settlement & Auto Display Gatepass
  async function handlePaymentSuccess() {
    setCardPaying(true)
    try {
      const botRow = {
        vehicle_registration_number: vehicle.reg_number.trim().toUpperCase(),
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || null,
        rating: 5,
        feedback_text: `[Online Bill Payment] Customer paid ₹${balanceDue.toLocaleString('en-IN')} online via Mobile App. Awaiting Accounts Desk verification & Gatepass release.`,
        service_type: 'Online Bill Payment',
        service_advisor_name: cleanAdvisorPersonName(vehicle.sa_name) || null,
        branch: vehicle.branch || null,
        mode: 'customer_payment_settlement',
        complaint_date_time: new Date().toISOString(),
      }
      await supabase.from('post_feedback_bot_data').insert([botRow])

      setVehicle((prev) => ({
        ...prev,
        payment_status: 'Paid',
        amount_received: totalEstimatedValue || prev.amount_received,
      }))
      setShowPaymentModal(false)
      if (isGatepassAccountsApproved) {
        setShowGatepassModal(true)
      } else {
        setShowPendingApprovalModal(true)
      }
    } catch (err) {
      console.error('Payment record error:', err)
    } finally {
      setCardPaying(false)
    }
  }

  async function handleCardPaymentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
      alert('Kripya card details sahi se fill karein.')
      return
    }
    setCardPaying(true)
    try {
      await new Promise((res) => setTimeout(res, 1000))
      await handlePaymentSuccess()
    } catch (err) {
      console.error('Card payment error:', err)
      alert('Payment processing error. Please try again or use UPI.')
    } finally {
      setCardPaying(false)
    }
  }

  const isPendingApproval = latestLiveEstimate
    ? latestLiveEstimate.status === 'Sent' || latestLiveEstimate.status === 'Draft'
    : false

  // ── 5-STAGE DYNAMIC SERVICE JOURNEY (DB-DRIVEN WITH LIVE ADVISOR & JC NO) ──
  const currentStageIndex = useMemo(() => {
    // Stage 4: Ready / Delivered
    if (vehicle.invoice_done_at || vehicle.payment_status === 'Paid') return 4
    // Stage 3: Repairs & Bay work
    if (allocatedTechnician || latestLiveEstimate?.status === 'Approved') return 3
    // Stage 2: Estimate review
    if (latestLiveEstimate) return 2
    // Stage 1: Job Card Open / SA Assigned
    if (vehicle.jc_number || Boolean(cleanAdvisorPersonName(vehicle.sa_name))) return 1
    // Stage 0: Intake Check-in
    return 0
  }, [vehicle.invoice_done_at, vehicle.payment_status, allocatedTechnician, latestLiveEstimate, vehicle.jc_number, vehicle.sa_name])

  const stages = [
    {
      label: 'Intake',
      desc: 'Vehicle Check-in & Initial Reception Inspection',
      icon: '📥',
    },
    {
      label: 'Job Card',
      desc: cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name)
        ? `Advisor: ${cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name)}${vehicle.jc_number ? ` · JC #${vehicle.jc_number}` : ''}`
        : (vehicle.jc_number ? `Job Card #${vehicle.jc_number}` : 'Job Card Opening & Service Advisor Assignment'),
      icon: '📋',
    },
    {
      label: 'Estimate',
      desc: latestLiveEstimate
        ? `Estimate #${latestLiveEstimate.estimate_no} (${latestLiveEstimate.status})`
        : 'Comprehensive Parts & Labour Estimation',
      icon: '📝',
    },
    {
      label: 'Repairs',
      desc: allocatedTechnician
        ? `Technician Working: ${allocatedTechnician.name}${allocatedTechnician.bay_no ? ` (Bay ${allocatedTechnician.bay_no})` : ''}`
        : 'Vehicle in Workshop Bay for Mechanical & Electrical Work',
      icon: '🔧',
    },
    {
      label: 'Ready',
      desc: 'Repairs Completed · Quality Tested & Ready for Delivery',
      icon: '✅',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans safe-mobile-container selection:bg-blue-600/30">
      {/* Background Decorative Ambient Mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-3 pb-24 space-y-4">
        {/* ── TOP APP BAR: TATA MOTORS BRAND & 3-LINE MENU DRAWER TRIGGER ── */}
        <div className="tata-glass-card rounded-3xl p-4 shadow-2xl relative overflow-hidden border border-[#00D2C4]/20 bg-gradient-to-r from-[#002B49]/90 via-[#071727]/90 to-[#0A1A2F]/90">
          {/* Official Tata Cyan Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#002B49] via-[#00D2C4] to-[#00E5BE]" />

          {/* Brand Header & Top Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#003366] to-[#002B49] border border-[#00D2C4]/40 flex items-center justify-center text-white shadow-lg shadow-[#002B49]/40 ring-1 ring-white/10 shrink-0">
                <span className="text-xl">🚘</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#00D2C4] truncate">Tata Motors Service</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D2C4] pulse-live-indicator shrink-0" />
                </div>
                <h1 className="text-base font-black text-white tracking-tight truncate flex items-center gap-1.5">
                  <span>Techwheels Service</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[#00D2C4]/15 text-[#00D2C4] border border-[#00D2C4]/30 font-mono">tata.cars</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeTab !== 'dashboard' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="tap-bounce px-2.5 py-1.5 rounded-xl bg-[#00D2C4]/15 hover:bg-[#00D2C4]/25 text-xs font-bold text-[#00D2C4] border border-[#00D2C4]/30 flex items-center gap-1 transition"
                  title="Back to Overview"
                >
                  <span>🏠</span>
                  <span>Home</span>
                </button>
              )}

              {/* ☰ 3-Line Hamburger Menu Button */}
              <button
                type="button"
                onClick={() => setShowMenuDrawer(true)}
                className="tap-bounce relative w-10 h-10 rounded-2xl bg-[#002B49]/70 hover:bg-[#003366] text-white flex flex-col items-center justify-center gap-1 border border-[#00D2C4]/30 shadow-md transition"
                title="Open Menu"
                aria-label="Open Navigation Menu"
              >
                <span className="w-4 h-0.5 bg-[#00D2C4] rounded-full transition-all" />
                <span className="w-4 h-0.5 bg-white rounded-full transition-all" />
                <span className="w-4 h-0.5 bg-[#00D2C4] rounded-full transition-all" />

                {/* Notification Badge if Gatepass is approved or estimate pending */}
                {(isGatepassAccountsApproved || isPendingApproval) && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#00D2C4] ring-2 ring-[#0A1118] animate-pulse" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── TAB 1: HOME PAGE OVERVIEW (TATA COCKPIT CARD & LIVE TRACKER) ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Tata Hero Vehicle Cockpit Card */}
            <div className="tata-hero-card rounded-3xl p-5 shadow-2xl relative overflow-hidden">
              {/* Top Cyan Glowing Line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#002B49] via-[#00D2C4] to-[#00E5BE]" />

              {/* Vehicle Title & License Plate */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* License Plate Style Badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xl sm:text-2xl font-black text-white tracking-wider bg-[#06101D] px-3.5 py-1 rounded-xl border border-[#00D2C4]/30 shadow-inner ring-1 ring-white/5">
                      {vehicle.reg_number}
                    </span>
                    <span className="tata-ev-badge text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00D2C4] pulse-live-indicator" />
                      <span>Tata Official Service</span>
                    </span>
                    {Boolean(vehicle.remark?.toLowerCase().includes('revisit')) && (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                        Revisit
                      </span>
                    )}
                  </div>

                  {/* Model & Owner Subtitle */}
                  <div className="mt-2.5 space-y-0.5">
                    <h2 className="text-base font-extrabold text-white flex items-center gap-1.5">
                      <span className="text-[#00D2C4]">🚘</span>
                      <span>{vehicle.model || 'Tata Motors Vehicle'}</span>
                      {vehicle.variant && <span className="text-slate-300 font-medium text-xs">· {vehicle.variant}</span>}
                    </h2>
                    <p className="text-xs text-slate-300 font-medium flex items-center gap-1">
                      <span className="text-slate-400">👤 Owner:</span>
                      <strong className="text-white font-semibold">{vehicle.owner_name || 'Customer'}</strong>
                    </p>
                  </div>
                </div>

                {/* Switch Vehicle Button for multi-car users */}
                {allVehicles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowVehiclePicker(true)}
                    className="tap-bounce px-3 py-1.5 rounded-xl bg-[#00D2C4]/15 hover:bg-[#00D2C4]/25 text-[#00D2C4] border border-[#00D2C4]/30 text-xs font-bold flex flex-col items-center gap-0.5 shrink-0"
                  >
                    <span>Switch</span>
                    <span className="text-[10px] opacity-75">{allVehicles.length} Cars</span>
                  </button>
                )}
              </div>

              {/* 3-Pill Essential Metrics Grid (Odometer, Job Card, Advisor) */}
              <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center">
                {/* 1. Verified Odometer KM (Strictly Read-Only) */}
                <div className="bg-[#06101D]/80 p-2.5 rounded-2xl border border-[#00D2C4]/15 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    🛣️ Odometer
                  </span>
                  <span className="font-mono font-black text-[#00D2C4] text-xs sm:text-sm mt-1 truncate">
                    {vehicle.km_reading != null && vehicle.km_reading > 0
                      ? `${vehicle.km_reading.toLocaleString('en-IN')} KM`
                      : '—'}
                  </span>
                </div>

                {/* 2. Job Card Number from DB */}
                <div className="bg-[#06101D]/80 p-2.5 rounded-2xl border border-[#00D2C4]/15 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    📋 Job Card
                  </span>
                  <span className="font-mono font-bold text-amber-300 text-xs mt-1 truncate" title={vehicle.jc_number || 'Pending'}>
                    {vehicle.jc_number || '—'}
                  </span>
                </div>

                {/* 3. Service Advisor Name from DB */}
                <div className="bg-[#06101D]/80 p-2.5 rounded-2xl border border-[#00D2C4]/15 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    👨‍💼 Advisor
                  </span>
                  <span className="font-bold text-slate-200 text-xs mt-1 truncate" title={cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || 'Pending'}>
                    {cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || '—'}
                  </span>
                </div>
              </div>

              {/* Technician Allocation Status Ribbon */}
              <div className="mt-2.5 bg-slate-950/40 rounded-xl px-3 py-1.5 border border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">🔧</span>
                  <span className="text-slate-400 text-[11px]">Technician:</span>
                  {allocatedTechnician ? (
                    <span className="font-bold text-emerald-300 truncate text-[11px] flex items-center gap-1.5">
                      <span>{allocatedTechnician.name}</span>
                      {allocatedTechnician.bay_no && (
                        <span className="bg-blue-600/30 text-blue-200 text-[9px] px-1.5 py-0.2 rounded border border-blue-400/30 font-mono">
                          Bay {allocatedTechnician.bay_no}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-amber-400/90 text-[11px] italic">Allocation in progress</span>
                  )}
                </div>
                {allocatedTechnician && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-live-indicator shrink-0" />
                )}
              </div>
            </div>

            {/* ── ACTION REQUIRED BANNER: OFFICIAL GATE PASS ISSUED BY ACCOUNTS ── */}
            {(issuedGatePass || vehicle.gate_pass_issued) && (
              <div
                onClick={() => setShowGatepassModal(true)}
                className="tap-bounce bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-emerald-700/30 border-2 border-emerald-400/60 rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-emerald-500/20 cursor-pointer animate-in fade-in"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/30 flex items-center justify-center text-2xl ring-1 ring-emerald-400/50">
                    🎟️
                  </div>
                  <div>
                    <div className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Official Gate Pass Issued</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-live-indicator" />
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5 font-mono">
                      Gate Pass #{issuedGatePass?.gate_pass_no || (vehicle.jc_number ? `GP-${vehicle.jc_number.replace(/[^0-9]/g, '').slice(-5)}` : 'READY')}
                    </div>
                    <div className="text-[11px] text-emerald-200/80 mt-0.5">
                      Accounts Cleared · Authorized for Vehicle Departure
                    </div>
                  </div>
                </div>
                <span className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl shadow-md flex items-center gap-1 shrink-0">
                  <span>View Pass</span>
                  <span>➔</span>
                </span>
              </div>
            )}

            {/* ── ACTION REQUIRED BANNER: ESTIMATE PENDING ── */}
            {isPendingApproval && latestLiveEstimate && (
              <div
                onClick={() => setActiveTab('estimate')}
                className="tap-bounce bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-600/20 border border-amber-500/40 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-amber-500/10 cursor-pointer animate-in fade-in"
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

            {/* ── ACTION REQUIRED BANNER: REPAIRS DONE & BILL READY ── */}
            {!isPendingApproval && balanceDue > 0 && (
              <div
                onClick={() => setShowPaymentModal(true)}
                className="tap-bounce bg-gradient-to-r from-emerald-600/25 via-teal-600/25 to-blue-600/25 border border-emerald-400/40 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-emerald-500/15 cursor-pointer animate-in fade-in"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/30 flex items-center justify-center text-xl ring-1 ring-emerald-400/40 animate-pulse">
                    💳
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Repairs Done · Bill Ready</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      ₹{balanceDue.toLocaleString('en-IN')} (Pay via UPI / Card)
                    </div>
                  </div>
                </div>
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-xl shadow-md">
                  Pay Now ➔
                </span>
              </div>
            )}

            {/* Quick Action Grid (4 Clean Minimalist Cards) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('complaint')}
                className="tap-bounce mobile-glass-dark p-4 rounded-3xl border border-white/10 text-left flex flex-col justify-between hover:border-blue-500/40 transition group"
              >
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center text-xl mb-3 border border-rose-500/20 group-hover:scale-105 transition">
                  🚨
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white flex items-center justify-between">
                    <span>Report Issues</span>
                    <span className="text-slate-500 group-hover:text-blue-400 transition">➔</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Voice 🎙️ or typed concerns</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('estimate')}
                className="tap-bounce mobile-glass-dark p-4 rounded-3xl border border-white/10 text-left flex flex-col justify-between hover:border-blue-500/40 transition group"
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center text-xl mb-3 border border-blue-500/20 group-hover:scale-105 transition">
                  📋
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white flex items-center justify-between">
                    <span>Estimates & Bills</span>
                    <span className="text-slate-500 group-hover:text-blue-400 transition">➔</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Itemized quote & pay</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('escalation')}
                className="tap-bounce mobile-glass-dark p-4 rounded-3xl border border-purple-500/30 text-left flex flex-col justify-between hover:border-purple-400/50 bg-gradient-to-br from-purple-950/30 via-slate-900 to-slate-900 transition group"
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-300 flex items-center justify-center text-xl border border-purple-400/20 group-hover:scale-105 transition">
                    📞
                  </div>
                  <span className="text-[9px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-500/30 uppercase tracking-wider">
                    Helpdesk
                  </span>
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white flex items-center justify-between">
                    <span>Escalation Hub</span>
                    <span className="text-purple-400">➔</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Call/mail advisor & GM</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('feedback')}
                className="tap-bounce mobile-glass-dark p-4 rounded-3xl border border-amber-500/30 text-left flex flex-col justify-between hover:border-amber-400/50 bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 transition group"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center text-xl mb-3 border border-amber-500/20 group-hover:scale-105 transition">
                  ⭐
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white flex items-center justify-between">
                    <span>Service Rating</span>
                    <span className="text-amber-400">➔</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Rate workshop quality</p>
                </div>
              </button>
            </div>

            {/* Financial Summary Card (Minimalist) */}
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

              <div className="pt-1">
                {balanceDue > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    className="tap-bounce w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                  >
                    <span>💳</span>
                    <span>Pay Online (₹{balanceDue.toLocaleString('en-IN')})</span>
                  </button>
                ) : (
                  <div className="bg-slate-900/90 py-2.5 px-3 rounded-2xl border border-emerald-500/20 text-center text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5">
                    <span>✓</span>
                    <span>All Service Dues Settled</span>
                  </div>
                )}
              </div>
            </div>

            {/* Permanent Lifetime Service History Records */}
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>📜</span> Lifetime Service History ({serviceHistory.length})
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                  Permanent Record
                </span>
              </div>

              <div className="space-y-2 pt-1">
                {serviceHistory.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-900/80 rounded-2xl p-3 border border-white/5 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🔧</span>
                        <span className="text-xs font-bold text-white">{item.service_type}</span>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-emerald-400">
                        {item.total_amount > 0 ? `₹${item.total_amount.toLocaleString('en-IN')}` : 'Free Service'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>📅 {item.service_date}</span>
                      <span>🛣️ {item.km_reading != null ? `${item.km_reading.toLocaleString('en-IN')} KM` : 'Inspection Done'}</span>
                    </div>

                    <div className="text-[10px] text-slate-400 border-t border-white/5 pt-1.5 mt-0.5 flex justify-between items-center">
                      <span>Advisor: <strong className="text-slate-300">{item.service_advisor}</strong> · {item.jc_number}</span>
                      <span className="text-blue-400 font-mono font-semibold">{item.invoice_no}</span>
                    </div>
                  </div>
                ))}
              </div>

              {serviceHistory.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  className="tap-bounce w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-blue-400 border border-white/10 flex items-center justify-center gap-1 mt-1"
                >
                  <span>View Complete History ({serviceHistory.length} Records)</span>
                  <span>➔</span>
                </button>
              )}
            </div>

            {/* ── 5-STAGE LIVE SERVICE JOURNEY STEPPER (TATA.EV GLOWING PROGRESS) ── */}
            <div className="tata-glass-card rounded-3xl p-5 border border-[#00D2C4]/20 shadow-2xl space-y-4 bg-gradient-to-b from-[#081524]/90 to-[#0A1A2F]/90">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#00D2C4] flex items-center gap-1.5">
                    <span>⚡</span> Live Service Journey
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs font-bold text-amber-300">
                      {vehicle.jc_number ? `JC #${vehicle.jc_number}` : 'JC Pending'}
                    </span>
                    <span className="text-[10px] text-slate-400">· Tap any step for details</span>
                  </div>
                </div>
                <span className="tata-ev-badge text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                  Stage {currentStageIndex + 1} of {stages.length}
                </span>
              </div>

              {/* Progress Line with Clickable Glowing Nodes */}
              <div className="relative flex justify-between items-center px-1 pt-2 pb-1">
                <div className="absolute top-[26px] left-4 right-4 -translate-y-1/2 h-1 bg-[#06101D] z-0 rounded-full border border-white/5" />
                <div
                  className="absolute top-[26px] left-4 -translate-y-1/2 h-1 bg-gradient-to-r from-[#003366] via-[#00D2C4] to-[#00E5BE] z-0 rounded-full transition-all duration-500 shadow-[0_0_12px_#00D2C4]"
                  style={{ width: `${(currentStageIndex / (stages.length - 1)) * 92}%` }}
                />

                {stages.map((stg, i) => {
                  const isDone = i < currentStageIndex
                  const isCurrent = i === currentStageIndex
                  return (
                    <button
                      key={stg.label}
                      type="button"
                      onClick={() => setSelectedStageModal(i)}
                      className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none transition active:scale-95"
                      title={`Click to view ${stg.label} details`}
                    >
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-black transition-all duration-300 shadow-lg ${
                          isDone
                            ? 'bg-[#00D2C4] text-[#002B49] ring-4 ring-[#00D2C4]/25'
                            : isCurrent
                            ? 'tata-step-active text-[#002B49] ring-4 ring-[#00D2C4]/50 scale-110'
                            : 'bg-[#06101D] text-slate-500 border border-white/10 group-hover:border-[#00D2C4]/40'
                        }`}
                      >
                        {isDone ? '✓' : stg.icon}
                      </div>
                      <span
                        className={`text-[10px] sm:text-[11px] mt-2 font-bold tracking-tight text-center transition group-hover:text-white ${
                          isCurrent ? 'text-[#00D2C4] font-black' : isDone ? 'text-emerald-300' : 'text-slate-400'
                        }`}
                      >
                        {stg.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Current Status Callout */}
              <div
                onClick={() => setSelectedStageModal(currentStageIndex)}
                className="tap-bounce bg-[#06101D]/90 hover:bg-[#06101D] rounded-2xl p-4 border border-[#00D2C4]/20 hover:border-[#00D2C4]/50 flex items-start gap-3 cursor-pointer transition group shadow-inner"
              >
                <span className="text-2xl mt-0.5 group-hover:scale-110 transition">{stages[currentStageIndex].icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>Current Stage: {stages[currentStageIndex].label}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00D2C4] pulse-live-indicator" />
                    </div>
                    <span className="text-[10px] font-bold text-[#00D2C4] group-hover:underline flex items-center gap-0.5">
                      Details ➔
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {stages[currentStageIndex].desc}
                  </p>
                </div>
              </div>
            </div>

            {/* ── ASSIGNED TATA SERVICE ADVISOR & WORKSHOP CONNECT ── */}
            <div className="tata-glass-card rounded-3xl p-5 border border-[#00D2C4]/20 shadow-xl space-y-3.5 bg-gradient-to-r from-[#002B49]/80 to-[#0B1E36]/80">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#00D2C4] flex items-center gap-1">
                  <span>👨‍💼</span> Assigned Tata Service Advisor
                </span>
                <span className="text-[10px] bg-[#00D2C4]/15 text-[#00D2C4] px-2 py-0.5 rounded-md font-mono border border-[#00D2C4]/30">
                  Dealership Verified
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#003366] to-[#002B49] border border-[#00D2C4]/40 flex items-center justify-center text-xl text-white shadow-md ring-1 ring-white/10 shrink-0">
                  👨‍🔧
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-white truncate">
                    {cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || 'Tata Service Advisor Desk'}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    {vehicle.branch || 'Sitapura Main Workshop'} · Techwheels Tata Motors
                  </div>
                </div>
              </div>

              {/* 1-Tap Direct WhatsApp & Phone Call Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`https://wa.me/91${(vehicle.owner_phone || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hello, I am tracking my Tata vehicle ${vehicle.reg_number} (Job Card: ${vehicle.jc_number || 'Active'}). Please update on current status.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-bounce py-2.5 px-3 rounded-2xl bg-[#00D2C4]/15 hover:bg-[#00D2C4]/25 text-[#00D2C4] border border-[#00D2C4]/35 font-bold text-xs flex items-center justify-center gap-1.5 transition text-center"
                >
                  <span>💬</span>
                  <span>WhatsApp</span>
                </a>
                <a
                  href={`tel:${vehicle.owner_phone || ''}`}
                  className="tap-bounce py-2.5 px-3 rounded-2xl bg-[#003366] hover:bg-[#002B49] text-white border border-[#00D2C4]/30 font-bold text-xs flex items-center justify-center gap-1.5 transition text-center shadow-md"
                >
                  <span>📞</span>
                  <span>Direct Call</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: ESTIMATES & APPROVALS (WITH SUPPLEMENTARY DYNAMIC ITEMS) ── */}
        {activeTab === 'estimate' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header Back Button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="tap-bounce text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-slate-900 border border-white/10"
              >
                <span>←</span>
                <span>Back to Overview</span>
              </button>
              <span className="text-xs text-slate-400 font-mono">Live Estimates & Billing</span>
            </div>

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
                const isApproved = est.status === 'Approved'
                const isRejected = est.status === 'Rejected'
                const isSupplementaryPending = est.status === 'Supplementary_Pending'
                const isPending = est.status === 'Sent' || est.status === 'Draft' || isSupplementaryPending

                const hasSupplementaryItems = est.items.some((i) => i.is_supplementary)
                const supplementaryItems = est.items.filter((i) => i.is_supplementary)
                const baseItems = est.items.filter((i) => !i.is_supplementary)

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
                            : isSupplementaryPending
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 pulse-live-indicator'
                            : isRejected
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 pulse-live-indicator'
                        }`}
                      >
                        {isApproved
                          ? '✓ Approved'
                          : isSupplementaryPending
                          ? '✨ Extra Work Added'
                          : isRejected
                          ? '✕ Rejected'
                          : 'Action Required'}
                      </span>
                    </div>

                    {/* Supplementary / Extra Work Notice Banner */}
                    {hasSupplementaryItems && (
                      <div className="bg-gradient-to-r from-purple-500/20 via-indigo-500/20 to-blue-500/20 border border-purple-500/40 rounded-2xl p-3.5 space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                          <span>✨</span>
                          <span>Additional Items Added During Service Inspection</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Gadi check karte time advisor ne kuch extra parts/labour add kiye hain taaki gadi sahi condition me rahe. Billing amount dynamically update ho gaya hai.
                        </p>
                      </div>
                    )}

                    {/* Itemized Base Parts Table */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-300">Itemized Parts & Services</div>
                      <div className="bg-slate-900/90 rounded-2xl p-3 border border-white/5 space-y-2 text-xs">
                        {baseItems.map((item, idx) => (
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

                    {/* Supplementary Items Table */}
                    {hasSupplementaryItems && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                          <span>✨</span>
                          <span>Supplementary Work Breakdown</span>
                        </div>
                        <div className="bg-purple-950/30 rounded-2xl p-3 border border-purple-500/20 space-y-2 text-xs">
                          {supplementaryItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 border-b border-purple-500/10 last:border-0">
                              <div>
                                <div className="font-semibold text-purple-200">{item.description}</div>
                                <div className="text-[10px] text-purple-400">
                                  Qty: {item.quantity} · {item.type}
                                </div>
                              </div>
                              <div className="font-mono font-bold text-purple-200">
                                ₹{item.total.toLocaleString('en-IN')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Total Summary */}
                    <div className="bg-slate-900/80 rounded-2xl p-4 border border-white/5 space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Subtotal:</span>
                        <span className="font-mono">₹{est.subtotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>GST & Taxes (18%):</span>
                        <span className="font-mono">₹{(est.gst_tax || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
                        <span>Total Estimated Amount:</span>
                        <span className="font-mono text-emerald-400 text-base">
                          ₹{est.grand_total.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons for Pending Estimates */}
                    {isPending && (
                      <div className="space-y-2 pt-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={approvingEstNo === est.estimate_no}
                            onClick={() => handleApprove(est)}
                            className="tap-bounce w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5"
                          >
                            <span>✓</span>
                            <span>{approvingEstNo === est.estimate_no ? 'Approving...' : 'Approve Work'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowRejectBox(true)}
                            className="tap-bounce w-full py-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-bold text-xs border border-rose-500/30 flex items-center justify-center gap-1.5"
                          >
                            <span>✕</span>
                            <span>Request Changes</span>
                          </button>
                        </div>

                        {showRejectBox && (
                          <div className="bg-slate-900 rounded-2xl p-3 border border-rose-500/30 space-y-2 animate-in fade-in">
                            <label className="text-xs font-bold text-rose-300 block">
                              Reason for change / rejection:
                            </label>
                            <textarea
                              rows={2}
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="e.g. Please remove wiper blade replacement..."
                              className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-white placeholder-slate-500 outline-none focus:border-rose-400"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={rejectingEstNo === est.estimate_no}
                                onClick={() => handleReject(est)}
                                className="tap-bounce flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                              >
                                {rejectingEstNo === est.estimate_no ? 'Submitting...' : 'Send Feedback to SA'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowRejectBox(false)}
                                className="tap-bounce px-3 py-2 rounded-xl bg-white/10 text-xs text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
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

        {/* ── TAB 3: REPORT VEHICLE ISSUES & VOICE COMPLAINTS ── */}
        {/* ── TAB: REPORT VEHICLE ISSUES & ADVISOR SOLUTIONS ── */}
        {activeTab === 'complaint' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header Back Button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="tap-bounce text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-slate-900 border border-white/10"
              >
                <span>←</span>
                <span>Back to Overview</span>
              </button>
              <span className="text-xs text-slate-400 font-mono">Issues & Solutions Desk</span>
            </div>

            {/* ── SECTION 1: LIVE REPORTED CONCERNS & ADVISOR SOLUTIONS ── */}
            {reportedConcerns.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <span>📋</span> Aapke Bataye Gaye Issues & Solution ({reportedConcerns.length})
                  </h3>
                  <span className="text-[10px] text-blue-400 font-mono font-bold bg-blue-600/10 px-2 py-0.5 rounded-lg border border-blue-500/20">
                    Live Workshop Feed
                  </span>
                </div>

                <div className="space-y-3">
                  {reportedConcerns.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="mobile-glass-dark rounded-3xl p-4 border border-white/10 shadow-xl space-y-3"
                    >
                      {/* Concern Header & Status */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🚨</span>
                          <span className="text-xs font-bold text-white">
                            Issue Ticket #{reportedConcerns.length - idx}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(item.created_at).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              item.advisor_solution
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {item.advisor_solution ? '✓ Resolved & Tested' : '🟡 Under Inspection'}
                          </span>
                        </div>
                      </div>

                      {/* Customer Reported Problems List */}
                      <div className="space-y-1.5 bg-black/30 p-3 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          Customer Reported Concern:
                        </span>
                        <div className="space-y-1">
                          {item.problems.map((prob, pIdx) => (
                            <div key={pIdx} className="flex items-start gap-2 text-xs text-slate-200">
                              <span className="text-blue-400 font-mono font-bold shrink-0">{pIdx + 1}.</span>
                              <span className="leading-relaxed">{prob}</span>
                            </div>
                          ))}
                        </div>
                        {item.additional_notes && (
                          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-white/5">
                            <strong className="text-slate-300">Notes:</strong> {item.additional_notes}
                          </div>
                        )}
                      </div>

                      {/* Dedicated Advisor & Technician Solution Box */}
                      <div
                        className={`rounded-2xl p-3.5 border ${
                          item.advisor_solution
                            ? 'bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-900 border-emerald-500/30'
                            : 'bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/30'
                        } space-y-1.5 shadow-inner`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{item.advisor_solution ? '✅' : '👨‍💼'}</span>
                            <span className="text-[11px] font-extrabold text-white">
                              {item.advisor_solution ? 'Advisor / Workshop Solution' : 'Service Advisor Action'}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              item.advisor_solution
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {item.advisor_name || vehicle.sa_display_name || vehicle.sa_name || 'Assigned Advisor'}
                          </span>
                        </div>

                        {item.advisor_solution ? (
                          <div className="text-xs text-emerald-200 leading-relaxed font-medium bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/20">
                            {item.advisor_solution}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-amber-200/90 leading-relaxed">
                              🔍 Technician inspection & diagnosis chal rahi hai. Jaise hi advisor solution update karenge, vo yahan display ho jayega.
                            </p>
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => setActiveTab('escalation')}
                                className="tap-bounce text-[10px] font-bold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1 rounded-lg border border-amber-500/30 flex items-center gap-1"
                              >
                                <span>📞</span>
                                <span>Ask Advisor for Quick Update</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 2: ADD NEW ISSUE / CONCERN FORM (VOICE 🎙️ & TEXT) ── */}
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>➕</span> Gadi Ki Problems Batayein (Voice / Type)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Aap bol kar (Voice 🎙️) ya likh kar apni sari complaints add kar sakte hain. Yeh seedha aapke Service Advisor ke pas jayegi.
                </p>
              </div>

              {/* Voice Listening Live Alert Message */}
              {voiceStatusMsg && (
                <div className="bg-rose-950/60 border border-rose-500/50 rounded-2xl p-3 text-xs text-rose-200 font-bold flex items-center justify-between shadow-lg shadow-rose-900/20 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span>{voiceStatusMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopVoiceRecognition}
                    className="tap-bounce bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1 shrink-0 ml-2"
                  >
                    <span>⏹️</span>
                    <span>Stop Mic</span>
                  </button>
                </div>
              )}

              {complaintSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl p-3 text-xs font-bold animate-in fade-in">
                  ✓ Problems successfully sent to your Service Advisor!
                </div>
              )}

              <form onSubmit={handleProblemSubmit} className="space-y-4">
                {/* Multi-Problem Items Container */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Problems List ({problemList.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => addProblemRow()}
                      className="tap-bounce text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-600/10 px-2.5 py-1 rounded-lg border border-blue-500/20"
                    >
                      <span>+ Add Another Concern</span>
                    </button>
                  </div>

                  {problemList.map((prob, idx) => (
                    <div key={prob.id} className="relative flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-[11px] font-bold flex items-center justify-center shrink-0 border border-white/10">
                        {idx + 1}
                      </div>

                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={prob.text}
                          onChange={(e) => updateProblemRow(prob.id, e.target.value)}
                          placeholder={`Problem #${idx + 1} (e.g. Brake noise, AC cooling issue...)`}
                          className="w-full bg-slate-900/90 border border-white/10 rounded-2xl pl-3.5 pr-11 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition"
                        />

                        {/* Mic Voice Button on individual input */}
                        <button
                          type="button"
                          onClick={() => startVoiceRecognition(prob.id)}
                          className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
                            isListening && listeningTarget === prob.id
                              ? 'bg-rose-600 text-white animate-pulse ring-2 ring-rose-400'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300'
                          }`}
                          title="बोल कर बताएं"
                        >
                          🎙️
                        </button>
                      </div>

                      {problemList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProblemRow(prob.id)}
                          className="w-7 h-7 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 flex items-center justify-center text-xs shrink-0 transition"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Additional Detailed Notes (With Voice Mic Support) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Additional Notes / Extra Details (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => startVoiceRecognition('notes')}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 transition ${
                        isListening && listeningTarget === 'notes'
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-blue-600/15 text-blue-300 border border-blue-500/20 hover:bg-blue-600/25'
                      }`}
                    >
                      <span>🎙️</span>
                      <span>{isListening && listeningTarget === 'notes' ? 'Stop Listening' : 'Speak Notes'}</span>
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="Koi aur baat jo aap Service Advisor ko batana chahte hain..."
                    className="w-full bg-slate-900/90 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={complaintSubmitting}
                  className="tap-bounce w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white font-extrabold text-xs shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                >
                  <span>🚀</span>
                  <span>{complaintSubmitting ? 'Sending to Advisor...' : 'Submit Vehicle Problems'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB 4: ESCALATION MATRIX & DIRECT HELPDESK HUB ── */}
        {activeTab === 'escalation' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header Back Button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="tap-bounce text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-slate-900 border border-white/10"
              >
                <span>←</span>
                <span>Back to Overview</span>
              </button>
              <span className="text-xs text-slate-400 font-mono">Helpdesk & Escalation</span>
            </div>

            {/* Hub Banner */}
            <div className="mobile-glass-dark rounded-3xl p-5 border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-slate-900/60 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center text-xl ring-1 ring-purple-400/30">
                    🏛️
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Helpdesk & Escalation Matrix</h3>
                    <p className="text-[11px] text-purple-200/80">Tata Motors Techwheels Authorised Service Hub</p>
                  </div>
                </div>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-2.5 py-0.5 rounded-full border border-purple-500/30">
                  Priority Access
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                Gadi service me dene se pehle ya service ke dauran kisi bhi query ke liye aap direct Dealership Management ya Tata Motors OEM team ko direct call, email ya WhatsApp kar sakte hain.
              </p>
            </div>

            {/* SECTION 1: DEALERSHIP MANAGEMENT HIERARCHY */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏢</span> Techwheels Dealership Management
                </h4>
                <span className="text-[10px] text-blue-400 font-semibold">3 Levels</span>
              </div>

              {dealershipEscalationTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="mobile-glass-dark rounded-3xl p-4 border border-white/10 shadow-lg space-y-3 transition hover:border-purple-500/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="text-2xl mt-0.5">{tier.icon}</span>
                      <div>
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${tier.badgeColor}`}>
                          {tier.level}
                        </span>
                        <h4 className="text-sm font-extrabold text-white mt-1">{tier.title}</h4>
                        <div className="text-[11px] font-medium text-slate-400">{tier.role}</div>
                        <div className="text-[11px] font-mono text-emerald-400 mt-0.5">📞 +91 {tier.phone} · ✉️ {tier.email}</div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed bg-black/25 p-2.5 rounded-2xl border border-white/5">
                    {tier.desc}
                  </p>

                  {/* 1-Tap Action Buttons (Call, Mail, WhatsApp) */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <a
                      href={`tel:${tier.phone}`}
                      className="tap-bounce py-2.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
                    >
                      <span>📞</span>
                      <span>Call Now</span>
                    </a>

                    <a
                      href={`mailto:${tier.email}?subject=${encodeURIComponent(`[Techwheels Service Query] Vehicle ${vehicle.reg_number} - ${vehicle.owner_name || 'Customer'}`)}`}
                      className="tap-bounce py-2.5 px-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20"
                    >
                      <span>✉️</span>
                      <span>Send Mail</span>
                    </a>

                    <a
                      href={`https://wa.me/91${tier.whatsapp}?text=${encodeURIComponent(`Hello, I am the owner of Tata vehicle ${vehicle.reg_number}. I have a query regarding my vehicle service.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="tap-bounce py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <span>💬</span>
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* SECTION 2: TATA MOTORS OFFICIAL SUPPORT TEAM */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🚘</span> Tata Motors Official Support Team
                </h4>
                <span className="text-[10px] text-indigo-400 font-semibold">OEM Escalation</span>
              </div>

              {tataMotorsEscalationTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="mobile-glass-dark rounded-3xl p-4 border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-900 shadow-lg space-y-3 transition hover:border-indigo-400/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="text-2xl mt-0.5">{tier.icon}</span>
                      <div>
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${tier.badgeColor}`}>
                          {tier.level}
                        </span>
                        <h4 className="text-sm font-extrabold text-white mt-1">{tier.title}</h4>
                        <div className="text-[11px] font-medium text-indigo-200">{tier.role}</div>
                        <div className="text-[11px] font-mono text-emerald-400 mt-0.5">📞 +91 {tier.phone} · ✉️ {tier.email}</div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed bg-black/25 p-2.5 rounded-2xl border border-white/5">
                    {tier.desc}
                  </p>

                  {/* 1-Tap Action Buttons (Call, Mail, WhatsApp) */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <a
                      href={`tel:${tier.phone}`}
                      className="tap-bounce py-2.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
                    >
                      <span>📞</span>
                      <span>Call Now</span>
                    </a>

                    <a
                      href={`mailto:${tier.email}?subject=${encodeURIComponent(`[Tata Motors Official Escalation] Vehicle ${vehicle.reg_number} - ${vehicle.owner_name || 'Customer'}`)}`}
                      className="tap-bounce py-2.5 px-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20"
                    >
                      <span>✉️</span>
                      <span>Send Mail</span>
                    </a>

                    <a
                      href={`https://wa.me/91${tier.whatsapp}?text=${encodeURIComponent(`Hello, I am the owner of Tata vehicle ${vehicle.reg_number}. I have an escalation regarding my Tata Motors service.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="tap-bounce py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <span>💬</span>
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* 24x7 Roadside Assistance / Emergency Helpdesk Box */}
            <div className="bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-900 border border-rose-500/30 rounded-3xl p-4 flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-300 flex items-center justify-center text-xl ring-1 ring-rose-400/30">
                  🚨
                </div>
                <div>
                  <div className="text-[10px] font-extrabold text-rose-300 uppercase tracking-wider">
                    24x7 Breakdown & Towing Desk
                  </div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    Tata Motors Toll-Free Roadside Assistance
                  </div>
                </div>
              </div>
              <a
                href="tel:18002098282"
                className="tap-bounce py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-md shadow-rose-600/30 flex items-center gap-1"
              >
                <span>📞</span>
                <span>1800-209-8282</span>
              </a>
            </div>

            {/* Direct Escalation / Problem Mailer Composer Form */}
            <div className="mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>📝</span> Submit Written Problem / Escalation
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Form submit karne par turant management ko notification aur email draft ho jayega.
                  </p>
                </div>
              </div>

              {escalationSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl p-3 text-xs font-bold animate-in fade-in">
                  ✓ Escalation ticket registered & logged in workshop portal!
                </div>
              )}

              <form onSubmit={handleEscalationSubmit} className="space-y-3">
                {/* Escalation Level Selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Send Escalation To:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('crm')}
                      className={`py-2 px-1 rounded-xl transition truncate ${
                        escalationTarget === 'crm'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Payal (CRM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('sm')}
                      className={`py-2 px-1 rounded-xl transition truncate ${
                        escalationTarget === 'sm'
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Govind (SM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('gm')}
                      className={`py-2 px-1 rounded-xl transition truncate ${
                        escalationTarget === 'gm'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Rajesh Panday (GM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('tataccm')}
                      className={`py-2 px-1 rounded-xl transition truncate ${
                        escalationTarget === 'tataccm'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Akshay (Tata CCM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('tataregional')}
                      className={`py-2 px-1 rounded-xl transition truncate ${
                        escalationTarget === 'tataregional'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Gurmeet (Tata RCCM)
                    </button>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Subject / Concern Title
                  </label>
                  <input
                    type="text"
                    value={escalationSubject}
                    onChange={(e) => setEscalationSubject(e.target.value)}
                    placeholder="e.g. Engine sound inspection before service / Billing query"
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 transition"
                  />
                </div>

                {/* Message Body */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Detailed Message / Problem Description
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={escalationMessage}
                    onChange={(e) => setEscalationMessage(e.target.value)}
                    placeholder="Apna concern ya instruction detail me likhein..."
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={escalationSubmitting}
                  className="tap-bounce w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
                >
                  <span>✉️</span>
                  <span>{escalationSubmitting ? 'Logging Ticket...' : 'Send Escalation & Open Email'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB 5: SERVICE FEEDBACK ── */}
        {activeTab === 'feedback' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header Back Button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="tap-bounce text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-slate-900 border border-white/10"
              >
                <span>←</span>
                <span>Back to Overview</span>
              </button>
              <span className="text-xs text-slate-400 font-mono">Service Rating</span>
            </div>

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
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl p-3 text-xs font-bold animate-in fade-in">
                  ✓ Thank you! Your review has been submitted to Tata Motors Quality Desk.
                </div>
              )}

              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-2">
                    Overall Workshop Rating
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl transition ${
                          rating >= star
                            ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 scale-105'
                            : 'bg-slate-900 text-slate-600 border border-white/5'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Detailed Review & Suggestions
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Share details about Service Advisor behavior, repair quality, on-time delivery..."
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="tap-bounce w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
                >
                  <span>⭐</span>
                  <span>{feedbackSubmitting ? 'Submitting...' : 'Submit Rating & Review'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── FLOATING GLASS BOTTOM NAVIGATION DOCK (5 CLEAN ITEMS) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-1 pointer-events-none safe-bottom">
        <div className="max-w-md mx-auto pointer-events-auto mobile-glass-nav rounded-3xl p-1.5 sm:p-2 grid grid-cols-5 gap-1 items-center border border-white/10 shadow-2xl">
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition w-full ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base sm:text-lg">🏠</span>
            <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 whitespace-nowrap">Home</span>
          </button>

          {/* 2. Issues / Concerns (Position 2 right after Home as requested) */}
          <button
            type="button"
            onClick={() => setActiveTab('complaint')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition relative w-full ${
              activeTab === 'complaint' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base sm:text-lg">🚨</span>
            <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 whitespace-nowrap">Issues</span>
            {reportedConcerns.length > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-400 pulse-live-indicator" />
            )}
          </button>

          {/* 3. Bills / Estimates */}
          <button
            type="button"
            onClick={() => setActiveTab('estimate')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition relative w-full ${
              activeTab === 'estimate' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base sm:text-lg">📋</span>
            <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 whitespace-nowrap">Bills</span>
            {isPendingApproval && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 pulse-live-indicator" />
            )}
          </button>

          {/* 4. Helpdesk */}
          <button
            type="button"
            onClick={() => setActiveTab('escalation')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition w-full ${
              activeTab === 'escalation' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base sm:text-lg">📞</span>
            <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 whitespace-nowrap">Helpdesk</span>
          </button>

          {/* 5. Review */}
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`tap-bounce flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition w-full ${
              activeTab === 'feedback' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base sm:text-lg">⭐</span>
            <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 whitespace-nowrap">Review</span>
          </button>
        </div>
      </div>

      {/* ── 3-LINE HAMBURGER SLIDE-OVER MENU DRAWER ── */}
      {showMenuDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setShowMenuDrawer(false)}
          />

          {/* Sliding Glass Panel */}
          <div className="relative z-10 w-full max-w-xs sm:max-w-sm h-full bg-slate-950/95 border-l border-white/10 shadow-2xl p-5 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Panel Header & Navigation */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-lg ring-1 ring-white/15 shrink-0">
                    🚘
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Tata Motors Service</span>
                    <h3 className="text-sm font-extrabold text-white">Menu & Services</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMenuDrawer(false)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center text-xs transition"
                >
                  ✕
                </button>
              </div>

              {/* Active Vehicle Info Badge */}
              <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-white/10 flex items-center justify-between gap-2 shadow-inner">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-white">{vehicle.reg_number}</span>
                    {vehicle.km_reading != null && vehicle.km_reading > 0 && (
                      <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {vehicle.km_reading.toLocaleString('en-IN')} KM
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">{vehicle.owner_name || 'Customer'}</p>
                </div>
                {allVehicles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenuDrawer(false)
                      setShowVehiclePicker(true)
                    }}
                    className="tap-bounce text-[10px] font-bold text-blue-400 bg-blue-600/20 hover:bg-blue-600/30 px-2 py-1 rounded-lg border border-blue-500/30 shrink-0"
                  >
                    Switch Car
                  </button>
                )}
              </div>

              {/* Menu Navigation Items */}
              <div className="space-y-1.5 pt-1">
                {/* 1. Home / Overview */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dashboard')
                    setShowMenuDrawer(false)
                  }}
                  className={`tap-bounce w-full p-3 rounded-2xl flex items-center justify-between transition ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-500/25'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🏠</span>
                    <div className="text-left">
                      <div className="text-xs font-bold">Home Overview</div>
                      <div className="text-[10px] opacity-75">Vehicle status & service details</div>
                    </div>
                  </div>
                  <span className="text-xs opacity-60">➔</span>
                </button>

                {/* 2. Report Issues & Concerns (Position 2 right after Home) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('complaint')
                    setShowMenuDrawer(false)
                  }}
                  className={`tap-bounce w-full p-3 rounded-2xl flex items-center justify-between transition ${
                    activeTab === 'complaint'
                      ? 'bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-500/25'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🚨</span>
                    <div className="text-left">
                      <div className="text-xs font-bold">Report Issues & Solutions</div>
                      <div className="text-[10px] opacity-75">Voice 🎙️, complaints & advisor reply</div>
                    </div>
                  </div>
                  <span className="text-xs opacity-60">➔</span>
                </button>

                {/* 3. Estimates & Invoices */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('estimate')
                    setShowMenuDrawer(false)
                  }}
                  className={`tap-bounce w-full p-3 rounded-2xl flex items-center justify-between transition ${
                    activeTab === 'estimate'
                      ? 'bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-500/25'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📋</span>
                    <div className="text-left">
                      <div className="text-xs font-bold">Estimates & Bills</div>
                      <div className="text-[10px] opacity-75">Itemized parts, approvals & bills</div>
                    </div>
                  </div>
                  {isPendingApproval ? (
                    <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-md">
                      Action
                    </span>
                  ) : (
                    <span className="text-xs opacity-60">➔</span>
                  )}
                </button>

                {/* 4. Official Vehicle Gatepass (Inside 3-Line Menu as requested) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDrawer(false)
                    if (isGatepassAccountsApproved) {
                      setShowGatepassModal(true)
                    } else {
                      setShowPendingApprovalModal(true)
                    }
                  }}
                  className="tap-bounce w-full p-3 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-900 border border-emerald-500/30 hover:border-emerald-400 flex items-center justify-between text-slate-200 shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🎫</span>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Official Gatepass</span>
                        {isGatepassAccountsApproved && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </div>
                      <div className="text-[10px] text-emerald-400">
                        {isGatepassAccountsApproved ? 'Approved · Download Pass' : 'Awaiting Accounts Clearance'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {isGatepassAccountsApproved ? 'Ready' : 'Pending'}
                  </span>
                </button>

                {/* 5. Helpdesk & Escalation */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('escalation')
                    setShowMenuDrawer(false)
                  }}
                  className={`tap-bounce w-full p-3 rounded-2xl flex items-center justify-between transition ${
                    activeTab === 'escalation'
                      ? 'bg-purple-600 text-white font-extrabold shadow-lg shadow-purple-500/25'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📞</span>
                    <div className="text-left">
                      <div className="text-xs font-bold">Helpdesk & Escalation Matrix</div>
                      <div className="text-[10px] opacity-75">Direct call/mail to advisor & team</div>
                    </div>
                  </div>
                  <span className="text-xs opacity-60">➔</span>
                </button>

                {/* 6. Service Review & Rating */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('feedback')
                    setShowMenuDrawer(false)
                  }}
                  className={`tap-bounce w-full p-3 rounded-2xl flex items-center justify-between transition ${
                    activeTab === 'feedback'
                      ? 'bg-amber-600 text-white font-extrabold shadow-lg shadow-amber-500/25'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">⭐</span>
                    <div className="text-left">
                      <div className="text-xs font-bold">Rate Workshop Experience</div>
                      <div className="text-[10px] opacity-75">Submit quality rating & review</div>
                    </div>
                  </div>
                  <span className="text-xs opacity-60">➔</span>
                </button>

                {/* 7. Lifetime Service History */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDrawer(false)
                    setShowHistoryModal(true)
                  }}
                  className="tap-bounce w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📜</span>
                    <div className="text-left">
                      <div className="text-xs font-bold">Lifetime Service History</div>
                      <div className="text-[10px] text-slate-400">{serviceHistory.length} Past Visits & Invoices</div>
                    </div>
                  </div>
                  <span className="text-xs opacity-60">➔</span>
                </button>
              </div>
            </div>

            {/* Panel Footer: 24x7 RSA & Logout Button (Inside 3-Line Menu as requested) */}
            <div className="pt-4 border-t border-white/10 space-y-2.5">
              <a
                href="tel:18002098282"
                className="tap-bounce w-full py-2.5 px-3 rounded-xl bg-slate-900 border border-white/10 hover:border-rose-500/30 text-xs font-bold text-slate-300 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span>🚨</span>
                  <span>24x7 Roadside Assistance</span>
                </div>
                <span className="font-mono text-blue-400 text-[11px]">1800-209-8282</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setShowMenuDrawer(false)
                  onLogout()
                }}
                className="tap-bounce w-full py-3 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition shadow-md"
              >
                <span>🚪</span>
                <span>Logout from Customer Portal</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Complete Lifetime Service History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-white/10 sticky top-0 bg-slate-950/90 py-1 backdrop-blur-sm z-10">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <span>📜</span> Lifetime Service History Records
                </h3>
                <p className="text-[11px] font-mono text-blue-400">{vehicle.reg_number} · {vehicle.model || 'Tata Motors'}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-xl bg-white/10"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3">
              {serviceHistory.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="bg-slate-900/90 rounded-2xl p-4 border border-white/10 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400">Visit #{serviceHistory.length - idx}</span>
                      <h4 className="font-bold text-white text-sm mt-0.5">{item.service_type}</h4>
                    </div>
                    <span className="font-mono font-extrabold text-emerald-400 text-sm bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                      {item.total_amount > 0 ? `₹${item.total_amount.toLocaleString('en-IN')}` : 'Free'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 bg-black/30 p-2.5 rounded-xl">
                    <div>📅 Date: <strong>{item.service_date}</strong></div>
                    <div>🛣️ Odometer: <strong>{item.km_reading != null ? `${item.km_reading.toLocaleString('en-IN')} KM` : 'N/A'}</strong></div>
                    <div>👨‍💼 SA: <strong>{item.service_advisor}</strong></div>
                    <div>📋 JC: <strong className="font-mono text-amber-300">{item.jc_number}</strong></div>
                  </div>

                  {item.items_summary && (
                    <div className="text-[11px] text-slate-400 bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-slate-300 font-bold block mb-0.5">Parts & Service Detail:</span>
                      {item.items_summary}
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1 text-[10px] text-slate-400 border-t border-white/5">
                    <span>Status: <strong className="text-emerald-400">✓ {item.status || 'Delivered'}</strong></span>
                    <span className="font-mono text-blue-400 font-bold">{item.invoice_no || 'INV-Done'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Online UPI & Card Payment Settlement Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm mobile-glass-dark rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <div className="text-left">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <span>💳</span> Settle Bill Online
                </h3>
                <p className="text-[11px] font-mono text-slate-400">Tata Motors Techwheels Service</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-xl bg-white/10"
              >
                ✕ Close
              </button>
            </div>

            {/* Payment Amount Callout */}
            <div className="bg-slate-900/90 rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Amount Due</span>
              <div className="font-mono text-2xl font-black text-emerald-400 mt-0.5">
                ₹{balanceDue.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-slate-400">Vehicle: {vehicle.reg_number} · JC #{vehicle.jc_number || 'Active'}</span>
            </div>

            {/* Payment Method Switcher (UPI or Card) */}
            <div className="grid grid-cols-2 p-1 bg-slate-900 rounded-2xl border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'upi'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📱</span>
                <span>UPI / QR</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'card'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>💳</span>
                <span>Debit / Card</span>
              </button>
            </div>

            {/* UPI Payment Tab Content */}
            {paymentMethod === 'upi' && (
              <div className="space-y-3 animate-in fade-in">
                {/* UPI QR Code Container */}
                <div className="bg-white p-3.5 rounded-2xl inline-block mx-auto shadow-inner ring-2 ring-emerald-500/30">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      `upi://pay?pa=techwheels.service@icici&pn=Techwheels%20Service&am=${balanceDue}&cu=INR&tn=Vehicle%20${vehicle.reg_number}%20Service%20Bill`
                    )}`}
                    alt="UPI Payment QR Code"
                    className="w-36 h-36 mx-auto rounded-lg"
                  />
                  <div className="mt-1.5 text-[10px] font-mono font-bold text-slate-900">
                    techwheels.service@icici
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Scan QR with GPay / PhonePe / Paytm to pay. Once paid, click below to mark your bill settled and unlock your official gatepass.
                </p>

                <div className="space-y-2">
                  <a
                    href={`upi://pay?pa=techwheels.service@icici&pn=Techwheels%20Service&am=${balanceDue}&cu=INR&tn=Vehicle%20${vehicle.reg_number}%20Service%20Bill`}
                    className="tap-bounce w-full py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/25"
                  >
                    <span>🚀</span>
                    <span>Launch UPI App</span>
                  </a>

                  <button
                    type="button"
                    disabled={cardPaying}
                    onClick={handlePaymentSuccess}
                    className="tap-bounce w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 active:from-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 flex items-center justify-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>{cardPaying ? 'Recording Settlement...' : '✓ Payment Done · Get Gatepass'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Card Payment Tab Content */}
            {paymentMethod === 'card' && (
              <form onSubmit={handleCardPaymentSubmit} className="space-y-3 text-left animate-in fade-in">
                <div>
                  <label className="text-[10px] font-bold text-slate-300 block mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    required
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-300 block mb-1">Card Number (16 Digits)</label>
                  <input
                    type="text"
                    required
                    maxLength={19}
                    value={cardNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 16)
                      const parts = v.match(/.{1,4}/g) || []
                      setCardNumber(parts.join(' '))
                    }}
                    placeholder="4532 ···· ···· 8921"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={cardExpiry}
                      onChange={(e) => {
                        let v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                        if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`
                        setCardExpiry(v)
                      }}
                      placeholder="08/28"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">CVV / CVC</label>
                    <input
                      type="password"
                      required
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                      placeholder="•••"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={cardPaying}
                    className="tap-bounce w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 active:from-emerald-700 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                  >
                    <span>🔒</span>
                    <span>
                      {cardPaying
                        ? 'Processing Payment...'
                        : `Pay ₹${balanceDue.toLocaleString('en-IN')} & Unlock Gatepass`}
                    </span>
                  </button>
                  <p className="text-[10px] text-slate-400 text-center mt-1.5">
                    🔒 256-bit Encrypted Secure Card Payment
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── OFFICIAL VEHICLE GATEPASS IN-APP DOCUMENT MODAL (PIXEL-PERFECT WORKSHOP SPEC) ── */}
      {showGatepassModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-900 space-y-4 animate-in zoom-in-95 my-auto">
            {/* Modal Controls Top Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-[11px] font-mono font-semibold text-slate-500">
                Gatepass · {effectiveJcNumber}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadOrPrintGatepass}
                  className="tap-bounce px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  <span>🖨️</span>
                  <span>Print / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGatepassModal(false)}
                  className="tap-bounce w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Exact Authentic Gatepass Document Layout */}
            <div className="bg-white p-1 rounded-2xl space-y-3 select-text">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-black tracking-wide uppercase">
                  VEHICLE GATEPASS
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5">
                  Techwheels Service · Mechanical · Printed {new Date().toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </p>
              </div>

              {/* Specification Table */}
              <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-300">
                      <th className="w-1/3 bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Job card
                      </th>
                      <td className="px-3 py-2 font-bold text-slate-900 font-mono">
                        {effectiveJcNumber}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Registration
                      </th>
                      <td className="px-3 py-2 font-bold text-slate-900 font-mono">
                        {vehicle.reg_number}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Owner
                      </th>
                      <td className="px-3 py-2 text-slate-900 font-medium">
                        {vehicle.owner_name || 'Customer'}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Service / Branch / SA
                      </th>
                      <td className="px-3 py-2 text-slate-900">
                        {vehicle.service_type || 'Paid Service'} · {vehicle.branch || 'Main Workshop'} · <strong className="text-slate-950">{cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || '—'}</strong>
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Invoice number
                      </th>
                      <td className="px-3 py-2 text-slate-900 font-mono">
                        {effectiveInvoiceNumber}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Invoice date
                      </th>
                      <td className="px-3 py-2 text-slate-900 font-mono">
                        {effectiveInvoiceDate}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Billed amount
                      </th>
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">
                        ₹{effectiveBilledMoney.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Amount received
                      </th>
                      <td className="px-3 py-2 font-mono font-bold text-emerald-700">
                        ₹{effectiveReceivedMoney.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Remaining
                      </th>
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">
                        ₹{effectiveRemainingMoney.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <th className="bg-slate-50 px-3 py-2 font-semibold text-slate-800 border-r border-slate-300">
                        Payment status
                      </th>
                      <td className="px-3 py-2 font-semibold text-emerald-600 lowercase">
                        {effectiveRemainingMoney === 0 ? 'received' : 'pending'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Official 3-Party Signature Verification Block */}
              <div className="grid grid-cols-3 gap-3 pt-6 pb-2 text-center text-[11px] font-medium text-slate-800">
                <div className="border-t border-black pt-1.5">
                  Accounts
                </div>
                <div className="border-t border-black pt-1.5">
                  Security / Gate
                </div>
                <div className="border-t border-black pt-1.5">
                  Customer
                </div>
              </div>
            </div>

            {/* Bottom Download & Share Action */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={downloadOrPrintGatepass}
                className="tap-bounce flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-xs shadow-lg shadow-blue-600/25 flex items-center justify-center gap-1.5"
              >
                <span>📥</span>
                <span>Download / Save Gatepass PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGatepassModal(false)}
                className="tap-bounce px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AWAITING ACCOUNTS CLEARANCE (WHEN GATEPASS NOT APPROVED YET) ── */}
      {showPendingApprovalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm mobile-glass-dark rounded-3xl p-6 border border-amber-500/30 shadow-2xl space-y-4 animate-in zoom-in-95 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-3xl mx-auto ring-2 ring-amber-500/30">
              ⏳
            </div>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                Accounts Verification Pending
              </div>
              <h3 className="text-base font-extrabold text-white mt-1">
                Gatepass Clearance In-Progress
              </h3>
            </div>
            <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-white/10 text-xs text-slate-300 space-y-2 text-left">
              <div className="flex justify-between items-center text-[11px] pb-1.5 border-b border-white/10">
                <span className="text-slate-400">Vehicle:</span>
                <span className="font-mono font-bold text-white">{vehicle.reg_number}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] pb-1.5 border-b border-white/10">
                <span className="text-slate-400">Job Card:</span>
                <span className="font-mono font-bold text-amber-300">{vehicle.jc_number || '—'}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Approval Status:</span>
                <span className="text-amber-400 font-bold">Awaiting Accounts Sign-off</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Gatepass tabhi generate aur download hoga jab Accounts desk payment verify karke approve karegi. Approval aate hi download option automatically enable ho jayega.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowPendingApprovalModal(false)
                  setActiveTab('escalation')
                }}
                className="tap-bounce flex-1 py-2.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-400/30 text-xs font-bold"
              >
                Contact Desk
              </button>
              <button
                type="button"
                onClick={() => setShowPendingApprovalModal(false)}
                className="tap-bounce flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold"
              >
                Okay, Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: INTERACTIVE STAGE DETAILS (WITH LIVE JOB CARD, ADVISOR, TECHNICIAN & BAY) ── */}
      {selectedStageModal !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm mobile-glass-dark rounded-3xl p-6 border border-blue-500/30 shadow-2xl space-y-4 animate-in zoom-in-95">
            {/* Header with Stage Icon & Status */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-2xl shadow-lg shadow-blue-500/25 ring-2 ring-white/10">
                  {stages[selectedStageModal]?.icon || '📋'}
                </div>
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
                    Stage {selectedStageModal + 1} of {stages.length}
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    {stages[selectedStageModal]?.label}
                  </h3>
                </div>
              </div>

              <span
                className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  selectedStageModal < currentStageIndex
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : selectedStageModal === currentStageIndex
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 pulse-live-indicator'
                    : 'bg-slate-800 text-slate-400 border border-white/10'
                }`}
              >
                {selectedStageModal < currentStageIndex
                  ? '✓ Completed'
                  : selectedStageModal === currentStageIndex
                  ? '⏳ Active Now'
                  : 'Upcoming'}
              </span>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-2xl border border-white/5">
              {stages[selectedStageModal]?.desc}
            </p>

            {/* Live Data Grid (Job Card, Advisor, Technician, Bay, Status) */}
            <div className="bg-slate-900/90 rounded-2xl p-4 border border-white/10 space-y-2.5 text-xs">
              {/* 1. Live Job Card Number */}
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span>📋</span>
                  <span>Job Card No:</span>
                </span>
                <span className="font-mono font-bold text-amber-300">
                  {vehicle.jc_number || 'Under Process'}
                </span>
              </div>

              {/* 2. Service Advisor */}
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span>👨‍💼</span>
                  <span>Service Advisor:</span>
                </span>
                <span className="font-bold text-white">
                  {cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || 'Assigned on check-in'}
                </span>
              </div>

              {/* 3. Allocated Technician (from Floor Incharge) */}
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span>🔧</span>
                  <span>Assigned Technician:</span>
                </span>
                <span className="font-bold text-emerald-300">
                  {allocatedTechnician?.name || (selectedStageModal >= 3 ? 'In allocation queue' : 'Assigned in repair stage')}
                </span>
              </div>

              {/* 4. Allocated Bay Number (from Floor Incharge) */}
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span>🏢</span>
                  <span>Workshop Bay:</span>
                </span>
                {allocatedTechnician?.bay_no ? (
                  <span className="font-mono font-bold bg-blue-600/30 text-blue-200 px-2 py-0.5 rounded border border-blue-400/30 text-[11px]">
                    Bay {allocatedTechnician.bay_no}
                  </span>
                ) : (
                  <span className="text-slate-400 italic">
                    {selectedStageModal >= 3 ? 'Allocating Bay...' : '—'}
                  </span>
                )}
              </div>

              {/* 5. Work Status */}
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>Floor Work Status:</span>
                </span>
                <span className="font-bold text-slate-200 capitalize">
                  {allocatedTechnician?.work_status
                    ? allocatedTechnician.work_status.replace(/_/g, ' ')
                    : (selectedStageModal < currentStageIndex ? 'Completed' : selectedStageModal === currentStageIndex ? 'In Process' : 'Pending')}
                </span>
              </div>

              {/* 6. Floor Incharge Remark (if any) */}
              {allocatedTechnician?.remark && (
                <div className="py-1 border-b border-white/5">
                  <div className="text-[11px] text-slate-400 mb-0.5">Floor Incharge Notes:</div>
                  <div className="text-slate-200 text-[11px] italic bg-slate-950 p-2 rounded-xl border border-white/5">
                    "{allocatedTechnician.remark}"
                  </div>
                </div>
              )}

              {/* 7. Timestamps */}
              {allocatedTechnician?.assigned_at && (
                <div className="flex justify-between items-center py-1 text-[11px] text-slate-400">
                  <span>Assigned Time:</span>
                  <span className="font-mono text-slate-300">
                    {new Date(allocatedTechnician.assigned_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedStageModal(null)}
              className="tap-bounce w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white font-extrabold text-xs shadow-lg shadow-blue-500/25 transition"
            >
              Close Stage Details
            </button>
          </div>
        </div>
      )}

      {/* ── OFFICIAL DIGITAL GATE PASS VIEW MODAL ── */}
      {showGatepassModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in"
          onClick={() => setShowGatepassModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white text-slate-900 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-md shadow-emerald-600/30 font-bold">
                  🎟️
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    Official Departure Pass
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Vehicle Gate Pass #{issuedGatePass?.gate_pass_no || (vehicle.jc_number ? `GP-${vehicle.jc_number.replace(/[^0-9]/g, '').slice(-5)}` : 'GP-AUTH')}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGatepassModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Clearance Verified Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">✅</span>
                <div>
                  <div className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                    {issuedGatePass?.payment_status || 'Accounts Clearance Verified'}
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    Authorized by {issuedGatePass?.issued_by || 'Accounts Desk · Dealership'}
                  </div>
                </div>
              </div>
              <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full font-mono">
                CLEARED
              </span>
            </div>

            {/* Pass Details Table */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Vehicle Reg:</span>
                <span className="font-mono font-black text-blue-700 text-sm">{vehicle.reg_number}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Owner Name:</span>
                <span className="font-extrabold text-slate-900 uppercase">{vehicle.owner_name || 'Customer'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Job Card No:</span>
                <span className="font-mono font-bold text-slate-800">{vehicle.jc_number || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Assigned Advisor:</span>
                <span className="font-bold text-slate-800">{cleanAdvisorPersonName(vehicle.sa_display_name || vehicle.sa_name) || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Assigned Technician:</span>
                <span className="font-bold text-emerald-800">{allocatedTechnician?.name || 'Assigned'}</span>
              </div>
              {allocatedTechnician?.bay_no && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-bold">Workshop Bay:</span>
                  <span className="font-mono font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded text-[11px]">
                    Bay {allocatedTechnician.bay_no}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Invoice / Bill Ref:</span>
                <span className="font-mono text-slate-700">{issuedGatePass?.invoice_no || 'DMS Billed'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Workshop Branch:</span>
                <span className="font-medium text-slate-700">{vehicle.branch || 'Sitapura Workshop'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-bold">Issued Timestamp:</span>
                <span className="font-medium text-slate-600">{issuedGatePass?.issued_at || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              </div>
            </div>

            {/* QR Authentication Token */}
            <div className="bg-slate-900 text-white p-3 rounded-2xl text-center space-y-1">
              <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Security Clearance QR Signature</div>
              <div className="text-xs font-mono font-bold text-emerald-400">
                {issuedGatePass?.qr_token || `GP_AUTH_${vehicle.reg_number}_DEALERSHIP_SECURE`}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🖨️</span>
                <span>Print / Save Gate Pass</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGatepassModal(false)}
                className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
