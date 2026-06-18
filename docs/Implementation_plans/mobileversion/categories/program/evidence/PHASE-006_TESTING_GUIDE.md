# Phase 6 Testing Guide - Offline Support

**Date**: May 27, 2026  
**Status**: Ready for local testing  
**Objective**: Validate offline functionality on Expo local

---

## Local Testing Setup

### Prerequisites
✅ Expo development server running on `http://localhost:8081`  
✅ Phase 5 (Core UI) working without errors  
✅ All Phase 6 infrastructure installed:
- Offline storage layer
- Sync queue manager
- Network status detection
- Background sync
- Logger utility

### Test Environment
- **Platform**: macOS (Expo Go or emulator)
- **Network**: Local WiFi + airplane mode simulation
- **Logging**: Device-local logs + S3 upload

---

## Test Scenarios

### Scenario 1: App Startup (Basic)
**Objective**: Verify app loads without offline infrastructure errors

```
1. Open Expo Go on device
2. Scan QR code from http://localhost:8081
3. Wait for app to load
4. Verify no red errors on screen
5. Check console: "Logger initialized", "Network status ready"
```

**Expected Result**: ✅ App loads, no crashes

---

### Scenario 2: Network Detection
**Objective**: Verify network status is detected correctly

**Steps**:
1. App is running
2. Open Settings → toggle WiFi on/off
3. Observe network status indicator
4. Check logs: `logEvent('network_connected')` or `logEvent('network_disconnected')`

**Expected Result**: ✅ Status changes reflect network changes

---

### Scenario 3: Cache Operations (No Network)
**Objective**: Verify caching works without network

**Setup**: 
- Airplane mode ON
- App is running

**Steps**:
1. Navigate to any list view (Reports, AutoDoc, etc.)
2. Observe loading state
3. If data exists locally (from previous load): ✅ Show cached data
4. Check logs: `cache_hit_used` or `cache_miss`

**Expected Result**: ✅ Cached data displays OR graceful offline state

---

### Scenario 4: Sync Queue (Offline Create)
**Objective**: Verify operations queue when offline

**Setup**:
- Airplane mode ON
- App is running

**Steps**:
1. Try to create a job card or estimate
2. Operation should:
   - ✅ Optimistically update local UI
   - ✅ Queue for sync (`queue_enqueued` log)
   - ✅ Show "Offline" indicator
3. Leave app and return
4. Verify queued item persists

**Expected Result**: ✅ Operation queued, appears in sync queue

---

### Scenario 5: Auto-Sync (Reconnect)
**Objective**: Verify auto-sync when connectivity returns

**Setup**:
- Multiple queued items from Scenario 4
- Airplane mode ON

**Steps**:
1. Turn airplane mode OFF
2. App should detect connectivity
3. Observe sync activity:
   - `sync_start` log
   - `sync_success` logs (one per item)
   - `sync_complete` log
4. UI should update with server confirmation

**Expected Result**: ✅ All queued items sync automatically

---

### Scenario 6: Sync Failure & Retry
**Objective**: Verify retry logic on sync failure

**Setup**:
- Network is on but backend is unreachable (use Supabase down simulator)
- Queued items exist

**Steps**:
1. Trigger sync manually
2. Observe first failure: `sync_retry` log
3. Wait 30 seconds (auto-retry interval)
4. Verify retry count increases
5. After 5 retries: `sync_failed` log

**Expected Result**: ✅ Failures are logged and retried

---

### Scenario 7: Background Sync
**Objective**: Verify background sync on iOS/Android

**Setup**:
- Real device (not simulator)
- Queued items exist
- Background sync registered

**Steps**:
1. Minimize app (send to background)
2. Wait 5 minutes
3. Bring app back to foreground
4. Check logs: `background_sync_triggered`, `background_sync_complete`

**Expected Result**: ✅ Background sync executed

---

### Scenario 8: Cache Memory Management
**Objective**: Verify cache doesn't grow unbounded

**Setup**:
- App running with network on
- Navigate through multiple screens

**Steps**:
1. Use debug panel to check cache stats
2. Open reports, lists, details repeatedly
3. Monitor cache size growth
4. Should not exceed 50 MB

**Expected Result**: ✅ Cache stays within limits, expired entries cleaned

---

### Scenario 9: Photo Upload (Offline)
**Objective**: Verify photo upload queuing offline

**Setup**:
- Airplane mode ON
- Job card is open

**Steps**:
1. Try to upload a photo
2. Select photo from gallery
3. Should queue: `queue_enqueued` for `photo` resource
4. Turn airplane mode OFF
5. Photo should upload in background

**Expected Result**: ✅ Photo queues and uploads when online

---

### Scenario 10: Multiple Offline Sessions
**Objective**: Verify offline changes persist across sessions

**Setup**:
- Airplane mode ON
- Make multiple changes (drafts)

**Steps**:
1. Create draft job card #1
2. Close app completely
3. Reopen app
4. Draft #1 should still be there
5. Create draft job card #2
6. Turn airplane mode OFF
7. Both drafts should sync

**Expected Result**: ✅ All drafts persist and sync correctly

---

## Debug Panel Setup

Add this temporary debug component to test offline features:

```tsx
// app/(tabs)/debug.tsx
import { ScrollView, View, Text, Button } from 'react-native'
import { useOffline } from '@/context/OfflineContext'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { getLogStats } from '@/utils/logger'

export default function DebugScreen() {
  const offline = useOffline()
  const network = useNetworkStatus()

  return (
    <ScrollView className="bg-white p-4">
      <Text className="text-lg font-bold mb-4">Debug: Offline Support</Text>
      
      {/* Network Status */}
      <View className="mb-4 p-3 bg-gray-100 rounded">
        <Text>Status: {network.isConnected ? '🟢 Online' : '🔴 Offline'}</Text>
        <Text>Type: {network.type}</Text>
        <Text>Metered: {network.ismetered ? 'Yes' : 'No'}</Text>
      </View>

      {/* Sync Stats */}
      <View className="mb-4 p-3 bg-gray-100 rounded">
        <Text>Pending Sync: {offline.pendingSync}</Text>
        <Text>Failed Sync: {offline.failedSync}</Text>
        <Text>Cache Size: {(offline.totalCacheSize / 1024).toFixed(2)} KB</Text>
      </View>

      {/* Actions */}
      <Button
        title="View Sync Queue"
        onPress={async () => {
          const items = await offline.getQueuedItems()
          console.log('Queue:', JSON.stringify(items, null, 2))
        }}
      />
      
      <Button
        title="View Log Stats"
        onPress={async () => {
          const stats = await getLogStats()
          console.log('Logs:', stats)
        }}
      />
      
      <Button
        title="Clear Cache"
        onPress={() => offline.cacheClear()}
      />
    </ScrollView>
  )
}
```

---

## Logging Checklist

During testing, watch for these log events:

### Network Events
- `network_connected` - Network came online
- `network_disconnected` - Network went offline
- `network_check_error` - Failed to check network status

### Cache Events
- `cache_hit_used` - Data loaded from cache
- `cache_miss` - Cache miss, fetching fresh
- `cache_populated` - Data cached successfully
- `cache_expired` - Cached entry expired
- `cache_cleanup` - Expired entries removed

### Sync Events
- `queue_enqueued` - Item added to sync queue
- `queue_dequeued` - Item removed (synced successfully)
- `sync_start` - Sync operation starting
- `sync_success` - Item synced successfully
- `sync_retry` - Retry attempt
- `sync_failed` - Sync failed after max retries
- `sync_complete` - Sync batch complete

### Background Sync Events
- `background_sync_triggered` - Background sync started
- `background_sync_complete` - Background sync finished
- `background_sync_error` - Background sync failed

### Logger Events
- `offline_context_online` - Offline context initialized, network online
- `offline_context_offline` - Offline context initialized, network offline

---

## Performance Benchmarks

**Current Phase 5 Baseline**:
- App size: ~140 MB (compressed)
- Memory: ~80 MB initial load
- Battery: Normal drain

**Expected Phase 6 Overhead** (with offline support):
- App size: +2-3 MB (new code)
- Memory: +15-20 MB (caching)
- Battery: Negligible with 5+ min sync intervals

---

## Common Test Issues

| Issue | Debug Steps |
|-------|------------|
| Cache not saving | Check AsyncStorage permissions |
| Sync never triggers | Verify network detection hook |
| Background sync not working | Ensure app granted background permission |
| Large cache size | Reduce TTLs or clear manually |
| Logs not uploading | Check Supabase storage bucket exists |
| High battery drain | Increase sync interval (currently 30s) |

---

## Success Criteria

✅ All 10 scenarios pass  
✅ No console errors  
✅ Sync completes within 2 seconds  
✅ Cache lookups < 100ms  
✅ App doesn't crash on network toggle  
✅ Logs upload successfully  

---

## Next: Proceed to Phase 7

Once all tests pass:
1. Create APK build
2. Test on real Android device
3. Deploy to beta testers
4. Gather feedback
5. Production release
