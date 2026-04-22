const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export function IntensityChips({
  value,
  onChange,
}: {
  value: (typeof LEVELS)[number]
  onChange: (value: (typeof LEVELS)[number]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={
            value === level
              ? 'rounded-full bg-accent px-3 py-1 text-xs text-background'
              : 'rounded-full bg-fill px-3 py-1 text-xs text-text-secondary'
          }
        >
          {level[0].toUpperCase() + level.slice(1)}
        </button>
      ))}
    </div>
  )
}
