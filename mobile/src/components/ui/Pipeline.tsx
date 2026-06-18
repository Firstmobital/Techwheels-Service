/**
 * Pipeline Component
 * 
 * Renders a visual pipeline showing the workflow stage of a job card.
 * Reference: design-refactor-bundle bp-core.jsx -> Pipeline usage
 */

import React from 'react'
import { View, Text } from 'react-native'

export type WorkflowStage =
  | 'active_intake'
  | 'documentation_pre_repair'
  | 'estimate'
  | 'pre_submit_pending'
  | 'pre_submit_done'
  | 'post_repair_ppt'
  | 'claim_submitted'

interface PipelineProps {
  stage: WorkflowStage | null | undefined
  compact?: boolean
}

function getStageConfig(stage: WorkflowStage | null | undefined): {
  label: string
  currentIndex: number
  bgColor: string
  steps: Array<{ name: string }>
} {
  const baseSteps = [
    { name: 'intake' },
    { name: 'documentation' },
    { name: 'estimate' },
    { name: 'submit' },
    { name: 'post-repair' },
  ]

  const stepMap: Record<WorkflowStage, { label: string; currentIndex: number; bgColor: string; steps: Array<{ name: string }> }> = {
    active_intake: {
      label: 'Intake',
      currentIndex: 0,
      bgColor: '#eeece5',
      steps: baseSteps,
    },
    documentation_pre_repair: {
      label: 'Documentation',
      currentIndex: 1,
      bgColor: '#fbefdd',
      steps: baseSteps,
    },
    estimate: {
      label: 'Estimate',
      currentIndex: 2,
      bgColor: '#efeafb',
      steps: baseSteps,
    },
    pre_submit_pending: {
      label: 'Pre-Submit',
      currentIndex: 3,
      bgColor: '#fbefdd',
      steps: baseSteps,
    },
    pre_submit_done: {
      label: 'Submitted',
      currentIndex: 3,
      bgColor: '#e4f4ec',
      steps: baseSteps,
    },
    post_repair_ppt: {
      label: 'Post-Repair',
      currentIndex: 4,
      bgColor: '#e9f0fd',
      steps: baseSteps,
    },
    claim_submitted: {
      label: 'Completed',
      currentIndex: 4,
      bgColor: '#e9effe',
      steps: baseSteps,
    },
  }

  return stepMap[stage ?? 'active_intake']
}

export const Pipeline: React.FC<PipelineProps> = ({ stage, compact = false }) => {
  const config = getStageConfig(stage)
  const DONE_COLOR = '#1c8f63'
  const CURRENT_COLOR = '#2f63cf'
  const UPCOMING_COLOR = '#ffffff'
  const UPCOMING_BORDER = '#d9d4c7'

  const currentIndex = Math.max(0, Math.min(config.currentIndex, config.steps.length - 1))

  if (compact) {
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
          {config.steps.map((step, index) => {
            const filled = index <= currentIndex
            return (
              <View
                key={step.name}
                style={{
                  flex: 1,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: filled ? '#2f63cf' : '#d9d4c7',
                }}
              />
            )
          })}
        </View>
        <Text
          style={{
            marginTop: 8,
            fontSize: 11.5,
            fontWeight: '700',
            color: '#7d8090',
          }}
        >
          {config.label}
        </Text>
      </View>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        paddingVertical: 4,
      }}
    >
      {config.steps.map((step, index) => (
        <React.Fragment key={step.name}>
          {index < currentIndex ? (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: DONE_COLOR,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: '#ffffff',
                }}
              >
                ✓
              </Text>
            </View>
          ) : index === currentIndex ? (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: CURRENT_COLOR,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: '#ffffff',
                }}
              />
            </View>
          ) : (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: UPCOMING_COLOR,
                borderWidth: 2,
                borderColor: UPCOMING_BORDER,
              }}
            />
          )}

          {index < config.steps.length - 1 && (
            <View
              style={{
                flex: 1,
                height: 3,
                backgroundColor: index < currentIndex ? DONE_COLOR : UPCOMING_BORDER,
                marginHorizontal: 4,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  )
}

export default Pipeline
