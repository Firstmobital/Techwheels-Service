# Phase 6: Offline Support Implementation Guide

**Date**: May 27, 2026  
**Status**: ✅ Core Infrastructure Complete  
**Target**: Offline data caching, sync queue, background sync

---

## What's Included in Phase 6

### Core Infrastructure Created

#### 1. **Offline Storage Layer** (`src/lib/offlineStorage.ts`)
- AsyncStorage-based key-value store with TTL support
- Features:
  - `set<T>(key, value, ttl?)` - Save data with optional time-to-live
  - `get<T>(key)` - Retrieve cached data
  - `getMultiple(keys)` - Batch retrieval
  - `cleanupExpired()` - Auto-cleanup of expired entries
  - Statistics tracking (`getStats()`)

#### 2. **Sync Queue Manager** (`src/lib/syncQueue.ts`)
- Manages pending operations that need server sync
- Features:
  - `enqueue(operation, resource, data, options)` - Add item to sync queue
  - `getQueue()` - Get all queued items
  - `retry(id)` - Retry failed sync
  - `markFailed(id, error)` - Mark item as failed
  - Automatic retry logic with configurable max retries
  - Priority-based queue ordering
  - Event subscriptions for queue changes

#### 3. **Network Status Detection** (`src/hooks/useNetworkStatus.ts`)
- Real-time network connectivity monitoring
- Features:
  - Detects WiFi, cellular, VPN, Bluetooth connections
  - Distinguishes between connectivity and internet reachability
  - Detects metered connections
  - Event logging on connection changes

#### 4. **Offline Sync Hook** (`src/hooks/useOfflineSync.ts`)
- Orchestrates sync operations when online
- Features:
  - Auto-sync when connectivity returns
  - Periodic sync check (every 30 seconds)
  - Configurable sync handlers per resource
  - Retry logic with exponential backoff
  - Statistics tracking

#### 5. **Background Sync** (`src/lib/backgroundSync.ts`)
- Syncs data even when app is in background
- Features:
  - Uses `expo-background-fetch` and `expo-task-manager`
  - Configurable sync interval (minimum 15 seconds on iOS)
  - Continues on app termination
  - Starts on device boot
  - Automatic log flush on background sync completion

#### 6. **Offline Context Provider** (`src/context/OfflineContext.tsx`)
- Central provider for offline utilities
- Exports:
  - Network status (`isOnline`, `networkType`, `isMeteredConnection`)
  - Cache operations (`cacheSet`, `cacheGet`, `cacheClear`)
  - Sync queue (`getQueuedItems`, `enqueueSync`)
  - Statistics (`pendingSync`, `failedSync`, `totalCacheSize`)
  - Background sync setup

#### 7. **Cache Hooks** (`src/hooks/useCache.ts`)
- Utility hooks for common caching patterns
- Exports:
  - `useCachedData<T>` - Generic data caching
  - `useListCache<T>` - List caching (5-minute TTL)
  - `useItemCache<T>` - Item caching (10-minute TTL)
  - `useCacheInvalidation()` - Cache clearing

#### 8. **Logger Utility** (`src/utils/logger.ts`)
- Structured event logging for offline debugging
- Features:
  - `logEvent(eventName, metadata, module)` - Log structured events
  - `flushPendingLogsToS3({ reason })` - Upload logs to S3
  - Local file storage with rotation
  - Device ID tracking
  - Auto-initialization

---

## Integration Steps

### Step 1: Install Dependencies
```bash
cd /Users/vkbin/Techwheels-Service/mobile
npm install
```

The following new dependency has been added:
- `@react-native-community/netinfo@^11.3.2` - Network status detection

### Step 2: Wrap App with OfflineProvider

Update `mobile/src/app/_layout.tsx`:

```tsx
import { OfflineProvider } from '../context/OfflineContext'

export default function RootLayout() {
  return (
    <OfflineProvider syncHandlers={syncHandlers}>
      {/* Your app layout */}
    </OfflineProvider>
  )
}
```

### Step 3: Create Sync Handlers

Create `mobile/src/lib/syncHandlers.ts`:

```typescript
import { syncQueue, QueuedItem } from './syncQueue'
import * as api from './api'
import { logEvent } from '../utils/logger'

export const syncHandlers = {
  job_card: {
    handle: async (item: QueuedItem) => {
      if (item.operation === 'create') {
        await api.jobCards.create(item.data)
      } else if (item.operation === 'update') {
        await api.jobCards.update(item.resourceId!, item.data)
      }
    },
  },
  photo: {
    handle: async (item: QueuedItem) => {
      if (item.operation === 'upload') {
        await api.photos.upload(item.data)
      }
    },
  },
  estimate: {
    handle: async (item: QueuedItem) => {
      if (item.operation === 'create') {
        await api.estimate.create(item.data)
      }
    },
  },
  // Add more handlers for other resources
}
```

### Step 4: Use in Components

```tsx
import { useOffline } from '../context/OfflineContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

export const MyComponent = () => {
  const { isOnline, cacheSet, cacheGet, enqueueSync } = useOffline()
  const { isConnected, networkType } = useNetworkStatus()

  // Use caching
  const handleFetchData = async () => {
    const cached = await cacheGet('my_data')
    if (cached) return cached
    
    const data = await api.getData()
    await cacheSet('my_data', data, 5 * 60 * 1000) // 5 min TTL
    return data
  }

  // Queue sync operation
  const handleCreateJobCard = async (jobCardData) => {
    const syncId = await enqueueSync('create', 'job_card', jobCardData, {
      priority: 10, // Higher = more urgent
    })
    
    // If online, it will sync automatically
    // If offline, it will sync when connectivity returns
  }

  return (
    <View>
      <Text>Status: {isOnline ? 'Online' : 'Offline'}</Text>
      <Text>Type: {networkType}</Text>
    </View>
  )
}
```

---

## Usage Patterns

### Pattern 1: Read-Through Cache

```typescript
export const useJobCards = () => {
  const { fetch } = useCachedData(
    'job_cards',
    () => api.jobCards.list(),
    { ttl: 5 * 60 * 1000 }, // 5 min TTL
  )

  return { fetch }
}
```

### Pattern 2: Optimistic Updates

```typescript
export const useUpdateJobCard = () => {
  const { enqueueSync, cacheSet, cacheGet } = useOffline()
  const { isOnline } = useNetworkStatus()

  return {
    update: async (id: string, data: Partial<JobCard>) => {
      // Update cache immediately (optimistic)
      const cached = await cacheGet<JobCard>(`job_card_${id}`)
      if (cached) {
        await cacheSet(`job_card_${id}`, { ...cached, ...data })
      }

      // Queue sync
      await enqueueSync('update', 'job_card', data, {
        resourceId: id,
        priority: 5,
      })

      // If online, sync immediately
      if (!isOnline) {
        console.log('Offline: Changes will sync when online')
      }
    },
  }
}
```

### Pattern 3: Offline-First Job Card

```typescript
export const useOfflineJobCard = (id: string) => {
  const { cacheSet, cacheGet, isOnline } = useOffline()

  return {
    // Draft locally first
    saveDraft: async (draft: Partial<JobCard>) => {
      const key = `draft_job_card_${id}`
      await cacheSet(key, draft, undefined) // No TTL = persist
    },

    // Get draft
    getDraft: async () => {
      return cacheGet(`draft_job_card_${id}`)
    },

    // Submit when online
    submit: async (jobCardData: JobCard) => {
      if (isOnline) {
        await api.jobCards.create(jobCardData)
        await cacheSet(`job_card_${id}`, jobCardData)
      } else {
        // Will be sent via background sync
        await enqueueSync('create', 'job_card', jobCardData, {
          priority: 10,
        })
      }
    },
  }
}
```

---

## Testing Offline Flow

### Local Testing with Expo

1. **Start Expo**:
   ```bash
   cd mobile
   npm start
   ```

2. **Simulate Offline (in Expo Web)**:
   - Open DevTools (F12)
   - Go to Network tab
   - Set throttling to "Offline"
   - Make changes in the app
   - Switch back to online - changes should sync

3. **Simulate Offline (on Android/iOS)**:
   - Enable airplane mode
   - Make changes in the app
   - Disable airplane mode
   - Changes should sync automatically

### Testing Background Sync

```typescript
import { triggerBackgroundSync } from '../lib/backgroundSync'

// In a test component
<Button
  title="Test Background Sync"
  onPress={async () => {
    await triggerBackgroundSync()
  }}
/>
```

### Debugging

```typescript
import { useOffline } from '../context/OfflineContext'
import { getLogStats } from '../utils/logger'

export const DebugPanel = () => {
  const { pendingSync, failedSync, totalCacheSize, getQueuedItems } = useOffline()

  return (
    <ScrollView>
      <Text>Pending Sync: {pendingSync}</Text>
      <Text>Failed Sync: {failedSync}</Text>
      <Text>Cache Size: {(totalCacheSize / 1024).toFixed(2)} KB</Text>
      
      <Button
        title="View Sync Queue"
        onPress={async () => {
          const items = await getQueuedItems()
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
    </ScrollView>
  )
}
```

---

## What Gets Cached

### Automatically Cache These:
- Job card lists (5 min TTL)
- Individual job cards (10 min TTL)
- Vehicle data (15 min TTL)
- Employee master (30 min TTL)
- Reports data (depends on context)

### Don't Cache:
- Authentication tokens (use secure storage)
- User-specific preferences (use real-time)
- Real-time activities

---

## What Gets Queued for Sync

### Priority 10 (Critical):
- Job card creation
- Photo uploads
- Document uploads

### Priority 5 (Normal):
- Job card updates
- Estimate updates
- Status changes

### Priority 0 (Low):
- Analytics events
- UI preference updates

---

## Migration Checklist

- [ ] Install dependencies: `npm install`
- [ ] Create sync handlers in `src/lib/syncHandlers.ts`
- [ ] Wrap app with `OfflineProvider`
- [ ] Convert list fetches to use `useCachedData()`
- [ ] Convert create/update to use `enqueueSync()`
- [ ] Test offline flow locally
- [ ] Test background sync
- [ ] Verify cache stats in debug panel
- [ ] Review sync queue on real device
- [ ] Benchmark: App size, memory, battery impact

---

## Next Steps

1. **Test Phase 5** on Expo local (completed ✅)
2. **Implement sync handlers** for each resource
3. **Integrate cache into screens** (Import, Reports, AutoDoc)
4. **Test offline flow** on real devices
5. **Performance tuning** (cache sizes, TTLs)
6. **Phase 7**: APK build & deployment

---

## Performance Targets

- App size: < 150 MB compressed
- Memory overhead: < 20 MB
- Battery impact: < 2% per hour background sync
- First load time: < 2 seconds
- Sync latency: < 500 ms per item

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Cache not persisting | Check AsyncStorage permissions |
| Sync never triggers | Verify network status hook |
| Large app bundle | Remove unused dependencies |
| Battery drain | Reduce sync frequency to 5-10 min |
| Logs not uploading | Check Supabase storage permissions |
