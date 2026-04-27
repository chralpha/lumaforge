import type {JpegRowSink} from '../../../src/lib/export/jpeg/row-writer';
import {
  createJpegRowWriter
} from '../../../src/lib/export/jpeg/row-writer'
import { createLumaJpegRuntime } from '../src/index'

type Pattern = 'black' | 'gradient' | 'high-entropy'
type Mode = 'runtimeDirect' | 'runtimeWithRowWriterClone'
type BenchmarkWriter = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  close: () => Promise<Blob>
  abort: () => Promise<void> | void
  dispose?: () => void
}

const width = 11662
const height = 8746
const bandRowsOptions = [512, 64] as const
const modes: Mode[] = ['runtimeDirect', 'runtimeWithRowWriterClone']
const quality = 0.92
const output = document.querySelector<HTMLPreElement>('#output')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const copyButton = document.querySelector<HTMLButtonElement>('#copy')!
let isRunning = false

function now() {
  return performance.now()
}

function fillRows(
  pattern: Pattern,
  rows: Uint8Array,
  startY: number,
  rowCount: number,
) {
  for (let y = 0; y < rowCount; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3
      if (pattern === 'black') {
        rows[index] = 0
        rows[index + 1] = 0
        rows[index + 2] = 0
      } else if (pattern === 'gradient') {
        rows[index] = Math.round((x / Math.max(1, width - 1)) * 255)
        rows[index + 1] = Math.round(
          ((startY + y) / Math.max(1, height - 1)) * 255,
        )
        rows[index + 2] = 128
      } else {
        const value = (x * 1103515245 + (startY + y) * 12345) >>> 0
        rows[index] = value & 255
        rows[index + 1] = (value >>> 8) & 255
        rows[index + 2] = (value >>> 16) & 255
      }
    }
  }
}

function createBenchmarkWriter(mode: Mode): BenchmarkWriter {
  if (mode === 'runtimeWithRowWriterClone') {
    return createJpegRowWriter({
      width,
      height,
      quality,
      sink: createBenchmarkWasmRowSink(),
    })
  }

  const runtime = createLumaJpegRuntime()
  const encoder = runtime.createEncoder({ width, height, quality })

  return {
    writeRows: (rows, rowCount) => encoder.writeRows(rows, rowCount),
    close: () => encoder.finish(),
    abort: () => encoder.abort(),
    dispose: () => runtime.dispose(),
  }
}

function createBenchmarkWasmRowSink(): JpegRowSink {
  return {
    createSession({ width, height, quality }) {
      const runtime = createLumaJpegRuntime()
      const encoder = runtime.createEncoder({ width, height, quality })
      let disposed = false

      function dispose() {
        if (disposed) return
        disposed = true
        runtime.dispose()
      }

      return {
        writeRows: (rows, rowCount) => encoder.writeRows(rows, rowCount),
        async close() {
          try {
            return await encoder.finish()
          } finally {
            dispose()
          }
        },
        abort() {
          try {
            encoder.abort()
          } finally {
            dispose()
          }
        },
      }
    },
  }
}

async function runPattern(
  mode: Mode,
  pattern: Pattern,
  bandRows: (typeof bandRowsOptions)[number],
) {
  const start = now()
  const createStart = now()
  const writer = createBenchmarkWriter(mode)
  const createMs = now() - createStart
  let allocMs = 0
  let fillMs = 0
  let firstWriteMs = 0
  let steadyWriteMs = 0
  let hasFirstWrite = false
  let completed = false

  try {
    for (let y = 0; y < height; y += bandRows) {
      const rowCount = Math.min(bandRows, height - y)
      const allocStart = now()
      const rows = new Uint8Array(width * rowCount * 3)
      allocMs += now() - allocStart
      const fillStart = now()
      fillRows(pattern, rows, y, rowCount)
      fillMs += now() - fillStart
      const writeStart = now()
      await writer.writeRows(rows, rowCount)
      const writeMs = now() - writeStart
      if (hasFirstWrite) {
        steadyWriteMs += writeMs
      } else {
        firstWriteMs = writeMs
        hasFirstWrite = true
      }
    }

    const finishStart = now()
    const blob = await writer.close()
    completed = true
    const finishMs = now() - finishStart
    const decodeStart = now()
    const bitmap = await createImageBitmap(blob)
    const decodeMs = now() - decodeStart
    const decodedWidth = bitmap.width
    const decodedHeight = bitmap.height
    bitmap.close?.()

    return {
      mode,
      pattern,
      width,
      height,
      megapixels: Math.round((width * height) / 10_000) / 100,
      quality,
      bandRows,
      createMs,
      allocMs,
      fillMs,
      firstWriteMs,
      steadyWriteMs,
      createAndWriteMs: createMs + firstWriteMs + steadyWriteMs,
      finishMs,
      decodeMs,
      totalMs: now() - start,
      outputBytes: blob.size,
      mimeType: blob.type,
      decodedWidth,
      decodedHeight,
      dimensionMatch: decodedWidth === width && decodedHeight === height,
      userAgent: navigator.userAgent,
    }
  } finally {
    if (!completed) {
      try {
        await writer.abort()
      } catch {
        // Preserve the original benchmark failure.
      }
    }
    writer.dispose?.()
  }
}

runButton.addEventListener('click', async () => {
  if (isRunning) return

  isRunning = true
  runButton.disabled = true
  output.textContent = ''
  const rows: string[] = []

  try {
    for (const bandRows of bandRowsOptions) {
      for (const mode of modes) {
        for (const pattern of ['black', 'gradient', 'high-entropy'] as const) {
          const record = await runPattern(mode, pattern, bandRows)
          rows.push(JSON.stringify(record))
          output.textContent = rows.join('\n')
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack : String(error)
    rows.push(JSON.stringify({ error: message }))
    output.textContent = rows.join('\n')
  } finally {
    isRunning = false
    runButton.disabled = false
  }
})

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.textContent ?? '')
})
