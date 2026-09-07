// ============================================================================
// BODY SHOP CUSTOMER APP — STATUS DISPLAY HELPERS
// ============================================================================
//
// The actual internal-enum -> customer-facing-string mapping happens
// server-side in get_customer_repair_summary (see
// supabase/migrations/20260906093000_bodyshop_customer_repair_summary_rpc.sql,
// bodyshop_map_stage_status / bodyshop_map_qc_status / etc). The RPC already
// returns display strings, so this module only maps those known display
// strings to visual treatment -- it does not re-implement the enum mapping.

export type StageDisplayState = 'Not Required' | 'Pending' | 'In Progress' | 'On Hold' | 'Completed'

const STAGE_TONE: Record<string, { color: string; bg: string }> = {
  'Not Required': { color: '#6b7280', bg: '#f3f4f6' },
  Pending: { color: '#92400e', bg: '#fef3c7' },
  'In Progress': { color: '#1d4ed8', bg: '#dbeafe' },
  'On Hold': { color: '#b45309', bg: '#fed7aa' },
  Completed: { color: '#15803d', bg: '#dcfce7' },
  Approved: { color: '#15803d', bg: '#dcfce7' },
  Passed: { color: '#15803d', bg: '#dcfce7' },
  Received: { color: '#15803d', bg: '#dcfce7' },
  'Requires Attention': { color: '#b91c1c', bg: '#fee2e2' },
  'Not Received': { color: '#b91c1c', bg: '#fee2e2' },
  'Not Started': { color: '#6b7280', bg: '#f3f4f6' },
}

export function stageTone(display: string): { color: string; bg: string } {
  return STAGE_TONE[display] ?? { color: '#374151', bg: '#f3f4f6' }
}

export const STAGE_ORDER: { key: keyof import('./types').RepairStages; label: string }[] = [
  { key: 'mechanical', label: 'Mechanical' },
  { key: 'denting', label: 'Denting' },
  { key: 'painting', label: 'Painting' },
  { key: 'rubbing', label: 'Rubbing' },
  { key: 'qc', label: 'QC' },
  { key: 'reinspection', label: 'Reinspection (RI)' },
  { key: 'edp', label: 'EDP' },
]
