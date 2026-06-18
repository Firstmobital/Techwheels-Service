import React from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { Icon, type IconName } from './Icon'

export interface PrimaryButtonProps {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  iconName?: IconName
  fullWidth?: boolean
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  iconName,
  fullWidth = true,
}) => {
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.9}
      style={{
        backgroundColor: isDisabled ? '#c7cdf0' : '#2a4cd0',
        borderRadius: 12,
        minHeight: 48,
        paddingHorizontal: 16,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        width: fullWidth ? '100%' : undefined,
        shadowColor: '#2a4cd0',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDisabled ? 0 : 0.3,
        shadowRadius: 20,
        elevation: isDisabled ? 0 : 3,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {iconName ? <Icon name={iconName} size={18} color="#ffffff" /> : null}
          <Text
            style={{
              color: '#ffffff',
              fontSize: 15,
              fontWeight: '700',
              marginLeft: iconName ? 8 : 0,
            }}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default PrimaryButton