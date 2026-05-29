import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'

export type WorkflowTab = 'dashboard' | 'jobcard' | 'damage' | 'estimate' | 'submit'

type WorkflowHeaderProps = {
  jobCardId?: string
  jcNumber?: string
  regNumber?: string
  activeTab: WorkflowTab
}

const TABS: Array<{ key: WorkflowTab; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'jobcard', label: 'Job Card' },
  { key: 'damage', label: 'Damage' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'submit', label: 'Submit' },
]

export default function JobWorkflowHeader({ jobCardId, jcNumber, regNumber, activeTab }: WorkflowHeaderProps) {
  const router = useRouter()

  const workflowParams = {
    id: jobCardId,
    jcNumber: jcNumber ?? '',
    regNumber: regNumber ?? '',
  }

  const onPressTab = (tab: WorkflowTab) => {
    if (tab === 'dashboard') {
      router.push('/(tabs)/autodoc')
      return
    }

    if (!jobCardId) return

    if (tab === 'jobcard') {
      router.push({ pathname: '/job-cards/[id]/jobcard', params: workflowParams })
      return
    }

    if (tab === 'damage') {
      router.push({ pathname: '/job-cards/[id]/damage', params: workflowParams })
      return
    }

    if (tab === 'estimate') {
      router.push({ pathname: '/job-cards/[id]/estimate', params: workflowParams })
      return
    }

    router.push({ pathname: '/job-cards/[id]/submit', params: workflowParams })
  }

  return (
    <View className="mb-3 flex-row flex-wrap -mx-1">
      {TABS.map((tab) => {
        const active = tab.key === activeTab
        const disabled = tab.key !== 'dashboard' && !jobCardId

        return (
          <TouchableOpacity
            key={tab.key}
            className="w-1/5 px-1"
            onPress={() => onPressTab(tab.key)}
            disabled={disabled}
          >
            <View
              className={`rounded-lg border py-2 items-center ${
                active ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
              } ${disabled ? 'opacity-40' : ''}`}
            >
              <Text className={`text-[10px] font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>
                {tab.label}
              </Text>
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
