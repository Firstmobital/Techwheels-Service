// src/pages/AdminPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import {
  listUserEmployeeLinks,
  createUserEmployeeLink,
  updateUserEmployeeLink,
  deactivateUserEmployeeLink,
  listEmployees,
  type UserEmployeeLinkRow,
} from '../lib/api/userEmployeeLinks'

// ── Types ──────────────────────────────────────────────────────────────────────
type UserRole = 'admin' | 'manager' | 'staff' | 'viewer'

interface AppUser {
  id:          string
  email:       string
  phone:       string | null
  full_name:   string | null
  role:        UserRole
  branch:      string | null
  dealer_code: string | null
  dealer_name: string | null
  dealer_codes?: string[] | null
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

interface UsersWithPhoneResponse {
  users: Array<{
    id: string
    email: string
    phone?: string | null
    full_name?: string | null
    role: UserRole
    branch?: string | null
    dealer_code?: string | null
    dealer_name?: string | null
    dealer_codes?: string[] | null
    is_active: boolean
    created_at: string
  }>
  supportsDealerColumns?: boolean
}

interface FunctionInvokeError extends Error {
  context?: Response
}

function normalizeDealerCodes(value: unknown): string[] | null {
  const normalizeList = (input: unknown[]): string[] => {
    const normalized = Array.from(
      new Set(
        input
          .map((item) => String(item ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    )
    return normalized
  }

  if (Array.isArray(value)) {
    const normalized = normalizeList(value)
    return normalized.length > 0 ? normalized : null
  }

  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return null

    if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('"[') && raw.endsWith(']"'))) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const normalized = normalizeList(parsed)
          return normalized.length > 0 ? normalized : null
        }
      } catch {
        // Fall through to split-based parsing
      }
    }

    const splitCodes = normalizeList(raw.split(/[\s,]+/))
    return splitCodes.length > 0 ? splitCodes : null
  }

  return null
}

function isMissingDealerColumnError(error: unknown): boolean {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''
  return /dealer_code|dealer_name|column/i.test(message)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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
  dealerCodes?: string[] | null,
) : Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.functions.invoke('sync-dealer-metadata', {
      body: { userId, dealerCode, dealerName, dealerCodes },
    })
    if (error) {
      console.warn('sync-dealer-metadata failed:', error)
      return { ok: false, error: error.message || 'sync-dealer-metadata failed' }
    }
    return { ok: true }
  } catch (err) {
    console.warn('Edge function call failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Edge function call failed' }
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
export default function AdminPage({ onViewAsUser }: { onViewAsUser?: (id: string, email: string, name: string) => void }) {
  const [tab, setTab]         = useState<'users' | 'permissions' | 'modules' | 'mappings'>('users')
  const [users, setUsers]     = useState<AppUser[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [search, setSearch]   = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all')
  const [permissionsSearch, setPermissionsSearch] = useState('')
  const [moduleSearch, setModuleSearch] = useState('')
  const [showInactiveModules, setShowInactiveModules] = useState(true)
  const [mappingSearch, setMappingSearch] = useState('')
  const [showInactiveMappings, setShowInactiveMappings] = useState(true)
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [supportsDealerColumns, setSupportsDealerColumns] = useState(true)
  const [usersLoadMode, setUsersLoadMode] = useState<'edge' | 'fallback'>('edge')
  const [usersEdgeError, setUsersEdgeError] = useState<string | null>(null)

  // Add user modal
  const [showAddUser, setShowAddUser]   = useState(false)
  const [newName, setNewName]           = useState('')
  const [newEmail, setNewEmail]         = useState('')
  const [newRole, setNewRole]           = useState<UserRole>('staff')

  // Change-role modal
  const [roleEditUser, setRoleEditUser]     = useState<AppUser | null>(null)
  const [roleEditValue, setRoleEditValue]   = useState<UserRole>('staff')
  const [roleEditSaving, setRoleEditSaving] = useState(false)
  const [newBranch, setNewBranch]       = useState('')
  const [newDealerCode, setNewDealerCode] = useState('')
  const [newDealerName, setNewDealerName] = useState('')
  const [saving, setSaving]             = useState(false)

  // Set dealer modal (for existing users)
  const [dealerEditUser, setDealerEditUser]   = useState<AppUser | null>(null)
  const [editDealerCode, setEditDealerCode]   = useState('')
  const [editDealerName, setEditDealerName]   = useState('')
  const [editDealerCodes, setEditDealerCodes] = useState('')
  const [savingDealer, setSavingDealer]       = useState(false)
  const [tempPasswordForm, setTempPasswordForm] = useState<TempPasswordForm | null>(null)
  const [settingTempPassword, setSettingTempPassword] = useState(false)

  // Permissions tab
  const [selectedUserId, setSelectedUserId] = useState('')
  const [pendingPerms, setPendingPerms]     = useState<Record<number, Permission>>({})
  const [savingPerms, setSavingPerms]       = useState(false)

  // Mappings tab
  const [mappings, setMappings]             = useState<UserEmployeeLinkRow[]>([])
  const [employeeCatalog, setEmployeeCatalog] = useState<Array<{ employee_code: string; employee_name: string; role?: string | null }>>([])
  const [showAddMapping, setShowAddMapping] = useState(false)
  const [editMapping, setEditMapping]       = useState<UserEmployeeLinkRow | null>(null)
  const [mapUserId, setMapUserId]           = useState('')
  const [mapEmployeeCode, setMapEmployeeCode] = useState('')
  const [mapDealerCode, setMapDealerCode]   = useState('')
  const [mapIsPrimary, setMapIsPrimary]     = useState(false)
  const [savingMapping, setSavingMapping]   = useState(false)

  // Current session user's JWT dealer info (fallback when public.users is null)
  const [currentUserJWTDealers, setCurrentUserJWTDealers] = useState<{
    id?: string
    dealer_code?: string | null
    dealer_name?: string | null
    dealer_codes?: string[] | null
  }>({})

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([loadUsers(), loadModules(), loadMappings(), loadEmployeeCatalog()]).finally(() => setLoading(false))
    // Also fetch current session user's JWT dealer info for fallback display
    loadCurrentUserJWTDealers()
  }, [])

  async function loadCurrentUserJWTDealers() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      setCurrentUserJWTDealers({
        id: session.user.id,
        dealer_code: session.user.user_metadata?.dealer_code ?? null,
        dealer_name: session.user.user_metadata?.dealer_name ?? null,
        dealer_codes: normalizeDealerCodes(session.user.user_metadata?.dealer_codes),
      })
    }
  }

  async function loadUsers() {
    const withPhone = await supabase.functions.invoke('list-users-with-phone', { body: {} })
    if (!withPhone.error) {
      const payload = withPhone.data as UsersWithPhoneResponse | null
      if (payload?.users && Array.isArray(payload.users)) {
        setUsersLoadMode('edge')
        setUsersEdgeError(null)
        setSupportsDealerColumns(payload.supportsDealerColumns ?? true)
        setUsers(
          payload.users.map((u) => ({
            id: u.id,
            email: u.email,
            phone: u.phone ?? null,
            full_name: u.full_name ?? null,
            role: u.role,
            branch: u.branch ?? null,
            dealer_code: u.dealer_code ?? null,
            dealer_name: u.dealer_name ?? null,
            dealer_codes: normalizeDealerCodes(u.dealer_codes),
            is_active: u.is_active,
            created_at: u.created_at,
          }))
        )
        return
      }
    }

    setUsersLoadMode('fallback')
    setUsersEdgeError(await extractFunctionErrorMessage(withPhone.error))

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
      ((fallback.data ?? []) as Array<Omit<AppUser, 'phone' | 'dealer_code' | 'dealer_name'>>).map((u) => ({
        ...u,
        phone: null,
        dealer_code: null,
        dealer_name: null,
        dealer_codes: null,
      }))
    )
  }

  async function loadModules() {
    const { data } = await supabase.from('modules').select('*').order('sort_order')
    setModules(data ?? [])
  }

  async function loadMappings() {
    const result = await listUserEmployeeLinks()
    if (result.data) {
      setMappings(result.data)
    } else {
      showToastMsg(result.error ?? 'Failed to load mappings', 'error')
    }
  }

  async function loadEmployeeCatalog() {
    const result = await listEmployees()
    if (result.data) {
      setEmployeeCatalog(result.data)
    }
  }

  async function createMapping() {
    if (!mapUserId || !mapEmployeeCode || !mapDealerCode) {
      showToastMsg('User, Employee Code, and Dealer Code are required', 'error')
      return
    }
    setSavingMapping(true)
    const result = await createUserEmployeeLink({
      user_id: mapUserId,
      employee_code: mapEmployeeCode,
      dealer_code: mapDealerCode,
      is_primary: mapIsPrimary,
    })
    setSavingMapping(false)
    if (result.data) {
      showToastMsg('Mapping created')
      setShowAddMapping(false)
      setMapUserId('')
      setMapEmployeeCode('')
      setMapDealerCode('')
      setMapIsPrimary(false)
      await loadMappings()
    } else {
      showToastMsg(result.error ?? 'Failed to create mapping', 'error')
    }
  }

  async function toggleMappingPrimary(mapping: UserEmployeeLinkRow) {
    setSavingMapping(true)
    const result = await updateUserEmployeeLink(mapping.id, { is_primary: !mapping.is_primary })
    setSavingMapping(false)
    if (result.data) {
      showToastMsg('Mapping updated')
      await loadMappings()
    } else {
      showToastMsg(result.error ?? 'Failed to update mapping', 'error')
    }
  }

  async function deactivateMapping(mapping: UserEmployeeLinkRow) {
    setSavingMapping(true)
    const result = await deactivateUserEmployeeLink(mapping.id)
    setSavingMapping(false)
    if (!result.error) {
      showToastMsg('Mapping deactivated')
      await loadMappings()
    } else {
      showToastMsg(result.error ?? 'Failed to deactivate mapping', 'error')
    }
  }

  function openEditMapping(mapping: UserEmployeeLinkRow) {
    setEditMapping(mapping)
    setMapEmployeeCode(mapping.employee_code)
    setMapDealerCode(mapping.dealer_code)
    setMapIsPrimary(mapping.is_primary)
  }

  async function saveEditedMapping() {
    if (!editMapping) return
    if (!mapEmployeeCode || !mapDealerCode) {
      showToastMsg('Employee Code and Dealer Code are required', 'error')
      return
    }

    setSavingMapping(true)
    const result = await updateUserEmployeeLink(editMapping.id, {
      employee_code: mapEmployeeCode,
      dealer_code: mapDealerCode,
      is_primary: mapIsPrimary,
    })
    setSavingMapping(false)

    if (result.data) {
      showToastMsg('Mapping updated')
      setEditMapping(null)
      setMapEmployeeCode('')
      setMapDealerCode('')
      setMapIsPrimary(false)
      await loadMappings()
    } else {
      showToastMsg(result.error ?? 'Failed to update mapping', 'error')
    }
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
  async function saveRoleChange() {
    if (!roleEditUser) return
    setRoleEditSaving(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: roleEditValue })
        .eq('id', roleEditUser.id)
      if (error) throw error
      setUsers(prev => prev.map(u => u.id === roleEditUser!.id ? { ...u, role: roleEditValue } : u))
      showToastMsg(`Role updated to "${roleEditValue}" for ${roleEditUser.full_name || roleEditUser.email}`)
      setRoleEditUser(null)
    } catch (err) {
      showToastMsg(err instanceof Error ? err.message : 'Failed to update role', 'error')
    } finally {
      setRoleEditSaving(false)
    }
  }

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
    setEditDealerCodes(Array.isArray(u.dealer_codes) ? u.dealer_codes.join(', ') : '')
  }

  async function saveDealer() {
    if (!dealerEditUser) return
    const parsedCodes = Array.from(
      new Set(
        editDealerCodes
          .split(/[\s,]+/)
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      ),
    )

    const explicitPrimary = editDealerCode.trim().toUpperCase()
    const primaryCode = explicitPrimary || parsedCodes[0] || ''
    const dealerCodes = Array.from(new Set([primaryCode, ...parsedCodes].filter(Boolean)))

    const code = primaryCode || null
    const name = editDealerName.trim() || null

    setSavingDealer(true)
    let usersUpdateSkippedReason: string | null = null

    // 1. Update public.users (primary display source)
    const { error } = await supabase
      .from('users')
      .update({ dealer_code: code, dealer_name: name })
      .eq('id', dealerEditUser.id)

    if (error) {
      const missingDealerColumns = isMissingDealerColumnError(error)
      if (missingDealerColumns) {
        setSupportsDealerColumns(false)
      } else {
        usersUpdateSkippedReason = error.message || 'public.users update failed'
      }
    }

    // 2. Sync into auth.users.raw_user_meta_data so JWT contains dealer scope on next login
    const metaSyncResult = await syncDealerToAuthMeta(
      dealerEditUser.id,
      code,
      name,
      dealerCodes.length > 0 ? dealerCodes : null,
    )

    if (!metaSyncResult.ok) {
      setSavingDealer(false)
      showToastMsg(`Dealer metadata sync failed: ${metaSyncResult.error ?? 'Unknown error'}`, 'error')
      return
    }

    // 3. Validate persisted values from server before confirming success in UI.
    // Auth metadata can take a short moment to reflect via admin users API.
    let validatedFromServer = false
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const validationRes = await supabase.functions.invoke('list-users-with-phone', { body: {} })
      if (!validationRes.error) {
        const payload = validationRes.data as UsersWithPhoneResponse | null
        if (payload?.users && Array.isArray(payload.users)) {
          setSupportsDealerColumns(payload.supportsDealerColumns ?? true)
          setUsers(
            payload.users.map((u) => ({
              id: u.id,
              email: u.email,
              phone: u.phone ?? null,
              full_name: u.full_name ?? null,
              role: u.role,
              branch: u.branch ?? null,
              dealer_code: u.dealer_code ?? null,
              dealer_name: u.dealer_name ?? null,
              dealer_codes: normalizeDealerCodes(u.dealer_codes),
              is_active: u.is_active,
              created_at: u.created_at,
            }))
          )

          const saved = payload.users.find((user) => user.id === dealerEditUser.id)
          if (saved) {
            const normalizedSavedCodes = normalizeDealerCodes(saved.dealer_codes) ?? []
            const serverCodes = Array.from(
              new Set(
                [saved.dealer_code, ...normalizedSavedCodes]
                  .map((value) => String(value ?? '').trim().toUpperCase())
                  .filter(Boolean),
              ),
            )
            const expectedCodes = Array.from(new Set(dealerCodes.map((value) => String(value).trim().toUpperCase()).filter(Boolean)))
            const codesMatch = expectedCodes.every((expectedCode) => serverCodes.includes(expectedCode))
            const nameMatch = (String(saved.dealer_name ?? '').trim() || null) === name
            validatedFromServer = code ? serverCodes.includes(code) && codesMatch && nameMatch : serverCodes.length === 0 && nameMatch
            if (validatedFromServer) break
          }
        }
      }

      if (attempt < 3) {
        await wait(500)
      }
    }

    if (!validatedFromServer) {
      await loadUsers()
      setSavingDealer(false)
      setDealerEditUser(null)
      showToastMsg('Dealer saved, but validation is still syncing. Please refresh in a few seconds to confirm.', 'success')
      return
    }

    setSavingDealer(false)
    setDealerEditUser(null)

    if (usersUpdateSkippedReason) {
      showToastMsg(`Dealer saved in auth metadata (database). public.users update skipped (${usersUpdateSkippedReason}). Dealer visibility in this schema comes from auth metadata + active mappings.`, 'success')
      return
    }

    showToastMsg(
      error && isMissingDealerColumnError(error)
        ? 'Dealer saved in auth metadata (database). This schema does not use public.users dealer columns; Dealer display comes from auth metadata + active mappings.'
        : 'Dealer metadata saved. For SM/GM, Additional Dealer Codes control SA visibility; if left blank, scope falls back to mapped dealer codes. User must re-login for JWT updates.'
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

  function quickSetAll(mode: 'full' | 'none') {
    const full = mode === 'full'
    const next: Record<number, Permission> = { ...pendingPerms }
    modules.filter(m => m.is_active).forEach((m) => {
      next[m.id] = { module_id: m.id, can_view: full, can_modify: full, can_delete: full }
    })
    setPendingPerms(next)
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

  const userLookup = useMemo(() => new Map(users.map(u => [u.id, u] as const)), [users])
  const employeeRoleLookup = useMemo(
    () => new Map(employeeCatalog.map((employee) => [employee.employee_code, String(employee.role ?? '').trim()] as const)),
    [employeeCatalog],
  )

  const activeMappingDealerCodesByUserId = useMemo(() => {
    const byUserId = new Map<string, string[]>()
    mappings
      .filter((mapping) => mapping.is_active)
      .forEach((mapping) => {
        const code = String(mapping.dealer_code ?? '').trim().toUpperCase()
        if (!code) return

        const existing = byUserId.get(mapping.user_id) ?? []
        if (!existing.includes(code)) {
          byUserId.set(mapping.user_id, [...existing, code])
        }
      })
    return byUserId
  }, [mappings])

  const filteredUsers = users.filter(u => {
    const term = search.toLowerCase()
    const metadataDealerCodesText = Array.isArray(u.dealer_codes) ? u.dealer_codes.join(' ').toLowerCase() : ''
    const mappingDealerCodesText = (activeMappingDealerCodesByUserId.get(u.id) ?? []).join(' ').toLowerCase()
    return (showInactive || u.is_active) &&
      (roleFilter === 'all' || u.role === roleFilter) &&
      (
        (u.full_name ?? '').toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.phone ?? '').toLowerCase().includes(term) ||
        (u.dealer_code ?? '').toLowerCase().includes(term) ||
        metadataDealerCodesText.includes(term) ||
        mappingDealerCodesText.includes(term)
      )
  })

  const filteredPermissionModules = modules.filter(m =>
    m.is_active && (
      m.label.toLowerCase().includes(permissionsSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(permissionsSearch.toLowerCase()) ||
      (m.route ?? '').toLowerCase().includes(permissionsSearch.toLowerCase())
    )
  )

  const filteredAdminModules = modules.filter(m =>
    (showInactiveModules || m.is_active) && (
      m.label.toLowerCase().includes(moduleSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(moduleSearch.toLowerCase()) ||
      (m.route ?? '').toLowerCase().includes(moduleSearch.toLowerCase()) ||
      (m.description ?? '').toLowerCase().includes(moduleSearch.toLowerCase())
    )
  )

  const filteredMappings = mappings.filter((m) => {
    const linkedUser = userLookup.get(m.user_id)
    const term = mappingSearch.toLowerCase()
    return (showInactiveMappings || m.is_active) && (
      (linkedUser?.full_name ?? '').toLowerCase().includes(term) ||
      (linkedUser?.email ?? '').toLowerCase().includes(term) ||
      m.employee_code.toLowerCase().includes(term) ||
      m.dealer_code.toLowerCase().includes(term)
    )
  })

  const selectedPermissionUser = selectedUserId ? users.find((user) => user.id === selectedUserId) ?? null : null
  const selectedPermissionMappings = selectedUserId
    ? mappings.filter((mapping) => mapping.user_id === selectedUserId && mapping.is_active)
    : []
  const selectedBusinessRoles = Array.from(
    new Set(
      selectedPermissionMappings
        .map((mapping) => String(employeeRoleLookup.get(mapping.employee_code) ?? '').trim().toUpperCase())
        .filter(Boolean),
    ),
  )
  const selectedDealerCodes = Array.from(
    new Set(selectedPermissionMappings.map((mapping) => String(mapping.dealer_code ?? '').trim().toUpperCase()).filter(Boolean)),
  )
  const selectedPermissionCounts = {
    view: Object.values(pendingPerms).filter((permission) => permission.can_view).length,
    modify: Object.values(pendingPerms).filter((permission) => permission.can_modify).length,
    delete: Object.values(pendingPerms).filter((permission) => permission.can_delete).length,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div>
      <div className="flex h-64 items-center justify-center text-sm" style={{ color: 'var(--faint)' }}>Loading…</div>
    </div>
  )

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet"><Icon name="settings" size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />Admin Panel</p>
          <h1>User management & access control</h1>
          <p>Manage users, module permissions, and employee mappings.</p>
        </div>
      </div>

      <div className="tabs">
        {(['users', 'permissions', 'modules', 'mappings'] as const).map(t => {
          const tabDefs: Record<typeof t, { icon: string; label: string; count?: () => number }> = {
            users: { icon: 'user', label: 'Users', count: () => users.length },
            permissions: { icon: 'shield', label: 'Permissions' },
            modules: { icon: 'grid', label: 'Modules', count: () => modules.length },
            mappings: { icon: 'admin', label: 'Mappings', count: () => mappings.length },
          }
          const def = tabDefs[t]
          return (
            <button
              key={t}
              className={`tab${tab === t ? ' is-active' : ''}`}
              onClick={() => setTab(t)}
            >
              <span className="ic"><Icon name={def.icon} size={16} strokeWidth={1.7} /></span>
              {def.label}
              {def.count && <span className="count">{def.count()}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'users' && (
        <div className="summary">
          <div className="schip"><span className="ic"><Icon name="user" size={16} strokeWidth={1.9} /></span><div><div className="n">{users.length}</div><div className="l">Total users</div></div></div>
          <div className="schip"><span className="ic"><Icon name="shield" size={16} strokeWidth={1.9} /></span><div><div className="n">{users.filter(u => u.role === 'admin').length}</div><div className="l">Admins</div></div></div>
          <div className="schip"><span className="ic"><Icon name="checksm" size={16} strokeWidth={1.9} /></span><div><div className="n">{users.filter(u => u.is_active).length}</div><div className="l">Active</div></div></div>
          <div className="schip"><span className="ic" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="clock" size={16} strokeWidth={1.9} /></span><div><div className="n">{users.filter(u => !u.is_active).length}</div><div className="l">Inactive</div></div></div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div>
          <div className="toolbar">
            <span className="inp-wrap" style={{ maxWidth: 340, flex: 1 }}>
              <span className="icon-l"><Icon name="search" size={16} strokeWidth={1.7} /></span>
              <input
                className="inp"
                placeholder="Search name, email, phone, or dealer code…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </span>
            <select
              className="sel"
              style={{ maxWidth: 160 }}
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'all' | UserRole)}
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
            <label className="switch">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
              />
              <span className="track" />
              Show inactive
            </label>
            <span className="badge badge--muted">
              Showing {filteredUsers.length} of {users.length}
            </span>
            <button
              className="btn btn--primary"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowAddUser(true)}
            >
              <Icon name="plus" size={16} strokeWidth={2} /> Add user
            </button>
          </div>

          <div className="note" style={{ marginBottom: 12 }}>
            <span className="ic"><Icon name="shield" size={17} strokeWidth={1.9} /></span>
            <div>
              <b>Governance split:</b> Platform role in this screen controls admin/security posture. Business persona roles (SA/CRM/TECHNICIAN/FLOOR INCHARGE/SM/GM) are mastered in Settings → Employee Master and mapped via Admin → Mappings.
            </div>
          </div>

          {usersLoadMode === 'fallback' && (
            <div className="note note--warn" style={{ marginBottom: 12 }}>
              <span className="ic"><Icon name="alert" size={17} strokeWidth={1.9} /></span>
              <div>
                <b>Admin data source fallback active:</b> <code>list-users-with-phone</code> failed, so phone numbers and some dealer metadata may be missing.
                {usersEdgeError && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--faint)' }}>Error: {usersEdgeError}</div>}
              </div>
            </div>
          )}

          <div className="card">
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Dealer</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td className="strong">{u.full_name || u.email}</td>
                      <td style={{ color: 'var(--muted)' }}>{u.email}</td>
                      <td style={{ color: 'var(--muted)' }}>{u.phone || '-'}</td>
                      <td>
                        {(() => {
                          // Use JWT data as fallback for current session user
                          const primaryCodeFromRow = String(u.dealer_code ?? '').trim().toUpperCase() || null
                          const primaryCodeFromSession = u.id === currentUserJWTDealers.id
                            ? (String(currentUserJWTDealers.dealer_code ?? '').trim().toUpperCase() || null)
                            : null
                          const displayName = (String(u.dealer_name ?? '').trim() || null)
                            ?? (u.id === currentUserJWTDealers.id ? (String(currentUserJWTDealers.dealer_name ?? '').trim() || null) : null)
                          const displayDealerCodes = Array.isArray(u.dealer_codes)
                            ? u.dealer_codes
                            : (u.id === currentUserJWTDealers.id && Array.isArray(currentUserJWTDealers.dealer_codes)
                                ? currentUserJWTDealers.dealer_codes
                                : null)
                          const mappingDealerCodes = activeMappingDealerCodesByUserId.get(u.id) ?? []
                          const normalizedAdditionalCodes = Array.from(
                            new Set(
                              [...(displayDealerCodes ?? []), ...mappingDealerCodes]
                                .map((code) => String(code ?? '').trim().toUpperCase())
                                .filter(Boolean),
                            ),
                          )
                          const displayCode = primaryCodeFromRow ?? primaryCodeFromSession ?? normalizedAdditionalCodes[0] ?? null
                          const visibleAdditionalCodes = normalizedAdditionalCodes.filter(
                            (code) => code !== displayCode,
                          )
                          
                          return displayCode ? (
                            <>
                              <span className="code-badge">{displayCode}</span>
                              {displayName && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{displayName}</div>}
                              {visibleAdditionalCodes.length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>
                                  + {visibleAdditionalCodes.join(', ')}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="notset">Not set</span>
                          )
                        })()}
                      </td>
                      <td><span className={`badge badge--${u.role}`}>{u.role}</span></td>
                      <td><span className={`badge badge--${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="tactions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="tbtn"
                            onClick={() => { setTab('permissions'); loadPermsForUser(u.id) }}
                          >
                            <Icon name="shield" size={13} strokeWidth={1.9} /> Perms
                          </button>
                          <button
                            className="tbtn"
                            onClick={() => openDealerEdit(u)}
                          >
                            <Icon name="building" size={13} strokeWidth={1.9} /> Dealer
                          </button>
                          <button
                            className="tbtn"
                            onClick={() => openTempPasswordModal(u)}
                          >
                            <Icon name="key" size={13} strokeWidth={1.9} /> Pwd
                          </button>
                          <button
                            className="tbtn tbtn--accent"
                            onClick={() => { setRoleEditUser(u); setRoleEditValue(u.role) }}
                          >
                            <Icon name="shield" size={13} strokeWidth={1.9} /> Role
                          </button>
                          <button
                            className={`tbtn ${u.is_active ? 'tbtn--danger' : 'tbtn--accent'}`}
                            onClick={() => toggleUserActive(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          {onViewAsUser && u.role !== 'admin' && (
                            <button
                              className="tbtn tbtn--view"
                              title={`See the app exactly as ${u.email} sees it`}
                              onClick={() => {
                                onViewAsUser(u.id, u.email, u.full_name || u.email)
                                window.location.href = '/home'
                              }}
                            >
                              👁 View as
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '40px 4px', color: 'var(--faint)' }}>
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="note note--warn" style={{ marginTop: 16 }}>
            <span className="ic"><Icon name="shield" size={17} strokeWidth={1.9} /></span>
            <div>
              <b>Dealer assignment:</b> Each user needs a Dealer Code matching the <code>dealer_code</code> column
              in <code>vehicles</code> before they can see AutoDoc job cards. After a change the user must
              sign out and back in for the new JWT to take effect.
            </div>
          </div>
          {!supportsDealerColumns && (
            <div className="note note--warn" style={{ marginTop: 12 }}>
              Admin compatibility mode: current DB schema does not have <code>public.users.dealer_code</code> or <code>public.users.dealer_name</code>. Users are listed, and dealer assignment is handled via auth metadata/JWT.
            </div>
          )}
        </div>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {tab === 'permissions' && (
        <div>
          <div className="toolbar">
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>Select user</span>
            <select
              className="sel"
              style={{ maxWidth: 340 }}
              value={selectedUserId}
              onChange={e => loadPermsForUser(e.target.value)}
            >
              <option value="">— choose a user —</option>
              {users.filter(u => u.is_active).map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.role})</option>
              ))}
            </select>
            <span className="inp-wrap" style={{ maxWidth: 280, flex: 1 }}>
              <span className="icon-l"><Icon name="search" size={16} strokeWidth={1.7} /></span>
              <input
                className="inp"
                placeholder="Search modules..."
                value={permissionsSearch}
                onChange={e => setPermissionsSearch(e.target.value)}
                disabled={!selectedUserId}
              />
            </span>
            {selectedUserId && (
              <span className="badge badge--muted" style={{ marginLeft: 16 }}>
                {Object.values(pendingPerms).filter(p => p.can_view).length} / {modules.filter(m => m.is_active).length} modules granted
              </span>
            )}
            {selectedUserId && (
              <>
                <button className="mini" onClick={() => quickSetAll('full')}>Grant all</button>
                <button className="mini mini--off" onClick={() => quickSetAll('none')}>Revoke all</button>
              </>
            )}
            {selectedUserId && (
              <button
                className="btn btn--primary"
                style={{ marginLeft: 'auto' }}
                disabled={savingPerms}
                onClick={savePerms}
              >
                <Icon name="checksm" size={16} strokeWidth={2.2} /> Save permissions
              </button>
            )}
          </div>

          {selectedPermissionUser && (
            <div className="note" style={{ marginBottom: 12 }}>
              <span className="ic"><Icon name="shield" size={17} strokeWidth={1.9} /></span>
              <div>
                <b>Effective Access Summary:</b>
                {' '}Platform role <code>{selectedPermissionUser.role}</code>
                {' '}| Business role(s) <code>{selectedBusinessRoles.length ? selectedBusinessRoles.join(', ') : 'Not mapped'}</code>
                {' '}| Active mappings <code>{selectedPermissionMappings.length}</code>
                {' '}| Dealer scope <code>{selectedDealerCodes.length ? selectedDealerCodes.join(', ') : 'Not mapped'}</code>
                {' '}| Modules (view/modify/delete) <code>{selectedPermissionCounts.view}/{selectedPermissionCounts.modify}/{selectedPermissionCounts.delete}</code>
              </div>
            </div>
          )}

          {!selectedUserId ? (
            <div className="card">
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--faint)' }}>
                <Icon name="shield" size={30} strokeWidth={1.7} />
                <p style={{ marginTop: 10, fontSize: 14 }}>Select a user to manage their module permissions</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th className="ctr">View</th>
                      <th className="ctr">Modify</th>
                      <th className="ctr">Delete</th>
                      <th className="ctr">Quick set</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPermissionModules.map(m => {
                      const p = pendingPerms[m.id] ?? { can_view: false, can_modify: false, can_delete: false }
                      return (
                        <tr key={m.id}>
                          <td>
                            <div className="modtag">
                              <span className="mi"><Icon name={m.icon ?? 'grid'} size={16} strokeWidth={1.7} /></span>
                              <span className="ml"><b>{m.label}</b>{m.description && <span>{m.description}</span>}</span>
                            </div>
                          </td>
                          <td className="ctr"><input className="cbx" type="checkbox" checked={p.can_view} onChange={e => setPerm(m.id, 'can_view', e.target.checked)} /></td>
                          <td className="ctr"><input className="cbx" type="checkbox" checked={p.can_modify} onChange={e => setPerm(m.id, 'can_modify', e.target.checked)} /></td>
                          <td className="ctr"><input className="cbx" type="checkbox" checked={p.can_delete} onChange={e => setPerm(m.id, 'can_delete', e.target.checked)} /></td>
                          <td className="ctr">
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button className="mini" onClick={() => quickSet(m.id, 'full')}>Full</button>
                              <button className="mini mini--off" onClick={() => quickSet(m.id, 'none')}>None</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredPermissionModules.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '40px 4px', color: 'var(--faint)' }}>
                          No active modules match this search
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODULES TAB ── */}
      {tab === 'modules' && (
        <div>
          <div className="toolbar">
            <span className="inp-wrap" style={{ maxWidth: 340, flex: 1 }}>
              <span className="icon-l"><Icon name="search" size={16} strokeWidth={1.7} /></span>
              <input
                className="inp"
                placeholder="Search label, name, route, or description..."
                value={moduleSearch}
                onChange={e => setModuleSearch(e.target.value)}
              />
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={showInactiveModules}
                onChange={e => setShowInactiveModules(e.target.checked)}
              />
              <span className="track" />
              Show inactive
            </label>
            <span className="badge badge--active">Active: {modules.filter(m => m.is_active).length}</span>
            <span className="badge badge--muted">Inactive: {modules.filter(m => !m.is_active).length}</span>
          </div>
          <div className="card">
          <div className="tbl-wrap scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Module</th>
                  <th>DB name</th>
                  <th>Route</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdminModules.map(m => (
                  <tr key={m.id}>
                    <td style={{ color: 'var(--faint)', fontFamily: 'var(--mono)' }}>{m.sort_order}</td>
                    <td>
                      <div className="modtag">
                        <span className="mi"><Icon name={m.icon ?? 'grid'} size={16} strokeWidth={1.7} /></span>
                        <span className="ml"><b>{m.label}</b></span>
                      </div>
                    </td>
                    <td><code className="k k--p">{m.name}</code></td>
                    <td><code className="k k--b">{m.route}</code></td>
                    <td style={{ color: 'var(--muted)', whiteSpace: 'normal', maxWidth: 320 }}>{m.description}</td>
                    <td><span className={`badge badge--${m.is_active ? 'active' : 'muted'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="tbtn" onClick={() => toggleModule(m)}>
                        {m.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAdminModules.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 4px', color: 'var(--faint)' }}>
                      No modules match this search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* ── MAPPINGS TAB ── */}
      {tab === 'mappings' && (
        <div>
          <div className="toolbar">
            <span className="inp-wrap" style={{ maxWidth: 340, flex: 1 }}>
              <span className="icon-l"><Icon name="search" size={16} strokeWidth={1.7} /></span>
              <input
                className="inp"
                placeholder="Search user, email, employee code, dealer..."
                value={mappingSearch}
                onChange={e => setMappingSearch(e.target.value)}
              />
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={showInactiveMappings}
                onChange={e => setShowInactiveMappings(e.target.checked)}
              />
              <span className="track" />
              Show inactive
            </label>
            <span className="badge badge--muted">Showing {filteredMappings.length} / {mappings.length}</span>
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>User ↔ employee-code links control which advisor/technician rows a login owns.</div>
            <button className="btn btn--primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAddMapping(true)}>
              <Icon name="plus" size={16} strokeWidth={2} /> Add mapping
            </button>
          </div>

          <div className="card">
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Employee code</th>
                    <th>Dealer</th>
                    <th>Primary</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.map(m => (
                    <tr key={m.id}>
                      <td>
                        <span className="strong">{userLookup.get(m.user_id)?.full_name || userLookup.get(m.user_id)?.email || m.user_id}</span>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{userLookup.get(m.user_id)?.email}</div>
                      </td>
                      <td><code className="k k--b mono">{m.employee_code}</code></td>
                      <td><span className="code-badge">{m.dealer_code}</span></td>
                      <td>{m.is_primary ? <span className="badge badge--admin badge--no">Primary</span> : <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                      <td><span className={`badge badge--${m.is_active ? 'active' : 'muted'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="tactions" style={{ justifyContent: 'flex-end' }}>
                          {m.is_active && <button className="tbtn" disabled={savingMapping} onClick={() => toggleMappingPrimary(m)}>
                            {m.is_primary ? 'Unset Primary' : 'Set Primary'}
                          </button>}
                          <button className="tbtn" onClick={() => openEditMapping(m)}>Edit</button>
                          <button className="tbtn tbtn--danger" disabled={!m.is_active} onClick={() => deactivateMapping(m)}>Deactivate</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredMappings.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px 4px', color: 'var(--faint)' }}>
                        No mappings match this filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 90,
          background: 'var(--ink)', color: '#fff', padding: '11px 18px', borderRadius: 99, fontSize: 13.5,
          fontWeight: 600, boxShadow: 'var(--sh-3)', display: 'flex', gap: 9, alignItems: 'center' }}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checksm'} size={16} strokeWidth={2.2} />{toast.msg}
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
            <Field label="Platform Role">
              <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className={INPUT}>
                <option value="viewer">Viewer — read only</option>
                <option value="staff">Staff — view + modify</option>
                <option value="manager">Manager — view + modify + delete</option>
                <option value="admin">Admin — full access</option>
              </select>
            </Field>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Governance: Platform Role is for security posture only. Keep business personas (SA/CRM/TECHNICIAN/FLOOR INCHARGE/SM/GM) in Settings → Employee Master.
            </p>
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
            <Field label="Dealer Code (Fallback Metadata)">
              <input
                value={editDealerCode}
                onChange={e => setEditDealerCode(e.target.value.toUpperCase())}
                placeholder="e.g. 3000840"
                className={INPUT}
                autoFocus
              />
            </Field>
            <Field label="Dealer Name">
              <input
                value={editDealerName}
                onChange={e => setEditDealerName(e.target.value)}
                placeholder="e.g. Sitapura Service Center"
                className={INPUT}
              />
            </Field>
            <Field label="Additional Dealer Codes (comma or space separated)">
              <input
                value={editDealerCodes}
                onChange={e => setEditDealerCodes(e.target.value.toUpperCase())}
                placeholder="e.g. 3000840, 500A840, 3001440"
                className={INPUT}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            This sets fallback metadata only. For SM/GM SA visibility: Additional Dealer Codes take precedence; if blank, scope falls back to mapped dealer codes from Admin → Mappings. User must sign out and sign back in for JWT updates.
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

      {/* ── ADD MAPPING MODAL ── */}
      {showAddMapping && (
        <Modal title="Create Employee Mapping" onClose={() => setShowAddMapping(false)}>
          <div className="space-y-4">
            <Field label="User *">
              <select
                value={mapUserId}
                onChange={e => setMapUserId(e.target.value)}
                className={INPUT}
                autoFocus
              >
                <option value="">— select user —</option>
                {users.filter(u => u.is_active).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </Field>

            <Field label="Employee *">
              <input
                list="emp-list"
                value={mapEmployeeCode}
                onChange={e => setMapEmployeeCode(e.target.value.toUpperCase())}
                placeholder="Search by code or name…"
                className={INPUT}
              />
              <datalist id="emp-list">
                {employeeCatalog.map(emp => (
                  <option key={emp.employee_code} value={emp.employee_code}>{emp.employee_name}</option>
                ))}
              </datalist>
            </Field>

            <Field label="Dealer Code *">
              <input
                value={mapDealerCode}
                onChange={e => setMapDealerCode(e.target.value.toUpperCase())}
                placeholder="e.g. TN123456"
                className={INPUT}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={mapIsPrimary}
                onChange={e => setMapIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Set as primary mapping for this user + dealer
            </label>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            The primary mapping is used by default in reception forms. Set to secondary if user has multiple dealer assignments.
          </p>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setShowAddMapping(false)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={createMapping} disabled={savingMapping} className={BTN_PRIMARY}>
              {savingMapping ? 'Creating…' : 'Create Mapping'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── EDIT MAPPING MODAL ── */}
      {editMapping && (
        <Modal title="Edit Employee Mapping" onClose={() => setEditMapping(null)}>
          <div className="space-y-4">
            <Field label="User">
              <input
                value={users.find(u => u.id === editMapping.user_id)?.full_name || users.find(u => u.id === editMapping.user_id)?.email || editMapping.user_id}
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600"
              />
            </Field>

            <Field label="Employee *">
              <input
                list="emp-list-edit"
                value={mapEmployeeCode}
                onChange={e => setMapEmployeeCode(e.target.value.toUpperCase())}
                placeholder="Search by code or name…"
                className={INPUT}
                autoFocus
              />
              <datalist id="emp-list-edit">
                {employeeCatalog.map(emp => (
                  <option key={emp.employee_code} value={emp.employee_code}>{emp.employee_name}</option>
                ))}
              </datalist>
            </Field>

            <Field label="Dealer Code *">
              <input
                value={mapDealerCode}
                onChange={e => setMapDealerCode(e.target.value.toUpperCase())}
                placeholder="e.g. 3000840"
                className={INPUT}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={mapIsPrimary}
                onChange={e => setMapIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded accent-blue-600"
              />
              Set as primary mapping for this user + dealer
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setEditMapping(null)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={saveEditedMapping} disabled={savingMapping} className={BTN_PRIMARY}>
              {savingMapping ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Change Role Modal ─── */}
      {roleEditUser && (
        <div className="modal-back" role="presentation" onClick={() => { if (!roleEditSaving) setRoleEditUser(null) }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 400 }}>
            <div className="modal__head">
              <h3>Change Role</h3>
              <button type="button" className="modal__x" onClick={() => setRoleEditUser(null)} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                <strong>{roleEditUser.full_name || roleEditUser.email}</strong>
                <div style={{ marginTop: 4 }}>{roleEditUser.email}</div>
                <div style={{ marginTop: 4 }}>
                  Current role: <span className={`badge badge--${roleEditUser.role}`}>{roleEditUser.role}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  New Role
                </label>
                <select
                  className="sel"
                  value={roleEditValue}
                  onChange={e => setRoleEditValue(e.target.value as UserRole)}
                  disabled={roleEditSaving}
                  style={{ width: '100%' }}
                >
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="staff">staff</option>
                  <option value="viewer">viewer</option>
                </select>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--warn-bg,#fffbeb)', borderRadius: 6, padding: '8px 10px', border: '1px solid var(--warn-border,#fde68a)' }}>
                ⚠️ <strong>admin</strong> gets full access to all modules and users. The user must sign out and back in for the change to take effect.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  disabled={roleEditSaving || roleEditValue === roleEditUser.role}
                  onClick={() => void saveRoleChange()}
                >
                  {roleEditSaving ? 'Saving…' : 'Save Role'}
                </button>
                <button type="button" className="btn btn--ghost"
                  onClick={() => setRoleEditUser(null)} disabled={roleEditSaving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
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