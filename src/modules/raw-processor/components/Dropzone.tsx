/**
 * Dropzone component for loading RAW files and LUTs via drag and drop.
 */

import { m } from 'motion/react'
import { useCallback, useId, useRef, useState } from 'react'

import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

export const RAW_FILE_EXTENSIONS = [
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

export interface DropzoneProps {
  onFileDrop: (files: File[]) => void
  accept?: string[]
  multiple?: boolean
  className?: string
  children?:
    | React.ReactNode
    | ((controls: {
        openFilePicker: () => void
        disabled: boolean
      }) => React.ReactNode)
  disabled?: boolean
  clickToOpen?: boolean
  'aria-label'?: string
  variant?: 'default' | 'stage'
}

function filterAcceptedFiles(files: File[], accept?: string[]) {
  if (!accept) return files

  return files.filter((file) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext && accept.some((a) => a.toLowerCase() === `.${ext}`)
  })
}

export function Dropzone({
  onFileDrop,
  accept,
  multiple = false,
  className,
  children,
  disabled = false,
  clickToOpen = true,
  'aria-label': ariaLabel,
  variant = 'default',
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isClickTarget = clickToOpen && !disabled

  const handleFiles = useCallback(
    (files: File[]) => {
      const filteredFiles = filterAcceptedFiles(files, accept)

      if (filteredFiles.length > 0) {
        onFileDrop(multiple ? filteredFiles : [filteredFiles[0]])
      }
    },
    [onFileDrop, accept, multiple],
  )

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
      handleFiles(files)
    },
    [handleFiles, disabled],
  )

  const openFilePicker = useCallback(() => {
    if (disabled) return
    if (inputRef.current) {
      inputRef.current.click()
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    if (accept) {
      input.accept = accept.join(',')
    }

    input.onchange = () => {
      const files = Array.from(input.files || [])
      handleFiles(files)
    }

    input.click()
  }, [handleFiles, accept, multiple, disabled])

  const handleClick = useCallback(() => {
    if (!clickToOpen) return

    openFilePicker()
  }, [clickToOpen, openFilePicker])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!clickToOpen) return

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openFilePicker()
      }
    },
    [clickToOpen, openFilePicker],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.currentTarget.files || [])
      handleFiles(files)
      e.currentTarget.value = ''
    },
    [handleFiles],
  )

  const content = (
    <>
      {typeof children === 'function'
        ? children({ openFilePicker, disabled })
        : children}
      {isDragOver && (
        <m.div
          className={clsxm(
            'absolute inset-0 flex items-center justify-center',
            variant === 'stage'
              ? 'rounded-lg bg-[oklch(0.59_0.15_153_/_0.18)]'
              : 'rounded-xl bg-accent/20',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <span className="text-accent font-medium">Drop to load</span>
        </m.div>
      )}
    </>
  )

  const frameClassName = clsxm(
    'relative transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    clickToOpen ? 'cursor-pointer' : 'cursor-default',
    variant === 'stage'
      ? 'rounded-lg border border-[oklch(0.96_0.012_86_/_0.36)]'
      : 'rounded-xl border-2 border-dashed',
    isDragOver
      ? variant === 'stage'
        ? 'border-[oklch(0.59_0.15_153)] bg-[oklch(0.59_0.15_153_/_0.16)]'
        : 'border-accent bg-accent/10'
      : variant === 'stage'
        ? clickToOpen && 'hover:border-[oklch(0.59_0.15_153_/_0.72)]'
        : 'border-border hover:border-accent/50 hover:bg-fill/50',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  )

  const motionProps = isClickTarget
    ? {
        whileHover: { scale: 1.01 },
        whileTap: { scale: 0.99 },
      }
    : {}

  if (clickToOpen) {
    return (
      <m.label
        htmlFor={inputId}
        aria-disabled={disabled ? true : undefined}
        className={frameClassName}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        {...motionProps}
        transition={Spring.presets.snappy}
      >
        {content}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple={multiple}
          accept={accept?.join(',')}
          disabled={disabled}
          aria-label={ariaLabel}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={handleInputChange}
        />
      </m.label>
    )
  }

  return (
    <m.div
      className={frameClassName}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...motionProps}
      transition={Spring.presets.snappy}
    >
      {content}
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
  return (
    <Dropzone
      onFileDrop={onFileDrop}
      accept={RAW_FILE_EXTENSIONS}
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
