/** Signup “requested access” roles — stored in auth user_metadata.role (web + mobile). */

export type StaffSignupRoleId =
  | 'reception'
  | 'advisor'
  | 'floor'
  | 'admin'
  | 'bodyshop_dentor'
  | 'bodyshop_painter'
  | 'bodyshop_technician'
  | 'bodyshop_rubbing'
  | 'bodyshop_edp'
  | 'bodyshop_helper'

export type StaffSignupRoleOption = {
  id: StaffSignupRoleId
  label: string
  desc: string
  icon: string
}

export const STAFF_SIGNUP_ROLE_OPTIONS: StaffSignupRoleOption[] = [
  { id: 'reception', label: 'Reception', icon: 'reception', desc: 'Vehicle intake & customer communication' },
  { id: 'advisor', label: 'Service Advisor', icon: 'tech', desc: 'Job cards & customer follow-up' },
  { id: 'floor', label: 'Floor Incharge', icon: 'floor', desc: 'Technician / floor allocation' },
  { id: 'bodyshop_dentor', label: 'Bodyshop Dentor', icon: 'floor', desc: 'Daily work updates on assigned vehicles' },
  { id: 'bodyshop_painter', label: 'Bodyshop Painter', icon: 'floor', desc: 'Daily work updates on assigned vehicles' },
  { id: 'bodyshop_technician', label: 'Bodyshop Technician', icon: 'floor', desc: 'Bodyshop floor technical work logs' },
  { id: 'bodyshop_rubbing', label: 'Rubbing', icon: 'floor', desc: 'Rubbing stage work logs with photos' },
  { id: 'bodyshop_helper', label: 'Bodyshop Helper', icon: 'floor', desc: 'Support staff on dentor/painter lane' },
  { id: 'bodyshop_edp', label: 'Bodyshop EDP', icon: 'floor', desc: 'Compile role updates into daily floor line' },
  { id: 'admin', label: 'Administrator', icon: 'shield', desc: 'Users, permissions & settings' },
]

const HINTS: Record<
  StaffSignupRoleId,
  { employeeMasterRole: string; modules: string[] }
> = {
  reception: { employeeMasterRole: 'RECEPTION', modules: ['reception'] },
  advisor: { employeeMasterRole: 'SA', modules: ['service_advisor'] },
  floor: { employeeMasterRole: 'FLOOR_INCHARGE', modules: ['floor_incharge', 'bodyshop_floor'] },
  admin: { employeeMasterRole: '', modules: ['admin'] },
  bodyshop_dentor: { employeeMasterRole: 'DENTOR', modules: ['bodyshop_floor_work'] },
  bodyshop_painter: { employeeMasterRole: 'PAINTER', modules: ['bodyshop_floor_work'] },
  bodyshop_technician: { employeeMasterRole: 'TECHNICIAN', modules: ['bodyshop_floor_work'] },
  bodyshop_rubbing: { employeeMasterRole: 'RUBBING', modules: ['bodyshop_floor_work'] },
  bodyshop_helper: { employeeMasterRole: 'DENTOR_HELPER,PAINTER_HELPER', modules: ['bodyshop_floor_work'] },
  bodyshop_edp: { employeeMasterRole: 'EDP', modules: ['bodyshop_floor_work'] },
}

export function staffSignupRoleLabel(raw: string | null | undefined): string {
  const id = String(raw ?? '').trim() as StaffSignupRoleId
  return STAFF_SIGNUP_ROLE_OPTIONS.find((r) => r.id === id)?.label ?? (raw ? String(raw) : '—')
}

export function staffSignupAdminHint(raw: string | null | undefined): {
  employeeMasterRole: string
  modules: string[]
} | null {
  const id = String(raw ?? '').trim() as StaffSignupRoleId
  return HINTS[id] ?? null
}

export function isBodyshopStaffSignupRole(raw: string | null | undefined): boolean {
  const id = String(raw ?? '').trim()
  return id.startsWith('bodyshop_')
}
