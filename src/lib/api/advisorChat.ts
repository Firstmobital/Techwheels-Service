import { supabase } from '../supabase'

export type AdvisorChatSide = 'customer' | 'staff'

export interface AdvisorChatThread {
  id: string
  dealer_code: string
  reg_number: string
  reg_key: string
  phone_10: string
  customer_name: string | null
  jc_number: string | null
  sa_name: string | null
  contact_key?: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_author_side: AdvisorChatSide | null
  staff_unread_count: number
  customer_unread_count: number
  created_at: string
  updated_at: string
}

export interface AdvisorChatMessage {
  id: string
  chat_id: string
  author_side: AdvisorChatSide
  author_user_id: string | null
  author_name: string
  body: string
  created_at: string
}

export interface AdvisorChatDetail {
  chat: AdvisorChatThread
  messages: AdvisorChatMessage[]
}

export async function listAdvisorChats(): Promise<AdvisorChatThread[]> {
  const { data, error } = await supabase.rpc('advisor_chat_list')
  if (error) throw error
  return (data || []) as AdvisorChatThread[]
}

export async function getAdvisorChat(chatId: string): Promise<AdvisorChatDetail> {
  const { data, error } = await supabase.rpc('advisor_chat_get', { p_chat_id: chatId })
  if (error) throw error
  return data as AdvisorChatDetail
}

export async function sendAdvisorChatMessage(chatId: string, body: string): Promise<AdvisorChatDetail> {
  const { data, error } = await supabase.rpc('advisor_chat_send', {
    p_chat_id: chatId,
    p_body: body,
  })
  if (error) throw error
  const payload = data as { chat: AdvisorChatThread; message: AdvisorChatMessage }
  return { chat: payload.chat, messages: [payload.message] }
}

export async function getAdvisorChatUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('advisor_chat_unread_count')
  if (error) throw error
  return Number(data || 0)
}

export interface AdvisorChatReplyReportRow {
  advisorKey: string
  advisorName: string
  employeeCode: string | null
  location: string | null
  totalThreads: number
  activeThreads: number
  endedThreads: number
  customerTurns: number
  repliedTurns: number
  pendingTurns: number
  avgReplySeconds: number | null
  minReplySeconds: number | null
  maxReplySeconds: number | null
}

function normAdvisorName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function normVehicleKey(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

type RepairCardCutoffMeta = {
  id: number
  job_card_no: string | null
  reg_number: string | null
  current_stage: number | null
  overall_status: string | null
  delivery_status: string | null
  delivery_marked_at: string | null
  delivered_at: string | null
  reinspection_status: string | null
  reinspection_at: string | null
  parts_entry_status: string | null
  billed_amount: number | null
  do_status: string | null
  do_amount: number | null
  do_payment_status: string | null
  customer_payment_status: string | null
  payment_status: string | null
  updated_at: string | null
}

function isRepairCardCompletedOrAtPayment(card: RepairCardCutoffMeta): {
  ended: boolean
  cutoffMs: number | null
} {
  const overall = String(card.overall_status ?? '').trim().toLowerCase()
  const delivery = String(card.delivery_status ?? '').trim().toLowerCase()
  const doStatus = String(card.do_status ?? '').trim().toLowerCase()
  const doPay = String(card.do_payment_status ?? '').trim().toLowerCase()
  const custPay = String(card.customer_payment_status ?? '').trim().toLowerCase()
  const payStatus = String(card.payment_status ?? '').trim().toLowerCase()
  const stage = Number(card.current_stage ?? 0)

  const atPaymentOrCompleted =
    overall === 'delivered'
    || delivery === 'done'
    || stage >= 17
    || (doStatus === 'received' && card.do_amount != null)
    || doPay === 'partial'
    || doPay === 'received'
    || custPay === 'partial'
    || custPay === 'received'
    || payStatus === 'partial'
    || payStatus === 'received'

  if (!atPaymentOrCompleted) {
    return { ended: false, cutoffMs: null }
  }

  const candidateIsos = [
    card.delivered_at,
    card.delivery_marked_at,
    card.updated_at,
    card.reinspection_at,
  ]
  for (const iso of candidateIsos) {
    if (!iso) continue
    const ms = new Date(iso).getTime()
    if (Number.isFinite(ms)) {
      return { ended: true, cutoffMs: ms }
    }
  }
  return { ended: true, cutoffMs: null }
}

export function formatReplyDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const totalSec = Math.round(seconds)
  if (totalSec < 60) return `${totalSec}s`
  const mins = Math.floor(totalSec / 60)
  const remSec = totalSec % 60
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`
  }
  const hours = Math.floor(mins / 60)
  const remMin = mins % 60
  if (hours < 24) {
    return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remHr = hours % 24
  return remHr > 0 ? `${days}d ${remHr}h` : `${days}d`
}

export async function fetchBodyshopAdvisorReplyReport(
  existingThreads?: AdvisorChatThread[],
): Promise<AdvisorChatReplyReportRow[]> {
  const { isBodyshopDepartment } = await import('../department')
  const { isBodyshopSaRole, isBodyshopSsaRole } = await import('../businessRoles')

  const [empRes, threads] = await Promise.all([
    supabase
      .from('employee_master')
      .select('employee_code, employee_name, department, role, location')
      .eq('is_active', true)
      .order('employee_name')
      .limit(1000),
    existingThreads ? Promise.resolve(existingThreads) : listAdvisorChats(),
  ])

  const bodyshopAdvisors = ((empRes.data ?? []) as Array<{
    employee_code: string
    employee_name: string
    department: string | null
    role: string | null
    location: string | null
  }>).filter(
    (emp) =>
      isBodyshopDepartment(emp.department)
      && (isBodyshopSaRole(emp.role) || isBodyshopSsaRole(emp.role)),
  )

  type Bucket = {
    advisorName: string
    employeeCode: string | null
    location: string | null
    threadIds: Set<string>
    activeThreadIds: Set<string>
    endedThreadIds: Set<string>
    replyDurationsSec: number[]
    customerTurns: number
    repliedTurns: number
    pendingTurns: number
  }

  const buckets = new Map<string, Bucket>()
  const codeToKey = new Map<string, string>()

  for (const emp of bodyshopAdvisors) {
    const key = normAdvisorName(emp.employee_name)
    if (!key) continue
    if (!buckets.has(key)) {
      buckets.set(key, {
        advisorName: emp.employee_name.trim(),
        employeeCode: emp.employee_code?.trim() || null,
        location: emp.location?.trim() || null,
        threadIds: new Set(),
        activeThreadIds: new Set(),
        endedThreadIds: new Set(),
        replyDurationsSec: [],
        customerTurns: 0,
        repliedTurns: 0,
        pendingTurns: 0,
      })
    }
    const code = String(emp.employee_code ?? '').trim().toUpperCase()
    if (code) codeToKey.set(code, key)
  }

  const advisorThreads = threads.filter(
    (t) => !t.contact_key || t.contact_key.toLowerCase() === 'advisor',
  )

  // Fetch matching bodyshop_repair_cards to know which vehicles have reached Payment (stage 18) or Delivery/Completed (stage 17).
  // Once a vehicle reaches Payment or is Completed, its chat is treated as ended in the report
  // (customer can still message the advisor normally in the chat app).
  const jcCandidates = Array.from(
    new Set(
      advisorThreads
        .map((t) => String(t.jc_number ?? '').trim())
        .filter(Boolean),
    ),
  )
  const regCandidates = Array.from(
    new Set(
      advisorThreads
        .map((t) => String(t.reg_number ?? '').trim())
        .filter(Boolean),
    ),
  )

  const cardByJc = new Map<string, RepairCardCutoffMeta>()
  const cardByReg = new Map<string, RepairCardCutoffMeta>()

  const cardSelect =
    'id, job_card_no, reg_number, current_stage, overall_status, delivery_status, delivery_marked_at, delivered_at, reinspection_status, reinspection_at, parts_entry_status, billed_amount, do_status, do_amount, do_payment_status, customer_payment_status, payment_status, updated_at'

  function registerRepairCards(cards: RepairCardCutoffMeta[]) {
    for (const c of cards) {
      const jcK = String(c.job_card_no ?? '').trim().toUpperCase()
      if (jcK) {
        const prev = cardByJc.get(jcK)
        if (!prev || c.id > prev.id) cardByJc.set(jcK, c)
      }
      const regK = normVehicleKey(c.reg_number)
      if (regK) {
        const prev = cardByReg.get(regK)
        if (!prev || c.id > prev.id) cardByReg.set(regK, c)
      }
    }
  }

  const chunkSize = 200
  for (let i = 0; i < jcCandidates.length; i += chunkSize) {
    const chunk = jcCandidates.slice(i, i + chunkSize)
    const { data } = await supabase
      .from('bodyshop_repair_cards')
      .select(cardSelect)
      .in('job_card_no', chunk)
    if (data) registerRepairCards(data as RepairCardCutoffMeta[])
  }
  for (let i = 0; i < regCandidates.length; i += chunkSize) {
    const chunk = regCandidates.slice(i, i + chunkSize)
    const { data } = await supabase
      .from('bodyshop_repair_cards')
      .select(cardSelect)
      .in('reg_number', chunk)
    if (data) registerRepairCards(data as RepairCardCutoffMeta[])
  }

  const chatIds = advisorThreads.map((t) => t.id).filter(Boolean)
  const messagesByChat = new Map<string, AdvisorChatMessage[]>()

  if (chatIds.length > 0) {
    let directFetchOk = true
    for (let i = 0; i < chatIds.length; i += chunkSize) {
      const chunk = chatIds.slice(i, i + chunkSize)
      const { data: msgRows, error: msgErr } = await supabase
        .from('advisor_chat_messages')
        .select('id, chat_id, author_side, author_user_id, author_name, body, created_at')
        .in('chat_id', chunk)
        .order('created_at', { ascending: true })
      if (msgErr) {
        directFetchOk = false
        break
      }
      for (const m of (msgRows ?? []) as AdvisorChatMessage[]) {
        const list = messagesByChat.get(m.chat_id) ?? []
        list.push(m)
        messagesByChat.set(m.chat_id, list)
      }
    }

    if (!directFetchOk) {
      messagesByChat.clear()
      await Promise.all(
        advisorThreads.map(async (t) => {
          try {
            const detail = await getAdvisorChat(t.id)
            messagesByChat.set(t.id, detail.messages || [])
          } catch {
            messagesByChat.set(t.id, [])
          }
        }),
      )
    }
  }

  function resolveBucketForThread(thread: AdvisorChatThread, msgs: AdvisorChatMessage[]): Bucket | null {
    const rawSa = normAdvisorName(thread.sa_name)
    if (rawSa && buckets.has(rawSa)) {
      return buckets.get(rawSa)!
    }
    if (rawSa) {
      for (const [k, b] of buckets.entries()) {
        if (k.includes(rawSa) || rawSa.includes(k)) return b
      }
    }
    for (const m of msgs) {
      if (m.author_side !== 'staff') continue
      const staffKey = normAdvisorName(m.author_name)
      if (staffKey && buckets.has(staffKey)) return buckets.get(staffKey)!
    }
    return null
  }

  for (const thread of advisorThreads) {
    const msgs = (messagesByChat.get(thread.id) ?? []).slice().sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )
    const bucket = resolveBucketForThread(thread, msgs)
    if (!bucket) continue

    const jcK = String(thread.jc_number ?? '').trim().toUpperCase()
    const regK = normVehicleKey(thread.reg_key || thread.reg_number)
    const card = (jcK ? cardByJc.get(jcK) : undefined) ?? (regK ? cardByReg.get(regK) : undefined)
    const cutoff = card ? isRepairCardCompletedOrAtPayment(card) : { ended: false, cutoffMs: null }

    bucket.threadIds.add(thread.id)
    if (cutoff.ended) {
      bucket.endedThreadIds.add(thread.id)
    } else {
      bucket.activeThreadIds.add(thread.id)
    }

    let waitingCustomerTs: number | null = null
    for (const m of msgs) {
      const ts = new Date(m.created_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (m.author_side === 'customer') {
        // Ignore new customer turns sent after the vehicle reached Payment / Completed
        if (cutoff.ended && cutoff.cutoffMs != null && ts > cutoff.cutoffMs) {
          continue
        }
        if (waitingCustomerTs === null) {
          waitingCustomerTs = ts
          bucket.customerTurns += 1
        }
      } else if (m.author_side === 'staff') {
        if (waitingCustomerTs !== null && ts >= waitingCustomerTs) {
          const diffSec = (ts - waitingCustomerTs) / 1000
          bucket.replyDurationsSec.push(diffSec)
          bucket.repliedTurns += 1
          waitingCustomerTs = null
        }
      }
    }
    // Once a vehicle is completed or reaches Payment, the chat is considered ended in the report
    // (never counts as a pending unanswered reply).
    if (waitingCustomerTs !== null && !cutoff.ended) {
      bucket.pendingTurns += 1
    }
  }

  const rows: AdvisorChatReplyReportRow[] = Array.from(buckets.entries()).map(([key, b]) => {
    const count = b.replyDurationsSec.length
    const avg =
      count > 0
        ? b.replyDurationsSec.reduce((sum, v) => sum + v, 0) / count
        : null
    const min = count > 0 ? Math.min(...b.replyDurationsSec) : null
    const max = count > 0 ? Math.max(...b.replyDurationsSec) : null
    return {
      advisorKey: key,
      advisorName: b.advisorName,
      employeeCode: b.employeeCode,
      location: b.location,
      totalThreads: b.threadIds.size,
      activeThreads: b.activeThreadIds.size,
      endedThreads: b.endedThreadIds.size,
      customerTurns: b.customerTurns,
      repliedTurns: b.repliedTurns,
      pendingTurns: b.pendingTurns,
      avgReplySeconds: avg,
      minReplySeconds: min,
      maxReplySeconds: max,
    }
  })

  return rows.sort((a, b) => {
    if (a.avgReplySeconds != null && b.avgReplySeconds != null) {
      return a.avgReplySeconds - b.avgReplySeconds
    }
    if (a.avgReplySeconds != null) return -1
    if (b.avgReplySeconds != null) return 1
    if (b.pendingTurns !== a.pendingTurns) return b.pendingTurns - a.pendingTurns
    return a.advisorName.localeCompare(b.advisorName)
  })
}
