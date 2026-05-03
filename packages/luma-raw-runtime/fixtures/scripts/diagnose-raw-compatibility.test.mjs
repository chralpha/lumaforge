import { describe, expect, it } from 'vitest'

import {
  defaultReportPath,
  parseArgs,
  reportPayload,
} from './diagnose-raw-compatibility.mjs'

describe('diagnose RAW compatibility CLI', () => {
  it('parses default CI-smoke selection', () => {
    expect(parseArgs([])).toEqual({
      all: false,
      purpose: 'ci-smoke',
      profile: 'desktop',
      output: undefined,
    })
  })

  it('parses all local fixture diagnostics', () => {
    expect(
      parseArgs([
        '--all',
        '--profile=low-memory',
        '--output=/tmp/report.json',
      ]),
    ).toEqual({
      all: true,
      purpose: undefined,
      profile: 'low-memory',
      output: '/tmp/report.json',
    })
  })

  it('rejects conflicting fixture selectors', () => {
    expect(() => parseArgs(['--all', '--purpose=ci-smoke'])).toThrow(
      'Use either --all or --purpose=<purpose>, not both.',
    )
  })

  it('uses the ignored reports cache as the default output path', () => {
    expect(defaultReportPath('/repo/packages/luma-raw-runtime/fixtures')).toBe(
      '/repo/packages/luma-raw-runtime/fixtures/.cache/reports/mobile-raw-compatibility.json',
    )
  })

  it('wraps entries in a stable report envelope', () => {
    expect(
      reportPayload({
        generatedAt: '2026-05-03T00:00:00.000Z',
        entries: [{ fixture: { name: 'raw' }, classification: 'supported' }],
      }),
    ).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-03T00:00:00.000Z',
      entries: [{ fixture: { name: 'raw' }, classification: 'supported' }],
    })
  })
})
