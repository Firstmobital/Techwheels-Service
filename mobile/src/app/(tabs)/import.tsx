import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { listJobCardSummaries, type JobDashboardSummaryRow } from '../../lib/api/jobCards'

export default function ImportScreen() {
  const router = useRouter()
  const { signOut, user } = useAuth()
  const [jobCards, setJobCards] = useState<JobDashboardSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadJobCards = async () => {
    try {
      setError(null)
      const result = await listJobCardSummaries()
      
      if (result.error) {
        setError(result.error)
      } else {
        setJobCards(result.data ?? [])
      }
    } catch (err: any) {
      setError(err.message || 'Error loading job cards')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadJobCards()
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    loadJobCards()
  }

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  const handleCreateJobCard = () => {
    Alert.alert('Create Job Card', 'Feature coming soon')
  }

  const renderJobCard = ({ item }: { item: JobDashboardSummaryRow }) => (
    <TouchableOpacity
      style={styles.jobCard}
      activeOpacity={0.85}
      onPress={() => Alert.alert('Job Card', `${item.jc_number} - ${item.reg_number}`)}
    >
      <View style={styles.jobCardTopRow}>
        <View style={styles.jobCardMain}>
          <Text style={styles.jobCardTitle}>{item.jc_number}</Text>
          <Text style={styles.jobCardSubtitle}>{item.reg_number}</Text>
          {item.model && <Text style={styles.jobCardMeta}>{item.model} ({item.vehicle_year})</Text>}
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{item.status || 'draft'}</Text>
        </View>
      </View>
      
      <View style={styles.jobCardBottomRow}>
        <Text style={styles.jobCardLabel}>
          Panels: {item.panel_count || 0}
        </Text>
        <Text style={styles.jobCardAmount}>
          ₹{(item.total_estimate_amount || 0).toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Import Data</Text>
          <View style={styles.liveChip}>
            <Text style={styles.liveChipText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>Job Cards</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading premium dashboard...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Unable to Load Data</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onRefresh}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobCards}
          renderItem={renderJobCard}
          keyExtractor={(item, index) => `${item.job_card_id ?? item.jc_number ?? 'job'}-${index}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No Job Cards Yet</Text>
              <Text style={styles.emptyBody}>Create your first job card to get started.</Text>
            </View>
          }
        />
      )}

      <View style={styles.footerActions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleCreateJobCard}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryButtonText}>+ New Job Card</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleLogout}
          activeOpacity={0.9}
        >
          <Text style={styles.secondaryButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7ff',
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e7ecff',
    shadowColor: '#1f3b8f',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 17,
    color: '#334155',
    fontWeight: '700',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#64748b',
  },
  liveChip: {
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveChipText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
  },
  jobCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
  },
  jobCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  jobCardMain: {
    flex: 1,
    paddingRight: 8,
  },
  jobCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  jobCardSubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: '#475569',
  },
  jobCardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  jobCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobCardLabel: {
    fontSize: 13,
    color: '#475569',
  },
  jobCardAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#991b1b',
    marginBottom: 6,
  },
  errorBody: {
    textAlign: 'center',
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 14,
  },
  emptyCard: {
    marginTop: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fbff',
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  emptyBody: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
  },
  footerActions: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: '#dbe3f4',
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
  },
})
