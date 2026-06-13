import { describe, expect, it } from 'vitest'

import type { ExportPerfMetric } from './export-metrics'
import {
  createExportMetricCollector,
  formatExportMetricJsonl,
} from './export-metrics'

describe('export performance metrics', () => {
  it('records stage durations and formats stable JSONL', () => {
    const collector = createExportMetricCollector({
      requestId: 'export-1',
      fileName: 'sample.RAF',
      width: 11662,
      height: 8746,
      browser: 'unit-test',
    })

    const stripMetric = collector.record({
      kind: 'strip',
      stripIndex: 0,
      totalStrips: 2,
      rows: 512,
      rawReadMs: 10,
      colorMs: 4,
      jpegWriteMs: 2,
      totalMs: 16,
    })

    collector.record({
      kind: 'summary',
      stripRows: 512,
      retries: 0,
      concurrency: 1,
      totalMs: 32,
      outputBytes: 1024,
    })

    const records = collector.records()
    expect(records).toHaveLength(2)
    expect(stripMetric).toBe(records[0])
    expect(records[0]).toMatchObject({
      requestId: 'export-1',
      fileName: 'sample.RAF',
      width: 11662,
      height: 8746,
      megapixels: 101.99,
      browser: 'unit-test',
      kind: 'strip',
      rawReadMs: 10,
      colorMs: 4,
      jpegWriteMs: 2,
    })
    expect(records[1]).toMatchObject({
      requestId: 'export-1',
      fileName: 'sample.RAF',
      width: 11662,
      height: 8746,
      megapixels: 101.99,
      browser: 'unit-test',
      kind: 'summary',
      stripRows: 512,
      retries: 0,
      concurrency: 1,
      totalMs: 32,
      outputBytes: 1024,
    })

    const jsonl = formatExportMetricJsonl(records)
    const lines = jsonl.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines).toEqual(records.map((record) => JSON.stringify(record)))
    expect(JSON.parse(lines[0]!) as ExportPerfMetric).toMatchObject({
      requestId: 'export-1',
      kind: 'strip',
      stripIndex: 0,
      totalStrips: 2,
    })
    expect(JSON.parse(lines[1]!) as ExportPerfMetric).toMatchObject({
      requestId: 'export-1',
      kind: 'summary',
      stripRows: 512,
      outputBytes: 1024,
    })
  })
})
