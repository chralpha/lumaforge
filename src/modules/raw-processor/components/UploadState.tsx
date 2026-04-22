import { FileDropzone } from './Dropzone'

export function UploadState({
  onFileDrop,
  disabled,
}: {
  onFileDrop: (files: File[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-3xl font-semibold text-text">
          Browser-local RAW styling
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Upload one RAW photo, preview it fast, apply a builtin look or a
          custom LUT, and export a share-ready JPEG.
        </p>
        <p className="mt-2 text-xs text-text-tertiary">
          Your photo stays in this browser by default and is not uploaded to a
          server.
        </p>
      </div>

      <FileDropzone onFileDrop={onFileDrop} disabled={disabled} />
    </div>
  )
}
