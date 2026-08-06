type UpdationAvailableBadgeProps = {
  className?: string
}

export default function UpdationAvailableBadge({ className }: UpdationAvailableBadgeProps) {
  return (
    <span className={['pill', 'ua', className].filter(Boolean).join(' ').trim()}>
      Updation Available
    </span>
  )
}
