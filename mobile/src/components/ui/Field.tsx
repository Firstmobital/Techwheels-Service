import React from 'react'
import { Text, View, type ReactNode } from 'react-native'

export interface FieldProps {
  label: string
  required?: boolean
  disabled?: boolean
  children: ReactNode
}

export const Field: React.FC<FieldProps> = ({ label, required = false, disabled = false, children }) => {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: '#4b4e59',
          marginBottom: 6,
        }}
      >
        {label}
        {required ? <Text style={{ color: '#c33b53' }}> *</Text> : null}
      </Text>
      <View
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: disabled ? '#e7e3d9' : '#d9d4c7',
          backgroundColor: disabled ? '#f6f4ee' : '#ffffff',
          paddingHorizontal: 14,
          paddingVertical: 12,
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  )
}

export default Field