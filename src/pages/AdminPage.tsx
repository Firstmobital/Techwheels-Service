// src/pages/AdminPage.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type UserRole = 'admin' | 'manager' | 'staff' | 'viewer'

interface AppUser {
  id:          string
  email:       string
  full_name:   string | null
  role:        UserRole
  branch:      string | null
  dealer_code: string | null
  dealer_name: string | null
  is_active:   boolean
  created_at:  string
}

interface Module {
  id:          number
  name:        string
  label:       string
  description: string | null
  icon:        string | null
  route:       string | null
  sort_order:  number
  is_active:   boolean
}

interface Permission {
  module_id:  number
  can_view:   boolean
  can_modify: boolean
  can_delete: boolean
}

interface TempPasswordForm {
  userId: string
  email: string
  tempPassword: string
  emailConfirm: boolean
}

interface FunctionInvokeError extends Error {
  context?: Response
}

function isMissingDealerColumnError(error: unknown): boolean {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''
  return /dealer_code|dealer_name|column/i.test(message)
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const roleBadge: Record<UserRole, string> = {
  admin:   'bg-blue-100 text-blue-700',
  manager: 'bg-purple-100 text-purple-700',
  staff:   'bg-green-100 text-green-700',
  viewer:  'bg-gray-100 text-gray-600',
}

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+-='
  let value = ''
  for (let i = 0; i < 16; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${value}Aa1!`
}

/** Call Edge Function to sync dealer fields into user_metadata / JWT. */
async function syncDealerToAuthMeta(
  userId:      string,
  dealerCode:  string | null,
  dealerName:  string | null,
) {
  try {
    const { error } = await supabase.functions.invoke('sync-dealer-metadata', {
      body: { userId, dealerCode, dealerName },
    })
    if (error) {
      console.warn('sync-dealer-metadata failed:', error)
      // Non-fatal: user can re-login to pick up JWT changes
    }
  } catch (err) {
    console.warn('Edge function call failed:', err)
    // Non-fatal: user can re-login to pick up JWT changes
  }
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  if (!(error instanceof Error)) {
    return 'Failed to invoke edge function'
  }

  const functionError = error as FunctionInvokeError
  const fallbackMessage = functionError.message || 'Edge function returned a non-2xx status code'

  if (!functionError.context) {
    return fallbackMessage
  }

  try {
    const payload = (await functionError.context.json()) as {
      error?: string
      message?: string
      details?: string
    }
    return payload.error ?? payload.message ?? payload.details ?? fallbackMessage
  } catch {
    return fallbackMessage
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab]         = useState<'users' | 'permissions' | 'modules'>('users')
  const [users, setUsers]     = useState<AppUser[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [supportsDealerColumns, setSupportsDealerColumns] = useState(true)

  // Add user modal
  const [showAddUser, setShowAddUser]   = useState(false)
  const [newName, setNewName]           = useState('')
  const [newEmail, setNewEmail]         = useState('')
  const [newRole, setNewRole]           = useState<UserRole>('staff')
  const [newBranch, setNewBranch]       = useState('')
  const [newDealerCode, setNewDealerCode] = useState('')
  const [newDealerName, setNewDealerName] = useState('')
  const [saving, setSaving]             = useState(false)

  // Set dealer modal (for existing users)
  const [dealerEditUser, setDealerEditUser]   = useState<AppUser | null>(null)
  const [editDealerCode, setEditDealerCode]   = useState('')
  const [editDealerName, setEditDealerName]   = useState('')
  const [savingDealer, setSavingDealer]       = useState(false)
  const [tempPasswordForm, setTempPasswordForm] = useState<TempPasswordForm | null>(null)
  const [settingTempPassword, setSettingTempPassword] = useState(false)

  // Permissions tab
  const [selectedUserId, setSelectedUserId] = useState('')
  const [pendingPerms, setPendingPerms]     = useState<Record<number, Permission>>({})
  const [savingPerms, setSavingPerms]       = useState(false)

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([loadUsers(), loadModules()]).finally(() => setLoading(false))
  }, [])

  async function loadUsers() {
    const withDealer = await supabase
      .from('users')
      .select('id, email, full_name, role, branch, dealer_code, dealer_name, is_active, created_at')
      .order('full_name')

    if (!withDealer.error) {
      setSupportsDealerColumns(true)
      setUsers((withDealer.data ?? []) as AppUser[])
      return
    }

    if (!isMissingDealerColumnError(withDealer.error)) {
      showToastMsg(withDealer.error.message, 'error')
      setUsers([])
      return
    }

    const fallback = await supabase
      .from('users')
      .select('id, email, full_name, role, branch, is_active, created_at')
      .order('full_name')

    if (fallback.error) {
      showToastMsg(fallback.error.message, 'error')
      setUsers([])
      return
    }

    setSupportsDealerColumns(false)
    setUsers(
      ((fallback.data ?? []) as Array<Omit<AppUser, 'dealer_code' | 'dealer_name'>>).map((u) => ({
        ...u,
        dealer_code: null,
        dealer_name: null,
      }))
    )
  }

  async function loadModules() {
    const { data } = await supabase.from('modules').select('*').order('sort_order')
    setModules(data ?? [])
  }

  function showToastMsg(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Create user ────────────────────────────────────────────────────────────
  async function createUser() {
    if (!newEmail) { showToastMsg('Email is required', 'error'); return }
    setSaving(true)

    // Use default dealer if not specified
    const defaultDealerCode = import.meta.env.VITE_DEFAULT_DEALER_CODE || 'DEFAULT'
    const defaultDealerName = import.meta.env.VITE_DEFAULT_DEALER_NAME || 'Your Dealership'
    
    const dealerCode = newDealerCode.trim().toUpperCase() || defaultDealerCode
    const dealerName = newDealerName.trim() || defaultDealerName

    const { data, error } = await supabase.auth.signUp({
      email:    newEmail,
      password: Math.random().toString(36).slice(-10) + 'A1!',
      options: {
        data: {
          full_name:   newName || null,
          dealer_code: dealerCode,  // Set in JWT
          dealer_name: dealerName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) { showToastMsg(error.message, 'error'); setSaving(false); return }

    const userId = data?.user?.id
    if (userId) {
      const upsertWithDealer = await supabase.from('users').upsert({
        id:        userId,
        email:     newEmail,
        full_name: newName   || newEmail,
        role:      newRole,
        branch:    newBranch || null,
        is_active: true,
        // DO NOT include dealer_code/dealer_name here
        // (they don't exist in schema; JWT is the source of truth)
      })

      if (upsertWithDealer.error && isMissingDealerColumnError(upsertWithDealer.error)) {
        setSupportsDealerColumns(false)
        await supabase.from('users').upsert({
          id:        userId,
          email:     newEmail,
          full_name: newName   || newEmail,
          role:      newRole,
          branch:    newBranch || null,
          is_active: true,
        })
      }
    }

    setSaving(false)
    setShowAddUser(false)
    setNewName(''); setNewEmail(''); setNewRole('staff'); setNewBranch('')
    setNewDealerCode(''); setNewDealerName('')
    await loadUsers()
    showToastMsg('User created — confirmation email sent')
  }

  // ── Activate / Deactivate ─────────────────────────────────────────────────
  async function toggleUserActive(u: AppUser) {
    const activating = !u.is_active
    const { error } = await supabase.from('users').update({ is_active: activating }).eq('id', u.id)
    if (error) { showToastMsg(error.message, 'error'); return }

    if (activating) {
      try {
        const { error: edgeFnError } = await supabase.functions.invoke('confirm-user-email', {
          body: { userId: u.id },
        })
        if (edgeFnError) {
          console.warn('Email confirm edge function failed:', edgeFnError)
          showToastMsg('Warning: Email confirmation may have failed (user may need to verify manually)', 'error')
        }
      } catch (err) {
        console.warn('Edge function call failed:', err)
        // Non-fatal
      }
    }

    await loadUsers()
    showToastMsg(activating ? 'User activated — can now log in' : 'User deactivated')
  }

  // ── Set dealer ─────────────────────────────────────────────────────────────
  function openDealerEdit(u: AppUser) {
    setDealerEditUser(u)
    setEditDealerCode(u.dealer_code ?? '')
    setEditDealerName(u.dealer_name ?? '')
  }

  async function saveDealer() {
    if (!dealerEditUser) return
    setSavingDealer(true)

    const code = editDealerCode.trim().toUpperCase() || null
    const name = editDealerName.trim() || null

    // 1. Update public.users (primary display source)
    const { error } = await supabase
      .from('users')
      .update({ dealer_code: code, dealer_name: name })
      .eq('id', dealerEditUser.id)

    if (error && !isMissingDealerColumnError(error)) {
      showToastMsg(error.message, 'error')
      setSavingDealer(false)
      return
    }

    if (error && isMissingDealerColumnError(error)) {
      setSupportsDealerColumns(false)
    }

    // 2. Sync into auth.users.raw_user_meta_data so JWT contains dealer_code on next login
    await syncDealerToAuthMeta(dealerEditUser.id, code, name)

    setSavingDealer(false)
    setDealerEditUser(null)
    await loadUsers()
    showToastMsg(
      error && isMissingDealerColumnError(error)
        ? 'Dealer metadata updated in auth. public.users dealer columns are not present in this schema, so dealer values are not shown in Admin users table.'
        : 'Dealer code updated. User must re-login for changes to take effect in reports.'
    )
  }

  // ── Temporary password (email throttle fallback) ─────────────────────────
  function openTempPasswordModal(u: AppUser) {
    setTempPasswordForm({
      userId: u.id,
      email: u.email,
      tempPassword: generateTemporaryPassword(),
      emailConfirm: true,
    })
  }

  async function setTemporaryPassword() {
    if (!tempPasswordForm) return
    if (!tempPasswordForm.tempPassword.trim()) {
      showToastMsg('Temporary password is required', 'error')
      return
    }

    setSettingTempPassword(true)
    const { error } = await supabase.functions.invoke('set-user-temp-password', {
      body: {
        userId: tempPasswordForm.userId,
        temporaryPassword: tempPasswordForm.tempPassword,
        emailConfirm: tempPasswordForm.emailConfirm,
      },
    })
    setSettingTempPassword(false)

    if (error) {
      const message = await extractFunctionErrorMessage(error)
      showToastMsg(message, 'error')
      return
    }

    showToastMsg('Temporary password set. Share it securely and ask user to change it immediately.')
    setTempPasswordForm(null)
  }

  // ── Permissions ────────────────────────────────────────────────────────────
  async function loadPermsForUser(userId: string) {
    setSelectedUserId(userId)
    if (!userId) { setPendingPerms({}); return }
    const { data } = await supabase
      .from('user_module_permissions')
      .select('module_id, can_view, can_modify, can_delete')
      .eq('user_id', userId)
    const map: Record<number, Permission> = {}
    ;(data ?? []).forEach(p => { map[p.module_id] = p })
    setPendingPerms(map)
  }

  function setPerm(moduleId: number, field: 'can_view' | 'can_modify' | 'can_delete', val: boolean) {
    setPendingPerms(prev => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] ?? { module_id: moduleId, can_view: false, can_modify: false, can_delete: false }),
        [field]: val,
      },
    }))
  }

  function quickSet(moduleId: number, mode: 'full' | 'none') {
    const full = mode === 'full'
    setPendingPerms(prev => ({
      ...prev,
      [moduleId]: { module_id: moduleId, can_view: full, can_modify: full, can_delete: full },
    }))
  }

  async function savePerms() {
    if (!selectedUserId) return
    setSavingPerms(true)
    const upserts = modules.filter(m => m.is_active).map(m => ({
      user_id:    selectedUserId,
      module_id:  m.id,
      can_view:   pendingPerms[m.id]?.can_view   ?? false,
      can_modify: pendingPerms[m.id]?.can_modify ?? false,
      can_delete: pendingPerms[m.id]?.can_delete ?? false,
    }))
    const { error } = await supabase
      .from('user_module_permissions')
      .upsert(upserts, { onConflict: 'user_id,module_id' })
    setSavingPerms(false)
    if (error) { showToastMsg(error.message, 'error'); return }
    showToastMsg('Permissions saved')
  }

  // ── Modules ────────────────────────────────────────────────────────────────
  async function toggleModule(m: Module) {
    const { error } = await supabase.from('modules').update({ is_active: !m.is_active }).eq('id', m.id)
    if (error) { showToastMsg(error.message, 'error'); return }
    await loadModules()
    showToastMsg('Module updated')
  }

  const filteredUsers = users.filter(u =>
    (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.dealer_code ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading…</div>
  )

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">Manage users, dealer assignments, and module access</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {(['users', 'permissions', 'modules'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'border-b-2 -mb-px px-4 py-2 text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            ].join(' ')}
          >
            {t === 'users' ? '👤 Users' : t === 'permissions' ? '🔐 Permissions' : '🧩 Modules'}
          </button>
        ))}
      </div>

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by name, email, or dealer code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowAddUser(true)}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              + Add User
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {['Name', 'Email', 'Dealer', 'Role', 'Branch', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.dealer_code ? (
                        <div>
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                            {u.dealer_code}
                          </span>
                          {u.dealer_name && (
                            <p className="mt-0.5 text-xs text-gray-400">{u.dealer_name}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic text-amber-600">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadge[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.branch || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openDealerEdit(u)}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-blue-50 hover:text-blue-700"
                          title="Set dealer code"
                        >
                          Set Dealer
                        </button>
                        <button
                          onClick={() => { setTab('permissions'); loadPermsForUser(u.id) }}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-gray-100"
                        >
                          Perms
                        </button>
                        <button
                          onClick={() => openTempPasswordModal(u)}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                          title="Set a temporary password without sending email"
                        >
                          Temp Password
                        </button>
                        <button
                          onClick={() => toggleUserActive(u)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            u.is_active
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Dealer assignment info box */}
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <strong>Dealer assignment:</strong> Each user must have a Dealer Code set before they can see AutoDoc job cards.
            The code must exactly match the <code className="rounded bg-amber-100 px-1">dealer_code</code> column in the{' '}
            <code className="rounded bg-amber-100 px-1">vehicles</code> table. After changing a dealer code, the user
            must <strong>sign out and back in</strong> for the updated JWT to take effect.
          </div>
          {!supportsDealerColumns && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Admin compatibility mode: current DB schema does not have
              <code className="mx-1 rounded bg-amber-100 px-1">public.users.dealer_code</code>
              or
              <code className="mx-1 rounded bg-amber-100 px-1">public.users.dealer_name</code>.
                Users are listed, and dealer assignment is handled via auth metadata/JWT.
            </div>
          )}
        </div>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {tab === 'permissions' && (
        <div>
          <div className="mb-6 flex items-center gap-4">
            <label className="whitespace-nowrap text-sm text-gray-500">Select User:</label>
            <select
              value={selectedUserId}
              onChange={e => loadPermsForUser(e.target.value)}
              className="min-w-[260px] rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— choose a user —</option>
              {users.filter(u => u.is_active).map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.role})</option>
              ))}
            </select>
            {selectedUserId && (
              <button
                onClick={savePerms}
                disabled={savingPerms}
                className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPerms ? 'Saving…' : '💾 Save Permissions'}
              </button>
            )}
          </div>

          {!selectedUserId ? (
            <div className="py-12 text-center text-sm text-gray-400">Select a user to manage their permissions</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Module</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">View</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Modify</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Delete</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Set</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modules.filter(m => m.is_active).map(m => {
                    const p = pendingPerms[m.id] ?? { can_view: false, can_modify: false, can_delete: false }
                    return (
                      <tr key={m.id} className="transition-colors hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{m.icon} {m.label}</div>
                          {m.description && <div className="mt-0.5 text-xs text-gray-400">{m.description}</div>}
                        </td>
                        {(['can_view', 'can_modify', 'can_delete'] as const).map(field => (
                          <td key={field} className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={p[field]}
                              onChange={e => setPerm(m.id, field, e.target.checked)}
                              className="h-4 w-4 cursor-pointer rounded accent-blue-600"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => quickSet(m.id, 'full')} className="rounded border border-gray-200 px-2 py-1 text-xs transition-colors hover:bg-blue-50 hover:text-blue-700">Full</button>
                            <button onClick={() => quickSet(m.id, 'none')} className="rounded border border-gray-200 px-2 py-1 text-xs transition-colors hover:bg-gray-100">None</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODULES TAB ── */}
      {tab === 'modules' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['#', 'Module', 'Route', 'Description', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modules.map(m => (
                <tr key={m.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{m.sort_order}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.icon} {m.label}</td>
                  <td className="px-4 py-3"><code className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{m.route}</code></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.description || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleModule(m)}
                      className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium transition-colors hover:bg-gray-100"
                    >
                      {m.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ADD USER MODAL ── */}
      {showAddUser && (
        <Modal title="Add New User" onClose={() => setShowAddUser(false)}>
          <div className="space-y-4">
            <Field label="Full Name">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Rajesh Kumar"
                className={INPUT} />
            </Field>
            <Field label="Email *">
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="rajesh@dealer.in"
                className={INPUT} />
            </Field>
            <Field label="Role">
              <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className={INPUT}>
                <option value="viewer">Viewer — read only</option>
                <option value="staff">Staff — view + modify</option>
                <option value="manager">Manager — view + modify + delete</option>
                <option value="admin">Admin — full access</option>
              </select>
            </Field>
            <Field label="Branch">
              <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="e.g. Mumbai"
                className={INPUT} />
            </Field>

            {/* Dealer section */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="mb-3 text-xs font-semibold text-blue-800">Dealer Assignment (required for AutoDoc access)</p>
              <div className="space-y-3">
                <Field label="Dealer Code">
                  <input
                    value={newDealerCode}
                    onChange={e => setNewDealerCode(e.target.value.toUpperCase())}
                    placeholder="e.g. TN123456"
                    className={INPUT}
                  />
                </Field>
                <Field label="Dealer Name">
                  <input
                    value={newDealerName}
                    onChange={e => setNewDealerName(e.target.value)}
                    placeholder="e.g. City Motors Pvt Ltd"
                    className={INPUT}
                  />
                </Field>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">User will receive a confirmation email to set their password.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setShowAddUser(false)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={createUser} disabled={saving} className={BTN_PRIMARY}>
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── SET DEALER MODAL ── */}
      {dealerEditUser && (
        <Modal
          title={`Set Dealer — ${dealerEditUser.full_name || dealerEditUser.email}`}
          onClose={() => setDealerEditUser(null)}
        >
          <div className="space-y-4">
            <Field label="Dealer Code">
              <input
                value={editDealerCode}
                onChange={e => setEditDealerCode(e.target.value.toUpperCase())}
                placeholder="e.g. TN123456"
                className={INPUT}
                autoFocus
              />
            </Field>
            <Field label="Dealer Name">
              <input
                value={editDealerName}
                onChange={e => setEditDealerName(e.target.value)}
                placeholder="e.g. City Motors Pvt Ltd"
                className={INPUT}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-amber-700">
            The user must <strong>sign out and sign back in</strong> for the updated dealer code to take effect in their reports and RLS filters.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setDealerEditUser(null)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={saveDealer} disabled={savingDealer} className={BTN_PRIMARY}>
              {savingDealer ? 'Saving…' : 'Save Dealer'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── TEMP PASSWORD MODAL ── */}
      {tempPasswordForm && (
        <Modal
          title={`Set Temporary Password — ${tempPasswordForm.email}`}
          onClose={() => setTempPasswordForm(null)}
        >
          <p className="mb-4 text-xs text-amber-700">
            Use this when auth email actions are rate-limited. Share via secure channel and require immediate password change.
          </p>
          <div className="space-y-4">
            <Field label="Temporary Password">
              <div className="flex gap-2">
                <input
                  value={tempPasswordForm.tempPassword}
                  onChange={e => setTempPasswordForm(prev => prev ? { ...prev, tempPassword: e.target.value } : prev)}
                  className={INPUT}
                  placeholder="Min 12 chars, with upper/lower/number/special"
                  autoFocus
                />
                <button
                  onClick={() => setTempPasswordForm(prev => prev ? { ...prev, tempPassword: generateTemporaryPassword() } : prev)}
                  className={BTN_SECONDARY}
                  type="button"
                >
                  Regenerate
                </button>
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={tempPasswordForm.emailConfirm}
                onChange={e => setTempPasswordForm(prev => prev ? { ...prev, emailConfirm: e.target.checked } : prev)}
                className="h-4 w-4 rounded accent-amber-600"
              />
              Mark user email as confirmed
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setTempPasswordForm(null)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={setTemporaryPassword} disabled={settingTempPassword} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50">
              {settingTempPassword ? 'Setting…' : 'Set Temp Password'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Shared mini-components ─────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'
const BTN_PRIMARY   = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50'
const BTN_SECONDARY = 'rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-600">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
