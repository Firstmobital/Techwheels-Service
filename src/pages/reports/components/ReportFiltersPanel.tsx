import { useEffect, useRef, useState } from 'react'
import type { BranchFilter, DateRangePreset, DateFieldType } from '../../../lib/reportQueries'

interface ReportFiltersPanelProps {
  branch: BranchFilter
  onBranchChange: (value: BranchFilter) => void
  branchOptions: string[]
  branchError: string | null
  fuelType: 'ALL' | 'PV' | 'EV'
  onFuelTypeChange: (value: 'ALL' | 'PV' | 'EV') => void
  disableFuelType?: boolean
  showServiceTypeFilter?: boolean
  showManpowerFilters?: boolean
  serviceTypeFilter?: string[]
  onServiceTypeFilterChange?: (value: string[]) => void
  serviceTypeOptions?: string[]
  parentProductLineFilter?: 'ALL' | string
  onParentProductLineFilterChange?: (value: 'ALL' | string) => void
  parentProductLineOptions?: string[]
  manpowerFilterLabel?: string
  showServiceAdvisorFilter?: boolean
  serviceAdvisorFilter?: string[]
  onServiceAdvisorFilterChange?: (value: string[]) => void
  serviceAdvisorOptions?: string[]
  datePreset: DateRangePreset
  onDatePresetChange: (value: DateRangePreset) => void
  customFrom: string
  onCustomFromChange: (value: string) => void
  customTo: string
  onCustomToChange: (value: string) => void
  customDateError: string | null
  dateFieldType: DateFieldType
  onDateFieldTypeChange: (value: DateFieldType) => void
  showDateFieldTypeFilter?: boolean
}

const DATE_PRESET_OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Last Month', value: 'last-month' },
  { label: 'Custom Date Range', value: 'custom' },
]

function sortFilterOptions(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export default function ReportFiltersPanel({
  branch,
  onBranchChange,
  branchOptions,
  branchError,
  fuelType,
  onFuelTypeChange,
  disableFuelType = false,
  showServiceTypeFilter = false,
  showManpowerFilters = false,
  serviceTypeFilter = [],
  onServiceTypeFilterChange,
  serviceTypeOptions = [],
  parentProductLineFilter = 'ALL',
  onParentProductLineFilterChange,
  parentProductLineOptions = [],
  manpowerFilterLabel = 'Manpower Wise',
  showServiceAdvisorFilter = false,
  serviceAdvisorFilter = [],
  onServiceAdvisorFilterChange,
  serviceAdvisorOptions = [],
  datePreset,
  onDatePresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  customDateError,
  dateFieldType,
  onDateFieldTypeChange,
  showDateFieldTypeFilter = true,
}: ReportFiltersPanelProps) {
  const [isServiceTypeDropdownOpen, setIsServiceTypeDropdownOpen] = useState(false)
  const [isServiceAdvisorDropdownOpen, setIsServiceAdvisorDropdownOpen] = useState(false)
  const serviceTypeDropdownRef = useRef<HTMLDivElement | null>(null)
  const serviceAdvisorDropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node

      if (serviceTypeDropdownRef.current && !serviceTypeDropdownRef.current.contains(target)) {
        setIsServiceTypeDropdownOpen(false)
      }

      if (serviceAdvisorDropdownRef.current && !serviceAdvisorDropdownRef.current.contains(target)) {
        setIsServiceAdvisorDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const topGridClass = showManpowerFilters ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'
  const normalizedBranch = branchOptions.includes(branch) ? branch : 'ALL'
  const sortedBranchOptions = sortFilterOptions(branchOptions)
  const sortedServiceTypeOptions = sortFilterOptions(serviceTypeOptions)
  const sortedParentProductLineOptions = sortFilterOptions(parentProductLineOptions)
  const sortedServiceAdvisorOptions = sortFilterOptions(serviceAdvisorOptions)
  const allServiceTypesSelected = serviceTypeFilter.length === 0
  const selectedServiceTypeLabel =
    serviceTypeFilter.length === 0
      ? 'All Service Types'
      : `${serviceTypeFilter.length} selected`
  const allServiceAdvisorsSelected = serviceAdvisorFilter.length === 0
  const selectedServiceAdvisorLabel =
    serviceAdvisorFilter.length === 0
      ? 'All Service Advisors'
      : `${serviceAdvisorFilter.length} selected`

  const toggleServiceType = (value: string) => {
    if (!onServiceTypeFilterChange) return

    const isSelected = serviceTypeFilter.includes(value)
    if (isSelected) {
      const next = serviceTypeFilter.filter((item) => item !== value)
      onServiceTypeFilterChange(next)
      return
    }

    onServiceTypeFilterChange([...serviceTypeFilter, value])
  }

  const toggleServiceAdvisor = (value: string) => {
    if (!onServiceAdvisorFilterChange) return

    const isSelected = serviceAdvisorFilter.includes(value)
    if (isSelected) {
      const next = serviceAdvisorFilter.filter((item) => item !== value)
      onServiceAdvisorFilterChange(next)
      return
    }

    onServiceAdvisorFilterChange([...serviceAdvisorFilter, value])
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className={topGridClass}>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Branch
          <select
            value={normalizedBranch}
            onChange={(event) => onBranchChange(event.target.value as BranchFilter)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="ALL">All Branches</option>
            {sortedBranchOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Fuel Type
          <select
            value={fuelType}
            onChange={(event) => onFuelTypeChange(event.target.value as 'ALL' | 'PV' | 'EV')}
            disabled={disableFuelType}
            className="rounded border border-gray-300 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            <option value="ALL">All</option>
            <option value="PV">PV</option>
            <option value="EV">EV</option>
          </select>
        </label>

        {showDateFieldTypeFilter ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Filter By
            <select
              value={dateFieldType}
              onChange={(event) => onDateFieldTypeChange(event.target.value as DateFieldType)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="closed_date">Job Closed Date</option>
              <option value="invoice_date">Invoice Date</option>
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Date Range
          <select
            value={datePreset}
            onChange={(event) => onDatePresetChange(event.target.value as DateRangePreset)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          >
            {DATE_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {showServiceTypeFilter && onServiceTypeFilterChange ? (
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            <span>Service Type</span>
            <div className="relative" ref={serviceTypeDropdownRef}>
              <button
                type="button"
                onClick={() => setIsServiceTypeDropdownOpen((prev) => !prev)}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-gray-300 px-2 py-2 text-sm text-gray-700"
              >
                <span className="truncate">{selectedServiceTypeLabel}</span>
                <span className="ml-2 text-xs text-gray-500">▾</span>
              </button>

              {isServiceTypeDropdownOpen ? (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded border border-gray-300 bg-white p-2 shadow-lg">
                  <label className="mb-1 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={allServiceTypesSelected}
                      onChange={() => onServiceTypeFilterChange([])}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    All Service Types
                  </label>

                  {sortedServiceTypeOptions.map((value) => (
                    <label key={value} className="mb-1 flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={serviceTypeFilter.includes(value)}
                        onChange={() => toggleServiceType(value)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="truncate">{value}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {showManpowerFilters && onParentProductLineFilterChange ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              {manpowerFilterLabel}
              <select
                value={parentProductLineFilter}
                onChange={(event) => onParentProductLineFilterChange(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="ALL">All</option>
                {sortedParentProductLineOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {showServiceAdvisorFilter && onServiceAdvisorFilterChange ? (
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            <span>Service Advisor</span>
            <div className="relative" ref={serviceAdvisorDropdownRef}>
              <button
                type="button"
                onClick={() => setIsServiceAdvisorDropdownOpen((prev) => !prev)}
                className="flex w-full cursor-pointer items-center justify-between rounded border border-gray-300 px-2 py-2 text-sm text-gray-700"
              >
                <span className="truncate">{selectedServiceAdvisorLabel}</span>
                <span className="ml-2 text-xs text-gray-500">▾</span>
              </button>

              {isServiceAdvisorDropdownOpen ? (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded border border-gray-300 bg-white p-2 shadow-lg">
                  <label className="mb-1 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={allServiceAdvisorsSelected}
                      onChange={() => onServiceAdvisorFilterChange([])}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    All Service Advisors
                  </label>

                  {sortedServiceAdvisorOptions.map((value) => (
                    <label key={value} className="mb-1 flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={serviceAdvisorFilter.includes(value)}
                        onChange={() => toggleServiceAdvisor(value)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="truncate">{value}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {datePreset === 'custom' && (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              From
              <input
                type="date"
                value={customFrom}
                onChange={(event) => onCustomFromChange(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              To
              <input
                type="date"
                value={customTo}
                onChange={(event) => onCustomToChange(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
          </>
        )}
      </div>

      {branchError && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Branch list could not be loaded from employee master: {branchError}. Showing All Branches fallback.
        </p>
      )}

      {customDateError && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {customDateError}
        </p>
      )}
    </section>
  )
}
