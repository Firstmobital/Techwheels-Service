import { employeeRowIsBodyshopFloorIncharge } from './bodyshopFloorInchargeScope'

export type StaffLinkedEmployeeProfile = {
  department: string | null
  role: string | null
}

/** Mechanical Floor Incharge (service reception / technician_assignments). Not bodyshop pipeline. */
export function shouldUseMechanicalFloorInchargeScreen(linked: {
  department?: string | null
  role?: string | null
} | null | undefined): boolean {
  if (!linked) return true
  if (employeeRowIsBodyshopFloorIncharge(linked)) return false
  const deptKey = String(linked.department ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (deptKey === 'BODYSHOP') return false
  return true
}

export function mechanicalFloorInchargeMisrouteMessage(): string {
  return 'Body Shop floor incharge: assign dentor, painter, and helpers from Bodyshop Floor — not this mechanical Floor Incharge screen.'
}
