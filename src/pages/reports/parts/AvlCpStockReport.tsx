// AvlCpStockReport — AVL WITH CP STOCK (Co-Dealer Stock Report)
// Separate report for Co-Dealer stock data. Shows all locations where a part is available.
// Data is imported via /import page → Back Order Data → AVL WITH CP STOCK slot.

import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'

interface CpRow {
  id: number
  part_number: string | null
  part_description: string | null
  co_dealer_name: string | null
  dealer_code: string | null
  available_qty: number | null
  on_order: number | null
  region_name: string | null
  state: string | null
  city: string | null
  cp_type: string | null
  division: string | null
  cell_phone: string | null
  contact_name: string | null
}

export default function AvlCpStockReport() {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CpRow[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Browse mode
  const [browseData, setBrowseData] = useState<CpRow[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseLoaded, setBrowseLoaded] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)

  // Filters
  const [filterRegion, setFilterRegion] = useState('')
  const [filterState, setFilterState] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterDealer, setFilterDealer] = useState('')

  // Unique filter values
  const [regions, setRegions] = useState<string[]>([])
  const [states, setStates] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [dealers, setDealers] = useState<string[]>([])

  const totalSearchQty = results.reduce((sum, r) => sum + (r.available_qty ?? 0), 0)

  // ── Search ──────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    setLoading(true)
    setHasSearched(true)
    setError(null)

    try {
      const { data, error: qErr } = await supabase
        .from('back_order_cp_stock_data')
        .select('id, part_number, part_description, co_dealer_name, dealer_code, available_qty, on_order, region_name, state, city, cp_type, division, cell_phone, contact_name')
        .or(`part_number.ilike.%${trimmed.toUpperCase()}%,part_description.ilike.%${trimmed}%`)
        .order('available_qty', { ascending: false })
        .limit(500)

      if (qErr) throw new Error(qErr.message)
      setResults(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [search])

  const handleClear = () => {
    setSearch('')
    setResults([])
    setHasSearched(false)
    setError(null)
  }

  // ── Load all data for browse ────────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    setBrowseLoading(true)
    setBrowseError(null)
    try {
      let allData: CpRow[] = []
      let offset = 0
      const PAGE = 1000
      while (true) {
        const { data, error: qErr } = await supabase
          .from('back_order_cp_stock_data')
          .select('id, part_number, part_description, co_dealer_name, dealer_code, available_qty, on_order, region_name, state, city, cp_type, division, cell_phone, contact_name')
          .order('part_number', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (qErr) throw new Error(qErr.message)
        if (!data || data.length === 0) break
        allData = allData.concat(data as CpRow[])
        if (data.length < PAGE) break
        offset += PAGE
      }
      setBrowseData(allData)
      setBrowseLoaded(true)

      // Extract unique filter values
      const rSet = new Set<string>()
      const sSet = new Set<string>()
      const cSet = new Set<string>()
      const dSet = new Set<string>()
      for (const r of allData) {
        if (r.region_name) rSet.add(r.region_name)
        if (r.state) sSet.add(r.state)
        if (r.city) cSet.add(r.city)
        if (r.co_dealer_name) dSet.add(r.co_dealer_name)
      }
      setRegions(Array.from(rSet).sort())
      setStates(Array.from(sSet).sort())
      setCities(Array.from(cSet).sort())
      setDealers(Array.from(dSet).sort())
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setBrowseLoading(false)
    }
  }, [])

  const filteredBrowse = browseData.filter(r => {
    if (filterRegion && r.region_name !== filterRegion) return false
    if (filterState && r.state !== filterState) return false
    if (filterCity && r.city !== filterCity) return false
    if (filterDealer && r.co_dealer_name !== filterDealer) return false
    return true
  })

  const totalFilteredQty = filteredBrowse.reduce((sum, r) => sum + (r.available_qty ?? 0), 0)

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">AVL WITH CP STOCK</h2>
          <p className="mt-1 text-sm text-gray-500">
            Search any Part Number or Part Name to find all Co-Dealer locations where it's available.
          </p>
        </div>
        {browseLoaded && (
          <span className="text-xs text-gray-400 mt-2">{browseData.length.toLocaleString('en-IN')} total records</span>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doSearch() }}
            placeholder="Search Part No. or Part Name…"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ width: '260px' }}
          />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button type="button" onClick={() => void doSearch()} disabled={loading || !search.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button type="button" onClick={handleClear} disabled={loading}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-300 disabled:opacity-50">
          Clear
        </button>
        {!browseLoaded && (
          <button type="button" onClick={() => void loadAllData()} disabled={browseLoading}
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200">
            {browseLoading ? 'Loading all…' : 'Browse All Data'}
          </button>
        )}
      </div>

      {error && <div className="p-4 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{error}</div>}
      {browseError && <div className="p-4 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{browseError}</div>}

      {/* ── SEARCH RESULTS ─────────────────────────────────────────────────────── */}
      {hasSearched && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap gap-3">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-600">Matching Records</p>
              <p className="text-xl font-bold text-blue-800">{results.length.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-green-600">Total Available Qty</p>
              <p className="text-xl font-bold text-green-800">{totalSearchQty.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">Unique Co-Dealers</p>
              <p className="text-xl font-bold text-gray-700">{new Set(results.map(r => r.co_dealer_name)).size}</p>
            </div>
          </div>

          {/* Results table */}
          {results.length > 0 ? (
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Name</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Co-Dealer (CP Location)</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Dealer Code</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Region</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">City</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">State</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Available Qty</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Contact</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 border text-gray-800 font-medium font-mono">{row.part_number || '—'}</td>
                      <td className="px-4 py-2 border text-gray-700 text-xs" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.part_description || '—'}</td>
                      <td className="px-4 py-2 border text-gray-700 font-medium">{row.co_dealer_name || '—'}</td>
                      <td className="px-4 py-2 border text-gray-500 font-mono">{row.dealer_code || '—'}</td>
                      <td className="px-4 py-2 border text-gray-600 text-xs">{row.region_name || '—'}</td>
                      <td className="px-4 py-2 border text-gray-600 text-xs">{row.city || '—'}</td>
                      <td className="px-4 py-2 border text-gray-500 text-xs" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.state || '—'}</td>
                      <td className="px-4 py-2 border text-right font-bold text-green-700">{row.available_qty ?? '—'}</td>
                      <td className="px-4 py-2 border text-gray-600 text-xs">{row.contact_name || '—'}</td>
                      <td className="px-4 py-2 border text-gray-500 text-xs font-mono">{row.cell_phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 border-t-2">
                    <td colSpan={7} className="px-4 py-2 text-right font-semibold text-gray-600 border">Total Available Qty:</td>
                    <td className="px-4 py-2 text-right font-bold text-green-700 border">{totalSearchQty.toLocaleString('en-IN')}</td>
                    <td colSpan={2} className="border"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200">
              No records found for "<span className="font-medium text-gray-600">{search}</span>"
            </div>
          )}
        </div>
      )}

      {/* ── BROWSE ALL + FILTERS ─────────────────────────────────────────────────── */}
      {browseLoaded && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Region</label>
              <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
                className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
                <option value="">All Regions</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">State</label>
              <select value={filterState} onChange={(e) => setFilterState(e.target.value)}
                className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
                <option value="">All States</option>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">City</label>
              <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Co-Dealer</label>
              <select value={filterDealer} onChange={(e) => setFilterDealer(e.target.value)}
                className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
                <option value="">All Dealers</option>
                {dealers.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => { setFilterRegion(''); setFilterState(''); setFilterCity(''); setFilterDealer('') }}
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-300">
              Clear Filters
            </button>
            <span className="text-xs text-gray-400 ml-auto">
              Showing <b className="text-gray-600">{filteredBrowse.length.toLocaleString('en-IN')}</b> of {browseData.length.toLocaleString('en-IN')} • Total Stock: <b className="text-green-700">{totalFilteredQty.toLocaleString('en-IN')}</b>
            </span>
          </div>

          {/* Data table */}
          <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200" style={{ maxHeight: '600px' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Co-Dealer</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Code</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Region</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">City</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">State</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Stock</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredBrowse.slice(0, 500).map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 border text-gray-800 font-medium font-mono">{row.part_number || '—'}</td>
                    <td className="px-4 py-2 border text-gray-700 text-xs" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.part_description || '—'}</td>
                    <td className="px-4 py-2 border text-gray-700 font-medium">{row.co_dealer_name || '—'}</td>
                    <td className="px-4 py-2 border text-gray-500 font-mono">{row.dealer_code || '—'}</td>
                    <td className="px-4 py-2 border text-gray-600 text-xs">{row.region_name || '—'}</td>
                    <td className="px-4 py-2 border text-gray-600 text-xs">{row.city || '—'}</td>
                    <td className="px-4 py-2 border text-gray-500 text-xs" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.state || '—'}</td>
                    <td className="px-4 py-2 border text-right font-bold text-green-700">{row.available_qty ?? '—'}</td>
                    <td className="px-4 py-2 border text-gray-500 text-xs">{row.cp_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredBrowse.length > 500 && (
            <p className="text-center text-xs text-gray-400">
              Showing first 500 of {filteredBrowse.length.toLocaleString('en-IN')} filtered records. Use filters to narrow down.
            </p>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────────── */}
      {!hasSearched && !browseLoaded && (
        <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-500 mb-2">Search for a Part Number or Part Name above, or click "Browse All Data" to view all records.</p>
          <p className="text-xs text-gray-400">Import data from the Import page → Back Order Data → AVL WITH CP STOCK</p>
        </div>
      )}
    </div>
  )
}
