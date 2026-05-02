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
    !(image.data instanceof Uint16Array) ||
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
    const debounceTimer = window.setTimeout(() => {
      if (versionRef.current !== runVersion) return

      setState({ state: 'computing', previous })

      const { image } = job
      const processor = createPreviewHistogramProcessor({
        width: image.width,
        rowBandRows: ROW_BAND_ROWS,
        graph: job.graph,
      })
      let nextRow = 0

      const processNextBand = () => {
        if (versionRef.current !== runVersion) return

        if (nextRow >= image.height) {
          const ready = processor.finish({
            source: image.source,
            width: image.width,
            height: image.height,
            totalRows: image.height,
            ownership: 'main-thread-chunked-no-copy',
            inputByteLength: image.data.buffer.byteLength,
          })
          if (versionRef.current === runVersion) {
            setState(ready)
          }
          return
        }

        const rowCount = Math.min(ROW_BAND_ROWS, image.height - nextRow)
        const start = nextRow * image.width * 3
        const end = start + rowCount * image.width * 3
        processor.processUint16Rows(image.data.subarray(start, end), rowCount)
        nextRow += rowCount
        chunkTimer = scheduleChunk(runVersion, versionRef, processNextBand)
      }

      processNextBand()
    }, COMPUTE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(debounceTimer)
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
