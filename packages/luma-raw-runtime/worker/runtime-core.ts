import { LumaRawRuntimeError, normalizeRawRuntimeError } from '../src/errors'
import type {
  LumaEmbeddedPreview,
  LumaRawFrame,
  LumaRawHeapStats,
  LumaRawMetadata,
  LumaRawProbe,
  LumaRawRuntimeInfo,
  LumaRawSessionInfo,
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
  LumaRawNativeOpenTimings,
  LumaRawNativeProcessor,
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

const maxCancelledJobIds = 128

type Timer = {
  mark: (name: Exclude<keyof LumaRawTimings, 'total'>) => void
  assign: (values: Partial<LumaRawTimings>) => void
  finish: () => LumaRawTimings
}

type RuntimeSession = {
  sessionId: string
  processor: LumaRawNativeProcessor
  maxOutputPixels?: number
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
    assign(values) {
      Object.assign(timings, values)
      last = now()
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
  // "bitmap" is native/raw bitmap bytes, not a PNG container. Only advertise
  // image/png once a native adapter exposes an explicit PNG-encoded format.
  return thumbnail.format === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'
}

function cloneUint8Array(data: Uint8Array) {
  return new Uint8Array(data)
}

function cloneUint16Array(data: Uint16Array) {
  return new Uint16Array(data)
}

function asOpenTiming(value: unknown, label: keyof LumaRawNativeOpenTimings) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `Native RAW openBuffer returned invalid ${label} timing.`,
    )
  }

  return value
}

function normalizeOpenTimings(
  timings: unknown,
): LumaRawNativeOpenTimings | undefined {
  if (timings === undefined) return undefined
  if (timings === null || typeof timings !== 'object') {
    throw new TypeError('Native RAW openBuffer returned invalid timing data.')
  }

  const raw = timings as Record<string, unknown>

  return {
    copyToWasm: asOpenTiming(raw.copyToWasm, 'copyToWasm'),
    librawOpen: asOpenTiming(raw.librawOpen, 'librawOpen'),
  }
}

function normalizeRequiredOpenTimings(timings: unknown) {
  const openTimings = normalizeOpenTimings(timings)
  if (!openTimings) {
    throw new TypeError('Native RAW openBuffer returned invalid timing data.')
  }

  return openTimings
}

function normalizeLoadBufferTimings(timings: unknown) {
  if (
    timings === null ||
    timings === undefined ||
    typeof timings !== 'object'
  ) {
    throw new TypeError('Native RAW openBuffer returned invalid timing data.')
  }

  const raw = timings as Record<string, unknown>

  return {
    copyToWasm: asOpenTiming(raw.copyToWasm, 'copyToWasm'),
  }
}

function openProcessorWithSettings(
  processor: LumaRawNativeProcessor,
  settings: LumaRawNativeOpenSettings,
  timer: Timer,
  copyToWasmOffset = 0,
) {
  const openTimings = normalizeRequiredOpenTimings(
    processor.openWithSettings(settings),
  )
  const copyToWasm = copyToWasmOffset + openTimings.copyToWasm
  timer.assign({
    copyToWasm,
    librawOpen: openTimings.librawOpen,
    openBuffer: copyToWasm + openTimings.librawOpen,
  })
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
  request: LumaRawWorkerRequest<
    | 'decodeQuick'
    | 'decodeHq'
    | 'decodeQuickFromSession'
    | 'decodeHqFromSession'
  >,
  nativeMetadata: LumaRawNativeMetadata,
  image: LumaRawNativeImage,
  timings: LumaRawTimings,
  heap?: LumaRawHeapStats,
): LumaRawFrame {
  const metadata = toMetadata(nativeMetadata)
  const isHq =
    request.type === 'decodeHq' || request.type === 'decodeHqFromSession'

  return {
    jobId: request.id,
    sessionId: request.payload.sessionId,
    source: isHq ? 'hq' : 'quick',
    width: image.width,
    height: image.height,
    // Native adapters may return views into WASM/pooled memory; transfer only owned tight buffers.
    data: cloneUint16Array(image.data),
    layout: 'rgb',
    bitDepth: image.bits,
    colorSpace: 'linear-prophoto-rgb',
    orientation: metadata.orientation ?? 1,
    blackLevel: metadata.blackLevel,
    whiteLevel: metadata.whiteLevel,
    metadata,
    timings,
    ...(heap ? { heap } : {}),
  }
}

export function createRuntimeCore(nativeFactory: LumaRawNativeFactory) {
  const cancelledJobIds = new Set<string>()
  const cancelledJobQueue: string[] = []
  const sessions = new Map<string, RuntimeSession>()
  let sessionCounter = 0

  function nextSessionId() {
    sessionCounter += 1
    return `raw-session-${sessionCounter}`
  }

  function readHeapBytes() {
    return nativeFactory.heapBytes?.()
  }

  function createHeapStats(before?: number, after?: number) {
    if (before === undefined && after === undefined) return undefined

    const heap: LumaRawHeapStats = {}
    if (before !== undefined) heap.before = before
    if (after !== undefined) heap.after = after
    return heap
  }

  function requireSession(sessionId: string) {
    const session = sessions.get(sessionId)
    if (!session) {
      throw new LumaRawRuntimeError(
        'RAW_WORKER_PROTOCOL_ERROR',
        `RAW runtime session does not exist: ${sessionId}`,
      )
    }

    return session
  }

  function rememberCancellation(jobId: string) {
    if (cancelledJobIds.has(jobId)) return

    cancelledJobIds.add(jobId)
    cancelledJobQueue.push(jobId)

    while (cancelledJobQueue.length > maxCancelledJobIds) {
      const expiredJobId = cancelledJobQueue.shift()
      if (expiredJobId) {
        cancelledJobIds.delete(expiredJobId)
      }
    }
  }

  function consumeCancellation(request: LumaRawWorkerRequest) {
    const wasCancelled = cancelledJobIds.delete(request.id)
    if (!wasCancelled) return false

    const index = cancelledJobQueue.indexOf(request.id)
    if (index !== -1) {
      cancelledJobQueue.splice(index, 1)
    }
    return true
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
      const openStart = now()
      const openTimings = normalizeOpenTimings(
        processor.openBuffer(
          new Uint8Array(request.payload.fileBuffer),
          settings,
        ),
      )
      const openElapsed = now() - openStart
      timer.assign(
        openTimings
          ? {
              copyToWasm: openTimings.copyToWasm,
              librawOpen: openTimings.librawOpen,
              openBuffer: openTimings.copyToWasm + openTimings.librawOpen,
            }
          : {
              openBuffer: openElapsed,
            },
      )

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
              // Native adapters may return views into WASM/pooled memory; transfer only owned tight buffers.
              data: cloneUint8Array(thumbnail.data),
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

  function disposeSession(session: RuntimeSession) {
    sessions.delete(session.sessionId)
    session.processor.dispose()
  }

  function handleOpenSession(
    request: LumaRawWorkerRequest<'openSession'>,
  ): LumaRawWorkerResponse {
    if (consumeCancellation(request)) {
      return cancelledResponse(request)
    }

    const timer = createTimer()
    const heapBefore = readHeapBytes()
    const sessionId = nextSessionId()
    const processor = nativeFactory.createProcessor()
    let session: RuntimeSession | undefined
    let response: LumaRawWorkerResponse | undefined
    let primaryError: unknown
    let disposeError: unknown

    try {
      const loadTimings = normalizeLoadBufferTimings(
        processor.loadBuffer(new Uint8Array(request.payload.fileBuffer)),
      )
      openProcessorWithSettings(
        processor,
        quickSettings,
        timer,
        loadTimings.copyToWasm,
      )

      const nativeMetadata = processor.readMetadata()
      timer.mark('metadata')
      const timings = timer.finish()
      const heapAfter = readHeapBytes()
      const heap = createHeapStats(heapBefore, heapAfter)
      session = {
        sessionId,
        processor,
        maxOutputPixels: request.payload.maxOutputPixels,
      }
      sessions.set(sessionId, session)

      const payload: LumaRawSessionInfo = {
        sessionId,
        probe: createProbePayload(request.id, nativeMetadata, timings),
        timings,
        ...(heap ? { heap } : {}),
      }

      response = {
        id: request.id,
        ok: true,
        type: request.type,
        payload,
      }
    } catch (error) {
      primaryError = error
    } finally {
      if (primaryError && !session) {
        try {
          processor.dispose()
        } catch (error) {
          disposeError = error
        }
      }

      if (!primaryError && response?.ok && consumeCancellation(request)) {
        if (session) {
          try {
            disposeSession(session)
          } catch (error) {
            disposeError = error
          }
        }
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

  function handleCloseSession(
    request: LumaRawWorkerRequest<'closeSession'>,
  ): LumaRawWorkerResponse {
    const session = requireSession(request.payload.sessionId)
    disposeSession(session)

    return {
      id: request.id,
      ok: true,
      type: request.type,
      payload: { closed: true },
    }
  }

  function handleExtractEmbeddedPreviewFromSession(
    request: LumaRawWorkerRequest<'extractEmbeddedPreviewFromSession'>,
  ): LumaRawWorkerResponse {
    if (consumeCancellation(request)) {
      return cancelledResponse(request)
    }

    const session = requireSession(request.payload.sessionId)
    const timer = createTimer()
    const heapBefore = readHeapBytes()

    openProcessorWithSettings(session.processor, quickSettings, timer)
    const nativeMetadata = session.processor.readMetadata()
    timer.mark('metadata')

    const thumbnail = session.processor.extractThumbnail()
    timer.mark('thumbnail')
    const heapAfter = readHeapBytes()
    const heap = createHeapStats(heapBefore, heapAfter)

    const payload: LumaEmbeddedPreview | null = thumbnail
      ? {
          jobId: request.id,
          sessionId: session.sessionId,
          source: 'embedded',
          width: thumbnail.width,
          height: thumbnail.height,
          // Native adapters may return views into WASM/pooled memory; transfer only owned tight buffers.
          data: cloneUint8Array(thumbnail.data),
          mimeType: toMimeType(thumbnail),
          colorSpace: 'display-srgb-preview',
          orientation: nativeMetadata.orientation ?? 1,
          timings: timer.finish(),
          ...(heap ? { heap } : {}),
        }
      : null

    const response: LumaRawWorkerResponse = {
      id: request.id,
      ok: true,
      type: request.type,
      payload,
    }

    if (consumeCancellation(request)) {
      return cancelledResponse(request)
    }

    return response
  }

  function handleDecodeFromSession(
    request: LumaRawWorkerRequest<
      'decodeQuickFromSession' | 'decodeHqFromSession'
    >,
  ): LumaRawWorkerResponse {
    if (consumeCancellation(request)) {
      return cancelledResponse(request)
    }

    const session = requireSession(request.payload.sessionId)
    const timer = createTimer()
    const heapBefore = readHeapBytes()
    const settings =
      request.type === 'decodeHqFromSession' ? hqSettings : quickSettings

    openProcessorWithSettings(session.processor, settings, timer)
    const nativeMetadata = session.processor.readMetadata()
    timer.mark('metadata')

    const image =
      request.type === 'decodeHqFromSession'
        ? session.processor.decodeHq()
        : session.processor.decodePreview({
            maxOutputPixels:
              request.payload.maxOutputPixels ?? session.maxOutputPixels,
          })
    timer.mark('unpack')
    const heapAfter = readHeapBytes()
    const response: LumaRawWorkerResponse = {
      id: request.id,
      ok: true,
      type: request.type,
      payload: createFramePayload(
        request,
        nativeMetadata,
        image,
        timer.finish(),
        createHeapStats(heapBefore, heapAfter),
      ),
    }

    if (consumeCancellation(request)) {
      return cancelledResponse(request)
    }

    return response
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
            rememberCancellation(request.payload.targetJobId)
            return {
              id: request.id,
              ok: true,
              type: request.type,
              payload: { cancelled: true },
            }
          case 'openSession':
            return handleOpenSession(request)
          case 'closeSession':
            return handleCloseSession(request)
          case 'extractEmbeddedPreviewFromSession':
            return handleExtractEmbeddedPreviewFromSession(request)
          case 'decodeQuickFromSession':
          case 'decodeHqFromSession':
            return handleDecodeFromSession(request)
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
