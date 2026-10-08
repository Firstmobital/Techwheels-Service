import { ReactNode } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon } from '../ui/Icon'
import { StaffDrawerMenu } from './StaffDrawerMenu'
import { useStaffNavigationMenu } from '../../hooks/useStaffNavigationMenu'

export type StaffShellHeaderProps = {
  title: string
  subtitle?: ReactNode
  rightAction?: ReactNode
  leadingExtra?: ReactNode
  onOpenMenu: () => void
}

export function StaffShellHeader({
  title,
  subtitle,
  rightAction,
  leadingExtra,
  onOpenMenu,
  compact,
}: StaffShellHeaderProps & { compact?: boolean }) {
  return (
    <View
      className={`bg-white border-b border-slate-200 px-4 flex-row items-center gap-2 ${compact ? 'py-2' : 'py-3'}`}
    >
      <TouchableOpacity
        onPress={onOpenMenu}
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
        className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 items-center justify-center"
      >
        <Icon name="menu" size={20} color="#0f172a" strokeWidth={2.4} />
      </TouchableOpacity>
      {leadingExtra ? <View>{leadingExtra}</View> : null}
      <View className="flex-1 min-w-0">
        <Text
          className={`text-slate-900 font-bold ${compact ? 'text-lg' : 'text-xl'}`}
          numberOfLines={1}
        >
          {title}
        </Text>
        {!compact && subtitle ? (
          typeof subtitle === 'string' ? (
            <Text className="text-slate-500 text-sm mt-0.5" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  )
}

export function StaffNavigationChrome({
  title,
  subtitle,
  rightAction,
  leadingExtra,
  compact,
}: Omit<StaffShellHeaderProps, 'onOpenMenu'> & { compact?: boolean }) {
  const { showMenu, openMenu, closeMenu, allowedModules, displayName } = useStaffNavigationMenu()

  return (
    <>
      <StaffDrawerMenu
        visible={showMenu}
        onClose={closeMenu}
        allowedModules={allowedModules}
        userDisplayName={displayName}
      />
      <StaffShellHeader
        title={title}
        subtitle={subtitle}
        rightAction={rightAction}
        leadingExtra={leadingExtra}
        onOpenMenu={openMenu}
        compact={compact}
      />
    </>
  )
}

/** Compact ☰ + drawer for detail screens that already have their own back row. */
export function StaffInlineMenuButton() {
  const { showMenu, openMenu, closeMenu, allowedModules, displayName } = useStaffNavigationMenu()

  return (
    <>
      <StaffDrawerMenu
        visible={showMenu}
        onClose={closeMenu}
        allowedModules={allowedModules}
        userDisplayName={displayName}
      />
      <TouchableOpacity
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: '#f1f5f9',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="menu" size={18} color="#0f172a" strokeWidth={2.4} />
      </TouchableOpacity>
    </>
  )
}

type Props = {
  title: string
  subtitle?: ReactNode
  rightAction?: ReactNode
  leadingExtra?: ReactNode
  compactHeader?: boolean
  children: ReactNode
}

export function StaffScreenShell({
  title,
  subtitle,
  rightAction,
  leadingExtra,
  compactHeader,
  children,
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <StaffNavigationChrome
        title={title}
        subtitle={subtitle}
        rightAction={rightAction}
        leadingExtra={leadingExtra}
        compact={compactHeader}
      />
      {children}
    </SafeAreaView>
  )
}
