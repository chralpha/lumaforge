import { useCallback, useRef } from 'react'

export interface UseHiddenFilePickerOptions {
  accept: string
  onFile: (file: File) => void
}

export interface UseHiddenFilePickerHandle {
  open: () => void
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>
    type: 'file'
    accept: string
    'aria-hidden': true
    tabIndex: -1
    className: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  }
}

/**
 * Always-mounted hidden file input. The caller renders `<input {...inputProps} />`
 * somewhere in its tree; `open()` triggers the native picker through that
 * real-DOM element, avoiding the WebKit-flaky off-DOM
 * `document.createElement('input')` pattern.
 */
export function useHiddenFilePicker(
  options: UseHiddenFilePickerOptions,
): UseHiddenFilePickerHandle {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onFileRef = useRef(options.onFile)
  onFileRef.current = options.onFile

  const open = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) {
      onFileRef.current(file)
    }
  }, [])

  return {
    open,
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: options.accept,
      'aria-hidden': true,
      tabIndex: -1,
      className: 'sr-only',
      onChange,
    },
  }
}
