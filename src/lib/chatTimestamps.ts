const IST = 'Asia/Kolkata'

export function chatDayKey(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: IST })
}

function todayKeyIst(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: IST })
}

function yesterdayKeyIst(now = new Date()): string {
  const parts = todayKeyIst(now).split('-').map(Number)
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

/** WhatsApp-style day chip: Today, Yesterday, weekday, or date. */
export function formatChatDaySeparator(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  const key = chatDayKey(iso)
  if (!key) return ''
  if (key === todayKeyIst(now)) return 'Today'
  if (key === yesterdayKeyIst(now)) return 'Yesterday'

  const msgUtc = Date.parse(iso)
  if (!Number.isNaN(msgUtc)) {
    const todayUtc = Date.parse(`${todayKeyIst(now)}T00:00:00.000Z`)
    const daysAgo = Math.floor((todayUtc - msgUtc) / 86400000)
    if (daysAgo >= 2 && daysAgo < 7) {
      return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', timeZone: IST })
    }
  }

  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  })
}

/** Time under each bubble (always show clock time in IST). */
export function formatChatMessageTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  })
}

/** Inbox row: time if today, else day label. */
export function formatChatListPreviewTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  if (chatDayKey(iso) === todayKeyIst(now)) return formatChatMessageTime(iso)
  return formatChatDaySeparator(iso, now)
}

export type ChatTimelineItem<T extends { id: string; created_at: string }> =
  | { type: 'day'; key: string; label: string }
  | { type: 'message'; key: string; message: T }

export function buildChatTimeline<T extends { id: string; created_at: string }>(
  messages: T[],
): ChatTimelineItem<T>[] {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const out: ChatTimelineItem<T>[] = []
  let lastDay = ''
  for (const msg of sorted) {
    const day = chatDayKey(msg.created_at)
    if (day && day !== lastDay) {
      lastDay = day
      out.push({
        type: 'day',
        key: `day-${day}`,
        label: formatChatDaySeparator(msg.created_at),
      })
    }
    out.push({ type: 'message', key: msg.id, message: msg })
  }
  return out
}
