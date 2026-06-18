import React from 'react'
import { Text, View } from 'react-native'

export interface WorkflowProgressProps {
  currentStep: number
  totalSteps?: number
  stageName?: string
}

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  currentStep,
  totalSteps = 5,
  stageName,
}) => {
  const filled = Math.max(0, Math.min(currentStep, totalSteps))

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', marginBottom: 7 }}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const isFilled = index < filled
          return (
            <View
              key={index}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 999,
                backgroundColor: isFilled ? '#2a4cd0' : '#e2ddcf',
                marginRight: index === totalSteps - 1 ? 0 : 4,
              }}
            />
          )
        })}
      </View>
      <Text style={{ fontSize: 11, fontWeight: '600', color: '#82858f' }}>
        {`Step ${filled} of ${totalSteps}${stageName ? ` · ${stageName}` : ''}`}
      </Text>
    </View>
  )
}

export default WorkflowProgress