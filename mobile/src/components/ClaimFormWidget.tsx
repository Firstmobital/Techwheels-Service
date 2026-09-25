import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  INSURANCE_PROVIDER_LIST,
  INSURANCE_PROVIDERS,
  type InsuranceProvider,
} from '../config/insuranceProviders'
import { CustomerTheme } from '../lib/customer/customerTheme'
import {
  downloadInsuranceClaimForm,
  openInsuranceClaimIntimation,
} from '../lib/customer/downloadInsuranceClaimForm'
import { Icon } from './ui/Icon'

interface ClaimFormWidgetProps {
  userInsurerId?: string
  /** When set, shown as “your insurer on file”. */
  insurerNameOnFile?: string | null
}

export function ClaimFormWidget({ userInsurerId, insurerNameOnFile }: ClaimFormWidgetProps) {
  const sortedProviders = useMemo(
    () => [...INSURANCE_PROVIDER_LIST].sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  const [selectedProvider, setSelectedProvider] = useState(userInsurerId || '')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)

  useEffect(() => {
    if (userInsurerId) {
      setSelectedProvider(userInsurerId)
    }
  }, [userInsurerId])

  const provider: InsuranceProvider | undefined = INSURANCE_PROVIDERS[selectedProvider]
  const canDownloadPdf = Boolean(provider && !provider.isPaperless && String(provider.claimFormUrl || '').trim())
  const canOpenPortal = Boolean(provider && String(provider.claimIntimationUrl || '').trim())

  const handleDownload = async () => {
    if (!provider) return
    setIsDownloading(true)
    try {
      await downloadInsuranceClaimForm(provider)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleOpenPortal = async () => {
    if (!provider) return
    setIsOpeningPortal(true)
    try {
      await openInsuranceClaimIntimation(provider)
    } finally {
      setIsOpeningPortal(false)
    }
  }

  return (
    <View
      style={{
        backgroundColor: CustomerTheme.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: CustomerTheme.border,
      }}
    >
      <Text style={{ color: CustomerTheme.ink, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
        Insurance claim form
      </Text>
      <Text style={{ color: CustomerTheme.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
        Download the official motor claim PDF or register your claim on the insurer portal.
      </Text>

      {insurerNameOnFile ? (
        <Text style={{ color: CustomerTheme.teal, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
          On your job card: {insurerNameOnFile}
        </Text>
      ) : null}

      <Text style={{ color: CustomerTheme.ink, fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
        Select insurance company
      </Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: CustomerTheme.border,
          borderRadius: 14,
          backgroundColor: CustomerTheme.bg,
          maxHeight: 220,
          marginBottom: 14,
          overflow: 'hidden',
        }}
      >
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {sortedProviders.map((insurer) => {
            const selected = selectedProvider === insurer.id
            return (
              <TouchableOpacity
                key={insurer.id}
                onPress={() => setSelectedProvider(insurer.id)}
                activeOpacity={0.75}
                style={{
                  paddingVertical: 11,
                  paddingHorizontal: 14,
                  backgroundColor: selected ? CustomerTheme.primaryLight : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: CustomerTheme.border,
                }}
              >
                <Text
                  style={{
                    color: CustomerTheme.ink,
                    fontSize: 14,
                    fontWeight: selected ? '800' : '600',
                  }}
                >
                  {insurer.name}
                </Text>
                {insurer.isPaperless ? (
                  <Text style={{ color: CustomerTheme.inkMuted, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                    Digital / paperless claims
                  </Text>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {provider?.isPaperless ? (
        <View
          style={{
            backgroundColor: '#ECFDF5',
            borderWidth: 1,
            borderColor: '#A7F3D0',
            borderRadius: 12,
            padding: 12,
            marginBottom: canOpenPortal ? 12 : 0,
          }}
        >
          <Text style={{ color: '#065F46', fontSize: 13, lineHeight: 20 }}>
            <Text style={{ fontWeight: '900', color: CustomerTheme.teal }}>{provider.name}</Text> handles claims
            digitally — no printed claim form is usually required.
          </Text>
        </View>
      ) : null}

      {canDownloadPdf ? (
        <TouchableOpacity
          disabled={!selectedProvider || isDownloading}
          onPress={() => void handleDownload()}
          activeOpacity={0.88}
          style={{
            backgroundColor: !selectedProvider || isDownloading ? CustomerTheme.inkSoft : CustomerTheme.teal,
            borderRadius: 14,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: canOpenPortal ? 10 : 0,
          }}
        >
          {isDownloading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="download" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Download claim form (PDF)</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {canOpenPortal ? (
        <TouchableOpacity
          disabled={!selectedProvider || isOpeningPortal}
          onPress={() => void handleOpenPortal()}
          activeOpacity={0.88}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 14,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1.5,
            borderColor: CustomerTheme.primary,
          }}
        >
          {isOpeningPortal ? (
            <ActivityIndicator color={CustomerTheme.primary} />
          ) : (
            <>
              <Icon name="navigation" size={18} color={CustomerTheme.primary} />
              <Text style={{ color: CustomerTheme.primary, fontWeight: '800', fontSize: 15 }}>
                Register claim online
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {!selectedProvider ? (
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
          Select your insurance company to see download and registration options.
        </Text>
      ) : provider && !canDownloadPdf && !canOpenPortal ? (
        <Text style={{ color: CustomerTheme.inkMuted, fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
          Links for this insurer are not available in the app yet. Your service advisor can help.
        </Text>
      ) : null}
    </View>
  )
}
