import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import { fetchJsonWithLimit } from '~/lib/profiles/fetch'
import type {
  ProfileSourceParseIssue,
  ProfileSourceResource,
} from '~/lib/profiles/source-url'
import {
  createLUTResourceShareUrl,
  parseLUTResourceQuery,
} from '~/lib/profiles/source-url'

import type {
  OnlineLUTSourceEntry,
  OnlineLUTSourceIssue,
  OnlineLUTSourceState,
} from '../services/look/online-lut-sources'
import {
  getShareableOnlineLUTSourceResources,
  mergeOnlineLUTSourceResolution,
  removeOnlineLUTSourceResource,
  resolveOnlineLUTSourceEntry,
  resolveProfileSourceResource,
} from '../services/look/online-lut-sources'

export interface UseOnlineLutSourcesOptions {
  search: string
  pathname: string
  loadOnlineLUT: (
    entry: OnlineLUTEntry,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
}

export interface UseOnlineLutSourcesResult {
  state: OnlineLUTSourceState
  sourceUrlInput: string
  setSourceUrlInput: (value: string) => void
  addSourceFromInput: () => Promise<void>
  refreshSource: (resourceId: string) => Promise<void>
  removeSource: (resourceId: string) => void
  loadEntry: (entryId: string) => Promise<void>
  share: {
    enabled: boolean
    url: string
    copy: () => Promise<void>
  }
}

const emptyState: OnlineLUTSourceState = {
  resources: [],
  entries: [],
  issues: [],
  activeResourceId: null,
  isLoading: false,
}

function parseIssuesToSourceIssues(
  issues: readonly ProfileSourceParseIssue[],
): OnlineLUTSourceIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    raw: issue.raw,
  }))
}

function retargetResource(
  resource: ProfileSourceResource,
  id: string,
  fromQuery: boolean,
): ProfileSourceResource {
  return {
    ...resource,
    id,
    fromQuery,
  }
}

function issueBelongsToEntry(
  issue: OnlineLUTSourceIssue,
  entry: OnlineLUTSourceEntry,
): boolean {
  if (issue.resourceId !== entry.resourceId) return false

  return issue.entryId === entry.id || issue.sourceUrl === entry.sourceUrl
}

function mergeEntryResolution(
  state: OnlineLUTSourceState,
  requestedEntry: OnlineLUTSourceEntry,
  resolvedEntry: OnlineLUTSourceEntry,
  issues: OnlineLUTSourceIssue[],
): OnlineLUTSourceState {
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.resourceId === requestedEntry.resourceId &&
      entry.id === requestedEntry.id
        ? { ...resolvedEntry, family: resolvedEntry.family ?? entry.family }
        : entry,
    ),
    issues: [
      ...state.issues.filter(
        (issue) => !issueBelongsToEntry(issue, requestedEntry),
      ),
      ...issues,
    ],
  }
}

export function useOnlineLutSources({
  search,
  pathname,
  loadOnlineLUT,
}: UseOnlineLutSourcesOptions): UseOnlineLutSourcesResult {
  const [state, setState] = useState<OnlineLUTSourceState>(emptyState)
  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const queryResourceUrlsRef = useRef(new Set<string>())
  const resourceIdsByUrlRef = useRef(new Map<string, string>())
  const nextResourceIdRef = useRef(1)
  const resourceControllersRef = useRef(new Map<string, AbortController>())
  const loadControllersRef = useRef(new Set<AbortController>())
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const hasShareCapability =
    typeof navigator !== 'undefined' &&
    (Boolean(navigator.clipboard?.writeText) || Boolean(navigator.share))

  const createResourceId = useCallback(() => {
    const id = `lut-source-${nextResourceIdRef.current}`
    nextResourceIdRef.current += 1
    return id
  }, [])

  const resolveResourceId = useCallback(
    (resource: ProfileSourceResource) => {
      const existingId = resourceIdsByUrlRef.current.get(resource.url)
      if (existingId) return existingId

      const existingResource = stateRef.current.resources.find(
        (item) => item.url === resource.url,
      )
      if (existingResource) {
        resourceIdsByUrlRef.current.set(resource.url, existingResource.id)
        return existingResource.id
      }

      const id = createResourceId()
      resourceIdsByUrlRef.current.set(resource.url, id)

      return id
    },
    [createResourceId],
  )

  const abortResourceRequest = useCallback((resourceId: string) => {
    const controller = resourceControllersRef.current.get(resourceId)
    if (!controller) return

    controller.abort()
    resourceControllersRef.current.delete(resourceId)
    setState((current) => ({
      ...current,
      isLoading: resourceControllersRef.current.size > 0,
    }))
  }, [])

  const resolveResource = useCallback(
    async (resource: ProfileSourceResource) => {
      abortResourceRequest(resource.id)

      const controller = new AbortController()
      resourceControllersRef.current.set(resource.id, controller)
      setState((current) => ({
        ...current,
        resources: [
          ...current.resources.filter((item) => item.id !== resource.id),
          resource,
        ],
        activeResourceId: resource.id,
        isLoading: true,
      }))

      const resolution = await resolveProfileSourceResource(resource, {
        fetchJson: fetchJsonWithLimit,
        signal: controller.signal,
      })

      if (controller.signal.aborted) return

      resourceControllersRef.current.delete(resource.id)
      setState((current) => ({
        ...mergeOnlineLUTSourceResolution(current, resolution),
        isLoading: resourceControllersRef.current.size > 0,
      }))
    },
    [abortResourceRequest],
  )

  useEffect(() => {
    const parsed = parseLUTResourceQuery(search)
    const resources = parsed.resources
      .filter((resource) => !queryResourceUrlsRef.current.has(resource.url))
      .map((resource) => {
        queryResourceUrlsRef.current.add(resource.url)

        return retargetResource(resource, resolveResourceId(resource), true)
      })
    const issues = parseIssuesToSourceIssues(parsed.issues)

    if (issues.length > 0) {
      setState((current) => ({
        ...current,
        issues: [...current.issues, ...issues],
      }))
    }

    for (const resource of resources) {
      void resolveResource(resource)
    }
  }, [resolveResource, resolveResourceId, search])

  useEffect(
    () => () => {
      for (const controller of resourceControllersRef.current.values()) {
        controller.abort()
      }
      resourceControllersRef.current.clear()
      queryResourceUrlsRef.current.clear()

      for (const controller of loadControllersRef.current) {
        controller.abort()
      }
      loadControllersRef.current.clear()
    },
    [],
  )

  const addSourceFromInput = useCallback(async () => {
    const parsed = parseLUTResourceQuery(
      `luts=${encodeURIComponent(sourceUrlInput)}`,
    )
    const issues = parseIssuesToSourceIssues(parsed.issues)
    const [parsedResource] = parsed.resources

    if (issues.length > 0) {
      setState((current) => ({
        ...current,
        issues: [...current.issues, ...issues],
      }))
    }

    if (!parsedResource) return

    const resource = retargetResource(
      parsedResource,
      resolveResourceId(parsedResource),
      false,
    )
    setSourceUrlInput('')
    await resolveResource(resource)
  }, [resolveResource, resolveResourceId, sourceUrlInput])

  const refreshSource = useCallback(
    async (resourceId: string) => {
      const resource = state.resources.find((item) => item.id === resourceId)
      if (!resource) return

      await resolveResource(resource)
    },
    [resolveResource, state.resources],
  )

  const removeSource = useCallback(
    (resourceId: string) => {
      abortResourceRequest(resourceId)
      setState((current) => removeOnlineLUTSourceResource(current, resourceId))
    },
    [abortResourceRequest],
  )

  const loadEntry = useCallback(
    async (entryId: string) => {
      const entry = stateRef.current.entries.find((item) => item.id === entryId)
      if (!entry) return

      const controller = new AbortController()
      loadControllersRef.current.add(controller)

      try {
        const entryResolution = await resolveOnlineLUTSourceEntry(entry, {
          fetchJson: fetchJsonWithLimit,
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        if (entryResolution.entry !== entry || entryResolution.issues.length) {
          setState((current) =>
            mergeEntryResolution(
              current,
              entry,
              entryResolution.entry,
              entryResolution.issues,
            ),
          )
        }

        await loadOnlineLUT(entryResolution.entry, {
          signal: controller.signal,
        })
      } finally {
        loadControllersRef.current.delete(controller)
      }
    },
    [loadOnlineLUT],
  )

  const shareResources = useMemo(
    () => getShareableOnlineLUTSourceResources(state),
    [state],
  )
  const shareUrl = useMemo(
    () => createLUTResourceShareUrl(pathname, shareResources),
    [pathname, shareResources],
  )

  const share = useMemo(
    () => ({
      enabled: shareResources.length > 0 && hasShareCapability,
      url: shareUrl,
      async copy() {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl)
          return
        }

        if (navigator.share) {
          try {
            await navigator.share({ url: shareUrl })
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return
            throw error
          }
        }
      },
    }),
    [hasShareCapability, shareResources.length, shareUrl],
  )

  return {
    state,
    sourceUrlInput,
    setSourceUrlInput,
    addSourceFromInput,
    refreshSource,
    removeSource,
    loadEntry,
    share,
  }
}
