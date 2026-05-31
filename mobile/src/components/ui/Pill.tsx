/**
 * Pill Component
 * 
 * Status or semantic indicator with color coding for readiness states.
 * Reference: design-refactor-bundle estimate panel readiness, submission status
 */

import React from 'react'
import { Text, View } from 'react-native'

export type PillVariant = 'pre' | 'under' | 'post' | 'success' | 'warning' | 'error' | 'neutral'

export interface PillProps {
  label: string
  variant?: PillVariant
  size?: 'sm' | 'md'
}

function getVariantColors(variant: PillVariant): {
  bg: string
  text: string
  border: string
} {
  const variants: Record<PillVariant, { bg: string; text: string; border: string }> = {
    pre: {
      bg: '#fbefdd',
      text: '#c9751b',
      border: '#f1dcb8',
    },
    under: {
      bg: '#e9f0fd',
      text: '#2f63cf',
      border: '#cadcf8',
    },
    post: {
      bg: '#e4f4ec',
      text: '#1c8f63',
      border: '#bfe6d2',
    },
    success: {
      bg: '#e4f4ec',
      text: '#1c8f63',
      border: '#bfe6d2',
    },
    warning: {
      bg: '#fdf2e4',
      text: '#c9751b',
      border: '#f1dcb8',
    },
    error: {
      bg: '#fbe9ec',
      text: '#c33b53',
      border: '#f3cdd4',
    },
    neutral: {
      bg: '#f6f4ee',
      text: '#4b4e59',
      border: '#e7e3d9',
    },
  }

  return variants[variant] || variants.neutral
}

export const Pill: React.FC<PillProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
}) => {
  const colors = getVariantColors(variant)
  const isSm = size === 'sm'

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: isSm ? 8 : 10,
        paddingVertical: isSm ? 3 : 5,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontSize: isSm ? 10 : 11,
          fontWeight: '600',
          color: colors.text,
          letterSpacing: 0.3,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

export default Pill
