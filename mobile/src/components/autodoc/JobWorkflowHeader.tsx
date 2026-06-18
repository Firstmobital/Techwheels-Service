import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { WorkflowTabs, type WorkflowTabKey } from './WorkflowTabs'

export type WorkflowTab = 'dashboard' | WorkflowTabKey

type WorkflowHeaderProps = {
  jobCardId?: string
  jcNumber?: string
  regNumber?: string
  activeTab: WorkflowTab
}

export default function JobWorkflowHeader({ jobCardId, jcNumber, regNumber, activeTab }: WorkflowHeaderProps) {
  const router = useRouter()

  const workflowParams = {
    id: jobCardId,
    jcNumber: jcNumber ?? '',
    regNumber: regNumber ?? '',
  }

  const onPressTab = (tab: WorkflowTabKey) => {
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
    <View style={{ marginBottom: 12 }}>
      <WorkflowTabs
        activeTab={activeTab === 'dashboard' ? 'jobcard' : activeTab}
        onTabPress={onPressTab}
        disabled={!jobCardId}
      />
    </View>
  )
}
