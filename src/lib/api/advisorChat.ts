import { supabase } from '../supabase'

export type AdvisorChatSide = 'customer' | 'staff'

export interface AdvisorChatThread {
  id: string
  dealer_code: string
  reg_number: string
  reg_key: string
  phone_10: string
  customer_name: string | null
  jc_number: string | null
  sa_name: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_author_side: AdvisorChatSide | null
  staff_unread_count: number
  customer_unread_count: number
  created_at: string
  updated_at: string
}

export interface AdvisorChatMessage {
  id: string
  chat_id: string
  author_side: AdvisorChatSide
  author_user_id: string | null
  author_name: string
  body: string
  created_at: string
}

export interface AdvisorChatDetail {
  chat: AdvisorChatThread
  messages: AdvisorChatMessage[]
}

export async function listAdvisorChats(): Promise<AdvisorChatThread[]> {
  const { data, error } = await supabase.rpc('advisor_chat_list')
  if (error) throw error
  return (data || []) as AdvisorChatThread[]
}

export async function getAdvisorChat(chatId: string): Promise<AdvisorChatDetail> {
  const { data, error } = await supabase.rpc('advisor_chat_get', { p_chat_id: chatId })
  if (error) throw error
  return data as AdvisorChatDetail
}

export async function sendAdvisorChatMessage(chatId: string, body: string): Promise<AdvisorChatDetail> {
  const { data, error } = await supabase.rpc('advisor_chat_send', {
    p_chat_id: chatId,
    p_body: body,
  })
  if (error) throw error
  const payload = data as { chat: AdvisorChatThread; message: AdvisorChatMessage }
  return { chat: payload.chat, messages: [payload.message] }
}

export async function getAdvisorChatUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('advisor_chat_unread_count')
  if (error) throw error
  return Number(data || 0)
}
