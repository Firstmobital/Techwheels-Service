export interface InsuranceProvider {
  id: string
  name: string
  /** Direct motor claim form PDF (when insurer publishes one). */
  claimFormUrl: string
  /** Insurer claim registration / intimation portal. */
  claimIntimationUrl?: string
  isPaperless: boolean
  /** Extra spellings from workshop / DMS (matching only). */
  aliases?: string[]
}

/** Major private & digital insurers — sorted by display name in UI. */
export const INSURANCE_PROVIDER_LIST: InsuranceProvider[] = [
  {
    id: 'ACKO',
    name: 'Acko General Insurance',
    claimFormUrl: '',
    claimIntimationUrl: 'https://www.acko.com/gi/car-insurance/claim/',
    isPaperless: true,
    aliases: ['acko general insurance limited', 'acko'],
  },
  {
    id: 'BAJAJ_ALLIANZ',
    name: 'Bajaj General Insurance',
    claimFormUrl: 'https://www.bajajgeneralinsurance.com/download-documents/motor/Motor_Claim_Form.pdf',
    claimIntimationUrl: 'https://www.bajajgeneralinsurance.com/general-insurance-claims.html',
    isPaperless: false,
    aliases: [
      'bajaj allianz',
      'bajaj allianz general insurance',
      'bajaj general insurance limited',
      'bajaj general insurance',
    ],
  },
  {
    id: 'CHOLA_MS',
    name: 'Cholamandalam MS General Insurance',
    claimFormUrl:
      'https://www.cholainsurance.com/documents/20121/40602/New+Motor+Insurance+Claim+form.pdf/898dbfc5-cb11-4319-7df3-bc121aae767f',
    claimIntimationUrl: 'https://www.cholainsurance.com/motor-and-other-claims',
    isPaperless: false,
    aliases: ['chola ms', 'cholamandalam', 'cholamandalam ms general insurance company limited'],
  },
  {
    id: 'DIGIT',
    name: 'Go Digit General Insurance',
    claimFormUrl: '',
    claimIntimationUrl: 'https://www.godigit.com/motor-insurance/claims',
    isPaperless: true,
    aliases: ['go digit', 'godigit', 'go digit general insurance ltd', 'go digit general insurance limited'],
  },
  {
    id: 'HDFC_ERGO',
    name: 'HDFC ERGO General Insurance',
    claimFormUrl: 'https://www.hdfcergo.com/documents/downloads/claimforms/MotorClaimform.pdf',
    claimIntimationUrl: 'https://www.hdfcergo.com/online/claim-intimation',
    isPaperless: false,
    aliases: ['hdfc ergo', 'hdfc ergo general insurance company limited', 'hdfc general insurance', 'icichdfc ergo'],
  },
  {
    id: 'ICICI_LOMBARD',
    name: 'ICICI Lombard General Insurance',
    claimFormUrl: 'https://www.icicilombard.com/docs/default-source/downloads/motor_claim_form.pdf',
    claimIntimationUrl: 'https://www.icicilombard.com/online-insurance/motor-insurance/claim',
    isPaperless: false,
    aliases: ['icici lombard', 'icici lombard general insurance company limited', 'il takecare'],
  },
  {
    id: 'IFFCO_TOKIO',
    name: 'IFFCO Tokio General Insurance',
    claimFormUrl: 'https://www.iffcotokio.co.in/content/dam/iffcotokio/claims/Motor-Claim-Form.pdf',
    claimIntimationUrl: 'https://www.iffcotokio.co.in/claims',
    isPaperless: false,
    aliases: ['iffco tokio', 'iffco tokiyo', 'iffco tokyo'],
  },
  {
    id: 'KOTAK',
    name: 'Zurich Kotak General Insurance',
    claimFormUrl: 'https://www.zurichkotak.com/downloads/motor-claim-form.pdf',
    claimIntimationUrl: 'https://www.zurichkotak.com/claims',
    isPaperless: false,
    aliases: ['kotak', 'zurich kotak', 'kotak general insurance', 'zurich kotak general insurance'],
  },
  {
    id: 'LIBERTY',
    name: 'Liberty General Insurance',
    claimFormUrl: 'https://www.libertyinsurance.in/Claims/motorclaimform.pdf',
    claimIntimationUrl: 'https://www.libertyinsurance.in/Claims',
    isPaperless: false,
    aliases: ['liberty general insurance limited'],
  },
  {
    id: 'MAGMA',
    name: 'Magma HDI General Insurance',
    claimFormUrl: 'https://www.magmahdi.com/downloads/motor-claim-form.pdf',
    claimIntimationUrl: 'https://www.magmahdi.com/claims',
    isPaperless: false,
    aliases: ['magma general insurance limited', 'magma hdi'],
  },
  {
    id: 'NATIONAL',
    name: 'National Insurance Co. Ltd.',
    claimFormUrl: 'https://nationalinsurance.nic.co.in/sites/default/files/2023-06/Motor%20Insurance%20Claim%20Form.pdf',
    claimIntimationUrl: 'https://nationalinsurance.nic.co.in/en/claim-intimation',
    isPaperless: false,
    aliases: ['national insurance', 'national in'],
  },
  {
    id: 'NAVI',
    name: 'Navi General Insurance',
    claimFormUrl: '',
    claimIntimationUrl: 'https://navi.com/insurance/car-insurance-claim',
    isPaperless: true,
    aliases: ['navi general insurance limited', 'navi insurance'],
  },
  {
    id: 'NEW_INDIA',
    name: 'The New India Assurance',
    claimFormUrl: 'https://www.newindia.co.in/downloads/MotorClaimForm.pdf',
    claimIntimationUrl: 'https://www.newindia.co.in/portal/claimIntimation',
    isPaperless: false,
    aliases: ['new india', 'the new india assurance company limited', 'the new india assurance'],
  },
  {
    id: 'ORIENTAL',
    name: 'Oriental Insurance Co. Ltd.',
    claimFormUrl: 'https://orientalinsurance.org.in/documents/10184/1095672/motor_claim_form.pdf',
    claimIntimationUrl: 'https://orientalinsurance.org.in/en/claim-intimation',
    isPaperless: false,
    aliases: ['oriental insurance', 'orentail inssurance', 'the orentail insurance', 'the orientation insurance'],
  },
  {
    id: 'RAHEJA_QBE',
    name: 'Raheja QBE General Insurance',
    claimFormUrl: 'https://www.rahejaqbe.com/content/dam/rahejaqbe/downloads/Motor-Claim-Form.pdf',
    claimIntimationUrl: 'https://www.rahejaqbe.com/claims',
    isPaperless: false,
    aliases: ['raheja qbe general insurance company limited', 'raheja qbe'],
  },
  {
    id: 'RELIANCE',
    name: 'Reliance General Insurance',
    claimFormUrl: 'https://www.reliancegeneral.co.in/downloads/motor_claim_form.pdf',
    claimIntimationUrl: 'https://www.reliancegeneral.co.in/Insurance/Self-i/Claim-Registration.aspx',
    isPaperless: false,
    aliases: ['reliance general insurance company limited', 'reliance general', 'self-i'],
  },
  {
    id: 'ROYAL_SUNDARAM',
    name: 'Royal Sundaram General Insurance',
    claimFormUrl: 'https://www.royalsundaram.in/documents/claim-form/motor-claim-form.pdf',
    claimIntimationUrl: 'https://www.royalsundaram.in/claims',
    isPaperless: false,
    aliases: ['royal sundaram', 'royal sundaram general insurnce company limited'],
  },
  {
    id: 'SBI_GENERAL',
    name: 'SBI General Insurance',
    claimFormUrl: 'https://content.sbigeneral.in/uploads/978a5ca67ab241dba8e8e865be1df963.pdf',
    claimIntimationUrl: 'https://www.sbigeneral.in/claims',
    isPaperless: false,
    aliases: ['sbi general insurance company limited', 'sbi general'],
  },
  {
    id: 'SHRIRAM',
    name: 'Shriram General Insurance',
    claimFormUrl: 'https://www.shriramgi.com/Downloads/MotorClaimForm.pdf',
    claimIntimationUrl: 'https://www.shriramgi.com/Claims/Intimation',
    isPaperless: false,
    aliases: ['shriram general insurance company limited', 'shriram gi', 'shriram general'],
  },
  {
    id: 'TATA_AIG',
    name: 'Tata AIG General Insurance',
    claimFormUrl: 'https://www.tataaig.com/s3/Motor_Claim_Form_new.pdf',
    claimIntimationUrl: 'https://www.tataaig.com/claims',
    isPaperless: false,
    aliases: ['tata aig', 'tata aig general insurance co. ltd.', 'tata aig general insurance company limited'],
  },
  {
    id: 'UNITED_INDIA',
    name: 'United India Insurance',
    claimFormUrl: 'https://uiic.co.in/documents/10184/1150315/Motor_Claim_Form_English.pdf',
    claimIntimationUrl: 'https://uiic.co.in/claim-intimation',
    isPaperless: false,
    aliases: ['united india insurance co. ltd.', 'united india insurance ltd pvt'],
  },
  {
    id: 'UNIVERSAL_SOMPO',
    name: 'Universal Sompo General Insurance',
    claimFormUrl: 'https://www.universalsompo.com/pdf/claim_forms/Motor_Claim_Form.pdf',
    claimIntimationUrl: 'https://www.universalsompo.com/claims',
    isPaperless: false,
    aliases: ['universal sompo', 'universal sompo general insurance company limited'],
  },
  {
    id: 'ZUNO',
    name: 'Zuno General Insurance',
    claimFormUrl: '',
    claimIntimationUrl: 'https://www.zunoinsurance.com/claims',
    isPaperless: true,
    aliases: ['zuno general insurance limited', 'edelweiss general insurance', 'edelweiss general'],
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
