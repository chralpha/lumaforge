import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import {
  dedupeOutputOptions,
  toDeclaredOutputOption,
} from './lut-output-options'

describe('lutOutputOptions', () => {
  it('dedupes declared output options by output contract', () => {
    const sony = {
      ...getLUTColorProfile('sony-sgamut3cine-slog3')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'srgb' as const,
      outputRange: 'full' as const,
    }
    const panasonic = {
      ...getLUTColorProfile('panasonic-vgamut-vlog')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'srgb' as const,
      outputRange: 'full' as const,
    }

    const options = dedupeOutputOptions(
      [sony, panasonic].map((profile) => toDeclaredOutputOption(profile)!),
    )

    expect(options).toHaveLength(1)
    expect(options[0]?.id).toBe('sony-sgamut3cine-slog3:declared-output')
    expect(options[0]?.label).toBe('Rec.709 display')
  })
})
