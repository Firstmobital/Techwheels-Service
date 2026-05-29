/**
 * useNetworkStatus Hook
 * Detects network connectivity status on both iOS and Android
 * Provides real-time updates on connection changes
 */

import { useEffect, useState, useCallback } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { logEvent } from '../utils/logger'

export interface NetworkState {
  isConnected: boolean | null
  isInternetReachable: boolean | null
  type: 'wifi' | 'cellular' | 'ethernet' | 'vpn' | 'bluetooth' | 'other' | 'unknown' | 'none'
  ismetered: boolean | null
}

let netInfoSubscription: (() => void) | null = null

export const useNetworkStatus = () => {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: null,
    isInternetReachable: null,
    type: 'unknown',
    ismetered: null,
  })

  const handleStateChange = useCallback((state: any) => {
    const newState: NetworkState = {
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type || 'unknown',
      ismetered: state.details?.isConnectionExpensive || false,
    }

    setNetworkState((prev) => {
      // Log transition only when connectivity flips.
      if (newState.isConnected && !prev.isConnected) {
        logEvent('network_connected', {
          type: newState.type,
          metered: newState.ismetered,
        }, 'network-status')
      } else if (!newState.isConnected && prev.isConnected) {
        logEvent('network_disconnected', {
          type: prev.type,
        }, 'network-status')
      }

      return newState
    })
  }, [])

  useEffect(() => {
    // Initial state check
    NetInfo.fetch()
      .then(handleStateChange)
      .catch((error) => {
        logEvent('network_fetch_error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'network-status')
      })

    // Subscribe to changes
    if (!netInfoSubscription) {
      netInfoSubscription = NetInfo.addEventListener(handleStateChange)
    }

    return () => {
      // Don't unsubscribe here - keep listening in background
      // Cleanup will happen when the app closes
    }
  }, [handleStateChange])

  return networkState
}

// Export utility function for checking connectivity
export const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch()
    return state.isConnected === true && state.isInternetReachable === true
  } catch (error) {
    logEvent('network_check_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'network-status')
    return false
  }
}

// Cleanup function for proper app teardown
export const cleanupNetworkListeners = () => {
  if (netInfoSubscription) {
    netInfoSubscription()
    netInfoSubscription = null
  }
}
