import type { OnlineLUTEntry, OnlineProfileIssue } from '~/lib/profiles/catalog'
import { parseReleaseCatalog, parseReleaseEntry } from '~/lib/profiles/catalog'
import type { fetchJsonWithLimit } from '~/lib/profiles/fetch'
import { OnlineProfileFetchError } from '~/lib/profiles/fetch'
import type { ProfileSourceResource } from '~/lib/profiles/source-url'
import { normalizeProfileSourceUrl } from '~/lib/profiles/source-url'

const defaultMaxJsonBytes = 1_000_000
export const ONLINE_LUT_SOURCE_STORAGE_KEY = 'lumaforge.raw.onlineLutSources.v1'
export const DEFAULT_LUMAFORGE_PROFILE_SOURCE: ProfileSourceResource = {
  id: 'lumaforge-default-profiles',
  url: 'https://profiles.lumaforge.invalid/channels/stable/catalog.json',
  type: 'catalog',
  label: 'LumaForge Profiles',
  fromQuery: false,
  isDefault: true,
}

export type OnlineLUTSourceEntry = OnlineLUTEntry & { resourceId: string }

export interface OnlineLUTSourceIssue {
  code: string
  message: string
  resourceId?: string
  entryId?: string
  sourceUrl?: string
  raw?: string
}

export interface OnlineLUTSourceState {
  resources: ProfileSourceResource[]
  entries: OnlineLUTSourceEntry[]
  issues: OnlineLUTSourceIssue[]
  activeResourceId: string | null
  isLoading: boolean
}

export interface OnlineLUTLoadRequest {
  entryId: string
  signal?: AbortSignal
}

export interface OnlineLUTSourceResolution {
  resource: ProfileSourceResource
  entries: OnlineLUTSourceEntry[]
  issues: OnlineLUTSourceIssue[]
}

export interface OnlineLUTSourceEntryResolution {
  entry: OnlineLUTSourceEntry
  issues: OnlineLUTSourceIssue[]
}

interface StoredOnlineLUTSourceResource {
  url: string
  type: ProfileSourceResource['type']
  label: string
}

interface StoredOnlineLUTSourceRegistry {
  resources: StoredOnlineLUTSourceResource[]
  removedDefaultUrls: string[]
}

function emptyStoredRegistry(): StoredOnlineLUTSourceRegistry {
  return { resources: [], removedDefaultUrls: [] }
}

function getOnlineLUTSourceStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function isStoredResource(
  value: unknown,
): value is StoredOnlineLUTSourceResource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const record = value as Record<string, unknown>

  return (
    typeof record.url === 'string' &&
    (record.type === 'catalog' ||
      record.type === 'entry' ||
      record.type === 'cube') &&
    typeof record.label === 'string'
  )
}

function normalizeStoredUrl(value: string): string | null {
  try {
    return normalizeProfileSourceUrl(value)
  } catch {
    return null
  }
}

function readStoredOnlineLUTSourceRegistry(
  storage = getOnlineLUTSourceStorage(),
): StoredOnlineLUTSourceRegistry {
  if (!storage) return emptyStoredRegistry()

  try {
    const raw = storage.getItem(ONLINE_LUT_SOURCE_STORAGE_KEY)
    if (!raw) return emptyStoredRegistry()

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyStoredRegistry()
    }

    const record = parsed as Record<string, unknown>
    const seenResources = new Set<string>()
    const resources = Array.isArray(record.resources)
      ? record.resources.flatMap((resource) => {
          if (!isStoredResource(resource)) return []

          const normalizedUrl = normalizeStoredUrl(resource.url)
          if (!normalizedUrl || seenResources.has(normalizedUrl)) return []

          seenResources.add(normalizedUrl)
          return [
            {
              url: normalizedUrl,
              type: resource.type,
              label: resource.label,
            },
          ]
        })
      : []
    const removedDefaultUrls = Array.isArray(record.removedDefaultUrls)
      ? Array.from(
          new Set(
            record.removedDefaultUrls.flatMap((value) => {
              if (typeof value !== 'string') return []

              const normalizedUrl = normalizeStoredUrl(value)
              return normalizedUrl ? [normalizedUrl] : []
            }),
          ),
        )
      : []

    return { resources, removedDefaultUrls }
  } catch {
    return emptyStoredRegistry()
  }
}

function writeStoredOnlineLUTSourceRegistry(
  registry: StoredOnlineLUTSourceRegistry,
  storage = getOnlineLUTSourceStorage(),
) {
  if (!storage) return

  try {
    storage.setItem(ONLINE_LUT_SOURCE_STORAGE_KEY, JSON.stringify(registry))
  } catch {
    // Storage can be unavailable or quota-limited; online LUT sources still work in memory.
  }
}

function toStoredResource(
  resource: ProfileSourceResource,
): StoredOnlineLUTSourceResource | null {
  if (resource.isDefault || resource.fromQuery) return null

  const normalizedUrl = normalizeStoredUrl(resource.url)
  if (!normalizedUrl) return null

  return {
    url: normalizedUrl,
    type: resource.type,
    label: resource.label,
  }
}

export function getInitialOnlineLUTSourceResources(
  options: {
    storage?: Storage | null
    defaultSource?: ProfileSourceResource
  } = {},
): ProfileSourceResource[] {
  const defaultSource =
    options.defaultSource ?? DEFAULT_LUMAFORGE_PROFILE_SOURCE
  const registry = readStoredOnlineLUTSourceRegistry(options.storage)
  const defaultUrl = normalizeStoredUrl(defaultSource.url) ?? defaultSource.url
  const resources: ProfileSourceResource[] = []

  if (!registry.removedDefaultUrls.includes(defaultUrl)) {
    resources.push({ ...defaultSource, url: defaultUrl })
  }

  for (const [index, resource] of registry.resources.entries()) {
    resources.push({
      id: `stored-lut-source-${index + 1}`,
      url: resource.url,
      type: resource.type,
      label: resource.label,
      fromQuery: false,
    })
  }

  return resources
}

export function persistOnlineLUTSourceResource(
  resource: ProfileSourceResource,
  options: { storage?: Storage | null } = {},
) {
  const storedResource = toStoredResource(resource)
  if (!storedResource) return

  const registry = readStoredOnlineLUTSourceRegistry(options.storage)
  const resources = registry.resources.filter(
    (item) => item.url !== storedResource.url,
  )

  writeStoredOnlineLUTSourceRegistry(
    {
      ...registry,
      resources: [...resources, storedResource],
    },
    options.storage,
  )
}

export function persistOnlineLUTSourceRemoval(
  resource: ProfileSourceResource,
  options: { storage?: Storage | null } = {},
) {
  const registry = readStoredOnlineLUTSourceRegistry(options.storage)
  const normalizedUrl = normalizeStoredUrl(resource.url) ?? resource.url
  const nextRegistry: StoredOnlineLUTSourceRegistry = {
    resources: registry.resources.filter((item) => item.url !== normalizedUrl),
    removedDefaultUrls: registry.removedDefaultUrls,
  }

  if (resource.isDefault) {
    nextRegistry.removedDefaultUrls = Array.from(
      new Set([...nextRegistry.removedDefaultUrls, normalizedUrl]),
    )
  }

  writeStoredOnlineLUTSourceRegistry(nextRegistry, options.storage)
}

function withResourceId(
  entry: OnlineLUTEntry,
  resourceId: string,
): OnlineLUTSourceEntry {
  return { ...entry, resourceId }
}

function mapProfileIssues(
  issues: readonly OnlineProfileIssue[],
  resourceId: string,
  sourceUrl: string,
): OnlineLUTSourceIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    resourceId,
    entryId: issue.entryId,
    sourceUrl,
  }))
}

function mapFetchIssue(
  error: unknown,
  resourceId: string,
  sourceUrl: string,
  entryId?: string,
): OnlineLUTSourceIssue {
  if (error instanceof OnlineProfileFetchError) {
    return {
      code: error.code,
      message: error.message,
      resourceId,
      entryId,
      sourceUrl,
    }
  }

  if (error instanceof Error) {
    return {
      code: 'network',
      message: error.message,
      resourceId,
      entryId,
      sourceUrl,
    }
  }

  return {
    code: 'network',
    message: 'Failed to fetch online profile resource.',
    resourceId,
    entryId,
    sourceUrl,
  }
}

function directCubeTitle(resource: ProfileSourceResource): string {
  if (resource.label) return resource.label

  try {
    const url = new URL(resource.url)

    return url.pathname.split('/').filter(Boolean).at(-1) ?? resource.url
  } catch {
    return resource.url
  }
}

function normalizeResourceUrl(resource: ProfileSourceResource): string {
  try {
    return normalizeProfileSourceUrl(resource.url)
  } catch {
    return resource.url
  }
}

function retargetEntry(
  entry: OnlineLUTSourceEntry,
  resourceId: string,
): OnlineLUTSourceEntry {
  return entry.resourceId === resourceId ? entry : { ...entry, resourceId }
}

function retargetIssue(
  issue: OnlineLUTSourceIssue,
  resourceId: string,
): OnlineLUTSourceIssue {
  return issue.resourceId === resourceId ? issue : { ...issue, resourceId }
}

export async function resolveProfileSourceResource(
  resource: ProfileSourceResource,
  options: {
    fetchJson: typeof fetchJsonWithLimit
    signal?: AbortSignal
    maxJsonBytes?: number
  },
): Promise<OnlineLUTSourceResolution> {
  const maxBytes = options.maxJsonBytes ?? defaultMaxJsonBytes

  if (resource.type === 'cube') {
    const title = directCubeTitle(resource)

    return {
      resource,
      entries: [
        {
          id: resource.id,
          resourceId: resource.id,
          title,
          sourceUrl: resource.url,
          sourceType: 'direct-cube',
          cube: {
            url: resource.url,
            sha256: '',
            title,
          },
          tags: [],
        },
      ],
      issues: [],
    }
  }

  if (resource.type === 'entry') {
    try {
      const document = await options.fetchJson<unknown>(resource.url, {
        signal: options.signal,
        maxBytes,
      })
      const result = parseReleaseEntry(document, resource.url)

      if (!result.ok) {
        return {
          resource,
          entries: [],
          issues: mapProfileIssues(result.issues, resource.id, resource.url),
        }
      }

      return {
        resource,
        entries: [withResourceId(result.value, resource.id)],
        issues: [],
      }
    } catch (error) {
      return {
        resource,
        entries: [],
        issues: [mapFetchIssue(error, resource.id, resource.url)],
      }
    }
  }

  try {
    const document = await options.fetchJson<unknown>(resource.url, {
      signal: options.signal,
      maxBytes,
    })
    const catalog = parseReleaseCatalog(document, resource.url)

    if (!catalog.ok) {
      return {
        resource,
        entries: [],
        issues: mapProfileIssues(catalog.issues, resource.id, resource.url),
      }
    }

    return {
      resource,
      entries: catalog.value.map((entry) => withResourceId(entry, resource.id)),
      issues: [],
    }
  } catch (error) {
    return {
      resource,
      entries: [],
      issues: [mapFetchIssue(error, resource.id, resource.url)],
    }
  }
}

export async function resolveOnlineLUTSourceEntry(
  entry: OnlineLUTSourceEntry,
  options: {
    fetchJson: typeof fetchJsonWithLimit
    signal?: AbortSignal
    maxJsonBytes?: number
  },
): Promise<OnlineLUTSourceEntryResolution> {
  if (entry.sourceType !== 'catalog-entry' || entry.trustedContract) {
    return { entry, issues: [] }
  }

  const maxBytes = options.maxJsonBytes ?? defaultMaxJsonBytes

  try {
    const document = await options.fetchJson<unknown>(entry.sourceUrl, {
      signal: options.signal,
      maxBytes,
    })
    const result = parseReleaseEntry(document, entry.sourceUrl)

    if (!result.ok) {
      return {
        entry,
        issues: mapProfileIssues(
          result.issues,
          entry.resourceId,
          entry.sourceUrl,
        ),
      }
    }

    return {
      entry: withResourceId(result.value, entry.resourceId),
      issues: [],
    }
  } catch (error) {
    return {
      entry,
      issues: [
        mapFetchIssue(error, entry.resourceId, entry.sourceUrl, entry.id),
      ],
    }
  }
}

export function mergeOnlineLUTSourceResolution(
  state: OnlineLUTSourceState,
  resolution: OnlineLUTSourceResolution,
): OnlineLUTSourceState {
  const normalizedUrl = normalizeResourceUrl(resolution.resource)
  const duplicateResource = state.resources.find(
    (resource) =>
      resource.id !== resolution.resource.id &&
      normalizeResourceUrl(resource) === normalizedUrl,
  )
  const targetResource = duplicateResource ?? resolution.resource
  const targetResourceId = targetResource.id
  const obsoleteResourceIds = new Set([
    resolution.resource.id,
    targetResourceId,
  ])
  const entries = resolution.entries.map((entry) =>
    retargetEntry(entry, targetResourceId),
  )
  const issues = resolution.issues.map((issue) =>
    retargetIssue(issue, targetResourceId),
  )

  const resources = duplicateResource
    ? state.resources.filter(
        (resource) => resource.id !== resolution.resource.id,
      )
    : [
        ...state.resources.filter(
          (resource) => resource.id !== resolution.resource.id,
        ),
        resolution.resource,
      ]

  return {
    resources,
    entries: [
      ...state.entries.filter(
        (entry) => !obsoleteResourceIds.has(entry.resourceId),
      ),
      ...entries,
    ],
    issues: [
      ...state.issues.filter(
        (issue) =>
          !issue.resourceId || !obsoleteResourceIds.has(issue.resourceId),
      ),
      ...issues,
    ],
    activeResourceId: targetResourceId,
    isLoading: false,
  }
}

export function removeOnlineLUTSourceResource(
  state: OnlineLUTSourceState,
  resourceId: string,
): OnlineLUTSourceState {
  return {
    resources: state.resources.filter((resource) => resource.id !== resourceId),
    entries: state.entries.filter((entry) => entry.resourceId !== resourceId),
    issues: state.issues.filter((issue) => issue.resourceId !== resourceId),
    activeResourceId:
      state.activeResourceId === resourceId ? null : state.activeResourceId,
    isLoading: state.isLoading,
  }
}

export function getShareableOnlineLUTSourceResources(
  state: OnlineLUTSourceState,
): ProfileSourceResource[] {
  const resourceIdsWithEntries = new Set(
    state.entries.map((entry) => entry.resourceId),
  )

  return state.resources.filter(
    (resource) =>
      resourceIdsWithEntries.has(resource.id) && !resource.isDefault,
  )
}
