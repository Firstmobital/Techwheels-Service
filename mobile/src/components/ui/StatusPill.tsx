/**
 * Status Pill Component
 * 
 * Renders a status indicator badge with color coding for job card statuses.
 * Reference: design-refactor-bundle bp-core.jsx -> StatusPill usage
 */

import React from 'react'
import { View, Text } from 'react-native'

export type JobCardStatus = 'draft' | 'submitted' | 'approved' | 'in_work' | 'completed'

interface StatusPillProps {
  status: JobCardStatus | null | undefined
  size?: 'sm' | 'md'
}

function getStatusConfig(status: JobCardStatus | null | undefined): {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
} {
  switch (status) {
    case 'draft':
      return {
        label: 'Draft',
        bgColor: '#f6f4ee',
        textColor: '#1a1b21',
        borderColor: '#d9d4c7',
      }
    case 'submitted':
      return {
        label: 'Submitted',
        bgColor: '#e9f0fd',
        textColor: '#2f63cf',
        borderColor: '#cadcf8',
      }
    case 'approved':
      return {
        label: 'Approved',
        bgColor: '#e4f4ec',
        textColor: '#1c8f63',
        borderColor: '#bfe6d2',
      }
    case 'in_work':
      return {
        label: 'In Work',
        bgColor: '#fdf2e4',
        textColor: '#c9751b',
        borderColor: '#f1dcb8',
      }
    case 'completed':
      return {
        label: 'Completed',
        bgColor: '#efeafb',
        textColor: '#7048cf',
        borderColor: '#ddd0f5',
      }
    default:
      return {
        label: 'Unknown',
        bgColor: '#eeece5',
        textColor: '#6b6e78',
        borderColor: '#ddd9cd',
      }
  }
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, size = 'md' }) => {
  const config = getStatusConfig(status)
  const isSm = size === 'sm'

  return (
    <View
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        borderWidth: 1,
        borderRadius: isSm ? 6 : 999,
        paddingHorizontal: isSm ? 8 : 12,
        paddingVertical: isSm ? 4 : 6,
      }}
    >
      <Text
        style={{
          fontSize: isSm ? 11 : 12,
          fontWeight: isSm ? '600' : '600',
          color: config.textColor,
        }}
      >
        {config.label}
      </Text>
    </View>
  )
}

export default StatusPill
