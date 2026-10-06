import { describe, expect, it } from 'vitest'
import {
  beginCustomerQueryScope,
  endCustomerQueryScope,
  logCustomerQuery,
} from './customerPortalQueryLog'

describe('customerPortalQueryLog', () => {
  it('counts queries within a scope', () => {
    beginCustomerQueryScope('test.scope')
    logCustomerQuery('rpc', 'customer_get_visit_context')
    logCustomerQuery('from', 'customer_estimates')
    const snap = endCustomerQueryScope()
    expect(snap.label).toBe('test.scope')
    expect(snap.count).toBe(2)
    expect(snap.entries.map((e) => `${e.op}:${e.target}`)).toEqual([
      'rpc:customer_get_visit_context',
      'from:customer_estimates',
    ])
  })

  it('resets entries when a new scope begins', () => {
    beginCustomerQueryScope('first')
    logCustomerQuery('rpc', 'a')
    endCustomerQueryScope()
    beginCustomerQueryScope('second')
    logCustomerQuery('from', 'b')
    const snap = endCustomerQueryScope()
    expect(snap.count).toBe(1)
    expect(snap.entries[0].target).toBe('b')
  })
})
