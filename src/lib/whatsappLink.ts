/** Same last-10 digit strip used by Insurance Renewal click-to-chat links. */
function lastTenDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

export function getWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '').slice(-10)
  return `https://wa.me/91${cleaned}?text=${encodeURIComponent(message)}`
}

/** Usable local mobile, or null when the Insurance strip does not yield 10 digits. */
export function whatsappLocal10(phone: string): string | null {
  const cleaned = lastTenDigits(phone)
  return cleaned.length === 10 ? cleaned : null
}
