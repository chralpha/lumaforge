import type {
  ExportCopyCapability,
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'

type ClipboardEnvironment = {
  navigator?: {
    clipboard?: {
      write?: (items: ClipboardItem[]) => Promise<void>
    }
  }
  ClipboardItem?: {
    new (items: Record<string, Blob>): ClipboardItem
    supports?: (type: string) => boolean
  }
}

export function resolveExportShareCapability(
  result: ExportResult,
  navigatorLike: Navigator = navigator,
): ExportShareCapability {
  if (
    typeof navigatorLike.canShare === 'function' &&
    typeof navigatorLike.share === 'function' &&
    navigatorLike.canShare({ files: [result.file] })
  ) {
    return { available: true }
  }

  return {
    available: false,
    reason: 'This browser cannot share JPEG files.',
  }
}

export async function shareExportResult(
  result: ExportResult,
  navigatorLike: Navigator = navigator,
) {
  const capability = resolveExportShareCapability(result, navigatorLike)
  if (!capability.available) {
    throw new Error(capability.reason)
  }

  await navigatorLike.share({
    files: [result.file],
    title: result.filename,
  })
}

export function downloadExportResult(
  result: ExportResult,
  environment: {
    document?: Document
    URL?: typeof URL
  } = {},
) {
  const documentLike = environment.document ?? document
  const urlLike = environment.URL ?? URL
  const url = urlLike.createObjectURL(result.blob)
  const link = documentLike.createElement('a')

  link.href = url
  link.download = result.filename
  documentLike.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    urlLike.revokeObjectURL(url)
  }, 0)
}

export function resolveExportCopyCapability(
  environment: ClipboardEnvironment = globalThis,
): ExportCopyCapability {
  const write = environment.navigator?.clipboard?.write
  const ClipboardItemCtor = environment.ClipboardItem

  if (typeof write !== 'function' || !ClipboardItemCtor) {
    return {
      mode: 'unavailable',
      reason: 'Clipboard image copy is not supported in this browser.',
    }
  }

  if (ClipboardItemCtor.supports?.('image/jpeg')) {
    return {
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    }
  }

  if (ClipboardItemCtor.supports?.('image/png')) {
    return {
      mode: 'preview-size',
      label: 'Copy preview-size image',
      reason: 'This browser cannot copy full-resolution JPEG files.',
    }
  }

  return {
    mode: 'unavailable',
    reason: 'Clipboard image copy is not supported in this browser.',
  }
}

export async function copyBlobToClipboard(
  blob: Blob,
  environment: ClipboardEnvironment = globalThis,
) {
  const write = environment.navigator?.clipboard?.write
  const ClipboardItemCtor = environment.ClipboardItem

  if (typeof write !== 'function' || !ClipboardItemCtor) {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const type = blob.type || 'image/jpeg'
  await write([new ClipboardItemCtor({ [type]: blob })])
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Preview image copy failed.'))
        return
      }

      resolve(blob)
    }, type)
  })
}

export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
  environment: ClipboardEnvironment = globalThis,
) {
  const blob = await canvasToBlob(canvas, 'image/png')
  const pngBlob =
    blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' })

  await copyBlobToClipboard(pngBlob, environment)
}
