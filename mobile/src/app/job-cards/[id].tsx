import { Redirect, useLocalSearchParams } from 'expo-router'

type Params = {
  id?: string | string[]
}

export default function JobCardDetailRedirect() {
  const { id } = useLocalSearchParams<Params>()
  const jobCardId = Array.isArray(id) ? id[0] : id

  if (!jobCardId) {
    return <Redirect href="/(tabs)/autodoc" />
  }

  return <Redirect href={`/job-cards/${jobCardId}/submit`} />
}
