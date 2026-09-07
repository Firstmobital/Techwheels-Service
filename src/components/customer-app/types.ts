// ============================================================================
// BODY SHOP CUSTOMER APP — TYPES
// ============================================================================

export interface CustomerSession {
  sessionToken: string
  expiresAt: string
}

export interface CustomerEntrySummary {
  reg_number: string
  model: string | null
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  km_reading: number | null
}

export interface FloorInchargeInfo {
  employee_name: string | null
  employee_mobile: string | null
}

export interface RepairInvoiceInfo {
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  do_status: string
  do_amount: number | null
}

export interface RepairStages {
  mechanical: string
  denting: string
  painting: string
  rubbing: string
  edp: string
  qc: string
  reinspection: string
}

export interface RepairCardSummary {
  job_card_no: string
  current_stage_name: string | null
  overall_status: string | null
  bodyshop_floor: string | null
  floor_incharge: FloorInchargeInfo | null

  estimate_amount: number | null
  estimate_date: string | null
  claim_intimation_no: string | null
  claim_intimation_date: string | null
  survey_date: string | null
  surveyor_name: string | null
  surveyor_mobile: string | null
  surveyor_email: string | null
  survey_status: string
  approved_parts: string | null
  non_approved_parts: string | null

  stages: RepairStages

  pi_status: string
  pi_generated_at: string | null

  invoice: RepairInvoiceInfo | null

  received_at: string | null
  delivered_at: string | null
}

export interface CustomerRepairSummary {
  entry: CustomerEntrySummary
  repair_card: RepairCardSummary | null
}

export type TicketType = 'query' | 'complaint' | 'chat'

export interface ThreadSummary {
  id: number
  ticket_number: string
  ticket_type: TicketType
  title: string
  status: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface ThreadMessage {
  id: number
  author_type: 'customer' | 'staff' | 'system'
  author_name: string | null
  body: string
  created_at: string
  attachments: { id: number; file_name: string; content_type: string }[] | null
}

export interface ThreadDetail {
  ticket: {
    id: number
    ticket_number: string
    ticket_type: TicketType
    title: string
    description: string | null
    status: string
    created_at: string
  }
  messages: ThreadMessage[]
}

export interface CustomerDocumentMeta {
  id: number
  doc_key: 'doc_rc' | 'doc_dl' | 'doc_pan' | 'doc_kyc' | 'doc_insurance'
  file_name: string
  content_type: string
  uploaded_at: string
}
