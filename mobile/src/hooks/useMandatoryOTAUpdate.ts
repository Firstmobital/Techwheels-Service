import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as Updates from 'expo-updates'
import { flushPendingLogsToS3, logEvent } from '../utils/logger'

const FOREGROUND_CHECK_COOLDOWN_MS = 60 * 1000
const ACTIVE_SESSION_CHECK_INTERVAL_MS = 30 * 1000

const resolveChannel = () => {
  const channel = (Updates.channel ?? '').trim().toLowerCase()
  return channel
}

const getGateDecision = () => {
  if (__DEV__) {
    return { enabled: false, reason: 'dev-build' }
  }
  if (!Updates.isEnabled) {
    return { enabled: false, reason: 'updates-disabled' }
  }

  // Some production builds can have empty channel; only preview is blocked.
  const channel = resolveChannel()
  if (channel === 'preview') {
    return { enabled: false, reason: 'preview-channel' }
  }

  return { enabled: true, reason: 'allowed' }
}

export function useMandatoryOTAUpdate() {
  const [modalVisible, setModalVisible] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [applyingUpdate, setApplyingUpdate] = useState(false)
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(null)

  const gateDecision = getGateDecision()
  const gateEnabled = gateDecision.enabled

  const lastCheckAtRef = useRef(0)
  const appStateRef = useRef(AppState.currentState)
  const checkingUpdateRef = useRef(false)
  const applyingUpdateRef = useRef(false)
  const updateAvailableRef = useRef(false)

  const logOTAEvent = useCallback((eventName: string, metadata: Record<string, unknown> = {}) => {
    logEvent(eventName, metadata, 'ota-gate')
  }, [])

  const checkForMandatoryUpdate = useCallback(
    async (reason: 'launch' | 'foreground' | 'manual', force = false) => {
      if (!gateEnabled) return
      if (checkingUpdateRef.current || applyingUpdateRef.current) return

      const now = Date.now()
      if (!force && now - lastCheckAtRef.current < FOREGROUND_CHECK_COOLDOWN_MS) {
        return
      }

      lastCheckAtRef.current = now
      checkingUpdateRef.current = true
      setCheckingUpdate(true)
      setUpdateErrorMessage(null)

      logOTAEvent('ota_check_start', {
        reason,
        channel: Updates.channel ?? '',
        runtime_version: Updates.runtimeVersion ?? '',
      })

      try {
        const result = await Updates.checkForUpdateAsync()

        if (result.isAvailable) {
          updateAvailableRef.current = true
          setModalVisible(true)
          logOTAEvent('ota_update_available', {
            reason,
            update_id: Updates.updateId ?? '',
            channel: Updates.channel ?? '',
            runtime_version: Updates.runtimeVersion ?? '',
          })
          return
        }

        updateAvailableRef.current = false
        setModalVisible(false)
        logOTAEvent('ota_no_update', {
          reason,
          channel: Updates.channel ?? '',
          runtime_version: Updates.runtimeVersion ?? '',
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logOTAEvent('ota_check_error', {
          reason,
          error_message: msg,
        })

        if (updateAvailableRef.current) {
          setModalVisible(true)
          setUpdateErrorMessage('Could not verify update status. Please retry.')
        }
      } finally {
        checkingUpdateRef.current = false
        setCheckingUpdate(false)
      }
    },
    [gateEnabled, logOTAEvent],
  )

  const applyMandatoryUpdate = useCallback(async () => {
    if (!gateEnabled) return
    if (applyingUpdateRef.current) return

    applyingUpdateRef.current = true
    setApplyingUpdate(true)
    setUpdateErrorMessage(null)

    logOTAEvent('ota_fetch_start', {
      channel: Updates.channel ?? '',
      runtime_version: Updates.runtimeVersion ?? '',
    })

    try {
      const fetchResult = await Updates.fetchUpdateAsync()

      if (!fetchResult.isNew) {
        logOTAEvent('ota_fetch_not_new', {})
        await checkForMandatoryUpdate('manual', true)
      }

      logOTAEvent('ota_reload_start', {})
      await flushPendingLogsToS3({ reason: 'ota-reload' })
      await Updates.reloadAsync()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logOTAEvent('ota_apply_error', {
        error_message: msg,
      })
      await flushPendingLogsToS3({ reason: 'ota-apply-error' })
      setUpdateErrorMessage('Update download failed. Check internet and retry.')
      setModalVisible(true)
    } finally {
      applyingUpdateRef.current = false
      setApplyingUpdate(false)
    }
  }, [gateEnabled, checkForMandatoryUpdate, logOTAEvent])

  useEffect(() => {
    logOTAEvent('ota_gate_evaluated', {
      enabled: gateEnabled,
      reason: gateDecision.reason,
      channel: Updates.channel ?? '',
      runtime_version: Updates.runtimeVersion ?? '',
      update_id: Updates.updateId ?? '',
      is_enabled: Updates.isEnabled,
    })

    if (!gateEnabled) {
      setModalVisible(false)
      setUpdateErrorMessage(null)
      return
    }

    checkForMandatoryUpdate('launch', true)
  }, [gateEnabled, gateDecision.reason, checkForMandatoryUpdate, logOTAEvent])

  useEffect(() => {
    if (!gateEnabled) return

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current
      appStateRef.current = nextAppState

      const becameActive = previousState.match(/inactive|background/) && nextAppState === 'active'
      if (!becameActive) return

      // Force foreground checks so users see the OTA gate immediately after returning.
      checkForMandatoryUpdate('foreground', true)
    })

    return () => {
      subscription.remove()
    }
  }, [gateEnabled, checkForMandatoryUpdate])

  useEffect(() => {
    if (!gateEnabled) return

    const interval = setInterval(() => {
      if (appStateRef.current !== 'active') return
      checkForMandatoryUpdate('manual')
    }, ACTIVE_SESSION_CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [gateEnabled, checkForMandatoryUpdate])

  return {
    modalVisible,
    checkingUpdate,
    applyingUpdate,
    updateErrorMessage,
    applyMandatoryUpdate,
  }
}
