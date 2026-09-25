import { supabase } from '../supabase'

export type AdvisorChatSide = 'customer' | 'staff'

export interface CustomerAdvisorChat {
  id: string
  reg_number: string
  phone_10: string
  customer_name: string | null
  jc_number: string | null
  sa_name: string | null
  customer_unread_count: number
}

export interface CustomerAdvisorMessage {
  id: string
  chat_id: string
  author_side: AdvisorChatSide
  author_name: string
  body: string
  created_at: string
}

export interface CustomerAdvisorThread {
  chat: CustomerAdvisorChat | null
  messages: CustomerAdvisorMessage[]
}

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message || ''
  if (raw.includes('Session expired')) return 'Session expired.'
  if (raw.includes('Vehicle not found')) return 'Vehicle not found for this session.'
  if (raw.includes('too long')) return 'Message is too long.'
  if (raw.includes('at least 1')) return 'Message should be at least 1 character.'
  if (raw.includes('forbidden')) return 'Not allowed.'
  return fallback
}

export async function customerListAdvisorMessages(
  sessionToken: string,
  regNumber: string,
  contactKey = 'advisor',
): Promise<CustomerAdvisorThread> {
  const { data, error } = await supabase.rpc('customer_list_advisor_messages', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_contact_key: contactKey,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load chat.'))
  const payload = (data || {}) as CustomerAdvisorThread
  return {
    chat: payload.chat ?? null,
    messages: payload.messages || [],
  }
}

export async function customerSendAdvisorMessage(
  sessionToken: string,
  regNumber: string,
  body: string,
  contactKey = 'advisor',
): Promise<void> {
  const { error } = await supabase.rpc('customer_send_advisor_message', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_body: body,
    p_contact_key: contactKey,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to send message.'))
}
