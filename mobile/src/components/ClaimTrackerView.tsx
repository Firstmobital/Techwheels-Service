/**
 * ClaimTrackerView (React Native / Expo)
 * Mobile counterpart of the web ClaimTrackerView
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

// ── types ─────────────────────────────────────────────────────────────────────
interface ClaimRow {
  job_card_id:           string
  jc_number:             string
  reg_number:            string | null
  vin:                   string | null
  model:                 string | null
  colour:                string | null
  complaint_date:        string
  date_of_sale:          string | null
  warranty_age_days:     number | null
  has_ppt_pre:           boolean
  has_ppt_post:          boolean
  has_excel_estimate:    boolean
  total_estimate_amount: number | null
  owner_name:            string | null
  km_reading:            number | null
  gdc_status?:           'none' | 'pending' | 'done' | null
  claim_hidden?:         boolean | null
}

// ── helpers ───────────────────────────────────────────────────────────────────
const LS_PREFIX = 'autodoc_claim_'
function ageLabel(days: number | null): { text: string; years: number } {
  if (!days) return { text: '—', years: 0 }
  const years  = Math.floor(days / 365)
  const months = Math.round((days % 365) / 30)
  return { text: `${years}Y ${months}M`, years }
}

// ── component ─────────────────────────────────────────────────────────────────
export function ClaimTrackerView() {
  const [rows,      setRows]      = useState<ClaimRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [gdcMap,    setGdcMap]    = useState<Record<string, string>>({})
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>({})
  const [busyId,    setBusyId]    = useState<string | null>(null)
  const [hasDbCols, setHasDbCols] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_card_summary')
      .select('job_card_id,jc_number,reg_number,vin,model,colour,complaint_date,date_of_sale,warranty_age_days,has_ppt_pre,has_ppt_post,has_excel_estimate,total_estimate_amount,owner_name,km_reading,gdc_status,claim_hidden')
      .in('status', ['submitted', 'completed'])
      .order('complaint_date', { ascending: false })
    if (error) { setLoading(false); return }
    const fetched = (data ?? []) as ClaimRow[]
    setRows(fetched)
    const dbCols = fetched.length === 0 || 'gdc_status' in fetched[0]
    setHasDbCols(dbCols)
    if (dbCols) {
      const gm: Record<string, string>  = {}
      const hm: Record<string, boolean> = {}
      fetched.forEach(r => {
        gm[r.job_card_id] = r.gdc_status ?? 'none'
        hm[r.job_card_id] = r.claim_hidden ?? false
      })
      setGdcMap(gm); setHiddenMap(hm)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void fetchRows() }, [fetchRows])

  async function toggleGdc(id: string, cur: string) {
    const next = cur === 'done' ? 'pending' : 'done'
    setBusyId(id)
    if (hasDbCols) await supabase.from('job_cards').update({ gdc_status: next }).eq('id', id)
    setGdcMap(m => ({ ...m, [id]: next }))
    setBusyId(null)
  }

  async function markSubmitted(id: string) {
    Alert.alert('Confirm', 'Mark this claim as submitted to TML?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'default', onPress: async () => {
        setBusyId(id)
        if (hasDbCols) await supabase.from('job_cards').update({ claim_hidden: true, claim_submitted_at: new Date().toISOString() }).eq('id', id)
        setHiddenMap(m => ({ ...m, [id]: true }))
        setBusyId(null)
      }}
    ])
  }

  const visible = rows.filter(r => !hiddenMap[r.job_card_id])

  if (loading) return (
    <View style={s.center}><ActivityIndicator size="large" color="#2a4cd0" /></View>
  )

  if (visible.length === 0) return (
    <View style={s.center}>
      <Text style={s.empty}>No submitted claims yet.</Text>
      <Text style={[s.empty, { fontSize: 12 }]}>Claims appear here once the email is sent.</Text>
    </View>
  )

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      {visible.map(row => {
        const gdc      = (gdcMap[row.job_card_id] ?? 'none') as 'none'|'pending'|'done'
        const busy     = busyId === row.job_card_id
        const { text: ageText, years } = ageLabel(row.warranty_age_days)
        const needsGdc = years >= 3
        const allOk    = row.has_ppt_pre && row.has_ppt_post && row.has_excel_estimate
        const blocked  = needsGdc && gdc !== 'done'

        return (
          <View key={row.job_card_id} style={s.card}>
            {/* Header */}
            <View style={s.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.jcNum}>{row.jc_number}</Text>
                <Text style={s.ownerName}>{row.owner_name ?? '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.regNum}>{row.reg_number ?? '—'}</Text>
                <Text style={s.modelTxt}>{row.model} · {row.colour}</Text>
              </View>
            </View>

            {/* Info pills */}
            <View style={s.infoRow}>
              <View style={s.infoPill}>
                <Text style={s.infoPillLabel}>VIN</Text>
                <Text style={s.infoPillVal} numberOfLines={1}>{row.vin ?? '—'}</Text>
              </View>
              <View style={[s.infoPill, needsGdc && { backgroundColor: '#fff8e7', borderColor: '#f59e0b' }]}>
                <Text style={s.infoPillLabel}>Age</Text>
                <Text style={[s.infoPillVal, needsGdc && { color: '#b45309' }]}>{ageText}</Text>
                {needsGdc && <Text style={{ fontSize: 9, color: '#b45309', fontWeight: '700' }}>GDC req.</Text>}
              </View>
            </View>

            {/* Doc checklist */}
            <View style={s.docsRow}>
              {[
                { ok: row.has_ppt_pre,        label: 'Pre-PPT' },
                { ok: row.has_ppt_post,       label: 'Post-PPT' },
                { ok: row.has_excel_estimate, label: 'Estimate' },
              ].map(({ ok, label }) => (
                <View key={label} style={[s.docChip, ok ? s.docChipOk : s.docChipBad]}>
                  <Text style={[s.docChipTxt, ok ? { color: '#059669' } : { color: '#dc2626' }]}>
                    {ok ? '✓' : '✗'} {label}
                  </Text>
                </View>
              ))}
            </View>
            {!allOk && (
              <Text style={{ fontSize: 10, color: '#dc2626', marginHorizontal: 12, marginBottom: 6 }}>
                ⚠ Missing documents — complete before submitting to TML
              </Text>
            )}

            {/* Estimate */}
            {!!row.total_estimate_amount && (
              <View style={s.estimateBar}>
                <Text style={{ fontSize: 11, color: '#1d4ed8' }}>Claim Value</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1d4ed8' }}>
                  Rs {row.total_estimate_amount.toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={s.actions}>
              {needsGdc && (
                <TouchableOpacity
                  style={[s.btn, gdc === 'done' ? s.btnGreen : s.btnAmber]}
                  disabled={busy}
                  onPress={() => void toggleGdc(row.job_card_id, gdc)}
                >
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={s.btnTxt}>{gdc === 'done' ? '✓ GDC Done' : '+ Create GDC'}</Text>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.btn, blocked ? s.btnDisabled : s.btnBlue]}
                disabled={busy || blocked}
                onPress={() => void markSubmitted(row.job_card_id)}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={[s.btnTxt, blocked && { color: '#9ca3af' }]}>
                    {blocked ? 'Complete GDC first' : '✓ Claim Submitted to TML'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll:       { flex: 1 },
  container:    { padding: 12, gap: 14, paddingBottom: 32 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty:        { fontSize: 15, fontWeight: '600', color: '#6b7280', textAlign: 'center', marginBottom: 4 },
  card:         { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  cardHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  jcNum:        { fontSize: 12, fontWeight: '700', color: '#374151', fontFamily: 'JetBrains Mono' },
  ownerName:    { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  regNum:       { fontSize: 13, fontWeight: '800', color: '#111827', fontFamily: 'JetBrains Mono' },
  modelTxt:     { fontSize: 10, color: '#9ca3af', marginTop: 1 },
  infoRow:      { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 6 },
  infoPill:     { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  infoPillLabel:{ fontSize: 9, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  infoPillVal:  { fontSize: 11, fontWeight: '700', color: '#374151' },
  docsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  docChip:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  docChipOk:    { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  docChipBad:   { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  docChipTxt:   { fontSize: 11, fontWeight: '600' },
  estimateBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eff6ff', marginHorizontal: 12, marginBottom: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  actions:      { padding: 12, gap: 8 },
  btn:          { borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnTxt:       { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnAmber:     { backgroundColor: '#f59e0b' },
  btnGreen:     { backgroundColor: '#059669' },
  btnBlue:      { backgroundColor: '#4f46e5' },
  btnDisabled:  { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
})
