import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createHelpTicket,
  listHelpTicketCategories,
  type HelpTicketCategory,
  type HelpTicketPriority,
} from '../../lib/api/helpTickets'
import { uploadHelpTicketAttachment } from '../../lib/helpTicketUpload'
import './helpTickets.css'

export default function RaiseHelpTicketPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<HelpTicketCategory[]>([])
  const [categoryKey, setCategoryKey] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<HelpTicketPriority | ''>('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listHelpTicketCategories()
      .then((rows) => {
        setCategories(rows)
        if (rows[0]) setCategoryKey(rows[0].key)
        if (!rows.length) {
          setError('No help ticket categories found. Ask an admin to run the categories seed migration.')
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load categories'
        setError(msg.includes('Employee link')
          ? `${msg}. Link an employee profile in Admin, or use an admin account after the latest hotfix migration.`
          : msg)
      })
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const created = await createHelpTicket({
        categoryKey,
        subject,
        description,
        priority: priority || null,
      })
      if (files?.length) {
        for (const file of Array.from(files)) {
          await uploadHelpTicketAttachment({ ticketId: created.id, file })
        }
      }
      navigate(`/help/tickets/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ht-page">
      <div className="ht-header">
        <div>
          <h1>Raise a ticket</h1>
          <p className="ht-sub">Tell us what you need help with</p>
        </div>
        <button type="button" className="ht-btn" onClick={() => navigate('/help/tickets')}>
          Back to my tickets
        </button>
      </div>

      {error && <div className="ht-error">{error}</div>}

      <form className="ht-form ht-card" onSubmit={onSubmit}>
        <label>
          Category
          <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label>
          Priority (optional)
          <select value={priority} onChange={(e) => setPriority(e.target.value as HelpTicketPriority | '')}>
            <option value="">Category default</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          Attachments (optional, max 25 MB each)
          <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
        </label>
        <div className="ht-actions">
          <button type="submit" className="ht-btn primary" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
