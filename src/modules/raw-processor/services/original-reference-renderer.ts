import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import type { RawUploadInput } from '~/lib/gl/pipeline'
import { RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import type { OriginalReferenceSnapshot } from './original-reference-snapshot'

type PipelineLike = Pick<
  RawProcessingPipeline,
  'initialize' | 'uploadImage' | 'setParams' | 'render' | 'dispose'
>

export type RenderOriginalReferenceSnapshotInput = {
  image: DecodedImage
  key: string
  maxPixels: number
  createCanvas?: () => HTMLCanvasElement
  createPipeline?: (canvas: HTMLCanvasElement) => PipelineLike
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
}

const ORIGINAL_REFERENCE_PARAMS: ProcessingParams = {
  viewMode: 'original',
  compareSplit: 0.5,
  intensity: 0,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

function fitWithinPixelCap(width: number, height: number, maxPixels: number) {
  const sourcePixels = Math.max(1, width * height)
  const scale = Math.min(1, Math.sqrt(Math.max(1, maxPixels) / sourcePixels))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.92,
    )
  })
}

function createSnapshotUploadInput(image: DecodedImage): RawUploadInput {
  if (
    image.layout === 'rgb-u16' &&
    image.colorSpace === 'linear-prophoto-rgb' &&
    image.data instanceof Uint16Array
  ) {
    return {
      data: image.data,
      width: image.width,
      height: image.height,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      renderExposureEv: image.renderExposure.ev,
      renderExposureMultiplier: image.renderExposure.multiplier,
    }
  }

  if (
    image.layout === 'rgba-float32' &&
    image.colorSpace === 'display-srgb-preview' &&
    image.data instanceof Float32Array
  ) {
    return {
      data: image.data,
      width: image.width,
      height: image.height,
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
    }
  }

  throw new Error('ORIGINAL_REFERENCE_SNAPSHOT_UNSUPPORTED_INPUT')
}

export async function renderOriginalReferenceSnapshot({
  image,
  key,
  maxPixels,
  createCanvas = () => document.createElement('canvas'),
  createPipeline = (canvas) => new RawProcessingPipeline(canvas),
  createObjectURL = URL.createObjectURL.bind(URL),
}: RenderOriginalReferenceSnapshotInput): Promise<OriginalReferenceSnapshot> {
  const canvas = createCanvas()
  const target = fitWithinPixelCap(image.width, image.height, maxPixels)
  canvas.width = target.width
  canvas.height = target.height

  const pipeline = createPipeline(canvas)
  try {
    await pipeline.initialize()
    pipeline.uploadImage(createSnapshotUploadInput(image))
    pipeline.setParams(ORIGINAL_REFERENCE_PARAMS)
    pipeline.render({ waitForGpu: true })

    const blob = await canvasToJpegBlob(canvas)
    return {
      key,
      objectUrl: createObjectURL(blob),
      width: target.width,
      height: target.height,
      source: image.source === 'bounded-hq' ? 'bounded-hq' : 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: blob.size,
    }
  } finally {
    pipeline.dispose({ releaseContext: true })
  }
}
