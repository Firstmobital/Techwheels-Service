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
  color: string
  bgColor: string
  steps: Array<{ name: string; done: boolean }>
} {
  const stepMap: Record<WorkflowStage, { label: string; color: string; bgColor: string; steps: Array<{ name: string; done: boolean }> }> = {
    active_intake: {
      label: 'Intake',
      color: '#6b6e78',
      bgColor: '#eeece5',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: false },
        { name: 'estimate', done: false },
        { name: 'submit', done: false },
        { name: 'post-repair', done: false },
      ],
    },
    documentation_pre_repair: {
      label: 'Documentation',
      color: '#c9751b',
      bgColor: '#fbefdd',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: true },
        { name: 'estimate', done: false },
        { name: 'submit', done: false },
        { name: 'post-repair', done: false },
      ],
    },
    estimate: {
      label: 'Estimate',
      color: '#7048cf',
      bgColor: '#efeafb',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: true },
        { name: 'estimate', done: true },
        { name: 'submit', done: false },
        { name: 'post-repair', done: false },
      ],
    },
    pre_submit_pending: {
      label: 'Pre-Submit',
      color: '#c9751b',
      bgColor: '#fbefdd',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: true },
        { name: 'estimate', done: true },
        { name: 'submit', done: false },
        { name: 'post-repair', done: false },
      ],
    },
    pre_submit_done: {
      label: 'Submitted',
      color: '#1c8f63',
      bgColor: '#e4f4ec',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: true },
        { name: 'estimate', done: true },
        { name: 'submit', done: true },
        { name: 'post-repair', done: false },
      ],
    },
    post_repair_ppt: {
      label: 'Post-Repair',
      color: '#2f63cf',
      bgColor: '#e9f0fd',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: true },
        { name: 'estimate', done: true },
        { name: 'submit', done: true },
        { name: 'post-repair', done: true },
      ],
    },
    claim_submitted: {
      label: 'Completed',
      color: '#2a4cd0',
      bgColor: '#e9effe',
      steps: [
        { name: 'intake', done: true },
        { name: 'documentation', done: true },
        { name: 'estimate', done: true },
        { name: 'submit', done: true },
        { name: 'post-repair', done: true },
      ],
    },
  }

  return stepMap[stage ?? 'active_intake']
}

export const Pipeline: React.FC<PipelineProps> = ({ stage, compact = false }) => {
  const config = getStageConfig(stage)

  if (compact) {
    return (
      <View
        style={{
          backgroundColor: config.bgColor,
          borderColor: config.color,
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
            color: config.color,
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
        gap: 8,
        paddingVertical: 4,
      }}
    >
      {config.steps.map((step, index) => (
        <React.Fragment key={step.name}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: step.done ? config.color : '#d9d4c7',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {step.done && (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: '#ffffff',
                }}
              >
                ✓
              </Text>
            )}
          </View>
          {index < config.steps.length - 1 && (
            <View
              style={{
                flex: 1,
                height: 2,
                backgroundColor: config.steps[index + 1].done ? config.color : '#d9d4c7',
                maxWidth: 16,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  )
}

export default Pipeline
