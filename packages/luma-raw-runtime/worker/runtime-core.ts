import { LumaRawRuntimeError, normalizeRawRuntimeError } from '../src/errors'
import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawMetadata,
  LumaRawProbe,
  LumaRawRuntimeInfo,
  LumaRawTimings,
} from '../src/types'
import type {
  LumaRawWorkerRequest,
  LumaRawWorkerResponse,
} from '../src/worker-protocol'
import type {
  LumaRawNativeFactory,
  LumaRawNativeImage,
  LumaRawNativeMetadata,
  LumaRawNativeOpenSettings,
  LumaRawNativeThumbnail,
} from './native-types'

const quickSettings = {
  halfSize: true,
  useCameraWb: true,
  outputColor: 4,
  outputBps: 16,
  noAutoBright: true,
  userQual: 0,
  gamm: [1, 1, 1, 1, 0, 0],
} satisfies LumaRawNativeOpenSettings

const hqSettings = {
  ...quickSettings,
  halfSize: false,
  userQual: 2,
} satisfies LumaRawNativeOpenSettings

type Timer = {
  mark: (name: Exclude<keyof LumaRawTimings, 'total'>) => void
  finish: () => LumaRawTimings
}

function now() {
  return globalThis.performance?.now() ?? Date.now()
}

function createTimer(): Timer {
  const start = now()
  let last = start
  const timings: Partial<LumaRawTimings> = {}

  return {
    mark(name) {
      const current = now()
      timings[name] = current - last
      last = current
    },
    finish() {
      return {
        ...timings,
        total: now() - start,
      }
    },
  }
}

function getRuntimeInfo(): LumaRawRuntimeInfo {
  const hardwareConcurrency =
    typeof globalThis.navigator?.hardwareConcurrency === 'number'
      ? globalThis.navigator.hardwareConcurrency
      : 1
  const workerPoolSize = Math.max(1, Math.min(4, hardwareConcurrency))
  const isolated =
    'crossOriginIsolated' in globalThis
      ? Boolean(globalThis.crossOriginIsolated)
      : false

  return {
    runtime: 'luma',
    version: '0.1.0',
    simd: true,
    pthreads: true,
    crossOriginIsolated: isolated,
    memoryTier: 'normal',
    workerPoolSize,
  }
}

function toMetadata(metadata: LumaRawNativeMetadata): LumaRawMetadata {
  return {
    width: metadata.width,
    height: metadata.height,
    rawWidth: metadata.rawWidth,
    rawHeight: metadata.rawHeight,
    make: metadata.make,
    model: metadata.model,
    lens: metadata.lens,
    iso: metadata.iso,
    aperture: metadata.aperture,
    focalLength: metadata.focalLength,
    shutter: metadata.shutter,
    timestamp: metadata.timestamp,
    orientation: metadata.orientation,
    blackLevel: metadata.blackLevel,
    whiteLevel: metadata.whiteLevel,
    thumbnail: metadata.thumbnail,
    supportLevel:
      metadata.width !== undefined && metadata.height !== undefined
        ? 'experimental'
        : 'unsupported',
  }
}

function toMimeType(thumbnail: LumaRawNativeThumbnail) {
  return thumbnail.format === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'
}

function failureResponse(
  request: LumaRawWorkerRequest,
  error: unknown,
): LumaRawWorkerResponse {
  const runtimeError = normalizeRawRuntimeError(error, 'RAW_OPEN_FAILED')

  return {
    id: request.id,
    ok: false,
    type: request.type,
    error: {
      code: runtimeError.code,
      message: runtimeError.message,
    },
  } as LumaRawWorkerResponse
}

function cancelledResponse(
  request: LumaRawWorkerRequest,
): LumaRawWorkerResponse {
  return failureResponse(
    request,
    new LumaRawRuntimeError(
      'RAW_JOB_CANCELLED',
      'RAW runtime job was cancelled.',
    ),
  )
}

function createProbePayload(
  id: string,
  nativeMetadata: LumaRawNativeMetadata,
  timings: LumaRawTimings,
): LumaRawProbe {
  return {
    ...toMetadata(nativeMetadata),
    jobId: id,
    timings,
  }
}

function createFramePayload(
  request: LumaRawWorkerRequest<'decodeQuick' | 'decodeHq'>,
  nativeMetadata: LumaRawNativeMetadata,
  image: LumaRawNativeImage,
  timings: LumaRawTimings,
): LumaRawFrame {
  const metadata = toMetadata(nativeMetadata)

  return {
    jobId: request.id,
    sessionId: request.payload.sessionId,
    source: request.type === 'decodeHq' ? 'hq' : 'quick',
    width: image.width,
    height: image.height,
    data: image.data,
    layout: 'rgb',
    bitDepth: image.bits,
    colorSpace: 'linear-prophoto-rgb',
    orientation: metadata.orientation ?? 1,
    blackLevel: metadata.blackLevel,
    whiteLevel: metadata.whiteLevel,
    metadata,
    timings,
  }
}

export function createRuntimeCore(nativeFactory: LumaRawNativeFactory) {
  const cancelledJobIds = new Set<string>()

  function consumeCancellation(request: LumaRawWorkerRequest) {
    return cancelledJobIds.delete(request.id)
  }

  function handleFileRequest(
    request: LumaRawWorkerRequest<
      'probe' | 'extractEmbeddedPreview' | 'decodeQuick' | 'decodeHq'
    >,
  ): LumaRawWorkerResponse {
    if (consumeCancellation(request)) {
      return cancelledResponse(request)
    }

    const timer = createTimer()
    const settings = request.type === 'decodeHq' ? hqSettings : quickSettings
    const processor = nativeFactory.createProcessor()
    let response: LumaRawWorkerResponse | undefined
    let primaryError: unknown
    let disposeError: unknown

    try {
      processor.openBuffer(new Uint8Array(request.payload.fileBuffer), settings)
      timer.mark('openBuffer')

      const nativeMetadata = processor.readMetadata()
      timer.mark('metadata')

      if (request.type === 'probe') {
        response = {
          id: request.id,
          ok: true,
          type: request.type,
          payload: createProbePayload(
            request.id,
            nativeMetadata,
            timer.finish(),
          ),
        }
      } else if (request.type === 'extractEmbeddedPreview') {
        const thumbnail = processor.extractThumbnail()
        timer.mark('thumbnail')

        const payload: LumaEmbeddedPreview | null = thumbnail
          ? {
              jobId: request.id,
              sessionId: request.payload.sessionId,
              source: 'embedded',
              width: thumbnail.width,
              height: thumbnail.height,
              data: thumbnail.data,
              mimeType: toMimeType(thumbnail),
              colorSpace: 'display-srgb-preview',
              orientation: nativeMetadata.orientation ?? 1,
              timings: timer.finish(),
            }
          : null

        response = {
          id: request.id,
          ok: true,
          type: request.type,
          payload,
        }
      } else {
        const image =
          request.type === 'decodeHq'
            ? processor.decodeHq()
            : processor.decodePreview()
        timer.mark('unpack')

        response = {
          id: request.id,
          ok: true,
          type: request.type,
          payload: createFramePayload(
            request,
            nativeMetadata,
            image,
            timer.finish(),
          ),
        }
      }
    } catch (error) {
      primaryError = error
    } finally {
      try {
        processor.dispose()
      } catch (error) {
        disposeError = error
      }

      if (!primaryError && response?.ok && consumeCancellation(request)) {
        response = cancelledResponse(request)
      }
    }

    if (primaryError) {
      throw primaryError
    }
    if (disposeError) {
      throw disposeError
    }

    return response ?? cancelledResponse(request)
  }

  return {
    async handleRequest(
      request: LumaRawWorkerRequest,
    ): Promise<LumaRawWorkerResponse> {
      try {
        switch (request.type) {
          case 'init':
            return {
              id: request.id,
              ok: true,
              type: request.type,
              payload: getRuntimeInfo(),
            }
          case 'cancel':
            cancelledJobIds.add(request.payload.targetJobId)
            return {
              id: request.id,
              ok: true,
              type: request.type,
              payload: { cancelled: true },
            }
          case 'probe':
          case 'extractEmbeddedPreview':
          case 'decodeQuick':
          case 'decodeHq':
            return handleFileRequest(request)
        }
      } catch (error) {
        return failureResponse(request, error)
      }
    },
  }
}

export type LumaRawRuntimeCore = ReturnType<typeof createRuntimeCore>
