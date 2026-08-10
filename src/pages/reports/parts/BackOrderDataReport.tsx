// BackOrderDataReport — AVL WITH CP STOCK (Co-Dealer Stock Report)
// Shows all Co-Dealer stock data with Parts No. Search, region/state/dealer filters,
// and multiple Co-Dealer results per part.
// Also includes VOR BO REPORT (Sheet 1) cross-reference for Tata Motors stock status.

import { useCallback, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface VorRow {
  id: number
  part_number: string | null
  part_description: string | null
  bo_quantity: number | null
}
interface CpRow {
  id: number
  part_number: string | null
  part_description: string | null
  co_dealer_name: string | null
  dealer_code: string | null
  available_qty: number | null
  on_order: number | null
  price: number | null
  region_name: string | null
  state: string | null
  city: string | null
  cp_type: string | null
  cp_type1: string | null
  division: string | null
  cell_phone: string | null
  contact_name: string | null
  email: string | null
}

export default function BackOrderDataReport() {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [vorRows, setVorRows] = useState<VorRow[]>([])
  const [cpRows, setCpRows] = useState<CpRow[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  // Browse mode
  const [allCpRows, setAllCpRows] = useState<CpRow[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseLoaded, setBrowseLoaded] = useState(false)

  // Filters for browse mode
  const [filterRegion, setFilterRegion] = useState('')
  const [filterState, setFilterState] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterDealer, setFilterDealer] = useState('')
  const [filterPartSearch, setFilterPartSearch] = useState('')

  // Unique filter values
  const [regions, setRegions] = useState<string[]>([])
  const [states, setStates] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [dealers, setDealers] = useState<string[]>([])

  // ── Combined search ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (partNo: string) => {
    const trimmed = partNo.trim()
    if (!trimmed) return
    setLoading(true)
    setHasSearched(true)

    try {
      const [vorRes, cpRes] = await Promise.all([
        supabase
          .from('back_order_vor_data')
          .select('id, part_number, part_description, bo_quantity')
          .ilike('part_number', trimmed.toUpperCase()),
        supabase
          .from('back_order_cp_stock_data')
          .select('id, part_number, part_description, co_dealer_name, dealer_code, available_qty, on_order, price, region_name, state, city, cp_type, cp_type1, division, cell_phone, contact_name, email')
          .ilike('part_number', trimmed.toUpperCase()),
      ])

      if (vorRes.error) console.error('[BO] VOR error:', vorRes.error)
      if (cpRes.error) console.error('[BO] CP error:', cpRes.error)

      setVorRows(vorRes.data ?? [])
      setCpRows(cpRes.data ?? [])
    } catch (err) {
      console.error('[BO] Search error:', err)
      setVorRows([])
      setCpRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Browse all + extract filter values ──────────────────────────────────────
  const loadAllData = useCallback(async () => {
    setBrowseLoading(true)
    try {
      // Fetch in chunks of 1000 to get all 45K rows
      let allData: CpRow[] = []
      let offset = 0
      const PAGE = 1000
      while (true) {
        const { data, error } = await supabase
          .from('back_order_cp_stock_data')
          .select('id, part_number, part_description, co_dealer_name, dealer_code, available_qty, on_order, price, region_name, state, city, cp_type, cp_type1, division, cell_phone, contact_name, email')
          .order('part_number', { ascending: true })
          .range(offset, offset + PAGE - 1)

        if (error) { console.error('[BO] Browse error:', error); break }
        if (!data || data.length === 0) break
        allData = allData.concat(data as CpRow[])
        if (data.length < PAGE) break
        offset += PAGE
      }

      setAllCpRows(allData)
      setBrowseLoaded(true)

      // Extract unique filter values
      const regionSet = new Set<string>()
      const stateSet = new Set<string>()
      const citySet = new Set<string>()
      const dealerSet = new Set<string>()
      for (const r of allData) {
        if (r.region_name) regionSet.add(r.region_name)
        if (r.state) stateSet.add(r.state)
        if (r.city) citySet.add(r.city)
        if (r.co_dealer_name) dealerSet.add(r.co_dealer_name)
      }
      setRegions(Array.from(regionSet).sort())
      setStates(Array.from(stateSet).sort())
      setCities(Array.from(citySet).sort())
      setDealers(Array.from(dealerSet).sort())
    } catch (err) {
      console.error('[BO] Browse error:', err)
    } finally {
      setBrowseLoading(false)
    }
  }, [])

  // ── Filtered browse data ─────────────────────────────────────────────────────
  const filteredRows = allCpRows.filter(r => {
    if (filterRegion && r.region_name !== filterRegion) return false
    if (filterState && r.state !== filterState) return false
    if (filterCity && r.city !== filterCity) return false
    if (filterDealer && r.co_dealer_name !== filterDealer) return false
    if (filterPartSearch && !(r.part_number ?? '').toLowerCase().includes(filterPartSearch.toLowerCase()) && !(r.part_description ?? '').toLowerCase().includes(filterPartSearch.toLowerCase())) return false
    return true
  })

  const handleSearch = () => void doSearch(search)
  const handleClear = () => { setSearch(''); setVorRows([]); setCpRows([]); setHasSearched(false) }

  const totalCpQty = cpRows.reduce((sum, r) => sum + (r.available_qty ?? 0), 0)
  const totalFilteredQty = filteredRows.reduce((sum, r) => sum + (r.available_qty ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">Co-Dealer Stock Report (AVL WITH CP STOCK)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Search any Part Number to find which Co-Dealers have it in stock, or browse all Co-Dealer data.
        </p>
      </div>

      {/* ── Search bar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Enter Part Number (e.g. 267889000000)"
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button type="button" onClick={handleSearch} disabled={loading || !search.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Searching…' : 'Search Part No.'}
        </button>
        <button type="button" onClick={handleClear} disabled={loading}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-300 disabled:opacity-50">
          Clear
        </button>
        <span className="text-xs text-gray-400 ml-2">
          {browseLoaded ? `${allCpRows.length.toLocaleString('en-IN')} total records loaded` : ''}
        </span>
        {!browseLoaded && (
          <button type="button" onClick={() => void loadAllData()} disabled={browseLoading}
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200">
            {browseLoading ? 'Loading all data…' : 'Load All Data'}
          </button>
        )}
      </div>

      {/* ── SEARCH RESULTS ─────────────────────────────────────────────────────── */}
      {hasSearched && !loading && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-bold text-gray-900">Part No: {search.trim().toUpperCase()}</h3>
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Tata Motors:</span>
                {vorRows.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    ✕ Back Order ({vorRows.reduce((s, r) => s + (r.bo_quantity ?? 0), 0)} qty)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    ✓ Available
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Co-Dealer:</span>
                {cpRows.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    ✓ Available — {cpRows.length} dealer{cpRows.length !== 1 ? 's' : ''}, {totalCpQty} qty
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                    Not Available
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Co-Dealer results table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h4 className="text-sm font-bold text-gray-900">
                Co-Dealer Availability <span className="font-normal text-gray-400">— {cpRows.length} records</span>
              </h4>
            </div>
            {cpRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Part Number</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Part Description</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Co-Dealer Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Dealer Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Region</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">City</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">State</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Stock</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">On Order</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Contact</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cpRows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-blue-50">
                        <td className="px-3 py-2.5 font-mono font-medium text-gray-900">{row.part_number || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-700" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.part_description || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-700 font-medium">{row.co_dealer_name || '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-500">{row.dealer_code || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{row.region_name || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{row.city || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.state || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-700">{row.available_qty ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{row.on_order ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{row.contact_name || '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-500">{row.cell_phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={7} className="px-3 py-2.5 text-right font-semibold text-gray-600">Total Stock Qty:</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-700">{totalCpQty}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No Co-Dealer has this part in stock.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BROWSE ALL DATA + FILTERS ───────────────────────────────────────────── */}
      {browseLoaded && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Part / Description Search</label>
                <input type="text" value={filterPartSearch} onChange={(e) => setFilterPartSearch(e.target.value)}
                  placeholder="Filter by part…"
                  className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Region</label>
                <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
                  className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none">
                  <option value="">All Regions</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">State</label>
                <select value={filterState} onChange={(e) => setFilterState(e.target.value)}
                  className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none">
                  <option value="">All States</option>
                  {states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">City</label>
                <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                  className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none">
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Co-Dealer</label>
                <select value={filterDealer} onChange={(e) => setFilterDealer(e.target.value)}
                  className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none">
                  <option value="">All Dealers</option>
                  {dealers.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => { setFilterRegion(''); setFilterState(''); setFilterCity(''); setFilterDealer(''); setFilterPartSearch('') }}
                className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-300">
                Clear Filters
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Showing <span className="font-bold text-gray-700">{filteredRows.length.toLocaleString('en-IN')}</span> of {allCpRows.length.toLocaleString('en-IN')} records • Total Stock: <span className="font-bold text-green-700">{totalFilteredQty.toLocaleString('en-IN')}</span>
            </p>
          </div>

          {/* Data table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto" style={{ maxHeight: '600px' }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Part Number</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Part Description</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Co-Dealer Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Code</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Region</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">City</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">State</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Stock</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">On Order</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Contact</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Phone</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Dealer Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 500).map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-blue-50">
                      <td className="px-3 py-2 font-mono font-medium text-gray-900">{row.part_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-700" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.part_description || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{row.co_dealer_name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{row.dealer_code || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.region_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.city || '—'}</td>
                      <td className="px-3 py-2 text-gray-500" style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.state || '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-700">{row.available_qty ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.on_order ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.contact_name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{row.cell_phone || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{row.cp_type || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRows.length > 500 && (
              <div className="border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-400">
                Showing first 500 of {filteredRows.length.toLocaleString('en-IN')} filtered records. Use filters to narrow down.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
