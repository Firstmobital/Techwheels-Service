export const BUSY_BRANCHES = ['Tonk', 'Shahpura', 'Mansarovar', 'Sitapura'] as const

export type BusyBranch = (typeof BUSY_BRANCHES)[number]

export const BUSY_DEBTOR_GROUPS = {
  Tonk: 'TONK DEBTORS',
  Shahpura: 'SHAHPPURA DEBTORS',
  Mansarovar: 'SERVICE CENTER DEBTORS -MAN SER',
  Sitapura: 'SERVICE CENTRE DEBTORS 2022-23',
} as const satisfies Record<BusyBranch, string>

export type BusyDebtorGroup = (typeof BUSY_DEBTOR_GROUPS)[BusyBranch]

const TONK_CODES = new Set(['PUM_3000840', 'EAA_500A840'])
const SHAHPURA_CODES = new Set(['GT_3000840', 'EHS1_500A840'])
const MANSAROVAR_CODES = new Set(['BS_500A840'])

export function normalizeAssignedTo(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, '_')
}

/**
 * Resolve BUSY branch from Labour `sr_assigned_to`.
 * Explicit matches run first; every other non-empty code falls back to Sitapura.
 */
export function resolveBusyBranch(srAssignedTo: unknown): BusyBranch | null {
  const code = normalizeAssignedTo(srAssignedTo).toUpperCase()
  if (!code) return null

  if (TONK_CODES.has(code)) return 'Tonk'
  if (SHAHPURA_CODES.has(code)) return 'Shahpura'
  if (MANSAROVAR_CODES.has(code)) return 'Mansarovar'
  return 'Sitapura'
}

export function resolveDebtorGroup(branch: BusyBranch): BusyDebtorGroup {
  return BUSY_DEBTOR_GROUPS[branch]
}

export function busyBranchLabelForParty(branch: BusyBranch): string {
  return branch.toUpperCase()
}
