import { describe, expect, it, vi } from 'vitest'

import { createExportResult } from '../model/export-result'
import {
  copyBlobToClipboard,
  downloadExportResult,
  resolveExportCopyCapability,
  resolveExportShareCapability,
  shareExportResult,
} from './export-result-actions'

function createResult() {
  return createExportResult({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    filename: 'frame_neutral_fullres.jpg',
    width: 6048,
    height: 4024,
    now: () => 123,
    copyCapability: {
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    },
  })
}

function createClipboardItem(items: Record<string, Blob>): ClipboardItem {
  return {
    presentationStyle: 'unspecified',
    types: Object.keys(items),
    getType: vi.fn(async (type: string) => {
      const blob = items[type]
      if (!blob) {
        throw new Error(`Clipboard item does not include ${type}.`)
      }

      return blob
    }),
  }
}

function createClipboardItemMock(supports: (type: string) => boolean) {
  const ClipboardItemMock = Object.assign(
    vi.fn((items: Record<string, Blob>): ClipboardItem => {
      return createClipboardItem(items)
    }),
    { supports: vi.fn(supports) },
  )

  return ClipboardItemMock as typeof ClipboardItemMock & {
    new (items: Record<string, Blob>): ClipboardItem
  }
}

describe('export result actions', () => {
  it('creates a file-backed export result with size and dimensions', () => {
    const result = createResult()

    expect(result.filename).toBe('frame_neutral_fullres.jpg')
    expect(result.width).toBe(6048)
    expect(result.height).toBe(4024)
    expect(result.size).toBe(4)
    expect(result.createdAt).toBe(123)
    expect(result.file).toBeInstanceOf(File)
    expect(result.file.name).toBe('frame_neutral_fullres.jpg')
    expect(result.file.type).toBe('image/jpeg')
  })

  it('downloads the stored full-resolution blob only when the action is called', () => {
    vi.useFakeTimers()
    const result = createResult()
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const link = { href: '', download: '', click, remove }
    const documentLike = {
      createElement: vi.fn(() => link),
      body: { append },
    } as unknown as Document
    const urlLike = {
      createObjectURL: vi.fn(() => 'blob:export'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL

    try {
      downloadExportResult(result, { document: documentLike, URL: urlLike })

      expect(urlLike.createObjectURL).toHaveBeenCalledWith(result.blob)
      expect(link.href).toBe('blob:export')
      expect(link.download).toBe('frame_neutral_fullres.jpg')
      expect(append).toHaveBeenCalledWith(link)
      expect(click).toHaveBeenCalledTimes(1)
      expect(remove).toHaveBeenCalledTimes(1)
      expect(urlLike.revokeObjectURL).not.toHaveBeenCalled()

      vi.runOnlyPendingTimers()

      expect(urlLike.revokeObjectURL).toHaveBeenCalledWith('blob:export')
    } finally {
      vi.useRealTimers()
    }
  })

  it('enables share only when the browser can share the JPEG file', () => {
    const result = createResult()
    const navigatorLike = {
      canShare: vi.fn(() => true),
      share: vi.fn(),
    } as unknown as Navigator

    expect(resolveExportShareCapability(result, navigatorLike)).toEqual({
      available: true,
    })
    expect(navigatorLike.canShare).toHaveBeenCalledWith({
      files: [result.file],
    })
  })

  it('marks share unavailable when canShare exists but share is unsupported', () => {
    const result = createResult()
    const navigatorLike = {
      canShare: vi.fn(() => true),
    } as unknown as Navigator

    expect(resolveExportShareCapability(result, navigatorLike)).toEqual({
      available: false,
      reason: 'This browser cannot share JPEG files.',
    })
    expect(navigatorLike.canShare).not.toHaveBeenCalled()
  })

  it('marks share unavailable when file sharing is unsupported', () => {
    const result = createResult()
    const navigatorLike = {} as Navigator

    expect(resolveExportShareCapability(result, navigatorLike)).toEqual({
      available: false,
      reason: 'This browser cannot share JPEG files.',
    })
  })

  it('calls navigator.share with the stored file from user action handlers', async () => {
    const result = createResult()
    const share = vi.fn().mockResolvedValue(undefined)
    const navigatorLike = {
      canShare: vi.fn(() => true),
      share,
    } as unknown as Navigator

    await shareExportResult(result, navigatorLike)

    expect(share).toHaveBeenCalledWith({
      files: [result.file],
      title: 'frame_neutral_fullres.jpg',
    })
  })

  it('prefers full-resolution copy when JPEG clipboard write is supported', () => {
    const write = vi.fn()
    const ClipboardItemMock = createClipboardItemMock(
      (type) => type === 'image/jpeg',
    )
    const environment = {
      navigator: { clipboard: { write } },
      ClipboardItem: ClipboardItemMock,
    }

    expect(resolveExportCopyCapability(environment)).toEqual({
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    })
  })

  it('falls back to preview-size copy when JPEG clipboard write is unsupported but PNG clipboard write is available', () => {
    const write = vi.fn()
    const ClipboardItemMock = createClipboardItemMock(
      (type) => type === 'image/png',
    )
    const environment = {
      navigator: { clipboard: { write } },
      ClipboardItem: ClipboardItemMock,
    }

    expect(resolveExportCopyCapability(environment)).toEqual({
      mode: 'preview-size',
      label: 'Copy preview-size image',
      reason: 'This browser cannot copy full-resolution JPEG files.',
    })
  })

  it('marks copy unavailable without async clipboard write support', () => {
    expect(resolveExportCopyCapability({ navigator: {} })).toEqual({
      mode: 'unavailable',
      reason: 'Clipboard image copy is not supported in this browser.',
    })
  })

  it('writes the full-resolution JPEG blob to clipboard when requested', async () => {
    const result = createResult()
    const write = vi.fn().mockResolvedValue(undefined)
    const ClipboardItemMock = createClipboardItemMock(() => false)
    const environment = {
      navigator: { clipboard: { write } },
      ClipboardItem: ClipboardItemMock,
    }

    await copyBlobToClipboard(result.blob, environment)

    expect(ClipboardItemMock).toHaveBeenCalledWith({
      'image/jpeg': result.blob,
    })
    expect(write).toHaveBeenCalledWith([
      ClipboardItemMock.mock.results[0].value,
    ])
  })
})
