// BackOrderDataReport — Parts No. Search across VOR BO Report + Co-Dealer Stock
// Shows Tata Motors availability + all matching Co-Dealer records for a searched part.

import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface VorRow {
  id: number
  part_number: string | null
  part_description: string | null
  bo_quantity: number | null
  source_row_data: Record<string, unknown> | null
}
interface CpRow {
  id: number
  part_number: string | null
  part_description: string | null
  co_dealer_name: string | null
  dealer_code: string | null
  available_qty: number | null
  source_row_data: Record<string, unknown> | null
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BackOrderDataReport() {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [vorRows, setVorRows] = useState<VorRow[]>([])
  const [cpRows, setCpRows] = useState<CpRow[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  const doSearch = useCallback(async (partNo: string) => {
    const trimmed = partNo.trim()
    if (!trimmed) return
    setLoading(true)
    setHasSearched(true)

    const upper = trimmed.toUpperCase()

    try {
      // Query both tables in parallel
      const [vorRes, cpRes] = await Promise.all([
        supabase
          .from('back_order_vor_data')
          .select('id, part_number, part_description, bo_quantity, source_row_data')
          .ilike('part_number', upper),
        supabase
          .from('back_order_cp_stock_data')
          .select('id, part_number, part_description, co_dealer_name, dealer_code, available_qty, source_row_data')
          .ilike('part_number', upper),
      ])

      setVorRows(vorRes.data ?? [])
      setCpRows(cpRes.data ?? [])
    } catch {
      setVorRows([])
      setCpRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = () => void doSearch(search)
  const handleClear = () => {
    setSearch('')
    setVorRows([])
    setCpRows([])
    setHasSearched(false)
  }

  const totalCpQty = cpRows.reduce((sum, r) => sum + (r.available_qty ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">Back Order Data — Parts No. Search</h2>
        <p className="mt-1 text-sm text-gray-500">
          Search a Part Number to check Tata Motors stock status and Co-Dealer availability.
        </p>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Enter Part Number (e.g. 5401090PA)"
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !search.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={loading}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-300 disabled:opacity-50"
        >
          Clear Search
        </button>
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {hasSearched && !loading && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-gray-900">
                Part No: {search.trim().toUpperCase()}
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              {/* Tata Motors status */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Tata Motors:</span>
                {vorRows.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    ✕ Not Available / Back Order
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    ✓ Available
                  </span>
                )}
              </div>

              {/* Co-Dealer status */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Co-Dealer:</span>
                {cpRows.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    ✓ Available ({cpRows.length} dealer{cpRows.length !== 1 ? 's' : ''}, {totalCpQty} qty)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                    Not Available
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* VOR BO Report details */}
          {vorRows.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h4 className="text-sm font-bold text-gray-900">
                  VOR BO REPORT <span className="font-normal text-gray-400">— Sheet 1 (Tata Motors)</span>
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Part Number</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Part Description</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">BO / Required Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vorRows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50">
                        <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{row.part_number || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.part_description || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">{row.bo_quantity ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Co-Dealer stock details */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h4 className="text-sm font-bold text-gray-900">
                Co-Dealer Availability <span className="font-normal text-gray-400">— Sheet 2 (AVL WITH CP STOCK)</span>
              </h4>
            </div>
            {cpRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Part Number</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Part Description</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Co-Dealer Name</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Dealer Code</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">Available Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cpRows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50">
                        <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{row.part_number || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.part_description || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.co_dealer_name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-500">{row.dealer_code || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-green-700">{row.available_qty ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={4} className="px-4 py-2.5 text-right font-semibold text-gray-600">Total Available Qty:</td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-700">{totalCpQty}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                Not Available — No Co-Dealer has this part in stock.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
