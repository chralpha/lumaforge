/**
 * Jotai atoms for RAW processor state management.
 */

import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { atom } from 'jotai'

import type { PipelineStats } from '~/lib/gl/pipeline'
import { createAtomHooks } from '~/lib/jotai'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import type { DecodedImage, ImageMetadata } from '~/lib/raw/decoder'

/**
 * Processing status
 */
export type ProcessingStatus =
  | 'idle'
  | 'warming'
  | 'loading'
  | 'decoding'
  | 'processing'
  | 'exporting'
  | 'ready'
  | 'error'

/**
 * Current loaded image state
 */
export interface LoadedImageState {
  file: File | null
  decoded: DecodedImage | null
  metadata: ImageMetadata | null
}

/**
 * Processing parameters atom
 */
const DEFAULT_PROCESSING_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
  userTemperature: 0,
  userTint: 0,
}

const baseProcessingParamsAtom = atom<ProcessingParams>({
  ...DEFAULT_PROCESSING_PARAMS,
})

export const [
  processingParamsAtom,
  useProcessingParams,
  useProcessingParamsValue,
  useSetProcessingParams,
  getProcessingParams,
  setProcessingParams,
] = createAtomHooks(baseProcessingParamsAtom)

/**
 * Loaded image atom
 */
const baseLoadedImageAtom = atom<LoadedImageState>({
  file: null,
  decoded: null,
  metadata: null,
})

export const [
  loadedImageAtom,
  useLoadedImage,
  useLoadedImageValue,
  useSetLoadedImage,
  getLoadedImage,
  setLoadedImage,
] = createAtomHooks(baseLoadedImageAtom)

/**
 * Processing status atom
 */
const baseProcessingStatusAtom = atom<ProcessingStatus>('idle')

export const [
  processingStatusAtom,
  useProcessingStatus,
  useProcessingStatusValue,
  useSetProcessingStatus,
  getProcessingStatus,
  setProcessingStatus,
] = createAtomHooks(baseProcessingStatusAtom)

/**
 * Error message atom
 */
const baseErrorMessageAtom = atom<string | null>(null)

export const [
  errorMessageAtom,
  useErrorMessage,
  useErrorMessageValue,
  useSetErrorMessage,
  getErrorMessage,
  setErrorMessage,
] = createAtomHooks(baseErrorMessageAtom)

/**
 * Progress value atom (0-100)
 */
const baseProgressAtom = atom<number>(0)

export const [
  progressAtom,
  useProgress,
  useProgressValue,
  useSetProgress,
  getProgress,
  setProgress,
] = createAtomHooks(baseProgressAtom)

/**
 * Loaded LUT atom
 */
const baseLutAtom = atom<ParsedLUT | null>(null)

export const [lutAtom, useLut, useLutValue, useSetLut, getLut, setLut] =
  createAtomHooks(baseLutAtom)

/**
 * Pipeline stats atom
 */
const basePipelineStatsAtom = atom<PipelineStats | null>(null)

export const [
  pipelineStatsAtom,
  usePipelineStats,
  usePipelineStatsValue,
  useSetPipelineStats,
  getPipelineStats,
  setPipelineStats,
] = createAtomHooks(basePipelineStatsAtom)

/**
 * Preview scale factor (for reduced resolution preview)
 */
const basePreviewScaleAtom = atom<number>(0.5)

export const [
  previewScaleAtom,
  usePreviewScale,
  usePreviewScaleValue,
  useSetPreviewScale,
  getPreviewScale,
  setPreviewScale,
] = createAtomHooks(basePreviewScaleAtom)

/**
 * Computed selectors
 */

// Check if an image is loaded
export const hasImageAtom = atom((get) => {
  const image = get(loadedImageAtom)
  return image.decoded !== null
})

// Check if a LUT is loaded
export const hasLutAtom = atom((get) => get(lutAtom) !== null)

// Check if ready for export
export const canExportAtom = atom((get) => {
  const status = get(processingStatusAtom)
  const hasImage = get(hasImageAtom)
  return status === 'ready' && hasImage
})

/**
 * Reset all state
 */
export function resetProcessorState(): void {
  setLoadedImage({ file: null, decoded: null, metadata: null })
  setProcessingStatus('idle')
  setErrorMessage(null)
  setProgress(0)
  setPipelineStats(null)
  // Don't reset LUT or processing params - user may want to keep them
}

/**
 * Reset to defaults
 */
export function resetToDefaults(): void {
  resetProcessorState()
  setLut(null)
  setProcessingParams({ ...DEFAULT_PROCESSING_PARAMS })
}
