import type {
  LUTColorProfile,
  LUTContractSelection,
  LUTData,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import { toast } from 'sonner'

import type { ParsedLUT } from '~/lib/lut/cube-parser'
import {
  isSupportedLUT,
  parseCubeLUT,
  validateLUT,
} from '~/lib/lut/cube-parser'
import {
  applyLUTContractSelection,
  toLUTContractSelection,
} from '~/lib/lut/profile-resolution'
import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import {
  createBrowserOnlineProfileCache,
  fetchCachedBytesWithLimit,
  fetchVerifiedCubeAsset,
} from '~/lib/profiles/fetch'

import type { ImageSession, StyleAsset } from '../../model/session'
import {
  applyActiveLookToSession,
  preserveCustomLookIntensity,
} from '../look-session-state'
import {
  resolveLUTContractProfile,
  resolveOnlineLUTSourceName,
} from '../lut-workflow'
import {
  buildLUTProfileSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from '../style-system'
import {
  getStableErrorCode,
  isAbortError,
  toUserFacingErrorCode,
} from '../workflow-status'

const MAX_ONLINE_CUBE_BYTES = 64 * 1024 * 1024
const onlineProfileCache = createBrowserOnlineProfileCache()

interface LoadLUTContentOptions {
  content: string
  sourceName: string
  trustedContract?: LUTContractSelection
}

export class LUTLoadError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LUTLoadError'
    this.code = code
  }
}

export interface LutLoadContext {
  atoms: {
    setLut: (lut: ParsedLUT | null) => void
    setSession: (
      value:
        | ImageSession
        | null
        | ((prev: ImageSession | null) => ImageSession | null),
    ) => void
    setParams: (
      value: ProcessingParams | ((prev: ProcessingParams) => ProcessingParams),
    ) => void
    getProcessingParams: () => ProcessingParams
    lut: ParsedLUT | null
    activeStyle: StyleAsset | null
  }
  refs: {
    lutDataRef: { current: LUTData | null }
    sessionRef: { current: ImageSession | null }
  }
  services: {
    scheduleToast: (notify: () => void) => void
    invalidateExportGraph: () => void
    setLutDataRef: (nextLutData: LUTData | null) => void
  }
}

function reportLUTLoadFailure(error: unknown, ctx: LutLoadContext): void {
  const message = error instanceof Error ? error.message : 'Failed to parse LUT'
  const stableCode = getStableErrorCode(error)
  const errorCode =
    toUserFacingErrorCode(stableCode ?? message) === 'RAW_UNKNOWN'
      ? 'LUT_PARSE_FAILED'
      : toUserFacingErrorCode(stableCode ?? message)

  ctx.atoms.setSession((prev) =>
    prev
      ? {
          ...prev,
          renderState: {
            ...prev.renderState,
            lastErrorCode: errorCode,
          },
        }
      : prev,
  )
  ctx.services.scheduleToast(() =>
    toast.error('Failed to load LUT', { description: message }),
  )
}

function applyLoadedLUT(parsed: ParsedLUT, ctx: LutLoadContext): void {
  const style = toCustomStyle(parsed)
  ctx.services.invalidateExportGraph()
  ctx.atoms.setLut(parsed)
  ctx.atoms.setSession((prev) =>
    prev
      ? applyActiveLookToSession(prev, {
          style,
          lutProfileSelection: buildLUTProfileSelectionState(parsed),
          clearExportResult: true,
        })
      : prev,
  )
  ctx.atoms.setParams((prev) => ({
    ...prev,
    styleKind: 'custom',
    builtinPreset: null,
    intensity: mapIntensityLevel(style.defaultIntensityLevel),
  }))
  ctx.services.scheduleToast(() =>
    toast.success(`Loaded LUT: ${parsed.title}`, {
      description: `${parsed.size}³ grid`,
    }),
  )
}

async function loadLUTContent(
  options: LoadLUTContentOptions,
  ctx: LutLoadContext,
): Promise<void> {
  const parsed = parseCubeLUT(options.content, {
    sourceName: options.sourceName,
  })
  const contracted = options.trustedContract
    ? applyLUTContractSelection(parsed, options.trustedContract)
    : parsed
  if (!contracted) throw new Error('Unsupported LUT color contract.')

  const validation = validateLUT(contracted)
  if (!validation.valid) {
    throw new LUTLoadError(
      'LUT_INVALID',
      validation.errors[0] ?? 'Invalid LUT file.',
    )
  }

  applyLoadedLUT(contracted, ctx)
}

export async function orchestrateLutLoadFromFile(
  file: File,
  ctx: LutLoadContext,
): Promise<void> {
  if (!isSupportedLUT(file)) {
    ctx.atoms.setSession((prev) =>
      prev
        ? {
            ...prev,
            renderState: {
              ...prev.renderState,
              lastErrorCode: 'LUT_UNSUPPORTED_FORMAT',
            },
          }
        : prev,
    )
    ctx.services.scheduleToast(() =>
      toast.error('Unsupported LUT format', {
        description: 'Only .cube files are supported',
      }),
    )
    return
  }

  try {
    await loadLUTContent(
      {
        content: await file.text(),
        sourceName: file.name,
      },
      ctx,
    )
  } catch (err) {
    reportLUTLoadFailure(err, ctx)
  }
}

export async function orchestrateOnlineLutLoad(
  entry: OnlineLUTEntry,
  options: { signal?: AbortSignal } | undefined,
  ctx: LutLoadContext,
): Promise<void> {
  try {
    if (options?.signal?.aborted) return

    const bytes =
      entry.sourceType === 'catalog-entry'
        ? await fetchVerifiedCubeAsset(entry.cube, {
            signal: options?.signal,
            maxBytes: MAX_ONLINE_CUBE_BYTES,
            cache: onlineProfileCache,
          })
        : await fetchCachedBytesWithLimit(entry.cube.url, {
            signal: options?.signal,
            maxBytes: MAX_ONLINE_CUBE_BYTES,
            cache: onlineProfileCache,
          })

    if (options?.signal?.aborted) return

    const content = new TextDecoder().decode(bytes)
    if (options?.signal?.aborted) return

    await loadLUTContent(
      {
        content,
        sourceName: resolveOnlineLUTSourceName(entry),
        trustedContract:
          entry.sourceType === 'catalog-entry'
            ? entry.trustedContract
            : undefined,
      },
      ctx,
    )
  } catch (err) {
    if (isAbortError(err) || options?.signal?.aborted) return

    reportLUTLoadFailure(err, ctx)
  }
}

export function orchestrateProfileSelection(
  profile: LUTColorProfile | string,
  ctx: LutLoadContext,
): void {
  if (!ctx.atoms.lut) {
    ctx.services.scheduleToast(() => toast.error('No LUT loaded'))
    return
  }

  const contractProfile = resolveLUTContractProfile(profile)
  const updatedLut = contractProfile
    ? applyLUTContractSelection(
        ctx.atoms.lut,
        toLUTContractSelection(contractProfile),
      )
    : undefined
  if (!updatedLut) {
    ctx.services.scheduleToast(() =>
      toast.error('Incomplete LUT contract', {
        description: typeof profile === 'string' ? profile : profile.id,
      }),
    )
    return
  }

  const style = preserveCustomLookIntensity(
    toCustomStyle(updatedLut),
    ctx.atoms.activeStyle,
  )

  ctx.atoms.setLut(updatedLut)
  ctx.services.invalidateExportGraph()
  ctx.atoms.setSession((prev) =>
    prev
      ? applyActiveLookToSession(prev, {
          style,
          lutProfileSelection: buildLUTProfileSelectionState(updatedLut),
          clearExportResult: true,
        })
      : prev,
  )
  ctx.atoms.setParams((prev) => ({
    ...prev,
    styleKind: 'custom',
    builtinPreset: null,
    intensity: mapIntensityLevel(style.currentIntensityLevel),
  }))
}
