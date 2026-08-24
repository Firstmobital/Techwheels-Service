type GgnStatus = 'Available' | 'Not Available' | null | undefined | string

export default function GgnStockBadge({ status }: { status: GgnStatus }) {
  if (status === 'Available') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Available
      </span>
    )
  }
  if (status === 'Not Available') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        Not Available
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
      No Data
    </span>
  )
}
