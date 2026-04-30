import type { OnlineLUTEntry, OnlineProfileIssue } from '~/lib/profiles/catalog'
import { parseReleaseCatalog, parseReleaseEntry } from '~/lib/profiles/catalog'
import type { fetchJsonWithLimit } from '~/lib/profiles/fetch'
import { OnlineProfileFetchError } from '~/lib/profiles/fetch'
import type { ProfileSourceResource } from '~/lib/profiles/source-url'
import { normalizeProfileSourceUrl } from '~/lib/profiles/source-url'

const defaultMaxJsonBytes = 1_000_000

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
  if (!issue.resourceId || issue.resourceId === resourceId) return issue

  return { ...issue, resourceId }
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

    const entries: OnlineLUTSourceEntry[] = []
    const issues: OnlineLUTSourceIssue[] = []

    for (const catalogEntry of catalog.value) {
      try {
        const entryDocument = await options.fetchJson<unknown>(
          catalogEntry.sourceUrl,
          {
            signal: options.signal,
            maxBytes,
          },
        )
        const entry = parseReleaseEntry(entryDocument, catalogEntry.sourceUrl)

        if (entry.ok) {
          entries.push(withResourceId(entry.value, resource.id))
        } else {
          entries.push(withResourceId(catalogEntry, resource.id))
          issues.push(
            ...mapProfileIssues(
              entry.issues,
              resource.id,
              catalogEntry.sourceUrl,
            ),
          )
        }
      } catch (error) {
        entries.push(withResourceId(catalogEntry, resource.id))
        issues.push(
          mapFetchIssue(
            error,
            resource.id,
            catalogEntry.sourceUrl,
            catalogEntry.id,
          ),
        )
      }
    }

    return { resource, entries, issues }
  } catch (error) {
    return {
      resource,
      entries: [],
      issues: [mapFetchIssue(error, resource.id, resource.url)],
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

  return state.resources.filter((resource) =>
    resourceIdsWithEntries.has(resource.id),
  )
}
