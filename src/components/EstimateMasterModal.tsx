import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  getMasterPricingList,
  addPartPricingItem,
  updatePartPricingItem,
  deletePartPricingItem,
  saveMasterPricingList,
  resetPricingToDefault,
  type PartPricingItem,
} from '../lib/partsPricing'

interface EstimateMasterModalProps {
  isOpen: boolean
  onClose: () => void
  isAdmin?: boolean
}

const COMMON_MODELS = [
  'All',
  'Altroz',
  'Punch',
  'Tiago',
  'Tigor',
  'Nexon',
  'Nexon EV',
  'Harrier',
  'Safari',
  'Curvv',
  'Sierra',
  'Common / General',
]

const COMMON_FUELS = ['All', 'Petrol', 'Diesel', 'CNG', 'EV', 'General']

const COMMON_SERVICE_TYPES = [
  'All',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Running Repairs',
  'Periodic Maintenance',
  'Accident & Bodyshop',
]

export function EstimateMasterModal({ isOpen, onClose }: EstimateMasterModalProps) {
  const [items, setItems] = useState<PartPricingItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedModel, setSelectedModel] = useState('All')
  const [selectedFuel, setSelectedFuel] = useState('All')
  const [selectedServiceType, setSelectedServiceType] = useState('All')

  // Add / Edit Modal state
  const [editingItem, setEditingItem] = useState<PartPricingItem | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    service_name: '',
    model: 'Altroz',
    fuel: 'Petrol',
    service_type: 'Paid Service',
    price: 0,
    labour: 0,
  })

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function reloadItems() {
    setItems(getMasterPricingList())
  }

  useEffect(() => {
    if (!isOpen) return
    reloadItems()

    function handleUpdate() {
      reloadItems()
    }
    window.addEventListener('techwheels_pricing_updated', handleUpdate)
    return () => {
      window.removeEventListener('techwheels_pricing_updated', handleUpdate)
    }
  }, [isOpen])

  // Extract unique models & fuels for filters
  const modelsList = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.model && set.add(i.model))
    const list = Array.from(set).sort()
    return ['All', ...list]
  }, [items])

  const fuelsList = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.fuel && set.add(i.fuel))
    const list = Array.from(set).sort()
    return ['All', ...list]
  }, [items])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (selectedModel !== 'All' && item.model.toLowerCase() !== selectedModel.toLowerCase()) {
        return false
      }
      if (selectedFuel !== 'All' && (item.fuel || '').toLowerCase() !== selectedFuel.toLowerCase()) {
        return false
      }
      if (selectedServiceType !== 'All' && !item.service_type.toLowerCase().includes(selectedServiceType.toLowerCase())) {
        return false
      }
      if (q) {
        const text = `${item.service_name} ${item.model} ${item.fuel} ${item.service_type}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  }, [items, search, selectedModel, selectedFuel, selectedServiceType])

  // Open Edit Item
  function handleOpenEdit(item: PartPricingItem) {
    setEditingItem(item)
    setFormData({
      service_name: item.service_name,
      model: item.model,
      fuel: item.fuel,
      service_type: item.service_type,
      price: item.price,
      labour: item.labour,
    })
  }

  // Open Add Item
  function handleOpenAdd() {
    setEditingItem(null)
    setFormData({
      service_name: '',
      model: selectedModel !== 'All' ? selectedModel : 'Altroz',
      fuel: selectedFuel !== 'All' ? selectedFuel : 'Petrol',
      service_type: 'Paid Service',
      price: 0,
      labour: 0,
    })
    setIsAddModalOpen(true)
  }

  // Save Add / Edit
  function handleSaveForm(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.service_name.trim()) {
      showToast('Please enter a service/part name', false)
      return
    }

    if (editingItem) {
      updatePartPricingItem(editingItem.id, {
        service_name: formData.service_name.trim(),
        model: formData.model.trim(),
        fuel: formData.fuel.trim(),
        service_type: formData.service_type.trim(),
        price: Number(formData.price) || 0,
        labour: Number(formData.labour) || 0,
      })
      showToast(`Updated "${formData.service_name}" successfully`)
      setEditingItem(null)
    } else {
      addPartPricingItem({
        service_name: formData.service_name.trim(),
        model: formData.model.trim(),
        fuel: formData.fuel.trim(),
        service_type: formData.service_type.trim(),
        price: Number(formData.price) || 0,
        labour: Number(formData.labour) || 0,
      })
      showToast(`Added new item "${formData.service_name}"`)
      setIsAddModalOpen(false)
    }
    reloadItems()
  }

  // Delete item
  function handleDelete(item: PartPricingItem) {
    if (confirm(`Are you sure you want to delete "${item.service_name}" (${item.model})?`)) {
      deletePartPricingItem(item.id)
      showToast(`Deleted "${item.service_name}"`)
      reloadItems()
    }
  }

  // Reset to default list
  function handleReset() {
    if (confirm('Are you sure you want to reset all pricing items back to factory default? Any custom items will be replaced.')) {
      resetPricingToDefault()
      showToast('Reset to default 926 items catalogue')
      reloadItems()
    }
  }

  // Export to Excel
  function handleExportExcel() {
    const data = filteredItems.map((item) => ({
      ID: item.id,
      'Service Type': item.service_type,
      Model: item.model,
      Fuel: item.fuel,
      'Service / Part Name': item.service_name,
      'Part Price (₹)': item.price,
      'Labour (₹)': item.labour,
      'Total Estimate (₹)': item.price + item.labour,
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Price_Master')
    XLSX.writeFile(wb, `Techwheels_Price_Master_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast('Exported Price Master to Excel')
  }

  // Import CSV / Excel
  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsName = wb.SheetNames[0]
        const ws = wb.Sheets[wsName]
        const rawData: any[] = XLSX.utils.sheet_to_json(ws)

        if (!Array.isArray(rawData) || rawData.length === 0) {
          showToast('No data found in uploaded file', false)
          return
        }

        const mapped: PartPricingItem[] = rawData.map((row, idx) => ({
          id: Number(row.ID || row.id || idx + 1),
          service_type: String(row['Service Type'] || row.service_type || 'Paid Service').trim(),
          model: String(row.Model || row.model || 'Common').trim(),
          fuel: String(row.Fuel || row.fuel || 'General').trim(),
          service_name: String(row['Service / Part Name'] || row.service_name || row['Service Name'] || 'Part').trim(),
          price: Number(row['Part Price (₹)'] || row.price || 0),
          labour: Number(row['Labour (₹)'] || row.labour || 0),
        }))

        saveMasterPricingList(mapped)
        showToast(`Imported ${mapped.length} pricing items successfully!`)
        reloadItems()
      } catch (err) {
        showToast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, false)
      } finally {
        if (e.target) e.target.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex h-[92vh] w-full max-w-7xl flex-col rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        {/* TOP HEADER */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 px-6 py-4 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-2xl shadow-inner border border-white/20">
              📋
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold tracking-tight text-white">
                  Estimate & Parts Price Master
                </h2>
                <span className="rounded-full bg-amber-400/25 border border-amber-300/40 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                  Admin Catalogue
                </span>
              </div>
              <p className="text-xs text-amber-100/80">
                {items.length} master price records · Add, edit items, update prices, import & export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition cursor-pointer"
            >
              <span>➕</span> Add New Item
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 transition cursor-pointer"
              title="Import items from CSV or Excel file"
            >
              <span>📥</span> Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileImport}
            />

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 transition cursor-pointer"
              title="Export all pricing records to Excel"
            >
              <span>📤</span> Export Excel
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600/30 border border-rose-300/30 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-600/50 transition cursor-pointer"
              title="Reset price list to factory default"
            >
              <span>↺</span> Reset Defaults
            </button>

            <button
              type="button"
              onClick={onClose}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition cursor-pointer font-bold text-sm"
              title="Close Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TOAST ALERT */}
        {toast && (
          <div
            className={`mx-6 mt-3 rounded-lg p-3 text-xs font-bold flex items-center justify-between ${
              toast.ok
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{toast.ok ? '✅' : '⚠️'} {toast.msg}</span>
            <button type="button" onClick={() => setToast(null)} className="text-gray-400 hover:text-gray-700">
              ✕
            </button>
          </div>
        )}

        {/* FILTER BAR & METRICS */}
        <div className="border-b border-gray-200 bg-gray-50/80 px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="flex-1 min-w-[260px] max-w-md">
              <div className="relative">
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                  placeholder="Search by part name, model, fuel or service type…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="absolute left-3 top-2.5 text-xs text-gray-400">🔍</span>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500">Model:</span>
                <select
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-amber-600 focus:outline-none"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {modelsList.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500">Fuel:</span>
                <select
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-amber-600 focus:outline-none"
                  value={selectedFuel}
                  onChange={(e) => setSelectedFuel(e.target.value)}
                >
                  {fuelsList.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500">Service:</span>
                <select
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:border-amber-600 focus:outline-none"
                  value={selectedServiceType}
                  onChange={(e) => setSelectedServiceType(e.target.value)}
                >
                  {COMMON_SERVICE_TYPES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {(selectedModel !== 'All' || selectedFuel !== 'All' || selectedServiceType !== 'All' || search) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModel('All')
                    setSelectedFuel('All')
                    setSelectedServiceType('All')
                    setSearch('')
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Total Badge */}
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900 font-mono">
                {filteredItems.length} of {items.length} items
              </span>
            </div>
          </div>
        </div>

        {/* PRICING TABLE */}
        <div className="flex-1 overflow-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
              <span className="text-4xl mb-2">🔍</span>
              <p className="text-sm font-bold text-gray-700">No items match your search criteria</p>
              <p className="text-xs text-gray-400 mt-1">Try clearing filters or click "+ Add New Item" to create one.</p>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="mt-4 rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-800"
              >
                + Add New Service Item
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-100 text-[11px] font-extrabold uppercase text-gray-600 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 w-14">#</th>
                    <th className="px-4 py-3">Service / Part Name</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3">Fuel</th>
                    <th className="px-3 py-3">Service Type</th>
                    <th className="px-4 py-3 text-right">Part Price (₹)</th>
                    <th className="px-4 py-3 text-right">Labour (₹)</th>
                    <th className="px-4 py-3 text-right">Total (₹)</th>
                    <th className="px-3 py-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredItems.map((item, index) => {
                    const total = item.price + item.labour
                    return (
                      <tr key={item.id || index} className="hover:bg-amber-50/40 transition">
                        <td className="px-3 py-2.5 font-mono text-gray-400">{item.id || index + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-gray-900">{item.service_name}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-100">
                            {item.model || 'Common'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700">
                            {item.fuel || 'General'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 font-medium">{item.service_type}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                          {item.price > 0 ? `₹${item.price.toLocaleString()}` : '₹0'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-purple-700">
                          {item.labour > 0 ? `₹${item.labour.toLocaleString()}` : '₹0'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-extrabold text-amber-900">
                          ₹{total.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              className="rounded-md bg-amber-50 border border-amber-200 p-1.5 text-amber-800 hover:bg-amber-100 transition cursor-pointer"
                              title="Edit item price & details"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="rounded-md bg-rose-50 border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                              title="Delete item"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* BOTTOM FOOTER */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3 text-xs text-gray-500">
          <div>
            Showing <strong className="text-gray-900">{filteredItems.length}</strong> items of {items.length} total records.
            Edits are saved locally & instantly available across Estimate Builder.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-bold text-white hover:bg-gray-900 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* ADD / EDIT ITEM MODAL DIALOG */}
      {(isAddModalOpen || editingItem) && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{editingItem ? '✏️' : '➕'}</span>
                <h3 className="text-base font-extrabold text-gray-900">
                  {editingItem ? `Edit Service Item #${editingItem.id}` : 'Add New Service / Part Item'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null)
                  setIsAddModalOpen(false)
                }}
                className="text-gray-400 hover:text-gray-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Service / Part Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 focus:border-amber-600 focus:outline-none"
                  placeholder="e.g. Engine Oil Synthetic, Front Brake Pads, Wiper Blade..."
                  value={formData.service_name}
                  onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Model</label>
                  <input
                    type="text"
                    list="model-list"
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 focus:border-amber-600 focus:outline-none"
                    placeholder="e.g. Nexon, Altroz, Common"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  />
                  <datalist id="model-list">
                    {COMMON_MODELS.filter((m) => m !== 'All').map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fuel Type</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 focus:border-amber-600 focus:outline-none"
                    value={formData.fuel}
                    onChange={(e) => setFormData({ ...formData, fuel: e.target.value })}
                  >
                    {COMMON_FUELS.filter((f) => f !== 'All').map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Service Type</label>
                <input
                  type="text"
                  list="service-type-list"
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 focus:border-amber-600 focus:outline-none"
                  placeholder="e.g. Paid Service, First Free Service, Running Repairs"
                  value={formData.service_type}
                  onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
                />
                <datalist id="service-type-list">
                  {COMMON_SERVICE_TYPES.filter((st) => st !== 'All').map((st) => (
                    <option key={st} value={st} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">Part Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full rounded-lg border border-emerald-300 bg-white p-2 font-mono font-bold text-emerald-800 text-xs focus:border-emerald-600 focus:outline-none"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label className="block font-bold text-purple-900 mb-1">Labour Charge (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full rounded-lg border border-purple-300 bg-white p-2 font-mono font-bold text-purple-800 text-xs focus:border-purple-600 focus:outline-none"
                    value={formData.labour}
                    onChange={(e) => setFormData({ ...formData, labour: Number(e.target.value) || 0 })}
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between border-t border-amber-200 pt-2 text-xs font-bold text-amber-950">
                  <span>Estimated Total (Part + Labour):</span>
                  <span className="font-mono text-sm text-amber-900 font-extrabold">
                    ₹{(Number(formData.price || 0) + Number(formData.labour || 0)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null)
                    setIsAddModalOpen(false)
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-700 px-5 py-2 font-bold text-white shadow-md hover:bg-amber-800 transition"
                >
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
