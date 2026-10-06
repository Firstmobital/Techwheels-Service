import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchCustomerDocuments,
  resetCustomerDocumentsInflight,
  shouldUseContextRepairCardForDocuments,
} from './customerDocumentsCache'

const getRepairCard = vi.fn()
const listAssets = vi.fn()

vi.mock('../api/customerPortal', () => ({
  customerGetRepairCard: (...args: unknown[]) => getRepairCard(...args),
}))

vi.mock('../api/customerBodyshopUploads', () => ({
  customerListBodyshopAssets: (...args: unknown[]) => listAssets(...args),
}))

describe('shouldUseContextRepairCardForDocuments', () => {
  it('uses context card when repairCard key is present and refresh is false', () => {
    expect(shouldUseContextRepairCardForDocuments({ repairCard: { id: 1 } })).toBe(true)
    expect(shouldUseContextRepairCardForDocuments({ repairCard: null })).toBe(true)
  })

  it('refetches when refreshRepairCard is true', () => {
    expect(shouldUseContextRepairCardForDocuments({ repairCard: { id: 1 }, refreshRepairCard: true })).toBe(
      false
    )
  })

  it('refetches when repairCard is omitted', () => {
    expect(shouldUseContextRepairCardForDocuments(undefined)).toBe(false)
    expect(shouldUseContextRepairCardForDocuments({})).toBe(false)
  })
})

describe('fetchCustomerDocuments', () => {
  beforeEach(() => {
    resetCustomerDocumentsInflight()
    getRepairCard.mockReset()
    listAssets.mockReset()
    listAssets.mockResolvedValue({ documents: [], photos: [] })
  })

  it('does not call customerGetRepairCard when visit context repair card is supplied', async () => {
    const ctxCard = { id: 42, reg_number: 'MH12AB1234' }
    const snap = await fetchCustomerDocuments('tok', 'MH12 AB 1234', { repairCard: ctxCard })
    expect(getRepairCard).not.toHaveBeenCalled()
    expect(snap.repairCard).toEqual(ctxCard)
    expect(listAssets).toHaveBeenCalledWith('tok', 'MH12 AB 1234')
  })

  it('calls customerGetRepairCard when refreshRepairCard is set', async () => {
    getRepairCard.mockResolvedValue({ id: 99 })
    await fetchCustomerDocuments('tok', 'MH12AB1234', {
      repairCard: { id: 42 },
      refreshRepairCard: true,
    })
    expect(getRepairCard).toHaveBeenCalledTimes(1)
  })
})
