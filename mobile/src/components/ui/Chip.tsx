/**
 * Chip Component
 * 
 * Reusable selected/unselected panel or option chip with parity-locked styling.
 * Reference: design-refactor-bundle Damage panel selection, Model selector
 */

import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Icon } from './Icon'

export interface ChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  disabled?: boolean
  showCheck?: boolean
  variant?: 'default' | 'large'
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onPress,
  disabled = false,
  showCheck = true,
  variant = 'default',
}) => {
  const isLarge = variant === 'large'

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        marginRight: 8,
        marginBottom: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          borderRadius: isLarge ? 10 : 8,
          borderWidth: 1,
          paddingHorizontal: isLarge ? 12 : 10,
          paddingVertical: isLarge ? 10 : 6,
          backgroundColor: selected ? '#2a4cd0' : '#ffffff',
          borderColor: selected ? '#2a4cd0' : '#d9d4c7',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: isLarge ? 14 : 12,
            fontWeight: '600',
            color: selected ? '#ffffff' : '#4b4e59',
          }}
        >
          {label}
        </Text>
        {selected && showCheck && (
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: 10,
              paddingHorizontal: 4,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>✓</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default Chip
