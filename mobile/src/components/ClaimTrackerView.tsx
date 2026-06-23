import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

interface ClaimRow {
  job_card_id:        string
  jc_number:          string | null
  reg_number:         string | null
  vin:                string | null
  model:              string | null
  colour:             string | null
  warranty_age_days:  number | null
  has_ppt_pre:        boolean
  has_ppt_post:       boolean
  has_excel_estimate: boolean
  gdc_status?:        string | null
  claim_hidden?:      boolean | null
  pre_pics?:          number
  under_repair_pics?: number
  post_pics?:         number
}

function ageLabel(days: number | null): { text: string; years: number } {
  if (days == null) return { text: '—', years: 0 }
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return { text: y > 0 ? `${y}Y ${m}M` : `${m}M`, years: y + m / 12 }
}

function PicBadge({ count, label, color }: { count: number; label: string; color: string }) {
  const ok = count > 0
  return (
    <View style={[s.badge, ok ? { backgroundColor: color + '20', borderColor: color } : s.badgeFail]}>
      <Text style={[s.badgeText, { color: ok ? color : '#dc2626' }]}>
        {ok ? `✓ ${label} (${count})` : `✗ ${label}`}
      </Text>
    </View>
  )
}

function DocBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={[s.badge, ok ? s.badgeOk : s.badgeFail]}>
      <Text style={[s.badgeText, { color: ok ? '#16a34a' : '#dc2626' }]}>
        {ok ? `✓ ${label}` : `✗ ${label}`}
      </Text>
    </View>
  )
}

export function ClaimTrackerView() {
  const [rows, setRows]       = useState<ClaimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [busyId, setBusyId]   = useState<string | null>(null)

  useEffect(() => { fetchClaims() }, [])

  async function fetchClaims() {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await sb
        .from('job_card_summary')
        .select(`job_card_id, jc_number, reg_number, vin, model, colour,
                 warranty_age_days, has_ppt_pre, has_ppt_post, has_excel_estimate,
                 gdc_status, claim_hidden`)
        .in('status', ['submitted', 'completed'])
        .order('warranty_age_days', { ascending: false })

      if (err) throw new Error(err.message)
      const base: ClaimRow[] = (data ?? []).map(r => ({
        ...r, pre_pics: 0, under_repair_pics: 0, post_pics: 0,
      }))

      if (base.length > 0) {
        const ids = base.map(r => r.job_card_id)
        const { data: photos } = await sb
          .from('panel_photos')
          .select('job_card_id, photo_type')
          .in('job_card_id', ids)

        if (photos) {
          const counts: Record<string, { defect: number; primer: number; paint: number }> = {}
          for (const p of photos) {
            if (!counts[p.job_card_id]) counts[p.job_card_id] = { defect: 0, primer: 0, paint: 0 }
            if (p.photo_type === 'defect') counts[p.job_card_id].defect++
            if (p.photo_type === 'primer') counts[p.job_card_id].primer++
            if (p.photo_type === 'paint')  counts[p.job_card_id].paint++
          }
          for (const r of base) {
            const c = counts[r.job_card_id]
            if (c) { r.pre_pics = c.defect; r.under_repair_pics = c.primer; r.post_pics = c.paint }
          }
        }
      }

      setRows(base)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function toggleGdc(id: string, current: string | null | undefined) {
    const next = current === 'done' ? 'none' : 'done'
    setBusyId(id)
    await sb.from('job_cards').update({ gdc_status: next }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, gdc_status: next } : r))
    setBusyId(null)
  }

  async function markSubmitted(id: string) {
    setBusyId(id)
    await sb.from('job_cards').update({ claim_hidden: true, claim_submitted_at: new Date().toISOString() }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, claim_hidden: true } : r))
    setBusyId(null)
  }

  async function undoSubmitted(id: string) {
    setBusyId(id)
    await sb.from('job_cards').update({ claim_hidden: false, claim_submitted_at: null }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, claim_hidden: false } : r))
    setBusyId(null)
  }

  const visible = rows.filter(r => !r.claim_hidden)
  const hidden  = rows.filter(r => r.claim_hidden)

  if (loading) return (
    <View style={s.center}><ActivityIndicator size="large" color="#6366f1" /></View>
  )
  if (error) return (
    <View style={s.center}>
      <Text style={{ color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{error}</Text>
      <TouchableOpacity onPress={fetchClaims} style={s.btn}>
        <Text style={s.btnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  )
  if (rows.length === 0) return (
    <View style={s.center}><Text style={{ color: '#9ca3af', fontSize: 13 }}>No submitted claims yet.</Text></View>
  )

  const renderCard = (row: ClaimRow) => {
    const { text: ageText, years: ageYears } = ageLabel(row.warranty_age_days)
    const needsGdc  = ageYears >= 3
    const gdcDone   = row.gdc_status === 'done'
    const canSubmit = !needsGdc || gdcDone
    const busy      = busyId === row.job_card_id
    const allPhotos = (row.pre_pics ?? 0) > 0 && (row.under_repair_pics ?? 0) > 0 && (row.post_pics ?? 0) > 0
    const allDocs   = row.has_ppt_pre && row.has_ppt_post && row.has_excel_estimate

    return (
      <View key={row.job_card_id} style={[s.card, row.claim_hidden && { opacity: 0.6 }]}>

        {/* Header: Reg No + Age */}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.regNo}>{row.reg_number ?? '—'}</Text>
            {row.jc_number && <Text style={s.sub}>#{row.jc_number}</Text>}
            {(row.model || row.colour) && (
              <Text style={s.sub}>{[row.model, row.colour].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
          <View style={[s.ageBadge, { backgroundColor: ageYears >= 3 ? '#fef3c7' : '#dcfce7' }]}>
            <Text style={[s.ageText, { color: ageYears >= 3 ? '#92400e' : '#166534' }]}>{ageText}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'center' }}>vehicle age</Text>
          </View>
        </View>

        {/* Chassis No */}
        <View style={s.chassisRow}>
          <Text style={s.label}>CHASSIS</Text>
          <Text style={s.mono}>{row.vin ?? '—'}</Text>
        </View>

        {/* Photos */}
        <Text style={s.sectionLabel}>PHOTOS</Text>
        <View style={s.wrap}>
          <PicBadge count={row.pre_pics ?? 0}          label="Pre-Repair"   color="#2563eb" />
          <PicBadge count={row.under_repair_pics ?? 0} label="Under Repair" color="#ea580c" />
          <PicBadge count={row.post_pics ?? 0}         label="Post-Repair"  color="#16a34a" />
        </View>

        {/* Documents */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>DOCUMENTS</Text>
        <View style={s.wrap}>
          <DocBadge ok={row.has_ppt_pre}        label="Pre-PPT" />
          <DocBadge ok={row.has_ppt_post}        label="Post-PPT" />
          <DocBadge ok={row.has_excel_estimate}  label="Estimate" />
        </View>

        {/* Warning */}
        {(!allPhotos || !allDocs) && (
          <View style={s.warn}>
            <Text style={s.warnText}>
              ⚠ {[!allPhotos && 'Missing photos', !allDocs && 'Missing documents'].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {/* Actions */}
        {!row.claim_hidden ? (
          <View style={[s.row, { gap: 8, marginTop: 10 }]}>
            {needsGdc && (
              <TouchableOpacity
                onPress={() => toggleGdc(row.job_card_id, row.gdc_status)}
                disabled={busy}
                style={[s.actionBtn, { backgroundColor: gdcDone ? '#16a34a' : '#f59e0b' }]}>
                <Text style={s.actionText}>{gdcDone ? '✓ GDC Done' : 'Create GDC'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => markSubmitted(row.job_card_id)}
              disabled={busy || !canSubmit}
              style={[s.actionBtn, { backgroundColor: canSubmit ? '#4f46e5' : '#d1d5db', flex: 1 }]}>
              <Text style={[s.actionText, !canSubmit && { color: '#9ca3af' }]}>
                ✓ Claim Submitted to TML
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => undoSubmitted(row.job_card_id)} disabled={busy} style={s.undoBtn}>
            <Text style={s.undoText}>↩ Undo — Reopen Claim</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      {/* Summary */}
      <View style={[s.row, { marginBottom: 12 }]}>
        <Text style={{ color: '#374151', fontSize: 13, fontWeight: '600' }}>
          {visible.length} active claim{visible.length !== 1 ? 's' : ''}
        </Text>
        {hidden.length > 0 && (
          <TouchableOpacity onPress={() => setShowHidden(v => !v)}>
            <Text style={{ color: '#6366f1', fontSize: 12, textDecorationLine: 'underline' }}>
              {showHidden ? 'Hide' : `Show ${hidden.length} submitted`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {visible.map(renderCard)}

      {showHidden && hidden.length > 0 && (
        <View>
          <Text style={[s.sectionLabel, { marginVertical: 12 }]}>SUBMITTED TO TML ({hidden.length})</Text>
          {hidden.map(renderCard)}
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  regNo:       { fontSize: 18, fontWeight: '700', color: '#111827', fontFamily: 'monospace' },
  sub:         { fontSize: 11, color: '#6b7280', marginTop: 1 },
  ageBadge:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  ageText:     { fontSize: 13, fontWeight: '700' },
  chassisRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, marginVertical: 8, gap: 8 },
  label:       { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, width: 56 },
  mono:        { fontSize: 12, color: '#1f2937', fontFamily: 'monospace', flex: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 6 },
  badge:       { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  badgeOk:     { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  badgeFail:   { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  badgeText:   { fontSize: 11, fontWeight: '600' },
  warn:        { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  warnText:    { fontSize: 11, color: '#92400e' },
  actionBtn:   { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  actionText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  undoBtn:     { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
  undoText:    { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  btn:         { backgroundColor: '#3b82f6', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  btnText:     { color: '#fff', fontSize: 13, fontWeight: '600' },
})
