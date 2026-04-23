import { describe, expect, it } from 'vitest'

import { PREVIEW_OUTPUT_SHADER } from './shaders'

describe('preview output shader', () => {
  it('flips the processed texture vertically for browser display', () => {
    expect(PREVIEW_OUTPUT_SHADER).toContain('1.0 - v_texCoord.y')
  })

  it('does not apply a second display gamma transform', () => {
    expect(PREVIEW_OUTPUT_SHADER).not.toContain('linearToSRGB')
    expect(PREVIEW_OUTPUT_SHADER).not.toContain('u_displayGamma')
  })
})
