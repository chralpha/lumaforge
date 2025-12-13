/**
 * Dropzone component for loading RAW files and LUTs via drag and drop.
 */

import { m } from 'motion/react'
import { useCallback, useState } from 'react'

import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

export interface DropzoneProps {
  onFileDrop: (files: File[]) => void
  accept?: string[]
  multiple?: boolean
  className?: string
  children?: React.ReactNode
  disabled?: boolean
}

export function Dropzone({
  onFileDrop,
  accept,
  multiple = false,
  className,
  children,
  disabled = false,
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) {
        setIsDragOver(true)
      }
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (disabled) return

      const files = Array.from(e.dataTransfer.files)

      // Filter by accepted extensions if specified
      const filteredFiles = accept
        ? files.filter((file) => {
            const ext = file.name.split('.').pop()?.toLowerCase()
            return ext && accept.some((a) => a.toLowerCase() === `.${ext}`)
          })
        : files

      if (filteredFiles.length > 0) {
        onFileDrop(multiple ? filteredFiles : [filteredFiles[0]])
      }
    },
    [onFileDrop, accept, multiple, disabled],
  )

  const handleClick = useCallback(() => {
    if (disabled) return

    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    if (accept) {
      input.accept = accept.join(',')
    }

    input.onchange = () => {
      const files = Array.from(input.files || [])
      if (files.length > 0) {
        onFileDrop(files)
      }
    }

    input.click()
  }, [onFileDrop, accept, multiple, disabled])

  return (
    <m.div
      className={clsxm(
        'relative rounded-xl border-2 border-dashed transition-colors cursor-pointer',
        isDragOver
          ? 'border-accent bg-accent/10'
          : 'border-border hover:border-accent/50 hover:bg-fill/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      whileHover={disabled ? {} : { scale: 1.01 }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      transition={Spring.presets.snappy}
    >
      {children}
      {isDragOver && (
        <m.div
          className="absolute inset-0 flex items-center justify-center bg-accent/20 rounded-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <span className="text-accent font-medium">Drop to load</span>
        </m.div>
      )}
    </m.div>
  )
}

/**
 * Empty state dropzone for initial file loading.
 */
export function FileDropzone({
  onFileDrop,
  disabled,
}: {
  onFileDrop: (files: File[]) => void
  disabled?: boolean
}) {
  const rawExtensions = [
    '.cr2',
    '.cr3',
    '.nef',
    '.arw',
    '.raf',
    '.rw2',
    '.orf',
    '.dng',
    '.pef',
    '.srw',
    '.3fr',
    '.fff',
    '.iiq',
    '.raw',
  ]

  return (
    <Dropzone
      onFileDrop={onFileDrop}
      accept={rawExtensions}
      disabled={disabled}
      className="min-h-[300px] flex flex-col items-center justify-center p-8"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="size-16 rounded-full bg-fill flex items-center justify-center">
          <i className="i-mingcute-image-2-line text-3xl text-text-secondary" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-text">
            Drop your RAW file here
          </h3>
          <p className="text-sm text-text-secondary mt-1">or click to browse</p>
        </div>
        <p className="text-xs text-text-tertiary max-w-md">
          Supports CR2, CR3, NEF, ARW, RAF, RW2, ORF, DNG and other RAW formats
        </p>
      </div>
    </Dropzone>
  )
}

/**
 * Small dropzone for LUT files.
 */
export function LutDropzone({
  onFileDrop,
  currentLut,
  onClear,
  disabled,
}: {
  onFileDrop: (files: File[]) => void
  currentLut?: string | null
  onClear?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Dropzone
        onFileDrop={onFileDrop}
        accept={['.cube']}
        disabled={disabled}
        className="flex-1 px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <i className="i-mingcute-palette-2-line text-lg text-text-secondary" />
          <span className="text-sm text-text truncate">
            {currentLut || 'Drop .cube LUT file'}
          </span>
        </div>
      </Dropzone>
      {currentLut && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="p-2 rounded-lg hover:bg-fill text-text-secondary hover:text-text transition-colors"
          title="Clear LUT"
        >
          <i className="i-mingcute-close-line text-lg" />
        </button>
      )}
    </div>
  )
}
