import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { updateServiceAdvisorEntry, type ReceptionEntryRow } from '../lib/api'

interface CustomerRemarkModalProps {
  isOpen: boolean
  onClose: () => void
  rows: ReceptionEntryRow[]
  onSaveSuccess: (updatedRow: ReceptionEntryRow, newRemark: string) => void
  showToast: (msg: string) => void
}

const QUICK_REMARK_TAGS = [
  'Customer requested early delivery',
  'Customer approved estimate on call',
  'Customer reported noise issue',
  'Parts delay informed to customer',
  'Customer satisfied with service',
  'Vehicle delivery promised today',
]

export default function CustomerRemarkModal({
  isOpen,
  onClose,
  rows,
  onSaveSuccess,
  showToast,
}: CustomerRemarkModalProps) {
  const [regSearch, setRegSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<ReceptionEntryRow | null>(null)
  const [remarkText, setRemarkText] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchingDb, setSearchingDb] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dbResults, setDbResults] = useState<ReceptionEntryRow[]>([])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setRegSearch('')
      setSelectedEntry(null)
      setRemarkText('')
      setError(null)
      setDbResults([])
    }
  }, [isOpen])

  // Clean registration query
  const cleanQuery = regSearch.trim().toUpperCase()

  // Suggestions from currently loaded rows in Service Advisor
  const rowSuggestions = useMemo(() => {
    if (!cleanQuery || cleanQuery.length < 2) return []
    return rows.filter((r) => {
      const reg = (r.reg_number || '').toUpperCase()
      const jc = (r.jc_number || '').toUpperCase()
      const phone = (r.owner_phone || '').trim()
      const name = (r.owner_name || '').toUpperCase()
      return reg.includes(cleanQuery) || jc.includes(cleanQuery) || phone.includes(cleanQuery) || name.includes(cleanQuery)
    }).slice(0, 8)
  }, [rows, cleanQuery])

  // Search DB if not found in loaded rows
  async function searchDbForReg() {
    if (!cleanQuery) return
    setSearchingDb(true)
    setError(null)
    try {
      const { data, error: qErr } = await supabase
        .from('service_reception_entries')
        .select('*')
        .or(`reg_number.ilike.%${cleanQuery}%,jc_number.ilike.%${cleanQuery}%,owner_phone.ilike.%${cleanQuery}%`)
        .order('created_at', { ascending: false })
        .limit(10)

      if (qErr) throw qErr
      const found = (data || []) as ReceptionEntryRow[]
      setDbResults(found)
      if (found.length === 1 && !selectedEntry) {
        handleSelectEntry(found[0])
      } else if (found.length === 0 && rowSuggestions.length === 0) {
        setError(`No vehicle found matching "${cleanQuery}"`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search database')
    } finally {
      setSearchingDb(false)
    }
  }

  function handleSelectEntry(entry: ReceptionEntryRow) {
    setSelectedEntry(entry)
    setRegSearch(entry.reg_number)
    setRemarkText(entry.remark || '')
    setError(null)
  }

  async function handleSave() {
    if (!selectedEntry) {
      setError('Please select a vehicle registration number first.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await updateServiceAdvisorEntry(selectedEntry.id, {
        service_type: selectedEntry.service_type || 'Running Repairs',
        jc_number: selectedEntry.jc_number,
        km_reading: selectedEntry.km_reading,
        remark: remarkText.trim() || null,
      })

      if (res.error || !res.data) {
        throw new Error(res.error || 'Failed to save customer remark')
      }

      const updated = res.data as ReceptionEntryRow
      onSaveSuccess(updated, remarkText.trim())
      showToast(`Customer remark saved for ${selectedEntry.reg_number}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer remark')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const allSuggestions = rowSuggestions.length > 0 ? rowSuggestions : dbResults

  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div
        className="modal modal--md"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620 }}
      >
        <div className="modal__head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Customer Remark / Feedback</h3>
          </div>
          <button type="button" className="modal__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal__body" style={{ padding: '16px 20px' }}>
          {error && (
            <div className="brx-settle-banner is-error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* Registration Search Field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-sub, #4b5563)', marginBottom: 6 }}>
              Vehicle Registration No (VRN) / JC / Phone <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="inp mono"
                style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: 14, flex: 1 }}
                placeholder="e.g. GJ36AJ2837 or RJ45CM5553"
                value={regSearch}
                onChange={(e) => {
                  setRegSearch(e.target.value.toUpperCase())
                  if (selectedEntry && e.target.value.toUpperCase() !== selectedEntry.reg_number) {
                    setSelectedEntry(null)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (rowSuggestions.length > 0) {
                      handleSelectEntry(rowSuggestions[0])
                    } else {
                      void searchDbForReg()
                    }
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void searchDbForReg()}
                disabled={searchingDb || !cleanQuery}
                title="Search database for this registration number"
              >
                {searchingDb ? 'Searching…' : '🔍 Search'}
              </button>
            </div>

            {/* Suggestions list */}
            {!selectedEntry && allSuggestions.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  maxHeight: 180,
                  overflowY: 'auto',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 8,
                  background: 'var(--surface, #ffffff)',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
              >
                <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted, #6b7280)', background: 'var(--canvas, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                  Matching vehicles — Click to select:
                </div>
                {allSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectEntry(s)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      border: 'none',
                      borderBottom: '1px solid var(--border, #f3f4f6)',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <strong className="mono" style={{ color: '#1e40af', fontSize: 13.5 }}>{s.reg_number}</strong>
                      <span style={{ marginLeft: 8, color: 'var(--muted, #6b7280)', fontSize: 12 }}>
                        {s.model || ''} {s.service_type ? `· ${s.service_type}` : ''}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                      <div>{s.owner_name || s.owner_phone || '—'}</div>
                      {s.jc_number && <div className="mono" style={{ fontSize: 11 }}>{s.jc_number}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Vehicle Info Card */}
          {selectedEntry ? (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>
                    Selected Vehicle
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                      {selectedEntry.reg_number}
                    </span>
                    {selectedEntry.model && (
                      <span style={{ fontSize: 12, background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                        {selectedEntry.model}
                      </span>
                    )}
                    {selectedEntry.service_type && (
                      <span style={{ fontSize: 12, background: '#f1f5f9', color: '#334155', padding: '2px 7px', borderRadius: 4, fontWeight: 500 }}>
                        {selectedEntry.service_type}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="linkbtn linkbtn--sm"
                  onClick={() => setSelectedEntry(null)}
                  style={{ fontSize: 12, color: '#dc2626' }}
                >
                  Change vehicle
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px 16px', fontSize: 12.5, color: '#475569' }}>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Owner / Customer: </span>
                  <strong>{selectedEntry.owner_name || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Mobile: </span>
                  <strong className="mono">{selectedEntry.owner_phone || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>JC Number: </span>
                  <strong className="mono">{selectedEntry.jc_number || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Advisor: </span>
                  <strong>{selectedEntry.sa_display_name || selectedEntry.sa_name || '—'}</strong>
                </div>
              </div>
            </div>
          ) : (
            cleanQuery.length >= 2 && allSuggestions.length === 0 && !searchingDb && (
              <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, fontSize: 12.5, color: '#92400e', marginBottom: 14 }}>
                ℹ️ Type full or partial registration number above and click <strong>Search</strong> to load the vehicle.
              </div>
            )
          )}

          {/* Customer Feedback / Remark Textarea */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-sub, #4b5563)', marginBottom: 6 }}>
              Customer Feedback / Remark <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className="inp"
              rows={4}
              placeholder="Enter customer remark, feedback, special request, or voice details here…"
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              disabled={!selectedEntry || saving}
              style={{
                width: '100%',
                resize: 'vertical',
                minHeight: 90,
                fontSize: 13.5,
                background: !selectedEntry ? 'var(--canvas, #f9fafb)' : undefined,
                cursor: !selectedEntry ? 'not-allowed' : undefined,
              }}
            />

            {/* Quick remark tags */}
            {selectedEntry && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted, #6b7280)', marginBottom: 4 }}>Quick Suggestions:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {QUICK_REMARK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setRemarkText((prev) => {
                          const trimmed = prev.trim()
                          return trimmed ? `${trimmed}; ${tag}` : tag
                        })
                      }}
                      style={{
                        fontSize: 11.5,
                        padding: '3px 8px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: 999,
                        cursor: 'pointer',
                        color: '#334155',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e0f2fe'
                        e.currentTarget.style.borderColor = '#93c5fd'
                        e.currentTarget.style.color = '#0369a1'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f1f5f9'
                        e.currentTarget.style.borderColor = '#cbd5e1'
                        e.currentTarget.style.color = '#334155'
                      }}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal__foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleSave()}
            disabled={saving || !selectedEntry || !remarkText.trim()}
          >
            {saving ? 'Saving…' : 'Save Customer Remark'}
          </button>
        </div>
      </div>
    </div>
  )
}
