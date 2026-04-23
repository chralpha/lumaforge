import LibRaw from 'libraw-wasm'

import { createLumaRawRuntime } from '../src/runtime'

type BenchRecord = {
  runtime: 'libraw-wasm' | 'luma'
  stage: 'full' | 'embedded' | 'quick' | 'hq' | 'init'
  file: string
  width?: number
  height?: number
  total: number
  timings?: Record<string, number | undefined>
}

type BenchErrorRecord = {
  runtime: 'libraw-wasm' | 'luma'
  stage: BenchRecord['stage']
  file: string
  error: string
}

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing benchmark page control: ${selector}`)
  }
  return element
}

const input = getRequiredElement<HTMLInputElement>('#fixture')
const runButton = getRequiredElement<HTMLButtonElement>('#run')
const output = getRequiredElement<HTMLPreElement>('#output')

function print(record: BenchRecord) {
  const line = JSON.stringify(record)
  output.textContent += `${line}\n`
}

function printError(record: BenchErrorRecord) {
  const line = JSON.stringify(record)
  output.textContent += `${line}\n`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

function terminateLibrawWorker(libraw: LibRaw) {
  // libraw-wasm stores the worker on a private runtime shape; check it before terminating.
  const worker = (libraw as unknown as { worker?: unknown }).worker
  if (worker instanceof Worker) {
    worker.terminate()
  }
}

async function benchLegacy(file: File) {
  const start = performance.now()
  const libraw = new LibRaw()
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await libraw.open(bytes, {
      halfSize: false,
      useCameraWb: true,
      outputColor: 1,
      outputBps: 16,
      noAutoBright: false,
    })
    const image = await libraw.imageData()
    print({
      runtime: 'libraw-wasm',
      stage: 'full',
      file: file.name,
      width: image.width,
      height: image.height,
      total: performance.now() - start,
    })
  } catch (error) {
    printError({
      runtime: 'libraw-wasm',
      stage: 'full',
      file: file.name,
      error: errorMessage(error),
    })
  } finally {
    terminateLibrawWorker(libraw)
  }
}

async function benchLuma(file: File) {
  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: false,
  })
  try {
    try {
      await runtime.init()
    } catch (error) {
      printError({
        runtime: 'luma',
        stage: 'init',
        file: file.name,
        error: errorMessage(error),
      })
      return
    }

    const runStage = async (
      stage: Exclude<BenchRecord['stage'], 'full' | 'init'>,
      action: () => Promise<void>,
    ) => {
      try {
        await action()
      } catch (error) {
        printError({
          runtime: 'luma',
          stage,
          file: file.name,
          error: errorMessage(error),
        })
      }
    }

    await runStage('embedded', async () => {
      const embedded = await runtime.extractEmbeddedPreview(file)
      if (!embedded) return

      print({
        runtime: 'luma',
        stage: 'embedded',
        file: file.name,
        width: embedded.width,
        height: embedded.height,
        total: embedded.timings.total,
        timings: embedded.timings,
      })
    })

    await runStage('quick', async () => {
      const quick = await runtime.decodeQuick(file)
      print({
        runtime: 'luma',
        stage: 'quick',
        file: file.name,
        width: quick.width,
        height: quick.height,
        total: quick.timings.total,
        timings: quick.timings,
      })
    })

    await runStage('hq', async () => {
      const hq = await runtime.decodeHq(file)
      print({
        runtime: 'luma',
        stage: 'hq',
        file: file.name,
        width: hq.width,
        height: hq.height,
        total: hq.timings.total,
        timings: hq.timings,
      })
    })
  } finally {
    runtime.dispose()
  }
}

async function main() {
  runButton.disabled = true
  output.textContent = ''
  try {
    const file = input.files?.[0]
    if (!file) {
      output.textContent = 'Choose a RAW fixture first.\n'
      return
    }

    await benchLegacy(file)
    await benchLuma(file)
  } finally {
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  main().catch((error) => {
    output.textContent += `${errorMessage(error)}\n`
    console.error(error)
  })
})
