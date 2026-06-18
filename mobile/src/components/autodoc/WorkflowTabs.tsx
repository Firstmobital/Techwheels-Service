import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

export type WorkflowTabKey = 'jobcard' | 'damage' | 'estimate' | 'submit'

export interface WorkflowTabsProps {
  activeTab: WorkflowTabKey
  onTabPress: (tab: WorkflowTabKey) => void
  disabled?: boolean
}

const TABS: Array<{ key: WorkflowTabKey; label: string }> = [
  { key: 'jobcard', label: 'Job Card' },
  { key: 'damage', label: 'Damage' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'submit', label: 'Submit' },
]

export const WorkflowTabs: React.FC<WorkflowTabsProps> = ({ activeTab, onTabPress, disabled = false }) => {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
      {TABS.map((tab, index) => {
        const isActive = tab.key === activeTab
        const isLast = index === TABS.length - 1

        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            disabled={disabled}
            activeOpacity={0.8}
            style={{
              flex: 1,
              marginRight: isLast ? 0 : 6,
              minHeight: 42,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: isActive ? '#2a4cd0' : '#e7e3d9',
              backgroundColor: isActive ? '#2a4cd0' : '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: isActive ? '#ffffff' : '#82858f',
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default WorkflowTabs