import type { ExportColorGraphDescriptor } from '~/lib/export/color-graph'
import {
  FullResolutionExportWorkerClient,
  type RunFullResolutionJpegExportInWorkerInput,
} from '~/lib/export/full-res-export-client'
import type { FullResolutionExportProgress } from '~/lib/export/full-res-export'

export function buildExportFilename(inputName: string, styleName: string) {
  const basename = inputName.replace(/\.[^.]+$/, '')
  return `${basename}_${styleName}_fullres.jpg`
}

export function recommendRetryLevel(
  level: 'safe' | 'balanced' | 'max',
): 'safe' | 'balanced' | null {
  if (level === 'max') return 'balanced'
  if (level === 'balanced') return 'safe'
  return null
}

export async function runPreviewExportJob({
  renderToCanvas,
  filename,
  quality,
}: {
  renderToCanvas: () => Promise<HTMLCanvasElement>
  filename: string
  quality: number
}) {
  const canvas = await renderToCanvas()

  return await new Promise<{ filename: string; blob: Blob }>(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('EXPORT_JPEG_BLOB_FAILED'))
            return
          }

          resolve({ filename, blob })
        },
        'image/jpeg',
        quality,
      )
    },
  )
}

export function createFullResolutionExportClient() {
  return new FullResolutionExportWorkerClient()
}

export async function runFullResolutionExportJob({
  file,
  filename,
  graph,
  quality,
  onProgress,
  signal,
  clientFactory = createFullResolutionExportClient,
}: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality?: RunFullResolutionJpegExportInWorkerInput['quality']
  onProgress?: (progress: FullResolutionExportProgress) => void
  signal?: AbortSignal
  clientFactory?: () => FullResolutionExportWorkerClient
}) {
  const client = clientFactory()

  try {
    const blob = await client.run({
      file,
      graph,
      quality,
      onProgress,
      signal,
    })

    return { filename, blob }
  } finally {
    client.dispose()
  }
}
