export const PORTAL_BRANCHES = ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'] as const

export type PortalBranch = (typeof PORTAL_BRANCHES)[number]

export const REPORT_BRANCH_OPTIONS = ['Ajmer Road', 'Sitapura', 'Tonk', 'Shahpura'] as const

const SITAPURA_BRANCH_ALIASES = ['Sitapura', 'Sitapura PV', 'Sitapura EV'] as const
const AJMER_BRANCH_ALIASES = ['Ajmer Road', 'Ajmer Road PV', 'Ajmer Road EV'] as const

export function normalizeBranchLabel(raw: unknown): string {
	if (raw === null || raw === undefined) return ''

	return String(raw)
		.replace(/[\u200B-\u200D\uFEFF]/g, '')
    // eslint-disable-next-line no-control-regex -- intentional: strip ASCII control chars
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
}

export function branchAliases(branch: string): string[] {
	const normalized = normalizeBranchLabel(branch)
	if (!normalized) return []

	const lower = normalized.toLowerCase()

	if (lower === 'sitapura' || lower === 'sitapura (pv+ev)') {
		return [...SITAPURA_BRANCH_ALIASES]
	}

	if (lower === 'ajmer road' || lower === 'ajmer road (pv+ev)') {
		return [...AJMER_BRANCH_ALIASES]
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Supabase builder accepts any callable
export function applyBranchFilterToQuery<T extends { eq: Function; in: Function }>(query: T, branch: 'ALL' | string): T {
	if (branch === 'ALL') return query

	const aliases = branchAliases(branch)
	if (aliases.length === 0) return query

	if (aliases.length === 1) {
		return query.eq('branch', aliases[0]) as T
	}

	return query.in('branch', aliases) as T
}

/** Explicit bucket for amounts whose branch cannot be mapped; never dropped from totals (ACCOUNTS-002, 4.1). */
export const UNMAPPED_BRANCH = 'Unmapped'

/**
 * Canonical branch for finance reporting: the first of the supplied labels that maps to a known report branch
 * (Sitapura / Ajmer Road families via the existing aliases, plus Tonk and Shahpura), otherwise `Unmapped`.
 */
export function canonicalReportBranch(...rawLabels: unknown[]): string {
	for (const raw of rawLabels) {
		const label = normalizeBranchLabel(raw)
		if (!label) continue
		for (const option of REPORT_BRANCH_OPTIONS) {
			if (branchAliases(option).some((alias) => alias.toLowerCase() === label.toLowerCase())) return option
		}
	}
	return UNMAPPED_BRANCH
}
