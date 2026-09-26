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

export interface StaffAdvisorChatThread {
  id: string
  reg_number: string
  phone_10: string
  customer_name: string | null
  jc_number: string | null
  sa_name: string | null
  contact_key?: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_author_side: AdvisorChatSide | null
  staff_unread_count: number
}

export async function listStaffAdvisorChats(): Promise<StaffAdvisorChatThread[]> {
  const { data, error } = await supabase.rpc('advisor_chat_list')
  if (error) throw new Error(error.message || 'Unable to load chats.')
  return (data || []) as StaffAdvisorChatThread[]
}

export async function getStaffAdvisorChat(chatId: string): Promise<{
  chat: StaffAdvisorChatThread
  messages: CustomerAdvisorMessage[]
}> {
  const { data, error } = await supabase.rpc('advisor_chat_get', { p_chat_id: chatId })
  if (error) throw new Error(error.message || 'Unable to open chat.')
  const payload = (data || {}) as { chat: StaffAdvisorChatThread; messages: CustomerAdvisorMessage[] }
  return { chat: payload.chat, messages: payload.messages || [] }
}

export async function sendStaffAdvisorChat(chatId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('advisor_chat_send', { p_chat_id: chatId, p_body: body })
  if (error) throw new Error(error.message || 'Unable to send message.')
}

export async function getStaffAdvisorChatUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('advisor_chat_unread_count')
  if (error) throw new Error(error.message || 'Unable to load unread chats.')
  return Number(data || 0)
}
