export interface SaFloorCompletedWaInput {
  customerName: string
  regNumber: string
  vehicleDetails: string
  completedOn: string
  complaintUrl: string
}

function requireValue(value: string, field: string): string {
  const next = String(value ?? '').trim()
  if (!next) throw new Error(`Missing required WA template field: ${field}`)
  return next
}

export function buildSaFloorCompletedWaTemplate(input: SaFloorCompletedWaInput): string {
  const customerName = requireValue(input.customerName, 'customerName')
  const regNumber = requireValue(input.regNumber, 'regNumber')
  const vehicleDetails = requireValue(input.vehicleDetails, 'vehicleDetails')
  const completedOn = requireValue(input.completedOn, 'completedOn')
  const complaintUrl = requireValue(input.complaintUrl, 'complaintUrl')

  return [
    `Hello ${customerName},`,
    '',
    `Your vehicle ${regNumber} (${vehicleDetails}) work is completed on ${completedOn}.`,
    '',
    'If you face any issue, please raise a complaint here:',
    complaintUrl,
    '',
    'Thank you,',
    'Techwheels Service',
  ].join('\n')
}
