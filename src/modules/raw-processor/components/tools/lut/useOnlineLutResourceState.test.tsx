import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { UseOnlineLutSourcesResult } from '../../../hooks/useOnlineLutSources'
import { useOnlineLutResourceState } from './useOnlineLutResourceState'

describe('useOnlineLutResourceState', () => {
  it('indexes entries and issues by resource and groups the selected entries', () => {
    const state = {
      resources: [
        {
          id: 'source-a',
          url: 'https://example.test/a.json',
          type: 'catalog',
          label: 'Source A',
          fromQuery: false,
        },
        {
          id: 'source-b',
          url: 'https://example.test/b.json',
          type: 'catalog',
          label: 'Source B',
          fromQuery: true,
        },
      ],
      entries: [
        {
          id: 'entry-a1',
          title: 'A One',
          sourceUrl: 'https://example.test/a.cube',
          sourceType: 'catalog-entry',
          cube: {
            url: 'https://example.test/a.cube',
            sha256: 'a'.repeat(64),
          },
          tags: [],
          family: 'A Family',
          resourceId: 'source-a',
        },
        {
          id: 'entry-b1',
          title: 'B One',
          sourceUrl: 'https://example.test/b.cube',
          sourceType: 'catalog-entry',
          cube: {
            url: 'https://example.test/b.cube',
            sha256: 'b'.repeat(64),
          },
          tags: [],
          resourceId: 'source-b',
        },
      ],
      issues: [
        {
          code: 'invalid-entry',
          message: 'Bad entry',
          resourceId: 'source-a',
          entryId: 'entry-a1',
        },
      ],
      activeResourceId: 'source-a',
      isLoading: true,
    } satisfies UseOnlineLutSourcesResult['state']

    const { result } = renderHook(() =>
      useOnlineLutResourceState({ state, resourceId: 'source-a' }),
    )

    expect(result.current.resourcesById.get('source-a')?.label).toBe('Source A')
    expect(result.current.entriesByResourceId.get('source-a')).toHaveLength(1)
    expect(result.current.issuesByResourceId.get('source-a')).toHaveLength(1)
    expect(result.current.selectedResource?.id).toBe('source-a')
    expect(result.current.selectedEntries.map((entry) => entry.id)).toEqual([
      'entry-a1',
    ])
    expect(result.current.selectedIssues.map((issue) => issue.entryId)).toEqual(
      ['entry-a1'],
    )
    expect(result.current.selectedResourceLoading).toBe(true)
    expect(result.current.selectedEntryGroups.families).toHaveLength(1)
    expect(result.current.selectedEntryGroups.others).toHaveLength(0)
  })
})
