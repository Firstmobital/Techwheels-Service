import { useCallback, useEffect, useState } from 'react'
import Icon from '../Icon'
import {
  createCustomerHelpdeskContact,
  deleteCustomerHelpdeskContact,
  listCustomerHelpdeskContacts,
  updateCustomerHelpdeskContact,
  type CustomerHelpdeskContact,
  type HelpdeskBadgeVariant,
  type HelpdeskContactGroup,
} from '../../lib/api/settings'

const EMPTY_DRAFT = {
  group_key: 'dealership' as HelpdeskContactGroup,
  sort_order: 0,
  level_label: '',
  contact_name: '',
  role_title: '',
  description: '',
  phone: '',
  email: '',
  icon_emoji: '👤',
  badge_variant: 'blue' as HelpdeskBadgeVariant,
  chat_contact_key: '',
  is_active: true,
}

function isMissingHelpdeskTableError(message: string) {
  const m = message.toLowerCase()
  return m.includes('42p01') || m.includes('settings_customer_helpdesk_contacts')
}

export function HelpdeskContactsSettingsSection({
  onMessage,
  onError,
  onContactsChanged,
}: {
  onMessage: (msg: string) => void
  onError: (msg: string) => void
  onContactsChanged?: () => void
}) {
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<CustomerHelpdeskContact[]>([])
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT })
  const [editId, setEditId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState({ ...EMPTY_DRAFT })

  const load = useCallback(async () => {
    setLoading(true)
    const result = await listCustomerHelpdeskContacts()
    setLoading(false)
    if (result.error) {
      if (isMissingHelpdeskTableError(String(result.error))) {
        setReady(false)
        setRows([])
        return
      }
      onError(String(result.error))
      return
    }
    setReady(true)
    setRows(result.data ?? [])
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    setSaving(true)
    const result = await createCustomerHelpdeskContact({
      groupKey: draft.group_key,
      sortOrder: draft.sort_order,
      levelLabel: draft.level_label,
      contactName: draft.contact_name,
      roleTitle: draft.role_title,
      description: draft.description,
      phone: draft.phone,
      email: draft.email,
      iconEmoji: draft.icon_emoji,
      badgeVariant: draft.badge_variant,
      chatContactKey: draft.chat_contact_key || null,
      isActive: draft.is_active,
    })
    setSaving(false)
    if (result.error) {
      onError(String(result.error))
      return
    }
    setDraft({ ...EMPTY_DRAFT })
    onMessage('Helpdesk contact added.')
    await load()
    onContactsChanged?.()
  }

  async function handleSaveEdit() {
    if (editId == null) return
    setSaving(true)
    const result = await updateCustomerHelpdeskContact(editId, {
      groupKey: editDraft.group_key,
      sortOrder: editDraft.sort_order,
      levelLabel: editDraft.level_label,
      contactName: editDraft.contact_name,
      roleTitle: editDraft.role_title,
      description: editDraft.description,
      phone: editDraft.phone,
      email: editDraft.email,
      iconEmoji: editDraft.icon_emoji,
      badgeVariant: editDraft.badge_variant,
      chatContactKey: editDraft.chat_contact_key || null,
      isActive: editDraft.is_active,
    })
    setSaving(false)
    if (result.error) {
      onError(String(result.error))
      return
    }
    setEditId(null)
    onMessage('Helpdesk contact updated.')
    await load()
    onContactsChanged?.()
  }

  async function handleDelete(row: CustomerHelpdeskContact) {
    if (!window.confirm(`Remove "${row.contact_name}" from the customer helpdesk?`)) return
    setSaving(true)
    const result = await deleteCustomerHelpdeskContact(row.id)
    setSaving(false)
    if (result.error) {
      onError(String(result.error))
      return
    }
    if (editId === row.id) setEditId(null)
    onMessage('Helpdesk contact removed.')
    await load()
    onContactsChanged?.()
  }

  function startEdit(row: CustomerHelpdeskContact) {
    setEditId(row.id)
    setEditDraft({
      group_key: row.group_key,
      sort_order: row.sort_order,
      level_label: row.level_label,
      contact_name: row.contact_name,
      role_title: row.role_title,
      description: row.description ?? '',
      phone: row.phone,
      email: row.email ?? '',
      icon_emoji: row.icon_emoji ?? '👤',
      badge_variant: row.badge_variant,
      chat_contact_key: row.chat_contact_key ?? '',
      is_active: row.is_active,
    })
  }

  const activeCount = rows.filter((r) => r.is_active).length

  return (
    <section id="customer-helpdesk" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Customer Helpdesk <span className="font-medium text-gray-500">({activeCount} active)</span>
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Contacts shown in the mobile app Help tab. Update names, phones, and emails when staff change.
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        {!ready && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Helpdesk table not deployed yet. Apply migration{' '}
            <code className="font-mono">20260925170000_settings_customer_helpdesk_contacts.sql</code> on Supabase.
          </div>
        )}

        <ContactFormGrid
          value={draft}
          onChange={setDraft}
          onSubmit={() => void handleCreate()}
          submitLabel={saving ? 'Saving…' : 'Add contact'}
          disabled={!ready || saving}
        />

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-2 py-2 font-semibold">Group</th>
                <th className="px-2 py-2 font-semibold">Level</th>
                <th className="px-2 py-2 font-semibold">Name</th>
                <th className="px-2 py-2 font-semibold">Phone</th>
                <th className="px-2 py-2 font-semibold">Email</th>
                <th className="px-2 py-2 font-semibold">Active</th>
                <th className="px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-gray-400">
                    No contacts configured.
                  </td>
                </tr>
              ) : (
                rows.map((row) =>
                  editId === row.id ? (
                    <tr key={row.id} className="border-b border-gray-100 bg-blue-50/40">
                      <td colSpan={7} className="p-3">
                        <ContactFormGrid
                          value={editDraft}
                          onChange={setEditDraft}
                          onSubmit={() => void handleSaveEdit()}
                          submitLabel={saving ? 'Saving…' : 'Save changes'}
                          disabled={saving}
                          compact
                        />
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-gray-600"
                          onClick={() => setEditId(null)}
                        >
                          Cancel edit
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="px-2 py-2 capitalize">{row.group_key.replace('_', ' ')}</td>
                      <td className="px-2 py-2">{row.level_label}</td>
                      <td className="px-2 py-2 font-semibold text-gray-900">{row.contact_name}</td>
                      <td className="px-2 py-2 font-mono">{row.phone}</td>
                      <td className="px-2 py-2">{row.email ?? '—'}</td>
                      <td className="px-2 py-2">{row.is_active ? 'Yes' : 'No'}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="font-semibold text-blue-700"
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="font-semibold text-red-600"
                            onClick={() => void handleDelete(row)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function ContactFormGrid({
  value,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
  compact,
}: {
  value: typeof EMPTY_DRAFT
  onChange: (v: typeof EMPTY_DRAFT) => void
  onSubmit: () => void
  submitLabel: string
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 ${compact ? '' : ''} md:grid-cols-12`}>
      <select
        value={value.group_key}
        onChange={(e) => onChange({ ...value, group_key: e.target.value as HelpdeskContactGroup })}
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      >
        <option value="dealership">Dealership</option>
        <option value="tata_motors">Tata Motors</option>
      </select>
      <input
        value={String(value.sort_order)}
        onChange={(e) => onChange({ ...value, sort_order: Number(e.target.value) || 0 })}
        placeholder="Sort"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-1"
      />
      <input
        value={value.level_label}
        onChange={(e) => onChange({ ...value, level_label: e.target.value })}
        placeholder="Level label"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      />
      <input
        value={value.contact_name}
        onChange={(e) => onChange({ ...value, contact_name: e.target.value })}
        placeholder="Contact name"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      />
      <input
        value={value.role_title}
        onChange={(e) => onChange({ ...value, role_title: e.target.value })}
        placeholder="Role / designation"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      />
      <input
        value={value.phone}
        onChange={(e) => onChange({ ...value, phone: e.target.value })}
        placeholder="Phone"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      />
      <input
        value={value.email}
        onChange={(e) => onChange({ ...value, email: e.target.value })}
        placeholder="Email"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-3"
      />
      <input
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        placeholder="Short description for customers"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-6"
      />
      <input
        value={value.icon_emoji}
        onChange={(e) => onChange({ ...value, icon_emoji: e.target.value })}
        placeholder="Icon emoji"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-1"
      />
      <select
        value={value.badge_variant}
        onChange={(e) => onChange({ ...value, badge_variant: e.target.value as HelpdeskBadgeVariant })}
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      >
        <option value="blue">Blue badge</option>
        <option value="amber">Amber</option>
        <option value="rose">Rose</option>
        <option value="indigo">Indigo</option>
        <option value="emerald">Emerald</option>
      </select>
      <input
        value={value.chat_contact_key}
        onChange={(e) => onChange({ ...value, chat_contact_key: e.target.value })}
        placeholder="Chat key (optional)"
        className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
      />
      <label className="flex items-center gap-1 text-xs md:col-span-2">
        <input
          type="checkbox"
          checked={value.is_active}
          onChange={(e) => onChange({ ...value, is_active: e.target.checked })}
        />
        Active in app
      </label>
      <div className="flex items-center md:col-span-2 md:justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          className="inline-flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Icon name="plus" size={12} strokeWidth={2.3} />
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
