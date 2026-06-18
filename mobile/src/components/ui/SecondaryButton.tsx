import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Icon, type IconName } from './Icon'

export interface SecondaryButtonProps {
  title: string
  onPress: () => void
  disabled?: boolean
  iconName?: IconName
  tone?: 'default' | 'danger'
  fullWidth?: boolean
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  title,
  onPress,
  disabled = false,
  iconName,
  tone = 'default',
  fullWidth = true,
}) => {
  const colors =
    tone === 'danger'
      ? {
          background: '#fbe9ec',
          border: '#f3cdd4',
          text: '#c33b53',
        }
      : {
          background: '#ffffff',
          border: '#d9d4c7',
          text: '#4b4e59',
        }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        width: fullWidth ? '100%' : undefined,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {iconName ? <Icon name={iconName} size={18} color={colors.text} /> : null}
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: '700',
            marginLeft: iconName ? 8 : 0,
          }}
        >
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export default SecondaryButton