import { beforeEach, describe, expect, it, vi } from 'vitest'

type RpcCall = { fn: string; args: Record<string, unknown> }
type FromCall = { table: string; op: string }

const rpcCalls: RpcCall[] = []
const fromCalls: FromCall[] = []

const rpcHandlers = new Map<string, (args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>()
const fromHandlers = new Map<string, () => unknown>()

function chain(table: string, op: string) {
  fromCalls.push({ table, op })
  const handler = fromHandlers.get(`${table}:${op}`)
  if (handler) return handler()
  return {
    select: () => chain(table, 'select'),
    ilike: () => chain(table, 'ilike'),
    eq: () => chain(table, 'eq'),
    in: () => chain(table, 'in'),
    order: () => chain(table, 'order'),
    limit: () => chain(table, 'limit'),
    update: () => chain(table, 'update'),
    or: () => chain(table, 'or'),
    insert: () => chain(table, 'insert'),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  }
}

vi.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      const handler = rpcHandlers.get(fn)
      if (handler) return handler(args)
      return Promise.resolve({ data: null, error: null })
    },
    from: (table: string) => ({
      select: (..._a: unknown[]) => chain(table, 'select'),
      update: (..._a: unknown[]) => chain(table, 'update'),
      insert: (..._a: unknown[]) => chain(table, 'insert'),
    }),
  },
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}))

vi.mock('../env', () => ({
  getSupabaseBaseUrl: () => 'https://example.supabase.co',
}))

describe('customerPortal API query patterns', () => {
  beforeEach(async () => {
    rpcCalls.length = 0
    fromCalls.length = 0
    rpcHandlers.clear()
    fromHandlers.clear()
    vi.resetModules()
  })

  it('customerListEstimates uses RPC first and skips direct tables when RPC returns rows', async () => {
    rpcHandlers.set('customer_list_estimates', async () => ({
      data: [{ estimate_id: 'E1', estimate_no: 'E1', status: 'issued' }],
      error: null,
    }))
    fromHandlers.set('post_feedback_bot_data:limit', () =>
      Promise.resolve({ data: [], error: null })
    )

    const { customerListEstimates, clearCustomerPortalCache } = await import('./customerPortal')
    clearCustomerPortalCache()

    const rows = await customerListEstimates('session-tok', 'MH12AB1234')
    expect(rows).toHaveLength(1)
    expect(rpcCalls.some((c) => c.fn === 'customer_list_estimates')).toBe(true)
    expect(fromCalls.some((c) => c.table === 'customer_estimates')).toBe(false)
    expect(fromCalls.filter((c) => c.table === 'post_feedback_bot_data' && c.op === 'select').length).toBeLessThanOrEqual(
      1
    )
  })

  it('customerGetRepairCard skips bodyshop_repair_cards when RPC card has id and cache is warm', async () => {
    rpcHandlers.set('customer_get_repair_card', async () => ({
      data: {
        id: 7,
        reg_number: 'MH12AB1234',
        estimate_document: { storage_path: '/est.pdf', file_name: 'est.pdf' },
      },
      error: null,
    }))

    const { customerGetRepairCard, clearCustomerPortalCache } = await import('./customerPortal')
    clearCustomerPortalCache()

    const card = await customerGetRepairCard('session-tok', 'MH12AB1234')
    expect(card?.id).toBe(7)
    expect(fromCalls.some((c) => c.table === 'bodyshop_repair_cards')).toBe(false)
    expect(rpcCalls.filter((c) => c.fn === 'customer_get_repair_card').length).toBe(1)
  })

  it('customerGetVisitContext does not re-fetch repair card when RPC context includes id', async () => {
    rpcHandlers.set('customer_get_visit_context', async () => ({
      data: {
        visit_kind: 'bodyshop',
        job: { service_type: 'Body & Paint', source: 'bodyshop' },
        repair_card: {
          id: 11,
          reg_number: 'MH12AB1234',
          claim_intimation_no: 'MOTI8202441',
          estimate_document: { storage_path: 'x', file_name: 'x.pdf' },
        },
      },
      error: null,
    }))

    const { customerGetVisitContext, clearCustomerPortalCache } = await import('./customerPortal')
    clearCustomerPortalCache()

    const ctx = await customerGetVisitContext('session-tok', 'MH12AB1234')
    expect(ctx.repair_card?.id).toBe(11)
    expect(ctx.repair_card?.claim_intimation_no).toBe('MOTI8202441')
    expect(ctx.visit_kind).toBe('bodyshop')
  })

  it('customerSetEstimateDecision batch-syncs bot payloads via RPC instead of row loops', async () => {
    rpcHandlers.set('customer_set_estimate_decision', async () => ({ data: { ok: true }, error: null }))
    rpcHandlers.set('customer_batch_sync_estimate_payloads', async () => ({
      data: { ok: true, updated: 2 },
      error: null,
    }))
    fromHandlers.set('customer_estimates:or', () => Promise.resolve({ error: null }))
    fromHandlers.set('post_feedback_bot_data:insert', () => Promise.resolve({ error: null }))

    const { customerSetEstimateDecision } = await import('./customerPortal')
    await customerSetEstimateDecision('session-tok', 'EST-1', 'approve', undefined, 'MH12AB1234')

    expect(rpcCalls.some((c) => c.fn === 'customer_batch_sync_estimate_payloads')).toBe(true)
    const botSelects = fromCalls.filter(
      (c) => c.table === 'post_feedback_bot_data' && c.op === 'select'
    )
    expect(botSelects.length).toBe(0)
  })
})
