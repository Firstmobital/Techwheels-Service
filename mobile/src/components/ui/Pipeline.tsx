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
  const DONE_COLOR = '#1f9a6b'
  const CURRENT_COLOR = '#2f63cf'
  const UPCOMING_COLOR = '#ffffff'
  const UPCOMING_BORDER = '#d9d4c7'

  const currentIndex = Math.max(0, Math.min(config.currentIndex, config.steps.length - 1))

  if (compact) {
    return (
      <View
        style={{
          backgroundColor: config.bgColor,
          borderColor: '#9ea4b0',
          borderWidth: 1,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          alignSelf: 'flex-start',
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: '#4b4e59',
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
        width: '100%',
        paddingVertical: 2,
        paddingVertical: 4,
      }}
      {config.steps.map((step, index) => (
      {config.steps.map((step, index) => (
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
          )}
        </React.Fragment>
      ))}
    </View>
  )
}

export default Pipeline
