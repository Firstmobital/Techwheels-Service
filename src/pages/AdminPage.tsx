// src/pages/AdminPage.tsx
// Drop this file into: src/pages/AdminPage.tsx

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────
type UserRole = 'admin' | 'manager' | 'staff' | 'viewer'

interface AppUser {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  branch: string | null
  is_active: boolean
  created_at: string
}

interface Module {
  id: number
  name: string
  label: string
  description: string | null
  icon: string | null
  route: string | null
  sort_order: number
  is_active: boolean
}

interface Permission {
  module_id: number
  can_view: boolean
  can_modify: boolean
  can_delete: boolean
}

// ── Role badge colors ─────────────────────────────────────────
const roleBadge: Record<UserRole, string> = {
  admin:   'bg-blue-100 text-blue-700',
  manager: 'bg-purple-100 text-purple-700',
  staff:   'bg-green-100 text-green-700',
  viewer:  'bg-gray-100 text-gray-600',
}

// ── Component ─────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'permissions' | 'modules'>('users')
  const [users, setUsers] = useState<AppUser[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Add user modal
  const [showAddUser, setShowAddUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('staff')
  const [newBranch, setNewBranch] = useState('')
  const [saving, setSaving] = useState(false)

  // Permissions
  const [selectedUserId, setSelectedUserId] = useState('')
  const [pendingPerms, setPendingPerms] = useState<Record<number, Permission>>({})
  const [savingPerms, setSavingPerms] = useState(false)

  // ── Load data ───────────────────────────────────────────────
  useEffect(() => {
    Promise.all([loadUsers(), loadModules()]).finally(() => setLoading(false))
  }, [])

  async function loadUsers() {
    const { data } = await supabase.from('users').select('*').order('full_name')
    setUsers(data || [])
  }

  async function loadModules() {
    const { data } = await supabase.from('modules').select('*').order('sort_order')
    setModules(data || [])
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Users ───────────────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  async function toggleUserActive(u: AppUser) {
    const { error } = await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    if (error) { showToast(error.message, 'error'); return }
    await loadUsers()
    showToast(u.is_active ? 'User deactivated' : 'User activated')
  }

  async function createUser() {
    if (!newEmail) { showToast('Email is required', 'error'); return }
    setSaving(true)
    // Create auth user — uses signUp, user gets confirmation email
    const { data, error } = await supabase.auth.signUp({
      email: newEmail,
      password: Math.random().toString(36).slice(-10) + 'A1!', // temp password
      options: { data: { full_name: newName } },
    })
    if (error) { showToast(error.message, 'error'); setSaving(false); return }

    const userId = data?.user?.id
    if (userId) {
      await supabase.from('users').upsert({
        id: userId, email: newEmail,
        full_name: newName || newEmail,
        role: newRole, branch: newBranch || null, is_active: true,
      })
    }
    setSaving(false)
    setShowAddUser(false)
    setNewName(''); setNewEmail(''); setNewRole('staff'); setNewBranch('')
    await loadUsers()
    showToast('User created — confirmation email sent')
  }

  // ── Permissions ─────────────────────────────────────────────
  async function loadPermsForUser(userId: string) {
    setSelectedUserId(userId)
    if (!userId) { setPendingPerms({}); return }
    const { data } = await supabase
      .from('user_module_permissions')
      .select('module_id, can_view, can_modify, can_delete')
      .eq('user_id', userId)
    const map: Record<number, Permission> = {}
    ;(data || []).forEach(p => { map[p.module_id] = p })
    setPendingPerms(map)
  }

  function setPerm(moduleId: number, field: 'can_view' | 'can_modify' | 'can_delete', val: boolean) {
    setPendingPerms(prev => ({
      ...prev,
      [moduleId]: { ...(prev[moduleId] || { module_id: moduleId, can_view: false, can_modify: false, can_delete: false }), [field]: val }
    }))
  }

  function quickSet(moduleId: number, mode: 'full' | 'none') {
    const full = mode === 'full'
    setPendingPerms(prev => ({
      ...prev,
      [moduleId]: { module_id: moduleId, can_view: full, can_modify: full, can_delete: full }
    }))
  }

  async function savePerms() {
    if (!selectedUserId) return
    setSavingPerms(true)
    const upserts = modules.filter(m => m.is_active).map(m => ({
      user_id: selectedUserId,
      module_id: m.id,
      can_view:   pendingPerms[m.id]?.can_view   ?? false,
      can_modify: pendingPerms[m.id]?.can_modify ?? false,
      can_delete: pendingPerms[m.id]?.can_delete ?? false,
    }))
    const { error } = await supabase
      .from('user_module_permissions')
      .upsert(upserts, { onConflict: 'user_id,module_id' })
    setSavingPerms(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Permissions saved ✓')
  }

  // ── Modules ─────────────────────────────────────────────────
  async function toggleModule(m: Module) {
    const { error } = await supabase.from('modules').update({ is_active: !m.is_active }).eq('id', m.id)
    if (error) { showToast(error.message, 'error'); return }
    await loadModules()
    showToast('Module updated')
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, roles, and module access</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['users', 'permissions', 'modules'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              tab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            ].join(' ')}
          >
            {t === 'users' ? '👤 Users' : t === 'permissions' ? '🔐 Permissions' : '🧩 Modules'}
          </button>
        ))}
      </div>

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowAddUser(true)}
              className="ml-auto px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add User
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Email', 'Role', 'Branch', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.branch || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setTab('permissions'); loadPermsForUser(u.id) }}
                          className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          🔐 Perms
                        </button>
                        <button
                          onClick={() => toggleUserActive(u)}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${u.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {tab === 'permissions' && (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500 whitespace-nowrap">Select User:</label>
              <select
                value={selectedUserId}
                onChange={e => loadPermsForUser(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 min-w-[260px]"
              >
                <option value="">— choose a user —</option>
                {users.filter(u => u.is_active).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.role})</option>
                ))}
              </select>
            </div>
            {selectedUserId && (
              <button
                onClick={savePerms}
                disabled={savingPerms}
                className="ml-auto px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingPerms ? 'Saving…' : '💾 Save Permissions'}
              </button>
            )}
          </div>

          {!selectedUserId ? (
            <div className="text-center text-gray-400 text-sm py-12">Select a user to manage their permissions</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Module</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">👁 View</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">✏️ Modify</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">🗑 Delete</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Quick Set</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modules.filter(m => m.is_active).map(m => {
                    const p = pendingPerms[m.id] || { can_view: false, can_modify: false, can_delete: false }
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{m.icon} {m.label}</div>
                          {m.description && <div className="text-xs text-gray-400 mt-0.5">{m.description}</div>}
                        </td>
                        {(['can_view', 'can_modify', 'can_delete'] as const).map(field => (
                          <td key={field} className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={p[field]}
                              onChange={e => setPerm(m.id, field, e.target.checked)}
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => quickSet(m.id, 'full')} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors">Full</button>
                            <button onClick={() => quickSet(m.id, 'none')} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 transition-colors">None</button>
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['#', 'Module', 'Route', 'Description', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modules.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{m.sort_order}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.icon} {m.label}</td>
                  <td className="px-4 py-3"><code className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{m.route}</code></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.description || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleModule(m)}
                      className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
              <button onClick={() => setShowAddUser(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Full Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Rajesh Kumar"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="rajesh@techwheels.in"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="viewer">Viewer — read only</option>
                  <option value="staff">Staff — view + modify</option>
                  <option value="manager">Manager — view + modify + delete</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Branch</label>
                <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="e.g. Mumbai"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">User will receive a confirmation email to set their password.</p>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setShowAddUser(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={createUser} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all z-50 ${
          toast.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  )
}
