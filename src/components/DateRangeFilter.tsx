// src/components/DateRangeFilter.tsx
// Shared date-range bar used across all CRM modules

import { useState } from 'react'

export type DateRange = { from: string; to: string }

export type DateRangePreset = 'this-month' | 'last-month' | 'this-week' | 'last-7' | 'last-30' | 'custom'

function toIST(d: Date) {
  // returns YYYY-MM-DD in Asia/Kolkata
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function currentMonthRange(): DateRange {
  const now = new Date()
  const y = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
  const m = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(5, 7)
  const lastDay = new Date(Number(y), Number(m), 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` }
}

function getRange(preset: DateRangePreset, custom: DateRange): DateRange {
  const now = new Date()
  const today = toIST(now)

  if (preset === 'this-month') return currentMonthRange()

  if (preset === 'last-month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
    const mo = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(5, 7)
    const lastDay = new Date(Number(y), Number(mo), 0).getDate()
    return { from: `${y}-${mo}-01`, to: `${y}-${mo}-${String(lastDay).padStart(2, '0')}` }
  }

  if (preset === 'this-week') {
    const day = now.getDay() // 0=Sun
    const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7))
    return { from: toIST(mon), to: today }
  }

  if (preset === 'last-7') {
    const d = new Date(now); d.setDate(now.getDate() - 6)
    return { from: toIST(d), to: today }
  }

  if (preset === 'last-30') {
    const d = new Date(now); d.setDate(now.getDate() - 29)
    return { from: toIST(d), to: today }
  }

  return custom // 'custom'
}

interface Props {
  range: DateRange
  onChange: (r: DateRange) => void
  label?: string
  disabledPresets?: DateRangePreset[]
  initialPreset?: DateRangePreset
}

export default function DateRangeFilter({ range, onChange, label, disabledPresets, initialPreset = 'this-month' }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>(initialPreset)
  const [custom, setCustom] = useState<DateRange>(range)
  const disabledSet = new Set(disabledPresets ?? [])

  function apply(p: DateRangePreset, c?: DateRange) {
    const resolved = c ?? custom
    const r = getRange(p, resolved)
    onChange(r)
  }

  function handlePreset(p: DateRangePreset) {
    if (disabledSet.has(p)) return
    setPreset(p)
    if (p !== 'custom') apply(p)
  }

  const PRESETS: { key: DateRangePreset; label: string }[] = [
    { key: 'this-month', label: 'This Month' },
    { key: 'last-month', label: 'Last Month' },
    { key: 'this-week',  label: 'This Week'  },
    { key: 'last-7',     label: 'Last 7 Days'},
    { key: 'last-30',    label: 'Last 30 Days'},
    { key: 'custom',     label: 'Custom'      },
  ]

  return (
    <div className="toolbar toolbar--tight" style={{ flexWrap: 'wrap', rowGap: 6 }}>
      {label && <span className="toolbar__label">{label}</span>}
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          disabled={disabledSet.has(p.key)}
          className={`btn btn--sm ${preset === p.key ? 'btn--primary' : 'btn--ghost'}`}
          style={disabledSet.has(p.key) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          onClick={() => handlePreset(p.key)}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <>
          <input
            type="date"
            className="inp inp-sm"
            value={custom.from}
            style={{ width: 140 }}
            onChange={(e) => {
              const next = { ...custom, from: e.target.value }
              setCustom(next)
              apply('custom', next)
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>→</span>
          <input
            type="date"
            className="inp inp-sm"
            value={custom.to}
            style={{ width: 140 }}
            onChange={(e) => {
              const next = { ...custom, to: e.target.value }
              setCustom(next)
              apply('custom', next)
            }}
          />
        </>
      )}
    </div>
  )
}
