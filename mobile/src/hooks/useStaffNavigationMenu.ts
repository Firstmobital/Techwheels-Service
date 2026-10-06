import { useEffect, useMemo, useState } from 'react'
import { BackHandler } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useStaffAllowedModules } from './useStaffAllowedModules'

export function useStaffDisplayName() {
  const { user } = useAuth()
  return useMemo(() => {
    const fromMetadata = String(user?.user_metadata?.full_name ?? '').trim()
    if (fromMetadata) return fromMetadata

    const email = String(user?.email ?? '').trim()
    if (!email) return 'Team'

    const username = email.split('@')[0] || 'Team'
    return username.replace(/[._-]+/g, ' ')
  }, [user?.email, user?.user_metadata])
}

export function useStaffNavigationMenu() {
  const { user } = useAuth()
  const allowedModules = useStaffAllowedModules(user)
  const displayName = useStaffDisplayName()
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    const onBackPress = () => {
      if (showMenu) {
        setShowMenu(false)
        return true
      }
      return false
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => sub.remove()
  }, [showMenu])

  return {
    showMenu,
    openMenu: () => setShowMenu(true),
    closeMenu: () => setShowMenu(false),
    allowedModules,
    displayName,
  }
}
