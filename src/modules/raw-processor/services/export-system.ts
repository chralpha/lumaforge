import type { ExportColorGraphDescriptor } from '~/lib/export/color-graph'
import type { FullResolutionExportProgress } from '~/lib/export/full-res-export'
import type { RunFullResolutionJpegExportInWorkerInput } from '~/lib/export/full-res-export-client'
import { FullResolutionExportWorkerClient } from '~/lib/export/full-res-export-client'
import type { ExportFidelity } from '~/lib/gl/export'

const PREFERRED_ROWS_BY_FIDELITY: Record<ExportFidelity, number> = {
  safe: 256,
  balanced: 512,
  max: 1024,
}

export function buildExportFilename(inputName: string, styleName: string) {
  const basename = inputName.replace(/\.[^.]+$/, '')
  return `${basename}_${styleName}_fullres.jpg`
}

export function getPreferredRowsForFidelity(fidelity: ExportFidelity) {
  return PREFERRED_ROWS_BY_FIDELITY[fidelity]
}

export function recommendRetryLevel(
  level: ExportFidelity,
): Exclude<ExportFidelity, 'max'> | null {
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
  preferredRows,
  onProgress,
  signal,
  clientFactory = createFullResolutionExportClient,
}: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality?: RunFullResolutionJpegExportInWorkerInput['quality']
  preferredRows?: RunFullResolutionJpegExportInWorkerInput['preferredRows']
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
      preferredRows,
      onProgress,
      signal,
    })

    return { filename, blob }
  } finally {
    client.dispose()
  }
}
