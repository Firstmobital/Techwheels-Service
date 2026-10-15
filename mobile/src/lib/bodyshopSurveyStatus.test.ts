import { describe, expect, it } from 'vitest'
import {
  normalizeBodyshopSurveyStatusForDb,
  prepareBodyshopRepairPatchForSave,
} from './bodyshopSurveyStatus'

describe('bodyshopSurveyStatus', () => {
  it('maps legacy Done/Scheduled to DB values', () => {
    expect(normalizeBodyshopSurveyStatusForDb('done')).toBe('approved')
    expect(normalizeBodyshopSurveyStatusForDb('scheduled')).toBe('pending')
    expect(normalizeBodyshopSurveyStatusForDb('approved')).toBe('approved')
  })

  it('rejects invalid status before save', () => {
    const res = prepareBodyshopRepairPatchForSave(
      { survey_status: 'pending' },
      { survey_status: 'invalid' },
      'test@example.com',
    )
    expect(res.ok).toBe(false)
  })

  it('normalizes done to approved on save', () => {
    const res = prepareBodyshopRepairPatchForSave(
      { survey_status: 'pending' },
      { survey_status: 'done' },
      'test@example.com',
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.patch.survey_status).toBe('approved')
  })
})
