import type { HTMLAttributes } from 'react'

import { cn } from '~/lib/cn'

type ChipTone = 'neutral' | 'amber' | 'rose' | 'sky' | 'green'
type ChipSurface = 'paper' | 'on-photo'
type ChipSize = 'sm' | 'md'

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone
  surface?: ChipSurface
  size?: ChipSize
}

const TONE_PAPER: Record<ChipTone, string> = {
  neutral: 'bg-lf-surface-sunk text-lf-on-surface-soft border-lf-hairline',
  amber: 'bg-lf-amber-soft text-lf-on-surface border-lf-amber',
  rose: 'bg-lf-surface-muted text-lf-rose border-lf-rose/40',
  sky: 'bg-lf-surface-sunk text-lf-sky border-lf-sky/40',
  green: 'bg-lf-green-soft text-lf-green-deep border-lf-green-deep/30',
}

const TONE_ON_PHOTO: Record<ChipTone, string> = {
  neutral:
    'bg-lf-on-photo-bg text-lf-on-photo-ink border-lf-on-photo-bord-soft',
  amber: 'bg-lf-on-photo-bg-strong text-lf-amber border-lf-amber/55',
  rose: 'bg-lf-on-photo-bg-strong text-lf-rose border-lf-rose/55',
  sky: 'bg-lf-on-photo-bg-strong text-lf-sky border-lf-sky/55',
  green: 'bg-lf-on-photo-bg-strong text-lf-green-soft border-lf-green/55',
}

const SIZE: Record<ChipSize, string> = {
  sm: 'h-6 px-2 text-lf-label tracking-wide uppercase',
  md: 'h-7 px-2.5 text-lf-control',
}

export function Chip({
  tone = 'neutral',
  surface = 'paper',
  size = 'sm',
  className,
  children,
  ...rest
}: ChipProps) {
  const tonePalette = surface === 'on-photo' ? TONE_ON_PHOTO : TONE_PAPER
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1 rounded-lf-pill border font-medium whitespace-nowrap',
        tonePalette[tone],
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  )
}

export type { ChipProps, ChipSize, ChipSurface, ChipTone }
