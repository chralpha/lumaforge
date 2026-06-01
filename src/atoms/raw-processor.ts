/**
 * Jotai atoms for RAW processor state management.
 */

import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { atom } from 'jotai'

import type { PipelineStats } from '~/lib/gl/pipeline'
import { createAtomHooks } from '~/lib/jotai'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import type { ProcessingStatus } from '~/modules/raw-processor/model/workflow'

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
 * Processing status atom
 */
const baseProcessingStatusAtom = atom<ProcessingStatus>('idle')

export const [
  ,
  ,
  useProcessingStatusValue,
  useSetProcessingStatus,
  ,
  setProcessingStatus,
] = createAtomHooks(baseProcessingStatusAtom)

/**
 * Error message atom
 */
const baseErrorMessageAtom = atom<string | null>(null)

export const [, , useErrorMessageValue, useSetErrorMessage, , setErrorMessage] =
  createAtomHooks(baseErrorMessageAtom)

/**
 * Progress value atom (0-100)
 */
const baseProgressAtom = atom<number>(0)

export const [, , useProgressValue, useSetProgress, , setProgress] =
  createAtomHooks(baseProgressAtom)

/**
 * Loaded LUT atom
 */
const baseLutAtom = atom<ParsedLUT | null>(null)

export const [, , useLutValue, useSetLut, getLut, setLut] =
  createAtomHooks(baseLutAtom)

/**
 * Pipeline stats atom
 */
const basePipelineStatsAtom = atom<PipelineStats | null>(null)

export const [
  ,
  ,
  usePipelineStatsValue,
  useSetPipelineStats,
  ,
  setPipelineStats,
] = createAtomHooks(basePipelineStatsAtom)

/**
 * Reset all state
 */
export function resetProcessorState(): void {
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
