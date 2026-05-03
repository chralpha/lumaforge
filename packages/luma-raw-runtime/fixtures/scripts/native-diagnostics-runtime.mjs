import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { captureStage, stageError, stageOk } from './compatibility-report.mjs'

export const quickSettings = {
  halfSize: true,
  useCameraWb: true,
  outputColor: 4,
  outputBps: 16,
  noAutoBright: true,
  useAutoWb: false,
  useCameraMatrix: 1,
  bright: 1,
  highlight: 2,
  userQual: 0,
  gamm: [1, 1, 1, 1, 0, 0],
}

export const hqSettings = {
  ...quickSettings,
  halfSize: false,
  userQual: 2,
}

const stageNames = [
  'open',
  'thumbnail',
  'quick',
  'boundedHq',
  'exportCapability',
  'processedWindow',
]

const missingStageMessages = {
  open: 'open not attempted',
  thumbnail: 'thumbnail not attempted',
  quick: 'quick not attempted',
  boundedHq: 'bounded HQ not attempted',
  exportCapability: 'export capability not attempted',
  processedWindow: 'processed-window not attempted',
}

const notAttemptedDurationMs = stageOk(0).durationMs

function isFiniteNumber(value) {
  return Number.isFinite(value)
}

function pickFinite(target, source, key) {
  if (isFiniteNumber(source[key])) {
    target[key] = source[key]
  }
}

export function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  const normalized = {}

  for (const key of ['make', 'model', 'normalizedMake', 'normalizedModel']) {
    if (metadata[key] !== undefined) {
      normalized[key] = metadata[key]
    }
  }

  for (const key of [
    'width',
    'height',
    'rawWidth',
    'rawHeight',
    'orientation',
    'baselineExposure',
  ]) {
    pickFinite(normalized, metadata, key)
  }

  if (metadata.thumbnail !== undefined) {
    normalized.thumbnail = metadata.thumbnail
  } else if (metadata.thumbWidth && metadata.thumbHeight) {
    normalized.thumbnail = {
      width: metadata.thumbWidth,
      height: metadata.thumbHeight,
      format: metadata.thumbFormat ?? 'unknown',
    }
  }

  return normalized
}

export function readNativeStage(callback) {
  return captureStage(callback)
}

export function createProcessorSession(nativeFactory, bytes) {
  const processor = nativeFactory.createProcessor()
  let disposed = false

  return {
    processor,
    open(settings) {
      processor.loadBuffer(new Uint8Array(bytes))
      processor.openWithSettings(settings)
    },
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      processor.delete?.()
    },
  }
}

export async function loadNativeFactory({ packageDir, profile = 'desktop' }) {
  const jsPath = path.join(packageDir, 'dist/native', profile, 'luma_raw.js')
  const wasmPath = path.join(
    packageDir,
    'dist/native',
    profile,
    'luma_raw.wasm',
  )
  const nativeModule = await import(pathToFileURL(jsPath).href)
  const createModule = nativeModule.default ?? nativeModule
  const module =
    typeof createModule === 'function'
      ? await createModule({
          locateFile(file) {
            return file === 'luma_raw.wasm'
              ? pathToFileURL(wasmPath).href
              : file
          },
        })
      : createModule

  return {
    createProcessor() {
      return new module.LumaRawProcessor()
    },
  }
}

function withDefaultStages(stages) {
  return Object.fromEntries(
    stageNames.map((stageName) => [
      stageName,
      stages[stageName] ??
        stageError(
          new Error(missingStageMessages[stageName]),
          notAttemptedDurationMs,
        ),
    ]),
  )
}

export async function diagnoseNativeFixture({
  fixturePath,
  fixture,
  nativeFactory,
  memoryProfile = 'desktop',
  quickMaxOutputPixels = 2_500_000,
  boundedHqMaxOutputPixels = 8_000_000,
}) {
  const bytes = await readFile(fixturePath)
  const session = createProcessorSession(nativeFactory, bytes)
  const stages = {}
  let metadata
  let capability

  try {
    const open = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.readMetadata()
    })
    stages.open = open.stage
    metadata = normalizeMetadata(open.value)

    const thumbnail = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.extractThumbnail?.()
    })
    stages.thumbnail = thumbnail.value
      ? thumbnail.stage
      : stageError(
          new Error('thumbnail unavailable'),
          thumbnail.stage.durationMs,
        )

    const quick = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.decodePreview({
        maxOutputPixels: quickMaxOutputPixels,
      })
    })
    stages.quick = quick.stage

    const boundedHq = await readNativeStage(() => {
      session.open(hqSettings)
      return session.processor.decodeHq({
        maxOutputPixels: boundedHqMaxOutputPixels,
      })
    })
    stages.boundedHq = boundedHq.stage

    const exportCapability = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.probeExportCapability()
    })
    stages.exportCapability = exportCapability.stage
    capability = exportCapability.value

    if (
      capability?.supported === true &&
      capability.strategy === 'libraw-processed-window' &&
      capability.windows?.librawProcessed === true
    ) {
      const { buildProcessedWindowRequest } =
        await import('./compatibility-report.mjs')
      const processedWindow = await readNativeStage(() =>
        session.processor.readProcessedWindow(
          buildProcessedWindowRequest(capability),
        ),
      )
      stages.processedWindow = processedWindow.stage
    } else {
      stages.processedWindow = stageError(
        new Error(
          'processed-window not attempted because export capability is unsupported',
        ),
        notAttemptedDurationMs,
      )
    }
  } finally {
    session.dispose()
  }

  return {
    fixture,
    runtime: { version: '0.1.0', memoryProfile },
    ...(metadata !== undefined ? { metadata } : {}),
    stages: withDefaultStages(stages),
    ...(capability !== undefined ? { capability } : {}),
  }
}
