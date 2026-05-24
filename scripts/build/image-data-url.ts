import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

type FetchResponseLike = {
  ok: boolean
  status: number
  statusText: string
  headers: {
    get: (name: string) => string | null
  }
  arrayBuffer: () => Promise<ArrayBuffer>
}

type FetchLike = (url: string) => Promise<FetchResponseLike>

export type FetchImageDataUrlOptions = {
  fallbackPath?: string
  fetchImpl?: FetchLike
  onFallback?: (message: string) => void
}

export function toDataUrl(mimeType: string, data: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`
}

function mimeTypeFromPath(path: string) {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.avif':
      return 'image/avif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function fetchImageDataUrl(
  url: string,
  {
    fallbackPath,
    fetchImpl = (input) => fetch(input),
    onFallback,
  }: FetchImageDataUrlOptions = {},
) {
  try {
    const response = await fetchImpl(url)
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }

    const mimeType = response.headers.get('content-type') ?? 'image/jpeg'
    return toDataUrl(mimeType, new Uint8Array(await response.arrayBuffer()))
  } catch (error) {
    if (!fallbackPath) throw error

    const message = `Unable to fetch image resource ${url}; using local fallback ${fallbackPath}: ${formatError(error)}`
    onFallback?.(message)

    return toDataUrl(mimeTypeFromPath(fallbackPath), readFileSync(fallbackPath))
  }
}
