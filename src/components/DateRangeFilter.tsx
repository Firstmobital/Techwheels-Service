// src/components/DateRangeFilter.tsx
// Shared date-range bar used across all CRM modules

import { useState } from 'react'

export type DateRange = { from: string; to: string }

export type DateRangePreset = 'this-month' | 'last-month' | 'this-week' | 'last-7' | 'last-30' | 'custom'

function toIST(d: Date) {
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
    const day = now.getDay()
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
  includeAll?: boolean
  defaultPreset?: DateRangePreset | 'all'
}

export default function DateRangeFilter({ range, onChange, label, disabledPresets, includeAll = false, defaultPreset }: Props) {
  const initialPreset: DateRangePreset | 'all' =
    defaultPreset
      ?? (includeAll && !range.from && !range.to ? 'all' : 'this-month')

  const [preset, setPreset] = useState<DateRangePreset | 'all'>(initialPreset)
  const [custom, setCustom] = useState<DateRange>(range)
  const disabledSet = new Set(disabledPresets ?? [])

  function apply(p: DateRangePreset, c?: DateRange) {
    const resolved = c ?? custom
    onChange(getRange(p, resolved))
  }

  function handleSelect(p: DateRangePreset | 'all') {
    if (p === 'all') {
      setPreset('all')
      onChange({ from: '', to: '' })
      return
    }
    if (disabledSet.has(p)) return
    setPreset(p)
    if (p !== 'custom') apply(p)
  }

  const OPTIONS: Array<{ key: DateRangePreset | 'all'; label: string }> = [
    ...(includeAll ? [{ key: 'all' as const, label: 'All' }] : []),
    { key: 'this-month', label: 'This Month'  },
    { key: 'last-month', label: 'Last Month'  },
    { key: 'this-week',  label: 'This Week'   },
    { key: 'last-7',     label: 'Last 7 Days' },
    { key: 'last-30',    label: 'Last 30 Days'},
    { key: 'custom',     label: 'Custom'       },
  ]

  return (
    <>
      {label && <span className="cft__label">{label}</span>}
      <select
        className="cft__sel"
        value={preset}
        onChange={(e) => handleSelect(e.target.value as DateRangePreset | 'all')}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key} disabled={o.key !== 'all' && disabledSet.has(o.key as DateRangePreset)}>
            {o.label}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <>
          <input
            type="date"
            className="cft__sel"
            value={custom.from}
            style={{ width: 130 }}
            onChange={(e) => {
              const next = { ...custom, from: e.target.value }
              setCustom(next)
              apply('custom', next)
            }}
          />
          <span className="cft__label">→</span>
          <input
            type="date"
            className="cft__sel"
            value={custom.to}
            style={{ width: 130 }}
            onChange={(e) => {
              const next = { ...custom, to: e.target.value }
              setCustom(next)
              apply('custom', next)
            }}
          />
        </>
      )}
    </>
  )
}
