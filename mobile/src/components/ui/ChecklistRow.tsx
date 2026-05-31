/**
 * ChecklistRow Component
 * 
 * Submission checklist item with status icon circle and semantic coloring.
 * Reference: design-refactor-bundle submit.tsx checklist rendering
 */

import React from 'react'
import { Text, View } from 'react-native'

export interface ChecklistRowProps {
  label: string
  statusText?: string
  completed: boolean
  size?: 'sm' | 'md'
}

export const ChecklistRow: React.FC<ChecklistRowProps> = ({
  label,
  statusText,
  completed,
  size = 'md',
}) => {
  const iconSize = size === 'sm' ? 18 : 22
  const bgColor = completed ? '#e4f4ec' : '#fdf2e4'
  const iconColor = completed ? '#1c8f63' : '#c9751b'
  const icon = completed ? '✓' : '✕'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#f6f4ee',
        borderRadius: 10,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        {/* Icon circle */}
        <View
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: iconSize / 2,
            backgroundColor: bgColor,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
          }}
        >
          <Text
            style={{
              fontSize: size === 'sm' ? 11 : 13,
              fontWeight: '700',
              color: iconColor,
            }}
          >
            {icon}
          </Text>
        </View>

        {/* Label */}
        <Text
          style={{
            fontSize: size === 'sm' ? 11 : 12,
            fontWeight: '600',
            color: '#1a1b21',
          }}
        >
          {label}
        </Text>
      </View>

      {/* Status text */}
      {statusText && (
        <Text
          style={{
            fontSize: size === 'sm' ? 10 : 11,
            fontWeight: '600',
            color: completed ? '#1c8f63' : '#c9751b',
            marginLeft: 8,
          }}
        >
          {statusText}
        </Text>
      )}
    </View>
  )
}

export default ChecklistRow
