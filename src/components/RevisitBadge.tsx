type RevisitBadgeProps = {
  className?: string
}

export default function RevisitBadge({ className }: RevisitBadgeProps) {
  return (
    <span className={['pill', 'r', className].filter(Boolean).join(' ').trim()}>
      Revisit
    </span>
  )
}
