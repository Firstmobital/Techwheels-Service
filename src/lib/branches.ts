export const PORTAL_BRANCHES = ['Ajmer Road', 'Sitapura PV', 'Sitapura EV'] as const

export type PortalBranch = (typeof PORTAL_BRANCHES)[number]

export const REPORT_BRANCH_OPTIONS = ['Ajmer Road', 'Sitapura', 'Tonk', 'Shahpura'] as const

const SITAPURA_BRANCH_ALIASES = ['Sitapura', 'Sitapura PV', 'Sitapura EV'] as const

export function normalizeBranchLabel(raw: unknown): string {
	if (raw === null || raw === undefined) return ''

	return String(raw)
		.replace(/[\u200B-\u200D\uFEFF]/g, '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
}

export function branchAliases(branch: string): string[] {
	const normalized = normalizeBranchLabel(branch)
	if (!normalized) return []

	if (normalized.toLowerCase() === 'sitapura') {
		return [...SITAPURA_BRANCH_ALIASES]
	}

	return [normalized]
}

export function matchesBranchSelection(rawBranch: unknown, selectedBranch: 'ALL' | string): boolean {
	if (selectedBranch === 'ALL') return true

	const rowBranch = normalizeBranchLabel(rawBranch).toLowerCase()
	if (!rowBranch) return false

	const aliases = branchAliases(selectedBranch)
	return aliases.some((alias) => alias.toLowerCase() === rowBranch)
}

export function applyBranchFilterToQuery<T extends { eq: Function; in: Function }>(query: T, branch: 'ALL' | string): T {
	if (branch === 'ALL') return query

	const aliases = branchAliases(branch)
	if (aliases.length === 0) return query

	if (aliases.length === 1) {
		return query.eq('branch', aliases[0]) as T
	}

	return query.in('branch', aliases) as T
}
