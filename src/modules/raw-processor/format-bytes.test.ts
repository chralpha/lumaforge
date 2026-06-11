import { describe, expect, it } from 'vitest'

import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('formats sub-kilobyte sizes in bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats kilobyte sizes with one decimal', () => {
    expect(formatBytes(970_382)).toBe('947.6 KB')
  })

  it('formats megabyte sizes with one decimal', () => {
    expect(formatBytes(7_414_958)).toBe('7.1 MB')
  })
})
