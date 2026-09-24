export interface InsuranceProvider {
  id: string
  name: string
  claimFormUrl: string
  isPaperless: boolean
  /** Extra spellings from workshop / DMS (matching only). */
  aliases?: string[]
}

/** Canonical list — sorted by display name in UI. */
export const INSURANCE_PROVIDER_LIST: InsuranceProvider[] = [
  {
    id: 'ACKO',
    name: 'Acko General Insurance',
    claimFormUrl: '',
    isPaperless: true,
    aliases: ['acko general insurance limited'],
  },
  {
    id: 'BAJAJ_ALLIANZ',
    name: 'Bajaj Allianz General Insurance',
    claimFormUrl: 'https://www.bajajallianz.com/documents/10184/1095672/motor_claim_form.pdf',
    isPaperless: false,
    aliases: ['bajaj general insurance', 'bajaj allianz'],
  },
  {
    id: 'DIGIT',
    name: 'Go Digit General Insurance',
    claimFormUrl: '',
    isPaperless: true,
    aliases: ['go digit', 'godigit', 'go digit general insurance ltd'],
  },
  {
    id: 'HDFC_ERGO',
    name: 'HDFC ERGO General Insurance',
    claimFormUrl: 'https://www.hdfcergo.com/documents/downloads/claimforms/MotorClaimform.pdf',
    isPaperless: false,
    aliases: ['hdfc ergo', 'hdfc general insurance', 'icichdfc ergo'],
  },
  {
    id: 'ICICI_LOMBARD',
    name: 'ICICI Lombard General Insurance',
    claimFormUrl: 'https://www.icicilombard.com/docs/default-source/downloads/motor_claim_form.pdf',
    isPaperless: false,
    aliases: ['icici lombard', 'icici lombard general insurance co. ltd.'],
  },
  {
    id: 'IFFCO_TOKIO',
    name: 'IFFCO Tokio General Insurance',
    claimFormUrl: 'https://www.iffcotokio.co.in/content/dam/iffcotokio/claims/Motor-Claim-Form.pdf',
    isPaperless: false,
    aliases: ['iffco tokio', 'iffco tokiyo', 'iffco tokyo'],
  },
  {
    id: 'KOTAK',
    name: 'Zurich Kotak General Insurance',
    claimFormUrl: 'https://www.zurichkotak.com/downloads/motor-claim-form.pdf',
    isPaperless: false,
    aliases: ['kotak', 'zurich kotak', 'kotak general insurance'],
  },
  {
    id: 'LIBERTY',
    name: 'Liberty General Insurance',
    claimFormUrl: 'https://www.libertyinsurance.in/Claims/motorclaimform.pdf',
    isPaperless: false,
    aliases: ['liberty general insurance limited'],
  },
  {
    id: 'MAGMA',
    name: 'Magma HDI General Insurance',
    claimFormUrl: 'https://www.magmahdi.com/downloads/motor-claim-form.pdf',
    isPaperless: false,
    aliases: ['magma general insurance limited', 'magma hdi'],
  },
  {
    id: 'NATIONAL',
    name: 'National Insurance Co. Ltd.',
    claimFormUrl: 'https://nationalinsurance.nic.co.in/sites/default/files/2023-06/Motor%20Insurance%20Claim%20Form.pdf',
    isPaperless: false,
    aliases: ['national insurance', 'national in'],
  },
  {
    id: 'NEW_INDIA',
    name: 'The New India Assurance',
    claimFormUrl: 'https://www.newindia.co.in/downloads/MotorClaimForm.pdf',
    isPaperless: false,
    aliases: ['new india', 'the new india assurance company limited', 'the new india assurance'],
  },
  {
    id: 'ORIENTAL',
    name: 'Oriental Insurance Co. Ltd.',
    claimFormUrl: 'https://orientalinsurance.org.in/documents/10184/1095672/motor_claim_form.pdf',
    isPaperless: false,
    aliases: ['oriental insurance', 'orentail inssurance', 'the orentail insurance', 'the orientation insurance'],
  },
  {
    id: 'ROYAL_SUNDARAM',
    name: 'Royal Sundaram General Insurance',
    claimFormUrl: 'https://www.royalsundaram.in/documents/claim-form/motor-claim-form.pdf',
    isPaperless: false,
    aliases: ['royal sundaram', 'royal sundaram general insurnce company limited'],
  },
  {
    id: 'SBI_GENERAL',
    name: 'SBI General Insurance',
    claimFormUrl: 'https://content.sbigeneral.in/uploads/978a5ca67ab241dba8e8e865be1df963.pdf',
    isPaperless: false,
    aliases: ['sbi general insurance company limited', 'sbi general'],
  },
  {
    id: 'TATA_AIG',
    name: 'Tata AIG General Insurance',
    claimFormUrl: 'https://www.tataaig.com/s3/Motor_Claim_Form_new.pdf',
    isPaperless: false,
    aliases: ['tata aig', 'tata aig general insurance co. ltd.', 'tata aig general insurance company limited'],
  },
  {
    id: 'UNITED_INDIA',
    name: 'United India Insurance',
    claimFormUrl: 'https://uiic.co.in/documents/10184/1150315/Motor_Claim_Form_English.pdf',
    isPaperless: false,
    aliases: ['united india insurance co. ltd.', 'united india insurance ltd pvt'],
  },
  {
    id: 'UNIVERSAL_SOMPO',
    name: 'Universal Sompo General Insurance',
    claimFormUrl: 'https://www.universalsompo.com/pdf/claim_forms/Motor_Claim_Form.pdf',
    isPaperless: false,
    aliases: ['universal sompo'],
  },
  {
    id: 'ZUNO',
    name: 'Zuno General Insurance',
    claimFormUrl: '',
    isPaperless: true,
    aliases: ['zuno general insurance limited'],
  },
]

export const INSURANCE_PROVIDERS: Record<string, InsuranceProvider> = Object.fromEntries(
  INSURANCE_PROVIDER_LIST.map((p) => [p.id, p])
)

function normalizeInsurerText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchInsuranceProviderId(companyName: string | null | undefined): string | undefined {
  const raw = normalizeInsurerText(String(companyName || ''))
  if (!raw || raw === 'blank unknown') return undefined

  for (const provider of INSURANCE_PROVIDER_LIST) {
    const candidates = [provider.name, ...(provider.aliases || []), provider.id.replace(/_/g, ' ')]
    for (const candidate of candidates) {
      const norm = normalizeInsurerText(candidate)
      if (!norm) continue
      if (raw === norm || raw.includes(norm) || norm.includes(raw)) {
        return provider.id
      }
    }
  }

  return undefined
}
