/**
 * ActionRow Component
 * 
 * Single action item with icon circle, title, status, and chevron indicator.
 * Reference: design-refactor-bundle submit.tsx pre-submit/final submit action rows
 */

import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Icon, type IconName } from './Icon'

export interface ActionRowProps {
  icon?: IconName
  title: string
  subtitle?: string
  statusText?: string
  enabled: boolean
  loading?: boolean
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'success' | 'danger'
  showChevron?: boolean
}

function getVariantColors(variant: string, enabled: boolean): {
  bg: string
  borderColor: string
  iconBg: string
  iconColor: string
  titleColor: string
  subtitleColor: string
} {
  if (!enabled) {
    return {
      bg: '#eeece5',
      borderColor: '#ddd9cd',
      iconBg: '#d9d4c7',
      iconColor: '#82858f',
      titleColor: '#82858f',
      subtitleColor: '#82858f',
    }
  }

  const variants: Record<string, any> = {
    primary: {
      bg: '#e9effe',
      borderColor: '#b3c9f0',
      iconBg: '#e9effe',
      iconColor: '#2a4cd0',
      titleColor: '#1a1b21',
      subtitleColor: '#4b4e59',
    },
    secondary: {
      bg: '#fbfaf6',
      borderColor: '#e7e3d9',
      iconBg: '#f6f4ee',
      iconColor: '#4b4e59',
      titleColor: '#1a1b21',
      subtitleColor: '#82858f',
    },
    success: {
      bg: '#e4f4ec',
      borderColor: '#bfe6d2',
      iconBg: '#e4f4ec',
      iconColor: '#1c8f63',
      titleColor: '#1a1b21',
      subtitleColor: '#1c8f63',
    },
    danger: {
      bg: '#1e293b',
      borderColor: '#3f4553',
      iconBg: '#334155',
      iconColor: '#ffffff',
      titleColor: '#ffffff',
      subtitleColor: '#cbd5e1',
    },
  }

  return variants[variant] || variants.primary
}

export const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  title,
  subtitle,
  statusText,
  enabled,
  loading = false,
  onPress,
  variant = 'primary',
  showChevron = true,
}) => {
  const colors = getVariantColors(variant, enabled)
  const opacity = enabled ? 1 : 0.5

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!enabled || loading}
      activeOpacity={0.8}
      style={{ marginBottom: 12, opacity }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bg,
          borderColor: colors.borderColor,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        {/* Icon circle */}
        {icon && (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: colors.iconBg,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12,
            }}
          >
            {loading ? (
              <Text style={{ fontSize: 12, color: colors.iconColor }}>⋯</Text>
            ) : icon ? (
              <Icon
                name={icon}
                size={20}
                color={colors.iconColor}
                strokeWidth={2}
              />
            ) : null}
          </View>
        )}

        {/* Title and subtitle */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.titleColor,
            }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                fontSize: 11,
                fontWeight: '500',
                color: colors.subtitleColor,
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {/* Status text and chevron */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {statusText && (
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: colors.subtitleColor,
              }}
            >
              {statusText}
            </Text>
          )}
          {showChevron && enabled && (
            <Icon
              name="arrow-right"
              size={18}
              color={colors.iconColor}
              strokeWidth={2.5}
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default ActionRow
