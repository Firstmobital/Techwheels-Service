import { useEffect, useMemo, useState } from 'react'
import {
  getPartsPricing,
  hydrateMasterPricingFromDb,
  type PartPricingItem,
} from '../lib/partsPricing'
import {
  CATALOGUE_FUELS,
  CATALOGUE_MAKES,
  DEFAULT_CATALOGUE_MAKE,
  canonicalizeMake,
  canonicalizeRequirement,
  type CatalogueFuel,
  type CatalogueMake,
} from '../lib/catalogueIdentity'
import {
  fetchServiceAdvisorEstimate,
  resolveSaEstimateContext,
  totalsFromEstimateLines,
  upsertServiceAdvisorEstimate,
  type ServiceAdvisorEstimateLine,
} from '../lib/api/serviceAdvisorEstimates'
import type { ReceptionEntryRow } from '../lib/api/reception'
import { openServiceAdvisorEstimatePrint } from '../lib/printServiceAdvisorEstimate'

interface ServiceAdvisorEstimateModalProps {
  isOpen: boolean
  onClose: () => void
  row: ReceptionEntryRow | null
  serviceType: string
  onSaved?: (receptionEntryId: number) => void
}

function lineFromCatalogue(item: PartPricingItem): ServiceAdvisorEstimateLine {
  return {
    catalogue_id: item.id,
    service_name: item.service_name,
    requirement: canonicalizeRequirement(item.requirement),
    price: Number(item.price) || 0,
    labour: Number(item.labour) || 0,
    quantity: 1,
  }
}

export function ServiceAdvisorEstimateModal({
  isOpen,
  onClose,
  row,
  serviceType,
  onSaved,
}: ServiceAdvisorEstimateModalProps) {
  const [model, setModel] = useState('')
  const [fuel, setFuel] = useState<CatalogueFuel | ''>('')
  const [make, setMake] = useState<CatalogueMake>(DEFAULT_CATALOGUE_MAKE)
  const [lockedType, setLockedType] = useState('')
  const [lines, setLines] = useState<ServiceAdvisorEstimateLine[]>([])
  const [catalogue, setCatalogue] = useState<PartPricingItem[]>([])
  const [addSearch, setAddSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [hasSavedDraft, setHasSavedDraft] = useState(false)

  useEffect(() => {
    if (!isOpen || !row) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setShowAdd(false)
    setAddSearch('')
    setHasSavedDraft(false)

    void (async () => {
      try {
        await hydrateMasterPricingFromDb()
        const context = await resolveSaEstimateContext(row, serviceType)
        if (cancelled) return
        if (!context.model) {
          setError('This row has no model, so the catalogue cannot be filtered.')
          setModel('')
          setFuel('')
          setMake(DEFAULT_CATALOGUE_MAKE)
          setLockedType(context.serviceType)
          setLines([])
          setCatalogue([])
          return
        }
        const existing = await fetchServiceAdvisorEstimate(row.id)
        if (cancelled) return
        const nextFuel = (existing?.fuel as CatalogueFuel | undefined) || context.fuel || ''
        const nextMake = canonicalizeMake(existing?.make || context.make)
        const nextType = existing?.service_type || context.serviceType
        setModel(context.model)
        setFuel(nextFuel)
        setMake(nextMake)
        setLockedType(nextType)
        const slice = nextFuel
          ? await getPartsPricing(context.model, nextFuel, nextType, nextMake)
          : []
        if (cancelled) return
        setCatalogue(slice)
        if (existing) {
          setHasSavedDraft(true)
          setLines(existing.items ?? [])
        } else {
          setHasSavedDraft(false)
          setLines(slice.filter((item) => canonicalizeRequirement(item.requirement) === 'Required').map(lineFromCatalogue))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to open estimate')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, row, serviceType])

  async function reloadCatalogue(nextFuel: CatalogueFuel | '', nextMake: CatalogueMake, keepLines: boolean) {
    if (!model || !nextFuel || !lockedType) {
      setCatalogue([])
      if (!keepLines) setLines([])
      return
    }
    const slice = await getPartsPricing(model, nextFuel, lockedType, nextMake)
    setCatalogue(slice)
    if (!keepLines) {
      setLines(slice.filter((item) => canonicalizeRequirement(item.requirement) === 'Required').map(lineFromCatalogue))
    }
  }

  const optionalUnadded = useMemo(() => {
    const used = new Set(
      lines
        .map((line) => Number(line.catalogue_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    )
    const q = addSearch.trim().toLowerCase()
    return catalogue.filter((item) => {
      if (canonicalizeRequirement(item.requirement) !== 'Optional') return false
      if (used.has(item.id)) return false
      if (q && !item.service_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalogue, lines, addSearch])

  const totals = totalsFromEstimateLines(lines)

  async function persistEstimate(): Promise<boolean> {
    if (!row) return false
    if (!model) {
      setError('Model is required')
      return false
    }
    if (!fuel) {
      setError('Select vehicle fuel before saving')
      return false
    }
    setSaving(true)
    setError(null)
    try {
      await upsertServiceAdvisorEstimate({
        reception_entry_id: row.id,
        dealer_code: row.dealer_code,
        model,
        fuel,
        make,
        service_type: lockedType,
        items: lines,
      })
      setHasSavedDraft(true)
      onSaved?.(row.id)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save estimate')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    await persistEstimate()
  }

  async function handlePrint() {
    if (!row) return
    setPrinting(true)
    try {
      const saved = await persistEstimate()
      if (!saved || !fuel) return
      openServiceAdvisorEstimatePrint({
        row,
        model,
        fuel,
        make,
        serviceType: lockedType,
        items: lines,
        partsTotal: totals.parts_total,
        labourTotal: totals.labour_total,
        grandTotal: totals.grand_total,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to print estimate')
    } finally {
      setPrinting(false)
    }
  }

  if (!isOpen || !row) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Create Estimate</h2>
            <p className="mt-1 text-xs text-gray-500">
              {row.reg_number} · Required items are added by default. Add Item is for Optional catalogue rows.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-3 text-xs">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">Model {model || '—'}</span>
          <label className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
            Fuel
            <select
              value={fuel}
              onChange={(e) => {
                const next = e.target.value as CatalogueFuel | ''
                setFuel(next)
                void reloadCatalogue(next, make, hasSavedDraft)
              }}
              className="bg-transparent font-semibold outline-none"
            >
              <option value="">Select</option>
              {CATALOGUE_FUELS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800">
            Make
            <select
              value={make}
              onChange={(e) => {
                const next = canonicalizeMake(e.target.value)
                setMake(next)
                void reloadCatalogue(fuel, next, hasSavedDraft)
              }}
              className="bg-transparent font-semibold outline-none"
            >
              {CATALOGUE_MAKES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <span className="rounded-full bg-purple-50 px-2.5 py-1 font-semibold text-purple-800">
            {lockedType || 'No service type'}
          </span>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-gray-500">Loading catalogue…</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">{lines.length} item{lines.length === 1 ? '' : 's'}</p>
                <button
                  type="button"
                  onClick={() => setShowAdd((open) => !open)}
                  disabled={!fuel}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  + Add Item
                </button>
              </div>

              {showAdd && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <input
                    type="text"
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search Optional items for this vehicle…"
                    className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
                  />
                  {optionalUnadded.length === 0 ? (
                    <p className="text-xs text-gray-500">No Optional items left for this Model + Fuel + Make + Service Type.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                      {optionalUnadded.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
                          <span>
                            <strong>{item.service_name}</strong>
                            <span className="ml-2 text-gray-500">
                              ₹{(item.price + item.labour).toLocaleString('en-IN')}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setLines((prev) => [...prev, lineFromCatalogue(item)])}
                            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800"
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {lines.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {fuel
                    ? 'No Required items for this vehicle. Use Add Item for Optional catalogue rows.'
                    : 'Select Fuel to load Required items.'}
                </p>
              ) : (
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2">Flag</th>
                      <th className="px-2 py-2 text-right">Part</th>
                      <th className="px-2 py-2 text-right">Labour</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={`${line.catalogue_id ?? line.service_name}-${index}`} className="border-b border-gray-100">
                        <td className="px-2 py-2 font-semibold text-gray-900">{line.service_name}</td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              line.requirement === 'Required'
                                ? 'rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800'
                                : 'rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700'
                            }
                          >
                            {line.requirement}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono">₹{line.price.toLocaleString('en-IN')}</td>
                        <td className="px-2 py-2 text-right font-mono">₹{line.labour.toLocaleString('en-IN')}</td>
                        <td className="px-2 py-2 text-right font-mono font-bold">
                          ₹{(line.price + line.labour).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                            className="text-rose-700 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3 text-xs">
          <div className="font-semibold text-gray-700">
            Parts ₹{totals.parts_total.toLocaleString('en-IN')} · Labour ₹{totals.labour_total.toLocaleString('en-IN')} ·{' '}
            <span className="text-amber-900">Total ₹{totals.grand_total.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={saving || printing || loading || !fuel || !model || lines.length === 0}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-1.5 font-bold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {printing ? 'Opening…' : hasSavedDraft ? 'Print' : 'Save & Print'}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading || !fuel || !model}
              className="rounded-lg bg-amber-700 px-4 py-1.5 font-bold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
