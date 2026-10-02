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
}

export const STAFF_SIGNUP_ROLE_OPTIONS: StaffSignupRoleOption[] = [
  { id: 'reception', label: 'Reception', desc: 'Vehicle intake & customer communication' },
  { id: 'advisor', label: 'Service Advisor', desc: 'Job cards & customer follow-up' },
  { id: 'floor', label: 'Floor Incharge', desc: 'Technician / floor allocation' },
  { id: 'bodyshop_dentor', label: 'Bodyshop Dentor', desc: 'Daily work updates on assigned vehicles' },
  { id: 'bodyshop_painter', label: 'Bodyshop Painter', desc: 'Daily work updates on assigned vehicles' },
  { id: 'bodyshop_technician', label: 'Bodyshop Technician', desc: 'Bodyshop floor technical work logs' },
  { id: 'bodyshop_rubbing', label: 'Rubbing', desc: 'Rubbing stage work logs with photos' },
  { id: 'bodyshop_helper', label: 'Bodyshop Helper', desc: 'Support on dentor/painter lane' },
  { id: 'bodyshop_edp', label: 'Bodyshop EDP', desc: 'Compile role updates into daily floor line' },
  { id: 'admin', label: 'Administrator', desc: 'Users, permissions & settings' },
]

const HINTS: Record<StaffSignupRoleId, { employeeMasterRole: string; modules: string[] }> = {
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

export function staffSignupAdminHint(raw: string | null | undefined) {
  const id = String(raw ?? '').trim() as StaffSignupRoleId
  return HINTS[id] ?? null
}
