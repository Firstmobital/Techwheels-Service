export function ReportLoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="text-center space-y-2">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm">Loading report...</p>
      </div>
    </div>
  )
}
