import { useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native'
import {
  customerOpenBodyshopSurveyApprovalDocument,
  customerSetSurveyApprovalDecision,
  parseBodyshopSurveyApprovalDocument,
  type CustomerBodyshopEstimateDocument,
} from '../../lib/api/customerPortal'
import { CustomerCard, CustomerToast, PrimaryButton } from './customerUi'
import { CustomerTheme } from '../../lib/customer/customerTheme'

type Props = {
  token: string
  regNumber: string
  repairCard: Record<string, unknown> | null | undefined
  onDecided: () => void
  /** Dedicated Survey Approval module screen (shows empty state when no doc yet). */
  moduleScreen?: boolean
}

export function CustomerSurveyApprovalCard({ token, regNumber, repairCard, onDecided, moduleScreen }: Props) {
  const doc = parseBodyshopSurveyApprovalDocument(repairCard)
  const status = String(repairCard?.customer_survey_approval_status ?? '').trim().toLowerCase()
  const rejectRemark = String(repairCard?.customer_survey_rejection_reason ?? '').trim()

  const [busy, setBusy] = useState(false)
  const [openingDoc, setOpeningDoc] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  if (!doc) {
    if (!moduleScreen) return null
    return (
      <CustomerCard>
        <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900' }}>Survey Approval</Text>
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginTop: 8, lineHeight: 18 }}>
          Your Service Advisor has not uploaded the survey approval document yet. When it is uploaded here, you can view it
          and approve or reject with a remark.
        </Text>
      </CustomerCard>
    )
  }

  const pending = !status || status === 'pending'
  const approved = status === 'approved'
  const rejected = status === 'rejected'

  const openDoc = async () => {
    setOpeningDoc(true)
    try {
      const result = await customerOpenBodyshopSurveyApprovalDocument(token, regNumber, doc as CustomerBodyshopEstimateDocument)
      if (result.mode === 'preview') setPreviewUri(result.uri)
    } catch (e) {
      Alert.alert('Unable to open', e instanceof Error ? e.message : 'Document unavailable')
    } finally {
      setOpeningDoc(false)
    }
  }

  const decide = async (decision: 'approve' | 'reject') => {
    const reasonText = rejectReason.trim()
    if (decision === 'reject' && reasonText.length < 3) {
      Alert.alert('Reason required', 'Please tell us why you are rejecting (min 3 characters).')
      return
    }
    setBusy(true)
    try {
      await customerSetSurveyApprovalDecision(token, regNumber, decision, decision === 'reject' ? reasonText : undefined)
      setShowReject(false)
      setRejectReason('')
      setToast({
        ok: decision === 'approve',
        msg: decision === 'approve'
          ? 'Survey approval accepted. Your advisor can proceed with floor work.'
          : 'Survey approval rejected. Your advisor will see your remark and may upload a revised document.',
      })
      onDecided()
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CustomerCard style={{ marginBottom: 14, borderColor: CustomerTheme.primary, borderWidth: 1 }}>
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}
      <Text style={{ color: CustomerTheme.ink, fontSize: 16, fontWeight: '900' }}>Survey approval</Text>
      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
        Your advisor uploaded the insurer / surveyor approval document. Please review and confirm.
      </Text>

      <View style={{ marginTop: 12 }}>
        <PrimaryButton
          label={openingDoc ? 'Opening…' : 'View approval document'}
          onPress={() => void openDoc()}
          loading={openingDoc}
        />
      </View>

      {approved ? (
        <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#ECFDF5' }}>
          <Text style={{ color: '#047857', fontWeight: '800', fontSize: 13 }}>You approved this document</Text>
        </View>
      ) : null}

      {rejected ? (
        <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2' }}>
          <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 13 }}>You rejected this document</Text>
          {rejectRemark ? (
            <Text style={{ color: '#7F1D1D', fontSize: 12, marginTop: 6, lineHeight: 17 }}>{rejectRemark}</Text>
          ) : null}
          <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11.5, marginTop: 8 }}>
            Contact your advisor if you need a revised upload.
          </Text>
        </View>
      ) : null}

      {pending ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onPress={() => void decide('approve')}
          >
            <View style={{ backgroundColor: '#ECFDF5', borderColor: '#86EFAC', borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              {busy ? <ActivityIndicator color="#047857" /> : <Text style={{ color: '#047857', fontWeight: '800' }}>Approve</Text>}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onPress={() => setShowReject(true)}
          >
            <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#B91C1C', fontWeight: '800' }}>Reject</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={showReject} transparent animationType="fade" onRequestClose={() => setShowReject(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: CustomerTheme.ink }}>Rejection reason</Text>
            <Text style={{ fontSize: 12, color: CustomerTheme.inkMuted, marginTop: 4, marginBottom: 10 }}>
              Your advisor will see this on the workshop portal.
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Explain what is wrong or missing…"
              multiline
              style={{
                borderWidth: 1,
                borderColor: CustomerTheme.border,
                borderRadius: 8,
                padding: 10,
                minHeight: 90,
                textAlignVertical: 'top',
                fontSize: 14,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowReject(false)}>
                <View style={{ paddingVertical: 11, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: CustomerTheme.border }}>
                  <Text style={{ fontWeight: '700', color: CustomerTheme.inkMuted }}>Cancel</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} disabled={busy} onPress={() => void decide('reject')}>
                <View style={{ paddingVertical: 11, alignItems: 'center', borderRadius: 8, backgroundColor: '#B91C1C' }}>
                  <Text style={{ fontWeight: '800', color: '#fff' }}>{busy ? 'Saving…' : 'Submit reject'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 48, right: 16, zIndex: 2, padding: 8 }} onPress={() => setPreviewUri(null)}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Close</Text>
          </TouchableOpacity>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={{ flex: 1 }} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </CustomerCard>
  )
}
