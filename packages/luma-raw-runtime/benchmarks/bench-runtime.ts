import LibRaw from 'libraw-wasm'

import { createLumaRawRuntime } from '../src/runtime'

type BenchRecord = {
  runtime: 'libraw-wasm' | 'luma'
  stage: 'full' | 'embedded' | 'quick' | 'hq'
  file: string
  width?: number
  height?: number
  total: number
  timings?: Record<string, number | undefined>
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

async function benchLegacy(file: File) {
  const start = performance.now()
  const libraw = new LibRaw()
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
  const worker = (libraw as unknown as { worker?: Worker }).worker
  worker?.terminate()
}

async function benchLuma(file: File) {
  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: false,
  })
  await runtime.init()

  const embedded = await runtime.extractEmbeddedPreview(file)
  if (embedded) {
    print({
      runtime: 'luma',
      stage: 'embedded',
      file: file.name,
      width: embedded.width,
      height: embedded.height,
      total: embedded.timings.total,
      timings: embedded.timings,
    })
  }

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

  runtime.dispose()
}

async function main() {
  output.textContent = ''
  const file = input.files?.[0]
  if (!file) {
    output.textContent = 'Choose a RAW fixture first.\n'
    return
  }

  await benchLegacy(file)
  await benchLuma(file)
}

runButton.addEventListener('click', () => {
  main().catch((error) => {
    output.textContent += `${error instanceof Error ? error.stack : String(error)}\n`
    console.error(error)
  })
})
