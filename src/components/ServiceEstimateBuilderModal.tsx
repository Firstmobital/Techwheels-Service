import { useState, useEffect, useMemo } from 'react'
import { ALL_PARTS_PRICING, addPartPricingItem, type PartPricingItem } from '../lib/partsPricing'
import { supabase } from '../lib/supabase'
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
  model?: string
  serviceType?: string
  fuelType?: string
  problemDescription?: string
  category?: string
  complaintId?: number
  onEstimateSent?: () => void
}

/**
 * Finds matching standard service checklist items from master pricing catalogue
 * based on vehicle model & service type (e.g., Altroz + Third Free Service).
 */
function getMatchingStandardItems(model: string, serviceType: string): EstimateItem[] {
  const normModel = (model || '').trim().toLowerCase()
  const normType = (serviceType || '').trim().toLowerCase()
  if (!normType || normType === 'general service' || normType === 'general') return []

  // Service type keyword matching
  const is1st = normType.includes('first') || normType.includes('1st') || normType.includes('1 st')
  const is2nd = normType.includes('second') || normType.includes('2nd') || normType.includes('2 nd')
  const is3rd = normType.includes('third') || normType.includes('3rd') || normType.includes('3 rd')
  const is4th = normType.includes('fourth') || normType.includes('4th') || normType.includes('4 th')
  const isPaid = normType.includes('paid') && !is1st && !is2nd && !is3rd && !is4th
  const isRunning = normType.includes('running') || normType.includes('repair')

  const matched = ALL_PARTS_PRICING.filter((item) => {
    const itemModel = (item.model || '').toLowerCase()
    const itemType = (item.service_type || '').toLowerCase()

    // Model check
    const modelMatches =
      !normModel ||
      normModel === 'all' ||
      itemModel === 'all' ||
      itemModel.includes(normModel) ||
      normModel.includes(itemModel)

    if (!modelMatches) return false

    // Service type check
    if (is1st) return itemType.includes('first') || itemType.includes('1st')
    if (is2nd) return itemType.includes('second') || itemType.includes('2nd')
    if (is3rd) return itemType.includes('third') || itemType.includes('3rd')
    if (is4th) return itemType.includes('fourth') || itemType.includes('4th')
    if (isPaid) return itemType.includes('paid')
    if (isRunning) return itemType.includes('running') || itemType.includes('repair')

    return itemType.includes(normType) || normType.includes(itemType)
  })

  const result: EstimateItem[] = []
  const now = Date.now()
  matched.forEach((m, idx) => {
    if (m.price > 0) {
      result.push({
        id: `auto-part-${m.id}-${now}-${idx}`,
        type: 'part',
        description: `${m.service_name} (${m.model || model || 'Standard'})`,
        quantity: 1,
        unit_price: m.price,
        total: m.price,
      })
    }
    if (m.labour > 0) {
      result.push({
        id: `auto-labour-${m.id}-${now}-${idx}`,
        type: 'labour',
        description: `Labour: ${m.service_name} (${m.model || model || 'Standard'})`,
        quantity: 1,
        unit_price: m.labour,
        total: m.labour,
      })
    }
  })

  return result
}

export function ServiceEstimateBuilderModal({
  isOpen,
  onClose,
  vehicleReg,
  customerName = 'Customer',
  customerPhone = '',
  model = '',
  serviceType = '',
  fuelType = 'Petrol',
  problemDescription = '',
  category = 'General',
  complaintId,
  onEstimateSent,
}: ServiceEstimateBuilderModalProps) {
  const [activeModel, setActiveModel] = useState(model || 'Altroz')
  const [activeServiceType, setActiveServiceType] = useState(serviceType || 'Third Free Service')
  const [activeFuel, setActiveFuel] = useState(fuelType || 'Petrol')

  const [estimateNo, setEstimateNo] = useState(
    () => `EST-${vehicleReg.replace(/[^A-Z0-9]/g, '')}-${complaintId ? `C${complaintId}` : Date.now().toString().slice(-4)}`
  )
  const [items, setItems] = useState<EstimateItem[]>([])
  const [modelFilter, setModelFilter] = useState('All')
  const [fuelFilter, setFuelFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [discount, setDiscount] = useState<number>(0)
  const [isSaving, setIsSaving] = useState(false)
  const [estimateStatus, setEstimateStatus] = useState<'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Supplementary_Pending'>('Draft')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  // Custom Item Form States (Part + Labour = Total & Master Catalogue Save)
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [customDesc, setCustomDesc] = useState('')
  const [customPartPrice, setCustomPartPrice] = useState<number>(0)
  const [customLabourPrice, setCustomLabourPrice] = useState<number>(0)
  const [customFuel, setCustomFuel] = useState<string>('All')
  const [saveToMasterCatalogue, setSaveToMasterCatalogue] = useState<boolean>(true)
  const [catalogueNotice, setCatalogueNotice] = useState<string | null>(null)

  // Catalogue Row Price Edits (Advisor price customizer)
  const [rowPriceEdits, setRowPriceEdits] = useState<Record<number, { price?: number; labour?: number }>>({})

  // Fetch reception entry details if model / serviceType not fully provided
  useEffect(() => {
    if (!isOpen || !vehicleReg) return

    async function fetchReceptionDetails() {
      try {
        const { data } = await supabase
          .from('service_reception_entries')
          .select('model, service_type')
          .ilike('reg_number', `%${vehicleReg.trim()}%`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (data && data.length > 0) {
          const r = data[0]
          if (r.model && !model) setActiveModel(r.model)
          if (r.service_type && !serviceType) setActiveServiceType(r.service_type)
        }
      } catch (err) {
        console.warn('Reception lookup notice:', err)
      }
    }

    void fetchReceptionDetails()
  }, [isOpen, vehicleReg, model, serviceType])

  // Sync props to state if provided
  useEffect(() => {
    if (model) {
      setActiveModel(model)
      setModelFilter(model)
    }
  }, [model])

  useEffect(() => {
    if (serviceType) setActiveServiceType(serviceType)
  }, [serviceType])

  useEffect(() => {
    if (fuelType) setActiveFuel(fuelType)
  }, [fuelType])

  // Load existing estimate or auto-populate standard items for this model & service type
  useEffect(() => {
    if (!isOpen || !vehicleReg) return

    const initialEstNo = `EST-${vehicleReg.replace(/[^A-Z0-9]/g, '')}-${complaintId ? `C${complaintId}` : Date.now().toString().slice(-4)}`
    setEstimateNo(initialEstNo)

    async function loadExisting() {
      const existing = complaintId
        ? await fetchEstimateForComplaint(complaintId, vehicleReg)
        : await fetchEstimateForVehicle(vehicleReg)

      if (existing && existing.items && existing.items.length > 0) {
        setEstimateNo(existing.estimate_no || initialEstNo)
        setItems(existing.items || [])
        setDiscount(existing.discount || 0)
        setEstimateStatus(existing.status || 'Draft')
        setRejectionReason(existing.rejection_reason || null)
      } else {
        // Auto-add standard items based on Model & Service Type
        const autoStandard = getMatchingStandardItems(activeModel, activeServiceType)
        if (autoStandard.length > 0) {
          setItems(autoStandard)
        } else {
          // Pre-populate with standard inspection recommendation
          setItems([
            {
              id: 'item-diag-01',
              type: 'labour',
              description: `Diagnostic Scan & Comprehensive Inspection (${category} Area)`,
              quantity: 1,
              unit_price: 650,
              total: 650,
            },
          ])
        }
        setDiscount(0)
        setEstimateStatus('Draft')
        setRejectionReason(null)
      }
    }

    void loadExisting()
  }, [isOpen, vehicleReg, complaintId, category, activeModel, activeServiceType])

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
    const q = searchQuery.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const selModel = modelFilter.trim().toLowerCase()
    const selFuel = fuelFilter.trim().toLowerCase()

    // Model match
    if (selModel !== 'all' && selModel) {
      const itemModel = (item.model || '').trim().toLowerCase()
      if (itemModel && itemModel !== 'all') {
        const models = itemModel.split(/[\/,|+]/).map((m) => m.trim())
        if (itemModel !== selModel && !models.includes(selModel) && !itemModel.includes(selModel)) {
          return false
        }
      }
    }

    // Fuel match
    if (selFuel !== 'all' && selFuel) {
      const itemFuel = (item.fuel || '').trim().toLowerCase()
      if (itemFuel && itemFuel !== 'all') {
        const fuels = itemFuel.split(/[\/,|+]/).map((f) => f.trim())
        if (itemFuel !== selFuel && !fuels.includes(selFuel)) {
          return false
        }
      }
    }

    // Search query
    if (tokens.length > 0) {
      const text = `${item.service_name || ''} ${item.service_type || ''} ${item.model || ''} ${item.fuel || ''}`.toLowerCase()
      if (!tokens.every((token) => text.includes(token))) {
        return false
      }
    }

    return true
  }).slice(0, 40)

  function getItemEffectivePrices(item: PartPricingItem) {
    const overrides = rowPriceEdits[item.id]
    const price = overrides?.price !== undefined ? overrides.price : item.price
    const labour = overrides?.labour !== undefined ? overrides.labour : item.labour
    return { price: Math.max(0, price), labour: Math.max(0, labour) }
  }

  function handleAddPart(item: PartPricingItem) {
    const { price } = getItemEffectivePrices(item)
    const newItem: EstimateItem = {
      id: `part-${item.id}-${Date.now()}`,
      type: 'part',
      description: `${item.service_name} (${item.model || activeModel})`,
      quantity: 1,
      unit_price: price,
      total: price,
    }
    setItems((prev) => [...prev, newItem])
  }

  function handleAddLabour(item: PartPricingItem) {
    const { labour } = getItemEffectivePrices(item)
    const newItem: EstimateItem = {
      id: `labour-${item.id}-${Date.now()}`,
      type: 'labour',
      description: `Labour: ${item.service_name} (${item.model || activeModel})`,
      quantity: 1,
      unit_price: labour,
      total: labour,
    }
    setItems((prev) => [...prev, newItem])
  }

  function handleAddBoth(item: PartPricingItem) {
    const { price, labour } = getItemEffectivePrices(item)
    const pItem: EstimateItem = {
      id: `part-${item.id}-${Date.now()}`,
      type: 'part',
      description: `${item.service_name} (${item.model || activeModel})`,
      quantity: 1,
      unit_price: price,
      total: price,
    }
    const lItem: EstimateItem = {
      id: `labour-${item.id}-${Date.now()}`,
      type: 'labour',
      description: `Labour: ${item.service_name} (${item.model || activeModel})`,
      quantity: 1,
      unit_price: labour,
      total: labour,
    }
    setItems((prev) => [...prev, pItem, lItem])
  }

  async function handleAddCustom() {
    if (!customDesc.trim()) {
      alert('Please enter a description for the custom item.')
      return
    }
    const partP = Math.max(0, Number(customPartPrice) || 0)
    const labourP = Math.max(0, Number(customLabourPrice) || 0)
    if (partP === 0 && labourP === 0) {
      alert('Please enter Part Price or Labour Price (greater than 0).')
      return
    }

    const newItems: EstimateItem[] = []
    const now = Date.now()

    if (partP > 0) {
      newItems.push({
        id: `custom-part-${now}`,
        type: 'part',
        description: `${customDesc.trim()} (${activeModel})`,
        quantity: 1,
        unit_price: partP,
        total: partP,
      })
    }

    if (labourP > 0) {
      newItems.push({
        id: `custom-labour-${now}`,
        type: 'labour',
        description: `Labour: ${customDesc.trim()} (${activeModel})`,
        quantity: 1,
        unit_price: labourP,
        total: labourP,
      })
    }

    setItems((prev) => [...prev, ...newItems])

    // Save to master catalogue if checked
    if (saveToMasterCatalogue) {
      try {
        await addPartPricingItem({
          service_name: customDesc.trim(),
          model: activeModel !== 'All' ? activeModel : 'Altroz',
          fuel: customFuel,
          service_type: activeServiceType || 'Running Repairs',
          price: partP,
          labour: labourP,
          make: 'BS6',
          requirement: 'Standard',
        })
        setCatalogueNotice(`✓ Added "${customDesc.trim()}" to Master Catalogue for ${activeModel}!`)
        setTimeout(() => setCatalogueNotice(null), 3500)
      } catch (err: any) {
        console.warn('Save to catalogue note:', err)
      }
    }

    setCustomDesc('')
    setCustomPartPrice(0)
    setCustomLabourPrice(0)
    setShowCustomItem(false)
  }

  function handleAutoFillServiceChecklist() {
    const autoItems = getMatchingStandardItems(activeModel, activeServiceType)
    if (autoItems.length === 0) {
      alert(`No pre-defined checklist items found for ${activeModel} · ${activeServiceType}.`)
      return
    }
    setItems((prev) => {
      // Append non-duplicate items
      const existingDesc = new Set(prev.map((i) => i.description.toLowerCase()))
      const toAdd = autoItems.filter((i) => !existingDesc.has(i.description.toLowerCase()))
      if (toAdd.length === 0) {
        return autoItems
      }
      return [...prev, ...toAdd]
    })
    setCatalogueNotice(`✓ Loaded ${autoItems.length} standard items for ${activeModel} · ${activeServiceType}!`)
    setTimeout(() => setCatalogueNotice(null), 3000)
  }

  function handleUpdateQty(id: string, delta: number) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          const newQty = Math.max(1, it.quantity + delta)
          return { ...it, quantity: newQty, total: newQty * it.unit_price }
        }
        return it
      })
    )
  }

  function handleUpdateUnitPrice(id: string, newPrice: number) {
    const p = Math.max(0, newPrice)
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          return { ...it, unit_price: p, total: p * it.quantity }
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
        model: activeModel,
        fuel: activeFuel,
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
      alert('Failed to send estimate. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const modelOptions = useMemo(() => {
    const defaultModels = ['All', 'Altroz', 'Tiago', 'Nexon', 'Punch', 'Tigor', 'Curvv', 'Harrier', 'Safari']
    if (activeModel && !defaultModels.includes(activeModel)) {
      return [...defaultModels, activeModel]
    }
    return defaultModels
  }, [activeModel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex h-[92vh] max-h-[880px] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
        
        {/* ── HEADER ── */}
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
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* ── CUSTOMER & VEHICLE DETAILS BANNER (Model & Service Type Prominently Displayed) ── */}
        <div className="border-b border-amber-200 bg-amber-50/90 px-6 py-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-base">🚨</span>
            <div>
              <span className="font-bold text-amber-900">Customer Reported Problem: </span>
              <span className="font-medium text-amber-800">{problemDescription || 'General checkup and service requested.'}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div>
              <strong>Customer:</strong> {customerName} ({customerPhone || '—'})
            </div>
            <div className="flex items-center gap-1">
              <strong>Model:</strong>{' '}
              <span className="rounded bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 border border-indigo-200">
                {activeModel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <strong>Service Type:</strong>{' '}
              <span className="rounded bg-blue-100 text-blue-900 font-bold px-2 py-0.5 border border-blue-200">
                {activeServiceType}
              </span>
            </div>
            <div>
              <strong>Category:</strong> <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold">{category}</span>
            </div>
          </div>
        </div>

        {/* Global Toast Notice */}
        {catalogueNotice && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-6 py-2 flex items-center justify-between">
            <span>{catalogueNotice}</span>
            <button onClick={() => setCatalogueNotice(null)} className="text-white hover:text-emerald-200">✕</button>
          </div>
        )}

        {/* ── MAIN CONTENT GRID ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* ── LEFT: Catalogue Selector (7 Cols) ── */}
          <div className="lg:col-span-7 flex flex-col border-r border-gray-200 bg-gray-50/50 p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-700 tracking-wide">
                  🏷️ Parts & Labour Catalogue (926 Master Items)
                </h3>
                <p className="text-[11px] text-gray-500">Pick replacement parts and labour operations</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFillServiceChecklist}
                  title="Auto-fill standard parts and labour checklist for this model & service type"
                  className="rounded-lg bg-emerald-50 border border-emerald-300 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <span>⚡ Auto-Fill {activeServiceType}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomItem(!showCustomItem)}
                  className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer shadow-xs"
                >
                  {showCustomItem ? '✕ Close Form' : '+ Custom Item'}
                </button>
              </div>
            </div>

            {/* ── CUSTOM ITEM & MASTER CATALOGUE BUILDER (Part + Labour = Total) ── */}
            {showCustomItem && (
              <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/90 p-3.5 text-xs space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-black text-indigo-950 flex items-center gap-1.5">
                    <span>✨</span>
                    <span>Add Custom Part & Labour (with Total calculation)</span>
                  </div>
                  <span className="rounded bg-indigo-200 text-indigo-900 font-bold px-2 py-0.5 text-[11px]">
                    Target Model: {activeModel}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <input
                    type="text"
                    className="md:col-span-5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
                    placeholder="Description (e.g. Bumper Bracket & Fitting)"
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                  />

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-600 block mb-0.5">Part ₹</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-mono font-bold text-emerald-800"
                      placeholder="Part ₹"
                      value={customPartPrice || ''}
                      onChange={(e) => setCustomPartPrice(Math.max(0, Number(e.target.value)))}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-600 block mb-0.5">Labour ₹</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-mono font-bold text-purple-800"
                      placeholder="Labour ₹"
                      value={customLabourPrice || ''}
                      onChange={(e) => setCustomLabourPrice(Math.max(0, Number(e.target.value)))}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-[10px] font-bold text-gray-600 block mb-0.5">Fuel Type</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                      value={customFuel}
                      onChange={(e) => setCustomFuel(e.target.value)}
                    >
                      <option value="All">All Fuels</option>
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="EV">EV</option>
                    </select>
                  </div>
                </div>

                {/* Calculation breakdown & Action row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-200/60">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-white border border-indigo-200 px-3 py-1 font-mono text-xs text-indigo-950 font-bold">
                      Part: ₹{customPartPrice || 0} + Labour: ₹{customLabourPrice || 0} = <span className="text-blue-700 font-extrabold text-[13px]">Total: ₹{(Number(customPartPrice) || 0) + (Number(customLabourPrice) || 0)}</span>
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-900 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={saveToMasterCatalogue}
                        onChange={(e) => setSaveToMasterCatalogue(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Save to Master Catalogue for {activeModel} (Reuse anytime)</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCustom}
                    className="rounded-lg bg-indigo-600 px-4 py-1.5 font-bold text-white hover:bg-indigo-700 shadow-sm cursor-pointer"
                  >
                    + Add to Estimate
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
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>Model: {m}</option>
                ))}
              </select>
              <select
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                value={fuelFilter}
                onChange={(e) => setFuelFilter(e.target.value)}
              >
                {['All', 'Petrol', 'Diesel', 'CNG', 'EV'].map((f) => (
                  <option key={f} value={f}>Fuel: {f}</option>
                ))}
              </select>
            </div>

            {/* Scrollable Catalogue Table with Editable Price/Labour inputs */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-100 text-[10px] font-bold uppercase text-gray-600 border-b border-gray-200 z-10">
                  <tr>
                    <th className="px-3 py-2">Service / Part Name</th>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2 text-right">Part ₹</th>
                    <th className="px-2 py-2 text-right">Labour ₹</th>
                    <th className="px-3 py-2 text-center">Add Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCatalogue.map((item) => {
                    const { price, labour } = getItemEffectivePrices(item)
                    return (
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
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <input
                            type="number"
                            className="w-16 text-right rounded border border-gray-200 bg-emerald-50/50 px-1.5 py-0.5 text-xs font-mono font-bold text-emerald-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
                            value={price}
                            onChange={(e) =>
                              setRowPriceEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], price: Math.max(0, Number(e.target.value)) },
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <input
                            type="number"
                            className="w-16 text-right rounded border border-gray-200 bg-purple-50/50 px-1.5 py-0.5 text-xs font-mono font-semibold text-purple-800 focus:bg-white focus:border-purple-500 focus:outline-none"
                            value={labour}
                            onChange={(e) =>
                              setRowPriceEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], labour: Math.max(0, Number(e.target.value)) },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <div className="inline-flex gap-1">
                            {price > 0 && (
                              <button
                                type="button"
                                onClick={() => handleAddPart(item)}
                                title="Add Part only"
                                className="rounded bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                              >
                                +Part
                              </button>
                            )}
                            {labour > 0 && (
                              <button
                                type="button"
                                onClick={() => handleAddLabour(item)}
                                title="Add Labour only"
                                className="rounded bg-purple-50 border border-purple-300 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 hover:bg-purple-100 cursor-pointer"
                              >
                                +Labour
                              </button>
                            )}
                            {price > 0 && labour > 0 && (
                              <button
                                type="button"
                                onClick={() => handleAddBoth(item)}
                                title="Add Both Part & Labour"
                                className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-blue-700 cursor-pointer"
                              >
                                +Both
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── RIGHT: Live Estimate Quotation (5 Cols) ── */}
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

            {/* Line items list with inline price & qty editing */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 p-2 space-y-2">
              {items.length === 0 ? (
                <div className="py-16 text-center text-xs text-gray-400">
                  No parts or labour added yet. Select from the catalogue on the left.
                </div>
              ) : (
                items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-xs hover:border-gray-200 shadow-xs"
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

                      {/* Inline Editable Unit Price */}
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-mono mt-1">
                        <span>₹</span>
                        <input
                          type="number"
                          className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs font-mono font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                          value={it.unit_price}
                          onChange={(e) => handleUpdateUnitPrice(it.id, Number(e.target.value))}
                        />
                        <span>× {it.quantity} =</span>
                        <strong className="text-gray-900 font-bold">₹{it.total.toLocaleString()}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(it.id, -1)}
                        className="h-6 w-6 rounded bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-bold text-xs">{it.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(it.id, 1)}
                        className="h-6 w-6 rounded bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300 cursor-pointer"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="ml-1 text-xs text-red-500 hover:text-red-700 cursor-pointer"
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
                className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{isSaving ? '⏳ Saving…' : '🚀 Send Estimate to Customer for Approval'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
