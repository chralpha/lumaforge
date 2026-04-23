import LibRaw from 'libraw-wasm'

import { createLumaRawRuntime } from '../src/runtime'
import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawRuntime,
} from '../src/types'

const QUICK_PREVIEW_MAX_PIXELS = 2_500_000
const LARGE_RAW_SAFE_HQ_REUSE_BYTES = 32 * 1024 * 1024

type BenchStage =
  | 'legacy-quick'
  | 'legacy-hq'
  | 'luma-open-session'
  | 'luma-embedded'
  | 'luma-quick'
  | 'luma-hq'

type BenchTargetStatus = 'within-target' | 'over-target' | 'baseline'
type BenchRuntime = 'libraw-wasm' | 'luma'
type BenchTimings = Record<string, number | undefined>
type BenchHeap = Record<string, number | undefined>

type BenchRecord = {
  runtime: BenchRuntime
  stage: BenchStage
  file: string
  size: number
  fileSize: number
  megapixels?: number
  width?: number
  height?: number
  total: number
  read?: number
  transfer?: number
  copy?: number
  open?: number
  unpack?: number
  process?: number
  heapBytes?: number
  targetStatus: BenchTargetStatus
  timings?: BenchTimings
  heap?: BenchHeap
}

type BenchErrorRecord = {
  runtime: BenchRuntime
  stage: BenchStage
  file: string
  size: number
  fileSize: number
  error: string
}

type LumaSessionStageResult = (LumaEmbeddedPreview | LumaRawFrame) & {
  timings: BenchTimings & { total: number }
  heap?: BenchHeap
}

type LumaRawSession = {
  probe: LumaRawProbe
  timings: BenchTimings & { total: number }
  heap?: BenchHeap
  extractEmbeddedPreview: () => Promise<LumaSessionStageResult | null>
  decodeQuick: () => Promise<LumaSessionStageResult>
  decodeHq: () => Promise<LumaSessionStageResult>
  dispose: () => void
}

type LumaRawRuntimeWithAnticipatedSession = LumaRawRuntime & {
  openSession?: (
    file: File,
    options?: { maxOutputPixels?: number },
  ) => Promise<LumaRawSession>
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing benchmark control: ${selector}`)
  return element
}

const input = required<HTMLInputElement>('#fixture')
const runButton = required<HTMLButtonElement>('#run')
const copyButton = required<HTMLButtonElement>('#copy')
const copyStatus = required<HTMLSpanElement>('#copy-status')
const output = required<HTMLPreElement>('#output')

function targetStatus(stage: BenchStage, total: number): BenchTargetStatus {
  if (stage === 'legacy-quick' || stage === 'legacy-hq') return 'baseline'
  if (stage === 'luma-embedded') {
    return total < 1000 ? 'within-target' : 'over-target'
  }
  if (stage === 'luma-quick') {
    return total <= 4000 ? 'within-target' : 'over-target'
  }
  if (stage === 'luma-hq') {
    return total <= 8000 ? 'within-target' : 'over-target'
  }
  return 'baseline'
}

function print(record: BenchRecord | BenchErrorRecord) {
  output.textContent += `${JSON.stringify(record)}\n`
}

function printError(
  runtime: BenchRuntime,
  stage: BenchStage,
  file: File,
  error: unknown,
) {
  print({
    runtime,
    stage,
    file: file.name,
    size: file.size,
    fileSize: file.size,
    error: errorMessage(error),
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

function terminateLibrawWorker(libraw: LibRaw) {
  const worker = (libraw as unknown as { worker?: unknown }).worker
  if (worker instanceof Worker) worker.terminate()
}

function outputMegapixels(width?: number, height?: number) {
  return width && height
    ? Number(((width * height) / 1_000_000).toFixed(2))
    : undefined
}

function firstTiming(timings: BenchTimings | undefined, keys: string[]) {
  for (const key of keys) {
    const value = timings?.[key]
    if (typeof value === 'number') return value
  }
  return undefined
}

function heapBytes(heap: BenchHeap | undefined) {
  return firstTiming(heap, [
    'heapBytes',
    'wasmHeapBytes',
    'usedBytes',
    'usedHeapBytes',
  ])
}

function recordTimingFields(timings: BenchTimings | undefined) {
  return {
    read: firstTiming(timings, ['read', 'readFile']),
    transfer: firstTiming(timings, ['transfer']),
    copy: firstTiming(timings, ['copy', 'copyToWasm']),
    open: firstTiming(timings, ['open', 'openBuffer']),
    unpack: firstTiming(timings, ['unpack']),
    process: firstTiming(timings, ['process']),
  }
}

function makeRecord(
  base: Omit<BenchRecord, 'targetStatus'> & {
    targetStatus?: BenchTargetStatus
  },
): BenchRecord {
  return {
    ...base,
    ...recordTimingFields(base.timings),
    heapBytes: heapBytes(base.heap),
    targetStatus: base.targetStatus ?? targetStatus(base.stage, base.total),
  }
}

async function legacyDecode(file: File, stage: 'legacy-quick' | 'legacy-hq') {
  const libraw = new LibRaw()
  const timings: BenchTimings = {}
  const start = performance.now()

  try {
    const readStart = performance.now()
    const bytes = new Uint8Array(await file.arrayBuffer())
    timings.read = performance.now() - readStart

    const openStart = performance.now()
    await libraw.open(bytes, {
      halfSize: stage === 'legacy-quick',
      useCameraWb: true,
      outputColor: 1,
      outputBps: 16,
      noAutoBright: false,
    })
    timings.open = performance.now() - openStart

    const processStart = performance.now()
    const image = await libraw.imageData()
    timings.process = performance.now() - processStart
    timings.total = performance.now() - start

    const record = makeRecord({
      runtime: 'libraw-wasm',
      stage,
      file: file.name,
      size: file.size,
      fileSize: file.size,
      width: image.width,
      height: image.height,
      megapixels: outputMegapixels(image.width, image.height),
      total: timings.total,
      targetStatus: 'baseline',
      timings,
    })
    print(record)
    return record
  } catch (error) {
    print({
      runtime: 'libraw-wasm',
      stage,
      file: file.name,
      size: file.size,
      fileSize: file.size,
      error: errorMessage(error),
    })
    return undefined
  } finally {
    terminateLibrawWorker(libraw)
  }
}

async function benchLegacy(file: File) {
  const quick = await legacyDecode(file, 'legacy-quick')

  if (file.size >= LARGE_RAW_SAFE_HQ_REUSE_BYTES) {
    if (quick) {
      print({
        ...quick,
        stage: 'legacy-hq',
        timings: {
          ...quick.timings,
          reusedFromLegacyQuick: 1,
        },
      })
    } else {
      print({
        runtime: 'libraw-wasm',
        stage: 'legacy-hq',
        file: file.name,
        size: file.size,
        fileSize: file.size,
        error:
          'Skipped large-file HQ legacy decode because legacy quick failed.',
      })
    }
    return
  }

  await legacyDecode(file, 'legacy-hq')
}

function assertOpenSession(
  runtime: LumaRawRuntime,
): asserts runtime is LumaRawRuntimeWithAnticipatedSession & {
  openSession: NonNullable<LumaRawRuntimeWithAnticipatedSession['openSession']>
} {
  const candidate = runtime as LumaRawRuntimeWithAnticipatedSession
  if (typeof candidate.openSession !== 'function') {
    throw new TypeError('Luma runtime openSession API is not available yet.')
  }
}

function printLumaStage(
  file: File,
  stage: BenchStage,
  result: {
    width?: number
    height?: number
    timings: BenchTimings & { total: number }
    heap?: BenchHeap
  },
  targetOverride?: BenchTargetStatus,
) {
  print(
    makeRecord({
      runtime: 'luma',
      stage,
      file: file.name,
      size: file.size,
      fileSize: file.size,
      width: result.width,
      height: result.height,
      megapixels: outputMegapixels(result.width, result.height),
      total: result.timings.total,
      targetStatus: targetOverride,
      timings: result.timings,
      heap: result.heap,
    }),
  )
}

async function benchLuma(file: File) {
  const runtime = createLumaRawRuntime({ requireCrossOriginIsolation: false })
  let session: LumaRawSession | undefined

  try {
    await runtime.init()
    assertOpenSession(runtime)

    session = await runtime.openSession(file, {
      maxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
    })
  } catch (error) {
    printError('luma', 'luma-open-session', file, error)
    runtime.dispose()
    return
  }

  try {
    printLumaStage(
      file,
      'luma-open-session',
      {
        width: session.probe.width,
        height: session.probe.height,
        timings: session.timings,
        heap: session.heap,
      },
      'baseline',
    )

    const runLumaStage = async (
      stage: Exclude<
        BenchStage,
        'legacy-quick' | 'legacy-hq' | 'luma-open-session'
      >,
      action: () => Promise<void>,
    ) => {
      try {
        await action()
      } catch (error) {
        printError('luma', stage, file, error)
      }
    }

    await runLumaStage('luma-embedded', async () => {
      const embedded = await session.extractEmbeddedPreview()
      if (!embedded) {
        throw new Error('No embedded preview available.')
      }
      printLumaStage(file, 'luma-embedded', {
        width: embedded.width,
        height: embedded.height,
        timings: embedded.timings,
        heap: embedded.heap,
      })
    })

    await runLumaStage('luma-quick', async () => {
      const quick = await session.decodeQuick()
      printLumaStage(file, 'luma-quick', {
        width: quick.width,
        height: quick.height,
        timings: quick.timings,
        heap: quick.heap,
      })
    })

    await runLumaStage('luma-hq', async () => {
      const hq = await session.decodeHq()
      printLumaStage(file, 'luma-hq', {
        width: hq.width,
        height: hq.height,
        timings: hq.timings,
        heap: hq.heap,
      })
    })
  } finally {
    session.dispose()
    runtime.dispose()
  }
}

async function run() {
  output.textContent = ''
  copyStatus.textContent = ''
  const files = [...(input.files ?? [])]
  if (files.length === 0) {
    output.textContent = 'Choose at least one RAW fixture.\n'
    return
  }

  runButton.disabled = true
  try {
    for (const file of files) {
      await benchLegacy(file)
      await benchLuma(file)
    }
  } finally {
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  run().catch((error) => {
    output.textContent += `${errorMessage(error)}\n`
    console.error(error)
  })
})

copyButton.addEventListener('click', async () => {
  const clipboard = navigator.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    copyStatus.textContent = 'Clipboard unavailable'
    copyButton.title = 'Clipboard unavailable in this browser context'
    return
  }

  try {
    await clipboard.writeText(output.textContent || '')
    copyStatus.textContent = 'Copied'
    copyButton.title = 'Copied JSONL output'
  } catch (error) {
    copyStatus.textContent = 'Copy failed'
    copyButton.title = errorMessage(error)
  }
})
