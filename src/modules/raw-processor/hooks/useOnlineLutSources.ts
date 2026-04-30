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
  OnlineLUTSourceIssue,
  OnlineLUTSourceState,
} from '../services/online-lut-sources'
import {
  getShareableOnlineLUTSourceResources,
  mergeOnlineLUTSourceResolution,
  removeOnlineLUTSourceResource,
  resolveProfileSourceResource,
} from '../services/online-lut-sources'

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

export function useOnlineLutSources({
  search,
  pathname,
  loadOnlineLUT,
}: UseOnlineLutSourcesOptions): UseOnlineLutSourcesResult {
  const [state, setState] = useState<OnlineLUTSourceState>(emptyState)
  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const parsedInitialSearchRef = useRef(false)
  const nextResourceIdRef = useRef(1)
  const resourceControllersRef = useRef(new Map<string, AbortController>())
  const loadControllersRef = useRef(new Set<AbortController>())

  const createResourceId = useCallback(() => {
    const id = `lut-source-${nextResourceIdRef.current}`
    nextResourceIdRef.current += 1
    return id
  }, [])

  const abortResourceRequest = useCallback((resourceId: string) => {
    const controller = resourceControllersRef.current.get(resourceId)
    if (!controller) return

    controller.abort()
    resourceControllersRef.current.delete(resourceId)
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
      setState((current) => mergeOnlineLUTSourceResolution(current, resolution))
    },
    [abortResourceRequest],
  )

  useEffect(() => {
    if (parsedInitialSearchRef.current) return
    parsedInitialSearchRef.current = true

    const parsed = parseLUTResourceQuery(search)
    const resources = parsed.resources.map((resource) =>
      retargetResource(resource, createResourceId(), true),
    )
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
  }, [createResourceId, resolveResource, search])

  useEffect(
    () => () => {
      for (const controller of resourceControllersRef.current.values()) {
        controller.abort()
      }
      resourceControllersRef.current.clear()

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

    const resource = retargetResource(parsedResource, createResourceId(), false)
    setSourceUrlInput('')
    await resolveResource(resource)
  }, [createResourceId, resolveResource, sourceUrlInput])

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
      const entry = state.entries.find((item) => item.id === entryId)
      if (!entry) return

      const controller = new AbortController()
      loadControllersRef.current.add(controller)

      try {
        await loadOnlineLUT(entry, { signal: controller.signal })
      } finally {
        loadControllersRef.current.delete(controller)
      }
    },
    [loadOnlineLUT, state.entries],
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
      enabled: shareResources.length > 0,
      url: shareUrl,
      async copy() {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl)
        }
      },
    }),
    [shareResources.length, shareUrl],
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
