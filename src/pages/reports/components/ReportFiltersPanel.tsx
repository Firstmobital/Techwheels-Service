import type { BranchFilter, DateRangePreset } from '../../../lib/reportQueries'

interface ReportFiltersPanelProps {
  branch: BranchFilter
  onBranchChange: (value: BranchFilter) => void
  branchOptions: string[]
  branchError: string | null
  showManpowerFilters?: boolean
  serviceTypeFilter?: 'ALL' | string
  onServiceTypeFilterChange?: (value: 'ALL' | string) => void
  serviceTypeOptions?: string[]
  parentProductLineFilter?: 'ALL' | string
  onParentProductLineFilterChange?: (value: 'ALL' | string) => void
  parentProductLineOptions?: string[]
  datePreset: DateRangePreset
  onDatePresetChange: (value: DateRangePreset) => void
  customFrom: string
  onCustomFromChange: (value: string) => void
  customTo: string
  onCustomToChange: (value: string) => void
  customDateError: string | null
}

const DATE_PRESET_OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Custom Date Range', value: 'custom' },
]

export default function ReportFiltersPanel({
  branch,
  onBranchChange,
  branchOptions,
  branchError,
  showManpowerFilters = false,
  serviceTypeFilter = 'ALL',
  onServiceTypeFilterChange,
  serviceTypeOptions = [],
  parentProductLineFilter = 'ALL',
  onParentProductLineFilterChange,
  parentProductLineOptions = [],
  datePreset,
  onDatePresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  customDateError,
}: ReportFiltersPanelProps) {
  const topGridClass = showManpowerFilters ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className={topGridClass}>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Branch
          <select
            value={branch}
            onChange={(event) => onBranchChange(event.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="ALL">All Branches</option>
            {branchOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

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

        {showManpowerFilters && onServiceTypeFilterChange && onParentProductLineFilterChange ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Service Type
              <select
                value={serviceTypeFilter}
                onChange={(event) => onServiceTypeFilterChange(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="ALL">All Service Types</option>
                {serviceTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Parent Product Line
              <select
                value={parentProductLineFilter}
                onChange={(event) => onParentProductLineFilterChange(event.target.value)}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="ALL">All Parent Product Lines</option>
                {parentProductLineOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </>
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
