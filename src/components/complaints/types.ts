// ============================================================================
// COMPLAINTS MODULE — TYPES & INTERFACES
// ============================================================================

export type ComplaintStatus = 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ComplaintCategory =
  | 'service_quality'
  | 'billing'
  | 'delivery_delay'
  | 'staff_behaviour'
  | 'parts_spares'
  | 'damage_during_service'
  | 'cleanliness'
  | 'other'
export type ComplaintSeverity = 'low' | 'medium' | 'high'
export type AuthorType = 'customer' | 'staff' | 'system'
export type SlaStatus = 'ok' | 'warning' | 'breached'

// ── Complaint Ticket ─────────────────────────────────────────────────────
export interface ComplaintTicket {
  id: bigint
  dealer_code: string
  ticket_number: string
  reception_entry_id: bigint
  reg_number: string
  model?: string
  jc_number?: string
  service_type?: string
  branch?: string
  customer_name?: string
  customer_phone?: string
  category: ComplaintCategory
  title: string
  description?: string
  priority: ComplaintPriority
  severity_self?: ComplaintSeverity
  status: ComplaintStatus
  sa_employee_code?: string
  assigned_to?: string
  is_escalated: boolean
  escalated_at?: string
  escalated_to?: string
  escalation_reason?: string
  response_due_at?: string
  resolution_due_at?: string
  first_response_at?: string
  resolved_at?: string
  closed_at?: string
  reopened_at?: string
  response_breached: boolean
  resolution_breached: boolean
  csat_rating?: number
  csat_comment?: string
  csat_at?: string
  channel: string
  created_by: string
  created_at: string
  updated_at: string
}

// ── Complaint Message ────────────────────────────────────────────────────
export interface ComplaintMessage {
  id: bigint
  dealer_code: string
  complaint_id: bigint
  author_type: AuthorType
  author_id?: string
  author_name?: string
  body: string
  is_internal: boolean
  created_at: string
}

// ── Complaint Activity ───────────────────────────────────────────────────
export interface ComplaintActivity {
  id: bigint
  dealer_code: string
  complaint_id: bigint
  event_type: string
  from_value?: string
  to_value?: string
  actor_type: AuthorType
  actor_id?: string
  actor_name?: string
  note?: string
  created_at: string
}

// ── Portal Response ──────────────────────────────────────────────────────
export interface ComplaintPortalResponse {
  mode: 'raise' | 'view'
  link_token: string
  entry_summary?: {
    reception_entry_id: bigint
    reg_number: string
    model?: string
    customer_name?: string
    service_type?: string
    branch?: string
  }
  ticket?: ComplaintTicket & {
    assigned_to_name?: string
    sla_status: SlaStatus
  }
  messages?: ComplaintMessage[]
  activity?: ComplaintActivity[]
}

// ── SLA Policy ───────────────────────────────────────────────────────────
export interface SlaPolicyRow {
  id: bigint
  dealer_code: string
  priority: ComplaintPriority
  response_mins: number
  resolution_mins: number
  created_at: string
  updated_at: string
}
