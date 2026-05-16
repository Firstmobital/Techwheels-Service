export const PORTAL_BRANCHES = ['Ajmer Road', 'Sitapura PV', 'Sitapura EV'] as const

export type PortalBranch = (typeof PORTAL_BRANCHES)[number]
