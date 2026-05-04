import type { RawRenderExposure } from '@lumaforge/luma-color-runtime'

import { getExportModeCopy } from '~/lib/export/execution-profile'

import { deriveExportDisabledReason } from '../model/derive-session'
import type { ImageSession } from '../model/session'
import { selectCurrentExportExecutionPlan } from './export-system'

const MISSING_RAW_RENDER_EXPOSURE_EXPORT_REASON =
  'RAW preview exposure is still being prepared.'

type SupportedFullResCapability = Extract<
  ImageSession['exportState']['fullResCapability'],
  { status: 'supported' }
>

export type FullResExportReadiness =
  | {
      canExport: true
      sourceFile: File
      session: ImageSession
      rawRenderExposure: RawRenderExposure
      fullResCapability: SupportedFullResCapability
      disabledReason?: undefined
    }
  | {
      canExport: false
      disabledReason: string
    }

function getUnsafeFullResExportReason(input: {
  session: ImageSession
  fidelity?: 'safe' | 'balanced' | 'max'
}) {
  const capability = input.session.exportState.fullResCapability
  if (capability.status !== 'supported') return undefined

  const plan = selectCurrentExportExecutionPlan({
    fidelity: input.fidelity ?? 'balanced',
    sourceWidth: capability.width,
    sourceHeight: capability.height,
  })

  return plan.productCopy === 'cannot-safely-complete'
    ? getExportModeCopy(plan.productCopy)
    : undefined
}

export function deriveFullResExportReadiness(input: {
  sourceFile: File | null
  session: ImageSession | null
  rawRenderExposure: RawRenderExposure | null | undefined
  fidelity?: 'safe' | 'balanced' | 'max'
}): FullResExportReadiness {
  if (!input.sourceFile || !input.session) {
    return {
      canExport: false,
      disabledReason: 'Full-resolution export source is still loading.',
    }
  }

  const sessionReason = deriveExportDisabledReason(input.session)
  if (sessionReason) {
    return { canExport: false, disabledReason: sessionReason }
  }

  const fullResCapability = input.session.exportState.fullResCapability
  if (fullResCapability.status !== 'supported') {
    return {
      canExport: false,
      disabledReason:
        'Full-resolution export support has not been checked yet.',
    }
  }

  if (!input.rawRenderExposure) {
    return {
      canExport: false,
      disabledReason: MISSING_RAW_RENDER_EXPOSURE_EXPORT_REASON,
    }
  }

  const unsafeReason = getUnsafeFullResExportReason({
    session: input.session,
    fidelity: input.fidelity,
  })
  if (unsafeReason) {
    return { canExport: false, disabledReason: unsafeReason }
  }

  return {
    canExport: true,
    sourceFile: input.sourceFile,
    session: input.session,
    rawRenderExposure: input.rawRenderExposure,
    fullResCapability,
    disabledReason: undefined,
  }
}
