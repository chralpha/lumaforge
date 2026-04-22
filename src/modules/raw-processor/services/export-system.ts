export function buildExportFilename(inputName: string, styleName: string) {
  const basename = inputName.replace(/\.[^.]+$/, '')
  return `${basename}_${styleName}.jpg`
}

export function recommendRetryLevel(
  level: 'safe' | 'balanced' | 'max',
): 'safe' | 'balanced' | null {
  if (level === 'max') return 'balanced'
  if (level === 'balanced') return 'safe'
  return null
}

export async function runExportJob({
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
