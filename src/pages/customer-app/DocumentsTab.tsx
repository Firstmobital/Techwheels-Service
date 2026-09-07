import React, { useEffect, useRef, useState } from 'react'
import {
  getCustomerDocumentDownloadUrl,
  listCustomerDocuments,
  uploadCustomerDocument,
} from '../../lib/api/bodyshopCustomerApp'
import type { CustomerDocumentMeta } from '../../components/customer-app/types'

const DOC_LABELS: Record<CustomerDocumentMeta['doc_key'], string> = {
  doc_rc: 'RC',
  doc_dl: 'Driving Licence',
  doc_pan: 'PAN Card',
  doc_kyc: 'KYC Documents',
  doc_insurance: 'Insurance Copy',
}

const DOC_KEYS = Object.keys(DOC_LABELS) as CustomerDocumentMeta['doc_key'][]

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export default function DocumentsTab({ sessionToken }: { sessionToken: string }) {
  const [docs, setDocs] = useState<CustomerDocumentMeta[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingKeyRef = useRef<CustomerDocumentMeta['doc_key'] | null>(null)

  const refresh = () => {
    listCustomerDocuments(sessionToken).then(setDocs).catch((e) => setError(e.message))
  }

  useEffect(refresh, [sessionToken])

  function triggerUpload(docKey: CustomerDocumentMeta['doc_key']) {
    pendingKeyRef.current = docKey
    fileInputRef.current?.click()
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const docKey = pendingKeyRef.current
    e.target.value = ''
    if (!file || !docKey) return
    setBusyKey(docKey)
    setError(null)
    try {
      await uploadCustomerDocument(sessionToken, docKey, file)
      refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  async function handleView(docKey: CustomerDocumentMeta['doc_key']) {
    try {
      const url = await getCustomerDocumentDownloadUrl(sessionToken, docKey)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const byKey = new Map((docs ?? []).map((d) => [d.doc_key, d]))

  return (
    <div className="twba-card">
      <h2>Documents</h2>
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChosen} />
      {error && <div className="twba-error">{error}</div>}
      {DOC_KEYS.map((key) => {
        const doc = byKey.get(key)
        return (
          <div key={key} className="twba-field-row">
            <div>
              <div className="twba-field-label">{DOC_LABELS[key]}</div>
              <span
                className="twba-badge"
                style={doc ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}
              >
                {doc ? 'Uploaded' : 'Missing'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {doc && (
                <button className="twba-btn-secondary twba-btn" style={{ width: 'auto', padding: '6px 10px' }} onClick={() => handleView(key)}>
                  View
                </button>
              )}
              <button
                className="twba-btn"
                style={{ width: 'auto', padding: '6px 10px' }}
                disabled={busyKey === key}
                onClick={() => triggerUpload(key)}
              >
                {busyKey === key ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
