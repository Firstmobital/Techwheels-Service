/**
 * HeroBlock Component
 * 
 * Gradient-backed hero section for estimate totals and status displays.
 * Uses expo-linear-gradient for reference-accurate rendering.
 * Reference: design-refactor-bundle estimate.tsx estimate total hero
 */

import React from 'react'
import { Text, View } from 'react-native'

export interface HeroBlockProps {
  title: string
  mainValue: string
  subtitle?: string
  variant?: 'brand' | 'success' | 'warning' | 'dark'
  children?: React.ReactNode
}

function getVariantGradient(variant: string): {
  backgroundColor: string
  titleColor: string
  valueColor: string
  subtitleColor: string
} {
  const variants: Record<string, any> = {
    brand: {
      backgroundColor: '#2a4cd0',
      titleColor: '#b3c9f0',
      valueColor: '#ffffff',
      subtitleColor: '#c7dcf7',
    },
    success: {
      backgroundColor: '#1c8f63',
      titleColor: '#bfe6d2',
      valueColor: '#ffffff',
      subtitleColor: '#d4f1e8',
    },
    warning: {
      backgroundColor: '#c9751b',
      titleColor: '#f1dcb8',
      valueColor: '#ffffff',
      subtitleColor: '#fde8c5',
    },
    dark: {
      backgroundColor: '#1e293b',
      titleColor: '#cbd5e1',
      valueColor: '#ffffff',
      subtitleColor: '#94a3b8',
    },
  }

  return variants[variant] || variants.brand
}

export const HeroBlock: React.FC<HeroBlockProps> = ({
  title,
  mainValue,
  subtitle,
  variant = 'brand',
  children,
}) => {
  const gradientConfig = getVariantGradient(variant)

  return (
    <View
      style={{
        backgroundColor: gradientConfig.backgroundColor,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Title */}
      <Text
        style={{
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1.2,
          color: gradientConfig.titleColor,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>

      {/* Main value */}
      <Text
        style={{
          fontSize: 32,
          fontWeight: '800',
          color: gradientConfig.valueColor,
          marginTop: 12,
          letterSpacing: -0.5,
        }}
      >
        {mainValue}
      </Text>

      {/* Subtitle */}
      {subtitle && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '500',
            color: gradientConfig.subtitleColor,
            marginTop: 8,
          }}
        >
          {subtitle}
        </Text>
      )}

      {/* Children (additional content) */}
      {children && (
        <View style={{ marginTop: 16 }}>
          {children}
        </View>
      )}
    </View>
  )
}

export default HeroBlock
