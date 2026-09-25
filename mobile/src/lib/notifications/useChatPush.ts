import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  readStaffPushEnabled,
  registerCustomerPush,
  registerStaffPush,
} from './pushRegistration'

function openFromNotificationData(data: Record<string, unknown> | undefined) {
  if (!data?.chat_id) return
  const audience = String(data.audience || '')
  const reg = typeof data.reg_number === 'string' ? data.reg_number : ''
  if (audience === 'customer') {
    if (reg) {
      router.push({ pathname: '/(customer)/chat', params: { reg } })
      return
    }
    router.push('/(customer)/chat')
    return
  }
  router.push('/(tabs)/home')
}

export function useChatPush() {
  const { user } = useAuth()
  const { token, setSelectedReg } = useCustomerSession()
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined
      if (typeof data?.reg_number === 'string' && data.reg_number && String(data.audience) === 'customer') {
        setSelectedReg(data.reg_number)
      }
      openFromNotificationData(data)
    })
    return () => sub.remove()
  }, [setSelectedReg])

  useEffect(() => {
    let cancelled = false
    if (user?.id) {
      void (async () => {
        const enabled = await readStaffPushEnabled()
        if (cancelled || !enabled) return
        await registerStaffPush()
      })()
    } else if (token) {
      const active = token
      void (async () => {
        if (cancelled) return
        await registerCustomerPush(active)
      })()
    }
    return () => {
      cancelled = true
    }
  }, [user?.id, token])
}
