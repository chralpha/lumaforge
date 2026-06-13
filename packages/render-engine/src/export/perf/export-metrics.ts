export type ExportPerfMetricBase = {
  requestId: string
  fileName?: string
  width: number
  height: number
  megapixels: number
  browser?: string
  timestamp: string
}

export type ExportPerfStripMetric = ExportPerfMetricBase & {
  kind: 'strip'
  stripIndex: number
  totalStrips: number
  rows: number
  rawReadMs: number
  colorMs: number
  jpegWriteMs: number
  totalMs: number
}

export type ExportPerfSummaryMetric = ExportPerfMetricBase & {
  kind: 'summary'
  stripRows: number
  retries: number
  concurrency: number
  totalMs: number
  outputBytes: number
}

export type ExportPerfMetric = ExportPerfStripMetric | ExportPerfSummaryMetric

export type ExportPerfCollectorInput = {
  requestId: string
  fileName?: string
  width: number
  height: number
  browser?: string
}

type StripRecordInput = Omit<ExportPerfStripMetric, keyof ExportPerfMetricBase>

type SummaryRecordInput = Omit<
  ExportPerfSummaryMetric,
  keyof ExportPerfMetricBase
>

function roundMegapixels(width: number, height: number) {
  return Math.floor((width * height) / 10_000) / 100
}

function createBase(input: ExportPerfCollectorInput): ExportPerfMetricBase {
  return {
    ...input,
    megapixels: roundMegapixels(input.width, input.height),
    timestamp: new Date().toISOString(),
  }
}

export function createExportMetricCollector(input: ExportPerfCollectorInput) {
  const base = createBase(input)
  const entries: ExportPerfMetric[] = []

  return {
    record(entry: StripRecordInput | SummaryRecordInput) {
      const metric = { ...base, ...entry } as ExportPerfMetric
      entries.push(metric)
      return metric
    },
    records() {
      return [...entries]
    },
  }
}

export function formatExportMetricJsonl(records: ExportPerfMetric[]) {
  return records.map((record) => JSON.stringify(record)).join('\n')
}

export function nowMs() {
  return globalThis.performance?.now() ?? Date.now()
}
