import type { IconName } from '../components/ui/Icon'
import { employeeRowIsBodyshopFloorIncharge } from './bodyshopFloorInchargeScope'
import {
  shouldUseMechanicalFloorInchargeScreen,
  type StaffLinkedEmployeeProfile,
} from './staffMechanicalFloorInchargeAccess'

export type StaffModuleRoute =
  | '/(tabs)/home'
  | '/(tabs)/autodoc'
  | '/(tabs)/reports'
  | '/(tabs)/import'
  | '/(tabs)/admin'
  | '/(tabs)/settings'
  | '/(tabs)/floor-incharge'
  | '/(tabs)/reception'
  | '/(tabs)/telecalling'
  | '/(tabs)/bodyshop-repair'
  | '/(tabs)/bodyshop-floor'
  | '/(tabs)/bodyshop-floor-work'
  | '/(tabs)/driver-tasks'
  | '/(tabs)/alerts'
  | '/(tabs)/chat'

export type StaffHomeModule = {
  key: string
  label: string
  icon: IconName
  iconBg: string
  description: string
  route?: StaffModuleRoute
}

export const STAFF_HOME_MODULES: StaffHomeModule[] = [
  { key: 'driver_tasks', label: 'Driver Tasks', icon: 'navigation', iconBg: 'bg-emerald-100', description: 'Doorstep pickup & drop navigation', route: '/(tabs)/driver-tasks' },
  { key: 'autodoc', label: 'Body & Paint', icon: 'edit', iconBg: 'bg-orange-100', description: 'Job cards · damage · claims', route: '/(tabs)/autodoc' },
  { key: 'reports', label: 'Reports', icon: 'file-text', iconBg: 'bg-blue-100', description: '28 revenue & ops reports', route: '/(tabs)/reports' },
  { key: 'import', label: 'Import Data', icon: 'cloud-upload', iconBg: 'bg-purple-100', description: 'Bulk CSV / XLSX upload', route: '/(tabs)/import' },
  { key: 'admin', label: 'Admin', icon: 'users', iconBg: 'bg-slate-100', description: 'Users, roles & branches', route: '/(tabs)/admin' },
  { key: 'settings', label: 'Settings', icon: 'settings', iconBg: 'bg-amber-100', description: 'Preferences & device', route: '/(tabs)/settings' },
  { key: 'reception', label: 'Reception', icon: 'check-circle', iconBg: 'bg-green-100', description: 'Vehicle intake & entries', route: '/(tabs)/reception' },
  { key: 'floor-incharge', label: 'Floor Incharge', icon: 'grid', iconBg: 'bg-indigo-100', description: 'Technician assignments · bay · status', route: '/(tabs)/floor-incharge' },
  { key: 'telecalling', label: 'Telecalling', icon: 'phone', iconBg: 'bg-cyan-100', description: 'Service reminders · call leads', route: '/(tabs)/telecalling' },
  { key: 'bodyshop-repair', label: 'Bodyshop Repair', icon: 'package', iconBg: 'bg-violet-100', description: '18-stage accident repair pipeline', route: '/(tabs)/bodyshop-repair' },
  { key: 'bodyshop-floor', label: 'Bodyshop Floor Incharge', icon: 'sliders', iconBg: 'bg-rose-100', description: 'Assign dentor, painter & floor roles', route: '/(tabs)/bodyshop-floor' },
  { key: 'bodyshop-floor-work', label: 'Floor Work', icon: 'edit', iconBg: 'bg-orange-100', description: 'Work update · photos · Done → next step', route: '/(tabs)/bodyshop-floor-work' },
]

/** Menu-only entries (not duplicated as permission-gated modules). */
export const STAFF_DRAWER_ALWAYS: StaffHomeModule[] = [
  { key: 'alerts', label: 'Alerts', icon: 'bell', iconBg: 'bg-slate-100', description: 'Cross-module activity feed', route: '/(tabs)/alerts' },
]

export type StaffDrawerExtraRoute = '/help-tickets/new' | '/help-tickets'

export type StaffDrawerExtraItem = {
  key: string
  label: string
  icon: IconName
  description: string
  route: StaffDrawerExtraRoute
}

export const STAFF_DRAWER_SUPPORT: StaffDrawerExtraItem[] = [
  { key: 'help_new', label: 'Raise a help ticket', icon: 'alert-circle', description: 'App or process support', route: '/help-tickets/new' },
  { key: 'help_list', label: 'My help tickets', icon: 'file-text', description: 'Track replies and resolutions', route: '/help-tickets' },
]

export const STAFF_MODULE_KEY_TO_DB: Record<string, string[]> = {
  autodoc: ['bodyshop_tracker', 'autodoc'],
  reports: ['reports'],
  import: ['import'],
  admin: ['admin'],
  settings: ['settings'],
  reception: ['reception'],
  'floor-incharge': ['floor_incharge'],
  telecalling: ['telecalling'],
  'bodyshop-repair': ['bodyshop_repair'],
  'bodyshop-floor': ['bodyshop_floor'],
  'bodyshop-floor-work': ['bodyshop_floor_work'],
  driver_tasks: ['driver_tasks', 'driver_management', 'driver'],
}

/** Body Shop FI often gets legacy `floor_incharge` in Admin; mobile uses `bodyshop_floor` tiles. */
function expandAllowedModulesForBodyshopFloorIncharge(
  allowedModules: Set<string>,
  linkedEmployee?: StaffLinkedEmployeeProfile | null,
): Set<string> {
  if (!linkedEmployee || !employeeRowIsBodyshopFloorIncharge(linkedEmployee)) {
    return allowedModules
  }
  const next = new Set(allowedModules)
  if (next.has('floor_incharge') || next.has('bodyshop_floor')) {
    next.add('bodyshop_floor')
  }
  if (next.has('bodyshop_floor_work') || (next.has('floor_incharge') && next.has('bodyshop_floor'))) {
    next.add('bodyshop_floor_work')
  }
  return next
}

function isLinkedBodyshopFloorIncharge(linkedEmployee?: StaffLinkedEmployeeProfile | null): boolean {
  return Boolean(linkedEmployee && employeeRowIsBodyshopFloorIncharge(linkedEmployee))
}

/** Body Shop FI keeps the home label "Floor Incharge" and opens bodyshop assignment, not mechanical bays. */
function presentFloorInchargeModule(
  module: StaffHomeModule,
  linkedEmployee?: StaffLinkedEmployeeProfile | null,
): StaffHomeModule {
  if (module.key !== 'floor-incharge' || !isLinkedBodyshopFloorIncharge(linkedEmployee)) return module
  return {
    ...module,
    label: 'Floor Incharge',
    description: 'Assign dentor, painter & floor roles',
    route: '/(tabs)/bodyshop-floor',
  }
}

export function filterStaffHomeModules(
  allowedModules: Set<string>,
  linkedEmployee?: StaffLinkedEmployeeProfile | null,
): StaffHomeModule[] {
  const effectiveAllowed = expandAllowedModulesForBodyshopFloorIncharge(allowedModules, linkedEmployee)
  if (effectiveAllowed.size === 0) return []
  const bodyShopFloorIncharge = isLinkedBodyshopFloorIncharge(linkedEmployee)
  if (effectiveAllowed.has('admin') && !bodyShopFloorIncharge) return [...STAFF_HOME_MODULES]
  return STAFF_HOME_MODULES.filter((module) => {
    if (module.key === 'bodyshop-floor' && bodyShopFloorIncharge) return false
    if (module.key === 'floor-incharge' && bodyShopFloorIncharge) {
      return effectiveAllowed.has('floor_incharge') || effectiveAllowed.has('bodyshop_floor')
    }
    if (module.key === 'floor-incharge' && linkedEmployee) {
      if (!shouldUseMechanicalFloorInchargeScreen(linkedEmployee)) return false
    }
    const dbNames = STAFF_MODULE_KEY_TO_DB[module.key]
    return dbNames ? dbNames.some((name) => effectiveAllowed.has(name)) : false
  }).map((module) => presentFloorInchargeModule(module, linkedEmployee))
}
