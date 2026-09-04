/** Current operational availability. Missing is_active is treated as active. */
export function isEmployeeCurrentlyActive(row: { is_active?: boolean | null } | null | undefined): boolean {
  if (!row) return false
  return row.is_active !== false
}
