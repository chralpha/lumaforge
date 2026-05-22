import { describe, expect, it } from 'vitest'

import { sheetSpring, Spring, surfaceFade } from '../spring'

describe('motion presets', () => {
  it('spring stays exported (unchanged for existing consumers)', () => {
    expect(Spring).toBeDefined()
  })

  it('sheetSpring is a non-reduced-motion-friendly spring transition', () => {
    expect(sheetSpring).toMatchObject({
      type: 'spring',
    })
  })

  it('surfaceFade pairs duration-lf-fast with ease-lf-standard semantics', () => {
    expect(surfaceFade).toMatchObject({
      duration: 0.16,
    })
    expect(surfaceFade.ease).toBeDefined()
  })
})
