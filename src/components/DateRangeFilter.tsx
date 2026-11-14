/* eslint-disable react-refresh/only-export-components -- utility helpers co-located with the component they serve */
// src/components/DateRangeFilter.tsx
// Shared date-range bar used across all CRM modules

import { useEffect, useState } from 'react'

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

export function getRange(preset: DateRangePreset, custom: DateRange): DateRange {
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

export function inferPresetFromRange(range: DateRange): DateRangePreset | 'all' {
  if (!range.from && !range.to) return 'all'

  const presets: DateRangePreset[] = ['this-month', 'last-month', 'this-week', 'last-7', 'last-30']
  for (const preset of presets) {
    const candidate = getRange(preset, range)
    if (candidate.from === range.from && candidate.to === range.to) return preset
  }

  return 'custom'
}

interface Props {
  range: DateRange
  onChange: (r: DateRange) => void
  label?: string
  disabledPresets?: DateRangePreset[]
  includeAll?: boolean
  /** When Period = All, API uses this many days — shown in the dropdown label. */
  allLookbackDays?: number
  /** Override the All option label. Defaults to `All (${allLookbackDays}d)`. */
  allLabel?: string
  disabled?: boolean
  /** When Custom is active, show date inputs on a row below the preset dropdown (e.g. BUSY top bar). */
  stackCustomDates?: boolean
  /** When Custom is active, also show YYYY-MM-DD text fields (paste / keyboard edit). */
  customTextEdit?: boolean
}

export default function DateRangeFilter({
  range,
  onChange,
  label,
  disabledPresets,
  includeAll = false,
  allLookbackDays = 90,
  allLabel,
  disabled = false,
  stackCustomDates = false,
  customTextEdit = false,
}: Props) {
  const [preset, setPreset] = useState<DateRangePreset | 'all'>(() => inferPresetFromRange(range))
  const [custom, setCustom] = useState<DateRange>(range)
  const [customFromText, setCustomFromText] = useState(range.from)
  const [customToText, setCustomToText] = useState(range.to)
  const disabledSet = new Set(disabledPresets ?? [])

  useEffect(() => {
    setPreset(inferPresetFromRange(range))
    if (inferPresetFromRange(range) === 'custom') {
      setCustom(range)
      setCustomFromText(range.from)
      setCustomToText(range.to)
    }
  }, [range.from, range.to])

  function commitCustomText(which: 'from' | 'to', raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      const next = which === 'from' ? { ...custom, from: '' } : { ...custom, to: '' }
      setCustom(next)
      apply('custom', next)
      return
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? trimmed
      : (() => {
          const d = new Date(trimmed)
          if (Number.isNaN(d.getTime())) return null
          return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        })()
    if (!iso) return
    const next = which === 'from' ? { ...custom, from: iso } : { ...custom, to: iso }
    if (next.from && next.to && next.from > next.to) {
      if (which === 'from') next.to = iso
      else next.from = iso
    }
    setCustom(next)
    setCustomFromText(next.from)
    setCustomToText(next.to)
    apply('custom', next)
  }

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
    ...(includeAll ? [{ key: 'all' as const, label: allLabel ?? `All (${allLookbackDays}d)` }] : []),
    { key: 'this-month', label: 'This Month'  },
    { key: 'last-month', label: 'Last Month'  },
    { key: 'this-week',  label: 'This Week'   },
    { key: 'last-7',     label: 'Last 7 Days' },
    { key: 'last-30',    label: 'Last 30 Days'},
    { key: 'custom',     label: 'Custom'       },
  ]

  const presetSelect = (
    <select
      className="cft__sel"
      value={preset}
      disabled={disabled}
      onChange={(e) => handleSelect(e.target.value as DateRangePreset | 'all')}
    >
      {OPTIONS.map((o) => (
        <option key={o.key} value={o.key} disabled={o.key !== 'all' && disabledSet.has(o.key as DateRangePreset)}>
          {o.label}
        </option>
      ))}
    </select>
  )

  const customDateInputs = preset === 'custom' && (
    <>
      {customTextEdit ? (
        <>
          <input
            type="text"
            className="cft__sel"
            value={customFromText}
            style={{ width: 108 }}
            disabled={disabled}
            placeholder="YYYY-MM-DD"
            aria-label="From date (text)"
            onChange={(e) => setCustomFromText(e.target.value)}
            onBlur={() => commitCustomText('from', customFromText)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCustomText('from', customFromText) }}
          />
          <span className="cft__label">→</span>
          <input
            type="text"
            className="cft__sel"
            value={customToText}
            style={{ width: 108 }}
            disabled={disabled}
            placeholder="YYYY-MM-DD"
            aria-label="To date (text)"
            onChange={(e) => setCustomToText(e.target.value)}
            onBlur={() => commitCustomText('to', customToText)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCustomText('to', customToText) }}
          />
        </>
      ) : null}
      <input
        type="date"
        className="cft__sel"
        value={custom.from}
        style={{ width: 130 }}
        disabled={disabled}
        aria-label="From date"
        onChange={(e) => {
          const next = { ...custom, from: e.target.value }
          setCustom(next)
          setCustomFromText(next.from)
          apply('custom', next)
        }}
      />
      {!customTextEdit ? <span className="cft__label">→</span> : null}
      <input
        type="date"
        className="cft__sel"
        value={custom.to}
        style={{ width: 130 }}
        disabled={disabled}
        aria-label="To date"
        onChange={(e) => {
          const next = { ...custom, to: e.target.value }
          setCustom(next)
          setCustomToText(next.to)
          apply('custom', next)
        }}
      />
    </>
  )

  if (stackCustomDates) {
    return (
      <div className="cft cft--stack-custom">
        <div className="cft__preset-row">
          {label && <span className="cft__label">{label}</span>}
          {presetSelect}
        </div>
        {customDateInputs && (
          <div className="cft__custom-row">
            {customDateInputs}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {label && <span className="cft__label">{label}</span>}
      {presetSelect}
      {customDateInputs}
    </>
  )
}
