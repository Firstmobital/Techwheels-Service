/** Same label in filter chips and list matching (null/blank branch → Unknown). */
export function bodyshopBranchLabel(branch: string | null | undefined): string {
  return String(branch ?? '').trim() || 'Unknown'
}

export function matchesBodyshopBranchFilter(
  branch: string | null | undefined,
  branchFilter: string,
): boolean {
  if (branchFilter === 'all') return true
  return bodyshopBranchLabel(branch) === branchFilter
}
