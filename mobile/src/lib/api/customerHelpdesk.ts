import { supabase } from '../supabase'

export type CustomerHelpdeskContactRow = {
  id: number
  group_key: 'dealership' | 'tata_motors'
  sort_order: number
  level_label: string
  contact_name: string
  role_title: string
  description: string | null
  phone: string
  email: string | null
  icon_emoji: string | null
  badge_variant: 'blue' | 'amber' | 'rose' | 'indigo' | 'emerald'
  chat_contact_key: string | null
}

export async function customerListHelpdeskContacts(
  sessionToken: string
): Promise<CustomerHelpdeskContactRow[]> {
  const { data, error } = await supabase.rpc('customer_list_helpdesk_contacts', {
    p_session_token: sessionToken,
  })
  if (error) {
    throw new Error(error.message || 'Unable to load helpdesk contacts.')
  }
  if (!Array.isArray(data)) return []
  return data as CustomerHelpdeskContactRow[]
}
