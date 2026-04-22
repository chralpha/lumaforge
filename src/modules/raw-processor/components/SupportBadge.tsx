export function SupportBadge({
  level,
}: {
  level: 'official' | 'experimental'
}) {
  return (
    <span
      className={
        level === 'official'
          ? 'rounded-full bg-green/10 px-2 py-1 text-xs text-green'
          : 'rounded-full bg-yellow/10 px-2 py-1 text-xs text-yellow'
      }
    >
      {level === 'official' ? 'Official support' : 'Experimental support'}
    </span>
  )
}
