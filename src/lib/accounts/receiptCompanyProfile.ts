/**
 * Workshop identity on Accounts customer payment receipts.
 * Legal name matches payroll / bank payout / customer terms authority.
 * Company GSTIN is not stored elsewhere in this repository; leave null until configured.
 */
export const ACCOUNTS_RECEIPT_COMPANY = {
  legalName: 'FIRST MOBITAL PRIVATE LIMITED',
  /** No authoritative company GSTIN table in repo — omit on PDF when null. */
  gstin: null as string | null,
  addressLines: [
    'Techwheels — Tata Motors Authorised Service Centre',
    'Sitapura Industrial Area, Jaipur, Rajasthan',
  ],
  placeOfSupply: 'Rajasthan',
} as const
