// AvlCpStockReport — AVL WITH CP STOCK (Co-Dealer Stock Report)
// Separate report for Co-Dealer stock data with filters on ALL columns.
// Data is imported via /import page → Back Order Data → AVL WITH CP STOCK slot.

import { useCallback, useEffect, useMemo, useState } from 'react'
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

const PAGE_SIZE = 25

export default function AvlCpStockReport() {
  const [allData, setAllData] = useState<CpRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // ── Filters (one per field) ────────────────────────────────────────────────
  const [fPartNo, setFPartNo] = useState('')
  const [fPartName, setFPartName] = useState('')
  const [fDealer, setFDealer] = useState('')
  const [fDealerCode, setFDealerCode] = useState('')
  const [fRegion, setFRegion] = useState('')
  const [fCity, setFCity] = useState('')
  const [fState, setFState] = useState('')
  const [fQtyMin, setFQtyMin] = useState('')
  const [fQtyMax, setFQtyMax] = useState('')
  const [fContact, setFContact] = useState('')
  const [fPhone, setFPhone] = useState('')

  // ── Dropdown option lists ──────────────────────────────────────────────────
  const [regionOptions, setRegionOptions] = useState<string[]>([])
  const [stateOptions, setStateOptions] = useState<string[]>([])
  const [cityOptions, setCityOptions] = useState<string[]>([])
  const [dealerOptions, setDealerOptions] = useState<string[]>([])
  const [dealerCodeOptions, setDealerCodeOptions] = useState<string[]>([])

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let all: CpRow[] = []
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
        all = all.concat(data as CpRow[])
        if (data.length < PAGE) break
        offset += PAGE
      }

      setAllData(all)
      setLoaded(true)

      // Build dropdown option lists
      const rSet = new Set<string>()
      const sSet = new Set<string>()
      const cSet = new Set<string>()
      const dSet = new Set<string>()
      const dcSet = new Set<string>()
      for (const r of all) {
        if (r.region_name) rSet.add(r.region_name)
        if (r.state) sSet.add(r.state)
        if (r.city) cSet.add(r.city)
        if (r.co_dealer_name) dSet.add(r.co_dealer_name)
        if (r.dealer_code) dcSet.add(r.dealer_code)
      }
      setRegionOptions(Array.from(rSet).sort())
      setStateOptions(Array.from(sSet).sort())
      setCityOptions(Array.from(cSet).sort())
      setDealerOptions(Array.from(dSet).sort())
      setDealerCodeOptions(Array.from(dcSet).sort())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  // ── Apply ALL filters ───────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    return allData.filter(r => {
      // Part Number — text contains (case-insensitive)
      if (fPartNo.trim()) {
        if (!(r.part_number ?? '').toLowerCase().includes(fPartNo.trim().toLowerCase())) return false
      }
      // Part Name — text contains
      if (fPartName.trim()) {
        if (!(r.part_description ?? '').toLowerCase().includes(fPartName.trim().toLowerCase())) return false
      }
      // Co-Dealer — dropdown exact match
      if (fDealer && r.co_dealer_name !== fDealer) return false
      // Dealer Code — dropdown exact match
      if (fDealerCode && r.dealer_code !== fDealerCode) return false
      // Region — dropdown exact match
      if (fRegion && r.region_name !== fRegion) return false
      // City — dropdown exact match
      if (fCity && r.city !== fCity) return false
      // State — dropdown exact match
      if (fState && r.state !== fState) return false
      // Available Qty — min/max range
      if (fQtyMin.trim()) {
        const min = parseFloat(fQtyMin)
        if (!isNaN(min) && (r.available_qty ?? 0) < min) return false
      }
      if (fQtyMax.trim()) {
        const max = parseFloat(fQtyMax)
        if (!isNaN(max) && (r.available_qty ?? 0) > max) return false
      }
      // Contact — text contains
      if (fContact.trim()) {
        if (!(r.contact_name ?? '').toLowerCase().includes(fContact.trim().toLowerCase())) return false
      }
      // Phone — text contains
      if (fPhone.trim()) {
        if (!(r.cell_phone ?? '').toLowerCase().includes(fPhone.trim().toLowerCase())) return false
      }
      return true
    })
  }, [allData, fPartNo, fPartName, fDealer, fDealerCode, fRegion, fCity, fState, fQtyMin, fQtyMax, fContact, fPhone])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalQty = filteredData.reduce((sum, r) => sum + (r.available_qty ?? 0), 0)
  const uniqueDealers = new Set(filteredData.map(r => r.co_dealer_name)).size
  const uniqueParts = new Set(filteredData.map(r => r.part_number)).size

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE))
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredData.slice(start, start + PAGE_SIZE)
  }, [filteredData, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [fPartNo, fPartName, fDealer, fDealerCode, fRegion, fCity, fState, fQtyMin, fQtyMax, fContact, fPhone])

  // ── Clear all filters ───────────────────────────────────────────────────────
  const clearAllFilters = () => {
    setFPartNo(''); setFPartName(''); setFDealer(''); setFDealerCode('')
    setFRegion(''); setFCity(''); setFState('')
    setFQtyMin(''); setFQtyMax('')
    setFContact(''); setFPhone('')
  }

  const hasActiveFilters = fPartNo || fPartName || fDealer || fDealerCode || fRegion || fCity || fState || fQtyMin || fQtyMax || fContact || fPhone

  // ── Filter input component ──────────────────────────────────────────────────
  const FilterLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold text-gray-500 mb-1">{children}</label>
  )

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">AVL WITH CP STOCK</h2>
          <p className="mt-1 text-sm text-gray-500">
            Co-Dealer stock availability. Use filters below to narrow down by any field.
          </p>
        </div>
        {loaded && (
          <span className="text-xs text-gray-400 mt-2">{allData.length.toLocaleString('en-IN')} total records</span>
        )}
      </div>

      {error && <div className="p-4 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{error}</div>}

      {/* ── Filters Bar ─────────────────────────────────────────────────────────── */}
      <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">Filters</h3>
          {hasActiveFilters ? (
            <button type="button" onClick={clearAllFilters}
              className="rounded-md bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-300">
              Clear All Filters
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Part Number */}
          <div>
            <FilterLabel>Part Number</FilterLabel>
            <input type="text" value={fPartNo} onChange={(e) => setFPartNo(e.target.value)}
              placeholder="Search part no…"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {/* Part Name */}
          <div>
            <FilterLabel>Part Name</FilterLabel>
            <input type="text" value={fPartName} onChange={(e) => setFPartName(e.target.value)}
              placeholder="Search part name…"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {/* Co-Dealer */}
          <div>
            <FilterLabel>Co-Dealer (CP Location)</FilterLabel>
            <select value={fDealer} onChange={(e) => setFDealer(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
              <option value="">All Dealers</option>
              {dealerOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Dealer Code */}
          <div>
            <FilterLabel>Dealer Code</FilterLabel>
            <select value={fDealerCode} onChange={(e) => setFDealerCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
              <option value="">All Codes</option>
              {dealerCodeOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Region */}
          <div>
            <FilterLabel>Region</FilterLabel>
            <select value={fRegion} onChange={(e) => setFRegion(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
              <option value="">All Regions</option>
              {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* City */}
          <div>
            <FilterLabel>City</FilterLabel>
            <select value={fCity} onChange={(e) => setFCity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
              <option value="">All Cities</option>
              {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* State */}
          <div>
            <FilterLabel>State</FilterLabel>
            <select value={fState} onChange={(e) => setFState(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs">
              <option value="">All States</option>
              {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Available Qty — min/max */}
          <div>
            <FilterLabel>Available Qty (Min – Max)</FilterLabel>
            <div className="flex gap-1">
              <input type="number" value={fQtyMin} onChange={(e) => setFQtyMin(e.target.value)}
                placeholder="Min" className="w-1/2 rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
              <input type="number" value={fQtyMax} onChange={(e) => setFQtyMax(e.target.value)}
                placeholder="Max" className="w-1/2 rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
            </div>
          </div>

          {/* Contact */}
          <div>
            <FilterLabel>Contact</FilterLabel>
            <input type="text" value={fContact} onChange={(e) => setFContact(e.target.value)}
              placeholder="Search contact…"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {/* Phone */}
          <div>
            <FilterLabel>Phone</FilterLabel>
            <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)}
              placeholder="Search phone…"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>

        {/* Result count */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Showing <b className="text-gray-700">{filteredData.length.toLocaleString('en-IN')}</b> of {allData.length.toLocaleString('en-IN')} records
          </span>
          <span className="text-xs text-gray-500">
            Total Available Qty: <b className="text-green-700">{totalQty.toLocaleString('en-IN')}</b>
          </span>
          <span className="text-xs text-gray-500">
            Unique Parts: <b className="text-gray-700">{uniqueParts.toLocaleString('en-IN')}</b>
          </span>
          <span className="text-xs text-gray-500">
            Unique Co-Dealers: <b className="text-gray-700">{uniqueDealers.toLocaleString('en-IN')}</b>
          </span>
        </div>
      </div>

      {/* ── Loading state ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200">
          Loading all data… {allData.length > 0 && `(${allData.length.toLocaleString('en-IN')} rows so far)`}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────────── */}
      {!loading && loaded && filteredData.length === 0 && (
        <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200">
          {hasActiveFilters
            ? 'No records match the current filters.'
            : 'No data available. Import data from the Import page → Back Order Data → AVL WITH CP STOCK.'}
        </div>
      )}

      {/* ── Data Table ──────────────────────────────────────────────────────────── */}
      {!loading && filteredData.length > 0 && (
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
              {paginatedData.map((row, idx) => (
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
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-600">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredData.length)} of {filteredData.length.toLocaleString('en-IN')}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-50">First</button>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 disabled:opacity-50">Prev</button>
              <span className="text-xs text-gray-600">Page {currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 disabled:opacity-50">Next</button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-50">Last</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
