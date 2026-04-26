import { describe, expect, it } from 'vitest'

import {
  expandRectWithHalo,
  planExportStrips,
  reduceStripRows,
} from './strip-scheduler'

describe('planExportStrips', () => {
  it('plans ordered output strips and expanded input windows', () => {
    const strips = planExportStrips({
      width: 10,
      height: 9,
      preferredRows: 4,
      minRows: 2,
      halo: 2,
    })

    expect(strips.map((strip) => strip.output)).toEqual([
      { x: 0, y: 0, width: 10, height: 4 },
      { x: 0, y: 4, width: 10, height: 4 },
      { x: 0, y: 8, width: 10, height: 1 },
    ])
  })
})

describe('expandRectWithHalo', () => {
  it('clamps the halo-expanded rect to the input bounds', () => {
    expect(
      expandRectWithHalo(
        { x: 0, y: 4, width: 10, height: 4 },
        { width: 10, height: 9 },
        2,
      ),
    ).toEqual({ x: 0, y: 2, width: 10, height: 7 })
  })
})

describe('reduceStripRows', () => {
  it('shrinks monotonically until the minimum strip height', () => {
    expect(reduceStripRows(8, 2)).toBe(4)
    expect(reduceStripRows(3, 2)).toBe(2)
    expect(reduceStripRows(2, 2)).toBe(2)
  })
})
