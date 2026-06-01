import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'
import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'

import type { OnlineLUTEntry } from '~/lib/profiles/catalog'

export function resolveLUTContractProfile(
  profile: LUTColorProfile | string,
): LUTColorProfile | undefined {
  if (typeof profile !== 'string') return profile

  const compact = profile.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (compact === 'vlog' || compact === 'vloginput') {
    return getLUTColorProfile('panasonic-vgamut-vlog')
  }
  if (compact === 'displaysrgb' || compact === 'srgbdisplay') {
    return getLUTColorProfile('display-srgb')
  }

  return getLUTColorProfile(profile)
}

export function resolveOnlineLUTSourceName(entry: OnlineLUTEntry): string {
  if (entry.title) return entry.title

  try {
    const pathname = new URL(entry.cube.url).pathname
    const fileName = pathname.split('/').filter(Boolean).at(-1)
    if (fileName) return fileName
  } catch {
    // Fall back to the original URL below.
  }

  return entry.cube.url
}
