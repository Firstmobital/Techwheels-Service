export function ReportErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      Failed to load report: {message}
    </div>
  )
}
