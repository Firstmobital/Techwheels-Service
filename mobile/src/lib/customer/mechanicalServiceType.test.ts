import { describe, expect, it } from 'vitest'
import {
  isActiveBodyshopRepairCard,
  isBodyshopReceptionServiceType,
  isEffectiveBodyshopCustomerVisit,
  resolveCustomerVisitKind,
} from './mechanicalServiceType'

describe('isBodyshopReceptionServiceType', () => {
  it('treats reception Accident as bodyshop', () => {
    expect(isBodyshopReceptionServiceType('Accident')).toBe(true)
    expect(isBodyshopReceptionServiceType('Accidental')).toBe(true)
    expect(isBodyshopReceptionServiceType('Paid Service')).toBe(false)
  })
})

describe('resolveCustomerVisitKind', () => {
  it('forces bodyshop for reception Accident even when server says mechanical', () => {
    const kind = resolveCustomerVisitKind(
      { source: 'reception', service_type: 'Accident', jc_number: 'JC-ACC-1' },
      'mechanical',
      null
    )
    expect(kind).toBe('bodyshop')
  })

  it('prefers active bodyshop card over server mechanical when job is stale reception', () => {
    const kind = resolveCustomerVisitKind(
      { source: 'reception', service_type: 'Paid Service', jc_number: 'JC-OLD' },
      'mechanical',
      { id: 9, overall_status: 'active', current_stage: 6, insurance_company: 'TATA AIG' }
    )
    expect(kind).toBe('bodyshop')
  })

  it('keeps mechanical when there is no active bodyshop card', () => {
    const kind = resolveCustomerVisitKind(
      { source: 'reception', service_type: 'Paid Service' },
      'mechanical',
      { id: 9, overall_status: 'delivered', current_stage: 18 }
    )
    expect(kind).toBe('mechanical')
  })

  it('respects explicit server bodyshop', () => {
    const kind = resolveCustomerVisitKind({ source: 'bodyshop', service_type: 'Body & Paint' }, 'bodyshop', {
      id: 1,
      overall_status: 'active',
    })
    expect(kind).toBe('bodyshop')
  })
})

describe('isEffectiveBodyshopCustomerVisit', () => {
  it('treats Accident reception as bodyshop UI even before repair card loads', () => {
    expect(
      isEffectiveBodyshopCustomerVisit({
        visitReady: true,
        kind: 'mechanical',
        repairCard: null,
        job: { service_type: 'Accident', jc_number: 'JC-MBTPLT-JP1-2627-008101' },
      })
    ).toBe(true)
  })
})

describe('isActiveBodyshopRepairCard', () => {
  it('detects active cards', () => {
    expect(isActiveBodyshopRepairCard({ id: 1, overall_status: 'active' })).toBe(true)
    expect(isActiveBodyshopRepairCard({ id: 1, overall_status: 'delivered' })).toBe(false)
  })
})
