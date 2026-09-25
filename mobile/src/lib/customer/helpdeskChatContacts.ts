/** In-app chat routing keys (see supabase migration advisor chat contact_key). */
export type HelpdeskChatContactKey =
  | 'advisor'
  | 'payal'
  | 'govind'
  | 'rajesh'
  | 'tata_akshay'
  | 'tata_gurmeet'

export const HELPDESK_CHAT_PEER_NAMES: Record<HelpdeskChatContactKey, string> = {
  advisor: 'Service advisor',
  payal: 'Payal Makhija',
  govind: 'Govind Singh',
  rajesh: 'Mr Rajesh Panday',
  tata_akshay: 'Mr Akshay Jethalia',
  tata_gurmeet: 'Mr Gurmeet Singh',
}

export function normalizeHelpdeskChatContactKey(value: string | undefined | null): HelpdeskChatContactKey {
  const key = String(value || 'advisor').trim().toLowerCase()
  if (key in HELPDESK_CHAT_PEER_NAMES) return key as HelpdeskChatContactKey
  return 'advisor'
}

export function helpdeskChatPeerName(contactKey: HelpdeskChatContactKey): string {
  return HELPDESK_CHAT_PEER_NAMES[contactKey]
}
