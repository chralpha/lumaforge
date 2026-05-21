import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useHiddenFilePicker } from './useHiddenFilePicker'

function Harness({ onFile }: { onFile: (f: File) => void }) {
  const picker = useHiddenFilePicker({
    accept: '.cr2,.cr3,.arw',
    onFile,
  })
  return (
    <>
      <button type="button" onClick={picker.open}>
        Open
      </button>
      <input data-testid="hidden-input" {...picker.inputProps} />
    </>
  )
}

describe('useHiddenFilePicker', () => {
  it('renders the input with the accessibility + accept attributes', () => {
    const { getByTestId } = render(<Harness onFile={() => {}} />)
    const input = getByTestId('hidden-input') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.cr2,.cr3,.arw')
    expect(input.getAttribute('aria-hidden')).toBe('true')
    expect(input.tabIndex).toBe(-1)
    expect(input.className).toBe('sr-only')
  })

  it('open() invokes the ref-bound input click, not document.createElement', () => {
    const { getByTestId, getByText } = render(<Harness onFile={() => {}} />)
    const input = getByTestId('hidden-input') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
    // Spy after render so we don't capture React's own createElement calls.
    const createElementSpy = vi.spyOn(document, 'createElement')

    fireEvent.click(getByText('Open'))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createElementSpy).not.toHaveBeenCalledWith('input')
    createElementSpy.mockRestore()
  })

  it('forwards the selected file to onFile and clears the input value', () => {
    const onFile = vi.fn()
    const { getByTestId } = render(<Harness onFile={onFile} />)
    const input = getByTestId('hidden-input') as HTMLInputElement
    const file = new File(['raw'], 'sample.ARW')

    fireEvent.change(input, { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
  })
})
