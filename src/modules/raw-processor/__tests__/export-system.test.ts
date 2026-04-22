import { describe, expect, it } from 'vitest'

import {
  buildExportFilename,
  recommendRetryLevel,
} from '../services/export-system'

describe('export-system', () => {
  it('generates filenames for builtin and custom styles', () => {
    expect(buildExportFilename('frame.ARW', 'Neutral')).toBe(
      'frame_Neutral.jpg',
    )
    expect(buildExportFilename('frame.ARW', 'custom')).toBe('frame_custom.jpg')
  })

  it('recommends the next lower fidelity level on failure', () => {
    expect(recommendRetryLevel('max')).toBe('balanced')
    expect(recommendRetryLevel('balanced')).toBe('safe')
    expect(recommendRetryLevel('safe')).toBe(null)
  })
})
