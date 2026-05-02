import type {
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
  ReadyPreviewHistogram,
} from '@lumaforge/luma-color-runtime'
import {
  createPreviewHistogramProcessor,
  resolveExportColorGraph,
} from '@lumaforge/luma-color-runtime'
import type { RefObject } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { DecodedImage } from '~/lib/raw/decoder'

import type { DisplaySource } from '../model/session'

const ROW_BAND_ROWS = 32
const COMPUTE_DEBOUNCE_MS = 150
const MAX_HISTOGRAM_SAMPLED_PIXELS = 500_000
const UNSUPPORTED_PREVIEW_REASON =
  'Preview histogram requires RGB16 Linear ProPhoto preview data.'

type PreviewHistogramInput = {
  imageRef: RefObject<DecodedImage | null>
  imageVersion: number
  params: ProcessingParams
  lutDataRef: RefObject<LUTData | null>
  lutDataVersion: number
  displaySource: DisplaySource
}

type ValidHistogramImage = DecodedImage & {
  data: Uint16Array
  source: 'quick' | 'bounded-hq'
}

type HistogramJob =
  | {
      kind: 'unavailable' | 'unsupported'
      key: string
      state: PreviewHistogramState
    }
  | {
      kind: 'compute'
      key: string
      image: ValidHistogramImage
      graph: Parameters<typeof createPreviewHistogramProcessor>[0]['graph']
    }

function getPreviousReady(
  state: PreviewHistogramState,
): ReadyPreviewHistogram | null {
  if (state.state === 'ready') return state
  if (state.state === 'stale' || state.state === 'computing') {
    return state.previous
  }
  return null
}

function hasExpectedRgb16DataLength(image: DecodedImage) {
  if (!(image.data instanceof Uint16Array)) return false

  const expectedLength = image.width * image.height * 3
  return (
    Number.isSafeInteger(expectedLength) &&
    expectedLength > 0 &&
    image.data.length === expectedLength
  )
}

function createHistogramJob({
  imageRef,
  imageVersion,
  params,
  lutDataRef,
  lutDataVersion,
  displaySource,
}: PreviewHistogramInput): HistogramJob {
  const image = imageRef.current
  const toneKey = [
    params.styleKind,
    params.intensity,
    params.builtinPreset ?? '',
    params.userExposureEv ?? 0,
    params.userContrast ?? 0,
  ].join(':')

  if (!image) {
    const reason = displaySource === 'embedded' ? 'embedded-only' : 'no-image'
    return {
      kind: 'unavailable',
      key: ['unavailable', displaySource, imageVersion, toneKey].join('|'),
      state: { state: 'unavailable', reason },
    }
  }

  const imageKey = [
    imageVersion,
    image.width,
    image.height,
    image.layout,
    image.colorSpace,
    image.source ?? '',
    image.renderExposure.ev,
    image.renderExposure.multiplier,
  ].join(':')
  const key = [
    'compute',
    imageKey,
    displaySource,
    toneKey,
    lutDataVersion,
  ].join('|')

  if (
    image.layout !== 'rgb-u16' ||
    image.colorSpace !== 'linear-prophoto-rgb' ||
    !hasExpectedRgb16DataLength(image) ||
    (image.source !== 'quick' && image.source !== 'bounded-hq')
  ) {
    return {
      kind: 'unsupported',
      key,
      state: {
        state: 'unsupported',
        reason: UNSUPPORTED_PREVIEW_REASON,
      },
    }
  }

  const graph = resolveExportColorGraph({
    styleKind: params.styleKind,
    intensity: params.intensity,
    builtinPreset: params.builtinPreset,
    lut: lutDataRef.current,
    rawRenderExposure: image.renderExposure,
    userExposureEv: params.userExposureEv,
    userContrast: params.userContrast,
  })

  if (!graph.supported) {
    return {
      kind: 'unsupported',
      key,
      state: {
        state: 'unsupported',
        reason: graph.message,
      },
    }
  }

  return {
    kind: 'compute',
    key,
    image: image as ValidHistogramImage,
    graph,
  }
}

function createInitialState(job: HistogramJob): PreviewHistogramState {
  if (job.kind !== 'compute') return job.state
  return { state: 'computing', previous: null }
}

function scheduleChunk(
  runVersion: number,
  activeVersionRef: RefObject<number>,
  work: () => void,
) {
  return window.setTimeout(() => {
    if (activeVersionRef.current !== runVersion) return
    work()
  }, 0)
}

function getPreviewHistogramRowStep(width: number, height: number) {
  const totalPixels = width * height
  if (
    !Number.isSafeInteger(totalPixels) ||
    totalPixels <= MAX_HISTOGRAM_SAMPLED_PIXELS
  ) {
    return 1
  }

  return Math.max(1, Math.ceil(totalPixels / MAX_HISTOGRAM_SAMPLED_PIXELS))
}

export function usePreviewHistogram(
  input: PreviewHistogramInput,
): PreviewHistogramState {
  const {
    imageRef,
    imageVersion,
    params,
    lutDataRef,
    lutDataVersion,
    displaySource,
  } = input
  const { styleKind, intensity, builtinPreset, userExposureEv, userContrast } =
    params
  const histogramParams = useMemo<ProcessingParams>(
    () => ({
      styleKind,
      intensity,
      builtinPreset,
      userExposureEv,
      userContrast,
      viewMode: 'processed',
      compareSplit: 0.5,
    }),
    [builtinPreset, intensity, styleKind, userContrast, userExposureEv],
  )
  const job = useMemo(
    () =>
      createHistogramJob({
        imageRef,
        imageVersion,
        params: histogramParams,
        lutDataRef,
        lutDataVersion,
        displaySource,
      }),
    [
      displaySource,
      histogramParams,
      imageRef,
      imageVersion,
      lutDataRef,
      lutDataVersion,
    ],
  )
  const [state, setState] = useState<PreviewHistogramState>(() =>
    createInitialState(job),
  )
  const stateRef = useRef(state)
  const jobKeyRef = useRef(job.key)
  const versionRef = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const runVersion = versionRef.current + 1
    versionRef.current = runVersion
    jobKeyRef.current = job.key

    if (job.kind !== 'compute') {
      setState(job.state)
      return
    }

    const previous = getPreviousReady(stateRef.current)
    setState(
      previous
        ? { state: 'stale', previous }
        : { state: 'computing', previous: null },
    )

    let chunkTimer: number | null = null
    const computeDelayMs =
      previous && previous.source === job.image.source ? COMPUTE_DEBOUNCE_MS : 0

    const computeTimer = window.setTimeout(() => {
      if (versionRef.current !== runVersion) return

      setState({ state: 'computing', previous })

      const { image } = job
      const processor = createPreviewHistogramProcessor({
        width: image.width,
        rowBandRows: ROW_BAND_ROWS,
        graph: job.graph,
      })
      const rowStep = getPreviewHistogramRowStep(image.width, image.height)
      let nextRow = 0
      let processedRows = 0

      const finishReady = () => {
        if (nextRow >= image.height) {
          const ready = processor.finish({
            source: image.source,
            width: image.width,
            height: image.height,
            totalRows: processedRows,
            ownership: 'main-thread-chunked-no-copy',
            inputByteLength: image.data.buffer.byteLength,
          })
          if (versionRef.current === runVersion) {
            setState(ready)
          }
        }
      }

      const processOneBand = () => {
        if (rowStep === 1) {
          const rowCount = Math.min(ROW_BAND_ROWS, image.height - nextRow)
          const start = nextRow * image.width * 3
          const end = start + rowCount * image.width * 3
          processor.processUint16Rows(image.data.subarray(start, end), rowCount)
          nextRow += rowCount
          processedRows += rowCount
        } else {
          let rowsThisChunk = 0
          while (rowsThisChunk < ROW_BAND_ROWS && nextRow < image.height) {
            const start = nextRow * image.width * 3
            const end = start + image.width * 3
            processor.processUint16Rows(image.data.subarray(start, end), 1)
            nextRow += rowStep
            processedRows += 1
            rowsThisChunk += 1
          }
        }
      }

      const processNextBand = () => {
        if (versionRef.current !== runVersion) return

        if (nextRow >= image.height) {
          finishReady()
          return
        }

        processOneBand()
        chunkTimer = scheduleChunk(runVersion, versionRef, processNextBand)
      }

      if (previous === null && image.source === 'quick') {
        while (versionRef.current === runVersion && nextRow < image.height) {
          processOneBand()
        }
        finishReady()
        return
      }

      processNextBand()
    }, computeDelayMs)

    return () => {
      window.clearTimeout(computeTimer)
      if (chunkTimer !== null) {
        window.clearTimeout(chunkTimer)
      }
    }
  }, [job])

  if (jobKeyRef.current !== job.key) {
    if (job.kind !== 'compute') return job.state
    const previous = getPreviousReady(state)
    return previous
      ? { state: 'stale', previous }
      : { state: 'computing', previous: null }
  }

  return state
}
