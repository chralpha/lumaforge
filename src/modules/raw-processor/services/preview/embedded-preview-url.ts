import { selectDisplaySource } from '../../model/derive-session'
import type { ImageSession } from '../../model/session'

type BlobConstructor = new (
  blobParts?: BlobPart[],
  options?: BlobPropertyBag,
) => Blob

type CreateObjectUrlEnvironment = {
  Blob: BlobConstructor
  URL: {
    createObjectURL: (object: Blob) => string
  }
}

type RevokeObjectUrlEnvironment = {
  URL: {
    revokeObjectURL?: (url: string) => void
  }
}

function copyToArrayBuffer(data: Uint8Array) {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}

export function createEmbeddedPreviewObjectUrl(
  input: {
    data: Uint8Array
    mimeType: string
  },
  environment: CreateObjectUrlEnvironment = {
    Blob: globalThis.Blob,
    URL: globalThis.URL,
  },
) {
  return environment.URL.createObjectURL(
    new environment.Blob([copyToArrayBuffer(input.data)], {
      type: input.mimeType,
    }),
  )
}

export function revokeEmbeddedPreviewObjectUrls(
  urls: Iterable<string | null | undefined>,
  environment: RevokeObjectUrlEnvironment = { URL: globalThis.URL },
) {
  for (const url of new Set(
    Array.from(urls).filter((value): value is string => Boolean(value)),
  )) {
    environment.URL.revokeObjectURL?.(url)
  }
}

export function clearEmbeddedPreviewUrlFromSession(
  session: ImageSession,
): ImageSession {
  if (!('objectUrl' in session.previewBundle.embeddedPreview)) {
    return session
  }

  const previewBundle = {
    ...session.previewBundle,
    embeddedPreview: { status: 'idle' as const },
  }

  return {
    ...session,
    previewBundle: {
      ...previewBundle,
      displaySource: selectDisplaySource(previewBundle),
    },
  }
}
