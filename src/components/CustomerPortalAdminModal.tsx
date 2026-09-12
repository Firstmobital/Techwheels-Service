import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ALL_PARTS_PRICING, type PartPricingItem } from '../lib/partsPricing'

interface CustomerPortalAdminModalProps {
  isOpen: boolean
  onClose: () => void
  isAdmin?: boolean
}

interface ComplaintRecord {
  id?: number
  vehicle_registration_number: string
  customer_name: string | null
  mobile_number: string | null
  rating: number
  feedback_text: string
  service_type: string | null
  service_advisor_name: string | null
  branch: string | null
  primary_complaint_area: string | null
  complaint_date_time: string | null
  created_at?: string | null
}

export function CustomerPortalAdminModal({ isOpen, onClose, isAdmin = true }: CustomerPortalAdminModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'complaints' | 'pricing' | 'live_preview'>('overview')
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([])
  const [loadingComplaints, setLoadingComplaints] = useState(false)
  
  // Pricing filters
  const [pricingSearch, setPricingSearch] = useState('')
  const [selectedModel, setSelectedModel] = useState('All')
  const [selectedFuel, setSelectedFuel] = useState('All')

  // Search vehicle test link
  const [testRegNumber, setTestRegNumber] = useState('RJ60CH2388')
  const [copiedLink, setCopiedLink] = useState(false)

  const portalUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5174` : 'http://localhost:5174'

  useEffect(() => {
    if (!isOpen) return

    async function fetchComplaints() {
      setLoadingComplaints(true)
      try {
        const { data, error } = await supabase
          .from('post_feedback_bot_data')
          .select('*')
          .order('complaint_date_time', { ascending: false })
          .limit(50)

        if (!error && data) {
          setComplaints(data as ComplaintRecord[])
        }
      } catch (err) {
        console.warn('Failed to load complaints from post_feedback_bot_data:', err)
      } finally {
        setLoadingComplaints(false)
      }
    }

    void fetchComplaints()
  }, [isOpen])

  if (!isOpen) return null

  const filteredPricing = ALL_PARTS_PRICING.filter((item: PartPricingItem) => {
    const matchSearch =
      !pricingSearch ||
      item.service_name.toLowerCase().includes(pricingSearch.toLowerCase()) ||
      item.service_type.toLowerCase().includes(pricingSearch.toLowerCase())
    const matchModel = selectedModel === 'All' || item.model.toLowerCase() === selectedModel.toLowerCase()
    const matchFuel = selectedFuel === 'All' || item.fuel.toLowerCase() === selectedFuel.toLowerCase()
    return matchSearch && matchModel && matchFuel
  }).slice(0, 50)

  const modelsList = ['All', 'Altroz', 'Tiago', 'Nexon', 'Punch', 'Tigor', 'Curvv', 'Harrier', 'Safari']
  const fuelsList = ['All', 'Petrol', 'Diesel', 'CNG', 'EV']

  function handleCopyCustomerLink() {
    const link = `${portalUrl}/?reg=${testRegNumber.trim().toUpperCase()}`
    void navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <div className="flex h-[90vh] max-h-[820px] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold shadow-md">
              🚗
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Customer Form & Bodyshop Admin Hub</h2>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/40">
                  {isAdmin ? 'Admin Scope' : 'Advisor Scope'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Manage Customer Form submissions, review complaints, access pricing catalogue & launch customer app
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

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              📊 Overview & Share Link
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('complaints')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'complaints'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>🚨</span> Complaints / Form Submissions ({complaints.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pricing')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'pricing'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>🏷️</span> Parts & Labour Pricing (926 Items)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('live_preview')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'live_preview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>📱</span> Embedded Customer App View
            </button>
          </div>

          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            Launch Web App ↗
          </a>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: OVERVIEW & SHARE */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Launch Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="text-2xl mb-1">📱</div>
                  <div className="text-sm font-bold text-blue-950">Customer Web Application</div>
                  <div className="text-xs text-blue-700 mt-1 mb-3">
                    Standalone customer portal for Estimates, Gate Pass & Complaints
                  </div>
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    Open on Port 5174 ↗
                  </a>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="text-2xl mb-1">💬</div>
                  <div className="text-sm font-bold text-emerald-950">Customer Remark & Voice</div>
                  <div className="text-xs text-emerald-700 mt-1 mb-3">
                    Syncs directly with table <code className="font-bold">post_feedback_bot_data</code>
                  </div>
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    {complaints.length} Total Records Logged
                  </span>
                </div>

                <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-4">
                  <div className="text-2xl mb-1">🏷️</div>
                  <div className="text-sm font-bold text-purple-950">Parts & Labour Pricing</div>
                  <div className="text-xs text-purple-700 mt-1 mb-3">
                    Tata Motors Model/Fuel rate card connected with Estimate engine
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pricing')}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
                  >
                    Browse Catalogue ({ALL_PARTS_PRICING.length}) →
                  </button>
                </div>
              </div>

              {/* Share Customer Link Generator */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  📤 Send Customer Portal Link to Customer
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Generate a direct access link for the customer to review their vehicle estimate, submit complaints or download gate pass.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-48">
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      Registration Number
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono font-bold uppercase text-gray-900 focus:border-blue-500 focus:outline-none"
                      value={testRegNumber}
                      onChange={(e) => setTestRegNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. RJ60CH2388"
                    />
                  </div>

                  <div className="flex-1 min-w-[280px]">
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      Direct Customer URL
                    </label>
                    <input
                      type="text"
                      readOnly
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-600"
                      value={`${portalUrl}/?reg=${testRegNumber.trim().toUpperCase()}`}
                    />
                  </div>

                  <div className="pt-5">
                    <button
                      type="button"
                      onClick={handleCopyCustomerLink}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 flex items-center gap-1.5"
                    >
                      {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPLAINTS LIST */}
          {activeTab === 'complaints' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Live Form Submissions & Complaints
                  </h3>
                  <p className="text-xs text-gray-500">
                    Submissions from Customer Portal ("Tell Us Your Problem") & Feedback forms
                  </p>
                </div>
              </div>

              {loadingComplaints ? (
                <div className="py-12 text-center text-xs text-gray-500">
                  Loading complaints from database…
                </div>
              ) : complaints.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
                  No complaints or feedback logged yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5">Date & Time</th>
                        <th className="px-3 py-2.5">Vehicle Reg</th>
                        <th className="px-3 py-2.5">Customer / Phone</th>
                        <th className="px-3 py-2.5">Category</th>
                        <th className="px-3 py-2.5">Rating</th>
                        <th className="px-3 py-2.5">Description / Remark</th>
                        <th className="px-3 py-2.5">Advisor / Branch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {complaints.map((c, i) => (
                        <tr key={c.id || i} className="hover:bg-gray-50/80">
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                            {c.complaint_date_time ? new Date(c.complaint_date_time).toLocaleString() : 'Recent'}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {c.vehicle_registration_number}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-gray-900">{c.customer_name || 'Customer'}</div>
                            <div className="text-[11px] text-gray-500">{c.mobile_number || '—'}</div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                              {c.primary_complaint_area || c.service_type || 'General'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-bold text-amber-500">
                              {'★'.repeat(c.rating || 5)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 max-w-xs truncate" title={c.feedback_text}>
                            {c.feedback_text}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                            <div>{c.service_advisor_name || 'Advisor'}</div>
                            <div className="text-[11px] text-gray-400">{c.branch || 'Workshop'}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRICING CATALOGUE */}
          {activeTab === 'pricing' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Parts & Labour Master Pricing Database
                  </h3>
                  <p className="text-xs text-gray-500">
                    Total 926 records mapped by Model, Fuel type & Service package
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                    placeholder="Search parts/services…"
                    value={pricingSearch}
                    onChange={(e) => setPricingSearch(e.target.value)}
                  />
                  <select
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {modelsList.map((m) => (
                      <option key={m} value={m}>Model: {m}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                    value={selectedFuel}
                    onChange={(e) => setSelectedFuel(e.target.value)}
                  >
                    {fuelsList.map((f) => (
                      <option key={f} value={f}>Fuel: {f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2.5">ID</th>
                      <th className="px-3 py-2.5">Service Type</th>
                      <th className="px-3 py-2.5">Model</th>
                      <th className="px-3 py-2.5">Fuel</th>
                      <th className="px-3 py-2.5">Service / Part Name</th>
                      <th className="px-3 py-2.5 text-right">Part Price</th>
                      <th className="px-3 py-2.5 text-right">Labour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPricing.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2 font-mono text-gray-400">{p.id}</td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{p.service_type}</td>
                        <td className="px-3 py-2 font-bold text-blue-900">{p.model}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {p.fuel || 'General'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">{p.service_name}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                          {p.price > 0 ? `₹${p.price.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-purple-700 font-semibold">
                          {p.labour > 0 ? `₹${p.labour.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: LIVE EMBEDDED PREVIEW */}
          {activeTab === 'live_preview' && (
            <div className="h-full flex flex-col space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-600 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                <span>
                  Showing live embedded Customer Web App (<strong className="font-mono text-blue-700">{portalUrl}</strong>)
                </span>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-blue-600 hover:underline"
                >
                  Open in New Tab ↗
                </a>
              </div>
              <div className="flex-1 rounded-xl border border-gray-300 overflow-hidden shadow-inner min-h-[480px]">
                <iframe
                  src={portalUrl}
                  title="Customer Portal Preview"
                  className="w-full h-full min-h-[480px] border-0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3 text-xs text-gray-500">
          <div>
            Techwheels Service Advisor · Bodyshop Customer Service Portal Hub
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-200 px-4 py-1.5 font-bold text-gray-700 hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
