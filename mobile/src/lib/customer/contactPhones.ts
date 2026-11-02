import { asText } from '../../components/customer/customerUi'

export function digitsForTel(raw: string | null | undefined): string | null {
  const text = asText(raw)
  if (!text) return null
  const digits = text.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

export function pickSurveyorPhone(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null
  return (
    digitsForTel(record.surveyor_contact)
    ?? digitsForTel(record.surveyor_mobile)
    ?? digitsForTel(record.surveyor_phone)
  )
}
