import { useState, useEffect } from 'react'
import { ALL_PARTS_PRICING, type PartPricingItem } from '../lib/partsPricing'
import {
  saveAndSendEstimate,
  fetchEstimateForComplaint,
  fetchEstimateForVehicle,
  type CustomerEstimateRecord,
  type EstimateItem,
} from '../lib/estimates'

interface ServiceEstimateBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  vehicleReg: string
  customerName?: string
  customerPhone?: string
  problemDescription?: string
  category?: string
  complaintId?: number
  onEstimateSent?: () => void
}

export function ServiceEstimateBuilderModal({
  isOpen,
  onClose,
  vehicleReg,
  customerName = 'Customer',
  customerPhone = '',
  problemDescription = '',
  category = 'General',
  complaintId,
  onEstimateSent,
}: ServiceEstimateBuilderModalProps) {
  const [estimateNo, setEstimateNo] = useState(
    () => `EST-${vehicleReg.replace(/[^A-Z0-9]/g, '')}-${complaintId ? `C${complaintId}` : Date.now().toString().slice(-4)}`
  )
  const [items, setItems] = useState<EstimateItem[]>([])
  const [modelFilter, setModelFilter] = useState('All')
  const [fuelFilter, setFuelFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [discount, setDiscount] = useState<number>(0)
  const [isSaving, setIsSaving] = useState(false)
  const [estimateStatus, setEstimateStatus] = useState<'Draft' | 'Sent' | 'Approved' | 'Rejected'>('Draft')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [customDesc, setCustomDesc] = useState('')
  const [customType, setCustomType] = useState<'part' | 'labour'>('part')
  const [customPrice, setCustomPrice] = useState<number>(500)

  const portalUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5174` : 'http://localhost:5174'
  const customerLink = `${portalUrl}/?reg=${vehicleReg.trim().toUpperCase()}`

  // Load existing estimate if one already exists for this specific complaint/vehicle
  useEffect(() => {
    if (!isOpen || !vehicleReg) return

    const initialEstNo = `EST-${vehicleReg.replace(/[^A-Z0-9]/g, '')}-${complaintId ? `C${complaintId}` : Date.now().toString().slice(-4)}`
    setEstimateNo(initialEstNo)

    async function loadExisting() {
      const existing = complaintId
        ? await fetchEstimateForComplaint(complaintId, vehicleReg)
        : await fetchEstimateForVehicle(vehicleReg)

      if (existing) {
        setEstimateNo(existing.estimate_no || initialEstNo)
        setItems(existing.items || [])
        setDiscount(existing.discount || 0)
        setEstimateStatus(existing.status || 'Draft')
        setRejectionReason(existing.rejection_reason || null)
      } else {
        // Pre-populate with a standard starter recommendation based on category
        setItems([
          {
            id: 'item-diag-01',
            type: 'labour',
            description: `Diagnostic Scan & Inspection (${category} Area)`,
            quantity: 1,
            unit_price: 650,
            total: 650,
          },
        ])
        setDiscount(0)
        setEstimateStatus('Draft')
        setRejectionReason(null)
      }
    }

    void loadExisting()
  }, [isOpen, vehicleReg, complaintId, category])

  // Listen for real-time customer approval/rejection updates
  useEffect(() => {
    function handleEstimateUpdate(e: Event) {
      const customEv = e as CustomEvent<CustomerEstimateRecord>
      if (customEv.detail && customEv.detail.vehicle_registration_number === vehicleReg) {
        setEstimateStatus(customEv.detail.status)
        if (customEv.detail.rejection_reason) {
          setRejectionReason(customEv.detail.rejection_reason)
        }
      }
    }

    window.addEventListener('techwheels_estimate_updated', handleEstimateUpdate)
    return () => {
      window.removeEventListener('techwheels_estimate_updated', handleEstimateUpdate)
    }
  }, [vehicleReg])

  if (!isOpen) return null

  // Filter catalogue items
  const filteredCatalogue = ALL_PARTS_PRICING.filter((item: PartPricingItem) => {
    const matchSearch =
      !searchQuery ||
      item.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.service_type.toLowerCase().includes(searchQuery.toLowerCase())
    const matchModel = modelFilter === 'All' || item.model.toLowerCase() === modelFilter.toLowerCase()
    const matchFuel = fuelFilter === 'All' || item.fuel.toLowerCase() === fuelFilter.toLowerCase()
    return matchSearch && matchModel && matchFuel
  }).slice(0, 30)

  function handleAddPart(item: PartPricingItem) {
    const newItem: EstimateItem = {
      id: `part-${item.id}-${Date.now()}`,
      type: 'part',
      description: `${item.service_name} (${item.model})`,
      quantity: 1,
      unit_price: item.price,
      total: item.price,
    }
    setItems((prev) => [...prev, newItem])
  }

  function handleAddLabour(item: PartPricingItem) {
    const newItem: EstimateItem = {
      id: `labour-${item.id}-${Date.now()}`,
      type: 'labour',
      description: `Labour: ${item.service_name} (${item.model})`,
      quantity: 1,
      unit_price: item.labour,
      total: item.labour,
    }
    setItems((prev) => [...prev, newItem])
  }

  function handleAddBoth(item: PartPricingItem) {
    const pItem: EstimateItem = {
      id: `part-${item.id}-${Date.now()}`,
      type: 'part',
      description: `${item.service_name} (${item.model})`,
      quantity: 1,
      unit_price: item.price,
      total: item.price,
    }
    const lItem: EstimateItem = {
      id: `labour-${item.id}-${Date.now()}`,
      type: 'labour',
      description: `Labour: ${item.service_name} (${item.model})`,
      quantity: 1,
      unit_price: item.labour,
      total: item.labour,
    }
    setItems((prev) => [...prev, pItem, lItem])
  }

  function handleAddCustom() {
    if (!customDesc.trim()) return
    const newItem: EstimateItem = {
      id: `custom-${Date.now()}`,
      type: customType,
      description: customDesc.trim(),
      quantity: 1,
      unit_price: Math.max(0, customPrice),
      total: Math.max(0, customPrice),
    }
    setItems((prev) => [...prev, newItem])
    setCustomDesc('')
    setShowCustomItem(false)
  }

  function handleUpdateQty(id: string, delta: number) {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.id === id) {
            const newQty = Math.max(1, it.quantity + delta)
            return { ...it, quantity: newQty, total: newQty * it.unit_price }
          }
          return it
        })
    )
  }

  function handleRemoveItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  // Compute totals
  const partsTotal = items.filter((i) => i.type === 'part').reduce((sum, i) => sum + i.total, 0)
  const labourTotal = items.filter((i) => i.type === 'labour').reduce((sum, i) => sum + i.total, 0)
  const subtotal = partsTotal + labourTotal
  const taxableAmount = Math.max(0, subtotal - discount)
  const gstTax = Math.round(taxableAmount * 0.18)
  const grandTotal = taxableAmount + gstTax

  async function handleSendEstimate() {
    if (items.length === 0) {
      alert('Please add at least one part or labour item to the estimate.')
      return
    }

    setIsSaving(true)
    try {
      const payload: CustomerEstimateRecord = {
        estimate_no: estimateNo,
        vehicle_registration_number: vehicleReg,
        complaint_id: complaintId || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        model: modelFilter !== 'All' ? modelFilter : 'Tata Vehicle',
        fuel: fuelFilter !== 'All' ? fuelFilter : 'Petrol',
        service_advisor_name: 'AMAN GUPTA',
        branch: 'Sitapura Workshop',
        items,
        subtotal,
        discount,
        gst_tax: gstTax,
        grand_total: grandTotal,
        status: 'Sent',
        rejection_reason: null,
      }

      await saveAndSendEstimate(payload)
      setEstimateStatus('Sent')
      if (onEstimateSent) onEstimateSent()
    } catch (e) {
      console.error('Error sending estimate:', e)
    } finally {
      setIsSaving(false)
    }
  }

  function handleCopyLink() {
    void navigator.clipboard.writeText(customerLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex h-[92vh] max-h-[860px] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold shadow-md">
              📝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Service Estimate & Parts Quotation Builder</h2>
                <span className="font-mono rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300 border border-blue-400/30">
                  {vehicleReg}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                    estimateStatus === 'Approved'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : estimateStatus === 'Rejected'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : estimateStatus === 'Sent'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                  }`}
                >
                  {estimateStatus === 'Approved'
                    ? '✅ Customer Approved'
                    : estimateStatus === 'Rejected'
                    ? '❌ Customer Rejected'
                    : estimateStatus === 'Sent'
                    ? '⏳ Sent · Awaiting Customer Approval'
                    : '📝 Draft Estimate'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Select parts & labour from Tata catalogue (926 items), create quotation and send directly to customer app
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Customer Problem Banner */}
        <div className="border-b border-amber-200 bg-amber-50/90 px-6 py-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-base">🚨</span>
            <div>
              <span className="font-bold text-amber-900">Customer Reported Problem: </span>
              <span className="font-medium text-amber-800">{problemDescription || 'General checkup and repair requested.'}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div>
              <strong>Customer:</strong> {customerName} ({customerPhone || '—'})
            </div>
            <div>
              <strong>Category:</strong> <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold">{category}</span>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT: Catalogue Selector (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col border-r border-gray-200 bg-gray-50/50 p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-700 tracking-wide">
                  🏷️ Parts & Labour Catalogue (926 Master Items)
                </h3>
                <p className="text-[11px] text-gray-500">Pick replacement parts and labour operations</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomItem(!showCustomItem)}
                className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
              >
                + Custom Item
              </button>
            </div>

            {/* Custom Item Quick Form */}
            {showCustomItem && (
              <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs space-y-2">
                <div className="font-bold text-indigo-950">Add Custom Part or Labour</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    className="flex-1 min-w-[180px] rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                    placeholder="Description (e.g. ECM Flashing / Bumper Bracket)"
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                  />
                  <select
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value as 'part' | 'labour')}
                  >
                    <option value="part">Part</option>
                    <option value="labour">Labour</option>
                  </select>
                  <input
                    type="number"
                    className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-mono"
                    placeholder="Price ₹"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustom}
                    className="rounded bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text"
                className="flex-1 min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                placeholder="Search part / service name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              >
                {['All', 'Altroz', 'Tiago', 'Nexon', 'Punch', 'Tigor', 'Curvv', 'Harrier', 'Safari'].map((m) => (
                  <option key={m} value={m}>Model: {m}</option>
                ))}
              </select>
              <select
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
                value={fuelFilter}
                onChange={(e) => setFuelFilter(e.target.value)}
              >
                {['All', 'Petrol', 'Diesel', 'CNG', 'EV'].map((f) => (
                  <option key={f} value={f}>Fuel: {f}</option>
                ))}
              </select>
            </div>

            {/* Scrollable Catalogue Table */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-100 text-[10px] font-bold uppercase text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2">Service / Part Name</th>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2 text-right">Part ₹</th>
                    <th className="px-2 py-2 text-right">Labour ₹</th>
                    <th className="px-3 py-2 text-center">Add Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCatalogue.map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50/60">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-900">{item.service_name}</div>
                        <div className="text-[10px] text-gray-400">{item.service_type}</div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                          {item.model}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {item.price > 0 ? `₹${item.price.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono font-semibold text-purple-700 whitespace-nowrap">
                        {item.labour > 0 ? `₹${item.labour.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          {item.price > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAddPart(item)}
                              title="Add Part only"
                              className="rounded bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                            >
                              +Part
                            </button>
                          )}
                          {item.labour > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAddLabour(item)}
                              title="Add Labour only"
                              className="rounded bg-purple-50 border border-purple-300 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 hover:bg-purple-100"
                            >
                              +Labour
                            </button>
                          )}
                          {item.price > 0 && item.labour > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAddBoth(item)}
                              title="Add Both Part & Labour"
                              className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-blue-700"
                            >
                              +Both
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: Live Estimate Quotation (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col bg-white p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-700 tracking-wide">
                  🧾 Estimate Quotation ({items.length} Items)
                </h3>
                <p className="text-[11px] text-gray-500">Quotation #{estimateNo}</p>
              </div>
              <span className="font-mono text-sm font-bold text-blue-700">
                ₹{grandTotal.toLocaleString()}
              </span>
            </div>

            {/* Line items list */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 p-2 space-y-2">
              {items.length === 0 ? (
                <div className="py-16 text-center text-xs text-gray-400">
                  No parts or labour added yet. Select from the catalogue on the left.
                </div>
              ) : (
                items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2 text-xs hover:border-gray-200"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            it.type === 'part' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {it.type}
                        </span>
                        <span className="font-semibold text-gray-900 truncate">{it.description}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                        ₹{it.unit_price} × {it.quantity} = <strong>₹{it.total.toLocaleString()}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(it.id, -1)}
                        className="h-6 w-6 rounded bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-bold text-xs">{it.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(it.id, 1)}
                        className="h-6 w-6 rounded bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="ml-1 text-xs text-red-500 hover:text-red-700"
                        title="Remove item"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pricing Calculation Summary */}
            <div className="mt-3 rounded-xl border border-gray-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-gray-600">
                <span>Parts Subtotal</span>
                <span className="font-mono font-medium">₹{partsTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Labour Subtotal</span>
                <span className="font-mono font-medium">₹{labourTotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700">
                <span>Special Dealership Discount</span>
                <div className="flex items-center gap-1 font-mono">
                  <span>- ₹</span>
                  <input
                    type="number"
                    className="w-16 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-right text-xs font-mono font-bold"
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST (18%)</span>
                <span className="font-mono font-medium">₹{gstTax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-gray-300 pt-1.5 text-sm font-bold text-gray-900">
                <span>Grand Total (Estimate)</span>
                <span className="font-mono text-blue-700">₹{grandTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Approval Status alert */}
            {estimateStatus === 'Approved' && (
              <div className="mt-2 rounded-lg bg-emerald-50 p-2.5 border border-emerald-200 text-xs text-emerald-900 font-bold text-center flex items-center justify-center gap-1.5">
                <span>✅</span>
                <span>Customer has Approved this estimate! Repairs are authorized.</span>
              </div>
            )}

            {estimateStatus === 'Rejected' && (
              <div className="mt-2 rounded-lg bg-rose-50 p-2.5 border border-rose-200 text-xs text-rose-900 font-medium">
                <div className="font-bold text-rose-950">❌ Estimate Rejected by Customer</div>
                <div>Reason: {rejectionReason || 'Customer requested revision.'}</div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSendEstimate}
                disabled={isSaving || items.length === 0}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>{isSaving ? '⏳ Saving…' : '🚀 Send Estimate to Customer for Approval'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 rounded-lg border border-gray-300 bg-white py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                >
                  {copiedLink ? '✓ Customer URL Copied!' : '📋 Copy Customer Approval Link'}
                </button>
                <a
                  href={`${portalUrl}/estimate?reg=${vehicleReg.trim().toUpperCase()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                >
                  Customer View ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
