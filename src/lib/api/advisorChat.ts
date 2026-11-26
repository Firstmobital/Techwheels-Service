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

  const chatIds = advisorThreads.map((t) => t.id).filter(Boolean)
  const messagesByChat = new Map<string, AdvisorChatMessage[]>()

  if (chatIds.length > 0) {
    const chunkSize = 200
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

    bucket.threadIds.add(thread.id)

    let waitingCustomerTs: number | null = null
    for (const m of msgs) {
      const ts = new Date(m.created_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (m.author_side === 'customer') {
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
    if (waitingCustomerTs !== null) {
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
