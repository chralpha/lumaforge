# Mobile Adjust Inline-Slider List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile `/raw` Adjust panel's strip+focus-editor pattern with an inline vertical list of slider rows, plus a floating value HUD during scrub. Eliminates the modal handoff between picking a field and adjusting it; makes every Tone/Color field reachable without horizontal scroll.

**Architecture:** A shared `AdjustSliderRow` row primitive (label · slider · value-with-reset) is composed by `ToneListPanel` and `ColorListPanel`. `AdjustListPanel` wraps them with the Tone/Color segment + section-level Reset on the top row. `MobileLabChrome` swaps its Adjust mode panel from `AdjustStripPanel` to `AdjustListPanel`, drops all focus-editor state and JSX, and renders a new `ScrubValueHud` over the preview while a slider is being dragged.

**Tech Stack:** React + TypeScript, Radix UI `Slider`, `motion/react` (`m` inside the app's `LazyMotion`), Tailwind v4 with the `/raw` darkroom tokens, Vitest + Testing Library + user-event for tests, i18n through `~/lib/i18n` (`src/locales/{en,zh-CN}.json`).

**Spec:** `docs/specs/2026-05-31-mobile-adjust-inline-list-design.md`

---

## File Structure

**Created:**
- `src/modules/raw-processor/components/mobile/AdjustSliderRow.tsx` — single-row primitive: label · slider · value-cell-with-per-field-reset. Owns scrub pointer events.
- `src/modules/raw-processor/components/mobile/AdjustSliderRow.test.tsx` — wiring, scrub events, value-cell reset.
- `src/modules/raw-processor/components/mobile/ToneListPanel.tsx` — vertical list of tone slider rows; no own chrome.
- `src/modules/raw-processor/components/mobile/ToneListPanel.test.tsx`
- `src/modules/raw-processor/components/mobile/ColorListPanel.tsx` — same shape for color.
- `src/modules/raw-processor/components/mobile/ColorListPanel.test.tsx`
- `src/modules/raw-processor/components/mobile/AdjustListPanel.tsx` — Tone/Color segment + section-level Reset on the top row + active list.
- `src/modules/raw-processor/components/mobile/AdjustListPanel.test.tsx`
- `src/modules/raw-processor/components/mobile/ScrubValueHud.tsx` — floating HUD over the preview during scrub.
- `src/modules/raw-processor/components/mobile/ScrubValueHud.test.tsx`

**Modified:**
- `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx` — replace focus state/handlers/JSX with `scrubField` state, `AdjustListPanel`, `ScrubValueHud`.
- `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx` — drop focus-editor assertions, add scrub-HUD assertions.
- `src/locales/en.json`, `src/locales/zh-CN.json` — add new keys, remove unused ones.

**Deleted:**
- `src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx` + `.test.tsx`
- `src/modules/raw-processor/components/mobile/ToneStripPanel.tsx` + `.test.tsx`
- `src/modules/raw-processor/components/mobile/ColorStripPanel.tsx` + `.test.tsx`
- `src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx` + `.test.tsx`
- `src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx` + `.test.tsx`

**Shared types** (declared in `AdjustListPanel.tsx`, imported by `MobileLabChrome.tsx` and `ScrubValueHud.tsx`):

```ts
export type ScrubFieldId =
  | { kind: 'tone'; key: keyof ToneValue }
  | { kind: 'color'; key: keyof ColorValue }
```

---

### Task 1: Add and remove i18n keys

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

Keys to add (used by later tasks): `raw.mobile.adjustList.aria` (region label), `raw.mobile.adjustList.toneListAria`, `raw.mobile.adjustList.colorListAria`, `raw.mobile.adjustList.fieldResetAria` (template `Reset {label}`), `raw.mobile.adjustList.scrubHudAria`.

Keys to remove (no longer referenced after this plan completes): `raw.mobile.toneStrip.hint`, `raw.mobile.toneStrip.aria`, `raw.mobile.adjustStrip.hint`, `raw.mobile.colorStrip.aria`, `raw.mobile.focus.cancel`, `raw.mobile.focus.done`, `raw.mobile.focus.neutral`, `raw.mobile.focus.siblingsAria`, `raw.mobile.focus.colorSiblingsAria`.

- [ ] **Step 1: Add new keys to en.json**

Insert these alongside the existing `raw.mobile.*` block in `src/locales/en.json` (place adjacent to the existing `raw.mobile.adjustStrip.hint` line; ordering inside the JSON object is not load-bearing):

```json
"raw.mobile.adjustList.aria": "Adjust panel",
"raw.mobile.adjustList.toneListAria": "Tone sliders",
"raw.mobile.adjustList.colorListAria": "Color sliders",
"raw.mobile.adjustList.fieldResetAria": "Reset {{label}}",
"raw.mobile.adjustList.scrubHudAria": "Adjustment readout",
```

- [ ] **Step 2: Add new keys to zh-CN.json**

```json
"raw.mobile.adjustList.aria": "调节面板",
"raw.mobile.adjustList.toneListAria": "影调滑块列表",
"raw.mobile.adjustList.colorListAria": "色彩滑块列表",
"raw.mobile.adjustList.fieldResetAria": "重置 {{label}}",
"raw.mobile.adjustList.scrubHudAria": "调节数值",
```

- [ ] **Step 3: Verify locale JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/zh-CN.json','utf8'))"`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json
git -c commit.gpgsign=false commit -m "feat(raw-processor): add mobile adjust list i18n keys" --no-gpg-sign
```

(Removal of stale keys is deferred to Task 8 once nothing references them.)

---

### Task 2: Build AdjustSliderRow primitive (TDD)

**Files:**
- Create: `src/modules/raw-processor/components/mobile/AdjustSliderRow.tsx`
- Test: `src/modules/raw-processor/components/mobile/AdjustSliderRow.test.tsx`

Component contract:

```ts
type AdjustSliderRowProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
  resetAriaLabel: string
  activeScrub?: boolean
  siblingScrubbing?: boolean
  onChange: (value: number) => void
  onScrubChange: (scrubbing: boolean) => void
}
```

Visual contract: single-line `grid grid-cols-[88px_minmax(0,1fr)_56px]` row, ~44px min height. When value === 0, the right-hand value cell renders as a plain `<span>` (non-interactive). When value !== 0, it renders as a `<button>` with `aria-label={resetAriaLabel}` whose click emits `onChange(0)`.

Visual states (driven by `activeScrub` / `siblingScrubbing` from the parent list):
- `activeScrub=true`: row "lifts" with `bg-lf-on-photo-bg-strong` and `border-lf-amber/55`.
- `siblingScrubbing=true`: row recedes via `opacity-40`.
- Neither: idle styling.

Both flags are also surfaced as `data-active-scrub` / `data-sibling-scrubbing` data attributes (only present when true) so tests can assert state without coupling to class strings.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/raw-processor/components/mobile/AdjustSliderRow.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustSliderRow } from './AdjustSliderRow'

describe('adjustSliderRow', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderRow(
    overrides: Partial<React.ComponentProps<typeof AdjustSliderRow>> = {},
  ) {
    const props = {
      label: 'Contrast',
      value: 0,
      min: -100,
      max: 100,
      step: 1,
      formatValue: (v: number) => `${v > 0 ? '+' : ''}${v}`,
      resetAriaLabel: 'Reset Contrast',
      onChange: vi.fn(),
      onScrubChange: vi.fn(),
      ...overrides,
    }
    render(<AdjustSliderRow {...props} />)
    return props
  }

  it('renders the label, slider wired with field metadata, and value', () => {
    renderRow({ value: 12 })
    const thumb = screen.getByRole('slider', { name: 'Contrast' })
    expect(thumb).toHaveAttribute('aria-valuemin', '-100')
    expect(thumb).toHaveAttribute('aria-valuemax', '100')
    expect(thumb).toHaveAttribute('aria-valuenow', '12')
    expect(screen.getByText('+12')).toBeInTheDocument()
    expect(screen.getByText('Contrast')).toBeInTheDocument()
  })

  it('renders the value as plain text when neutral', () => {
    renderRow({ value: 0 })
    expect(
      screen.queryByRole('button', { name: /reset contrast/i }),
    ).toBeNull()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('exposes a reset button when dirty and emits onChange(0)', async () => {
    const props = renderRow({ value: -42 })
    const resetButton = screen.getByRole('button', { name: /reset contrast/i })
    expect(resetButton).toHaveTextContent('-42')
    await userEvent.click(resetButton)
    expect(props.onChange).toHaveBeenCalledWith(0)
  })

  it('emits onScrubChange on pointerdown and pointerup over the slider track', () => {
    const props = renderRow({ value: 12 })
    const scrubTarget = screen.getByTestId('adjust-slider-row-scrub')
    fireEvent.pointerDown(scrubTarget)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerUp(scrubTarget)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(false)
  })

  it('also clears scrub state on pointercancel', () => {
    const props = renderRow({ value: 12 })
    const scrubTarget = screen.getByTestId('adjust-slider-row-scrub')
    fireEvent.pointerDown(scrubTarget)
    fireEvent.pointerCancel(scrubTarget)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(false)
  })

  it('exposes active-scrub and sibling-scrubbing data attributes', () => {
    const { container, rerender } = render(
      <AdjustSliderRow
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        resetAriaLabel="Reset Contrast"
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const root = container.querySelector('[data-adjust-slider-row]')!
    expect(root).not.toHaveAttribute('data-active-scrub')
    expect(root).not.toHaveAttribute('data-sibling-scrubbing')

    rerender(
      <AdjustSliderRow
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        resetAriaLabel="Reset Contrast"
        activeScrub
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    expect(root).toHaveAttribute('data-active-scrub', 'true')
    expect(root).not.toHaveAttribute('data-sibling-scrubbing')

    rerender(
      <AdjustSliderRow
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        resetAriaLabel="Reset Contrast"
        siblingScrubbing
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    expect(root).not.toHaveAttribute('data-active-scrub')
    expect(root).toHaveAttribute('data-sibling-scrubbing', 'true')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/AdjustSliderRow.test.tsx`
Expected: FAIL with "Cannot find module './AdjustSliderRow'" or equivalent.

- [ ] **Step 3: Implement `AdjustSliderRow.tsx`**

Create `src/modules/raw-processor/components/mobile/AdjustSliderRow.tsx`:

```tsx
import { Slider } from '~/components/ui/slider/Slider'
import { clsxm } from '~/lib/cn'

type AdjustSliderRowProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
  resetAriaLabel: string
  activeScrub?: boolean
  siblingScrubbing?: boolean
  onChange: (value: number) => void
  onScrubChange: (scrubbing: boolean) => void
}

export function AdjustSliderRow(props: AdjustSliderRowProps) {
  const dirty = props.value !== 0
  const formatted = props.formatValue(props.value)
  const activeScrub = props.activeScrub === true
  const siblingScrubbing = props.siblingScrubbing === true

  return (
    <div
      data-adjust-slider-row
      data-active-scrub={activeScrub || undefined}
      data-sibling-scrubbing={siblingScrubbing || undefined}
      className={clsxm(
        'grid grid-cols-[88px_minmax(0,1fr)_56px] items-center gap-3 rounded-md border border-transparent px-3 py-2 min-h-[44px] transition-[opacity,background-color,border-color] duration-150',
        activeScrub && 'border-lf-amber/55 bg-lf-on-photo-bg-strong',
        siblingScrubbing && 'opacity-40',
      )}
    >
      <span
        className={clsxm(
          'truncate text-[0.82rem] font-semibold leading-tight',
          dirty ? 'text-lf-amber-soft' : 'text-lf-on-photo-ink/82',
        )}
      >
        {props.label}
      </span>
      <div
        data-testid="adjust-slider-row-scrub"
        onPointerDown={() => props.onScrubChange(true)}
        onPointerUp={() => props.onScrubChange(false)}
        onPointerCancel={() => props.onScrubChange(false)}
      >
        <Slider
          thumbAriaLabel={props.label}
          value={[props.value]}
          min={props.min}
          max={props.max}
          step={props.step}
          onValueChange={([next]) => props.onChange(next)}
        />
      </div>
      {dirty ? (
        <button
          type="button"
          aria-label={props.resetAriaLabel}
          onClick={() => props.onChange(0)}
          className="inline-flex h-9 items-center justify-end rounded-md px-1 text-right text-[0.82rem] font-semibold tabular-nums text-lf-amber-soft transition-colors hover:text-lf-on-photo-ink"
        >
          {formatted}
        </button>
      ) : (
        <span className="inline-flex h-9 items-center justify-end px-1 text-right text-[0.82rem] font-semibold tabular-nums text-lf-on-photo-ink/72">
          {formatted}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/AdjustSliderRow.test.tsx`
Expected: PASS, 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/AdjustSliderRow.tsx src/modules/raw-processor/components/mobile/AdjustSliderRow.test.tsx
git -c commit.gpgsign=false commit -m "feat(raw-processor): add mobile AdjustSliderRow primitive" --no-gpg-sign
```

---

### Task 3: Build ToneListPanel (TDD)

**Files:**
- Create: `src/modules/raw-processor/components/mobile/ToneListPanel.tsx`
- Test: `src/modules/raw-processor/components/mobile/ToneListPanel.test.tsx`

Component contract:

```ts
type ToneListPanelProps = {
  tone: ToneValue
  onChange: (patch: Partial<ToneValue>) => void
  onScrubChange: (field: { key: keyof ToneValue } | null) => void
}
```

Renders one `AdjustSliderRow` per `MOBILE_TONE_FIELDS` entry, in order. Wraps the list in `<div role="group" aria-label={t('raw.mobile.adjustList.toneListAria')}>`. Forwards each row's `onChange(value)` as `onChange({ [field.key]: value })` to the parent. Tracks an internal `scrubbingKey: keyof ToneValue | null` so it can drive `activeScrub` / `siblingScrubbing` on each row; also forwards scrub identity upward via the prop `onScrubChange({ key } | null)`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/raw-processor/components/mobile/ToneListPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TONE_NEUTRAL } from './tone-fields'
import { ToneListPanel } from './ToneListPanel'

describe('toneListPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders one slider per tone field in canonical order', () => {
    render(
      <ToneListPanel
        tone={{ ...TONE_NEUTRAL, userExposureEv: 1.25 }}
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(6)
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Exposure',
      'Contrast',
      'Highlights',
      'Shadows',
      'Whites',
      'Blacks',
    ])
    expect(screen.getByText('+1.25')).toBeInTheDocument()
  })

  it('per-field reset emits a single-key patch', async () => {
    const onChange = vi.fn()
    render(
      <ToneListPanel
        tone={{ ...TONE_NEUTRAL, userContrast: 30 }}
        onChange={onChange}
        onScrubChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /reset contrast/i }))
    expect(onChange).toHaveBeenCalledWith({ userContrast: 0 })
  })

  it('forwards scrub state with the originating field key', () => {
    const onScrubChange = vi.fn()
    render(
      <ToneListPanel
        tone={{ ...TONE_NEUTRAL, userShadows: 8 }}
        onChange={vi.fn()}
        onScrubChange={onScrubChange}
      />,
    )
    const shadowsRow = screen
      .getByRole('slider', { name: 'Shadows' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(shadowsRow)
    expect(onScrubChange).toHaveBeenLastCalledWith({ key: 'userShadows' })
    fireEvent.pointerUp(shadowsRow)
    expect(onScrubChange).toHaveBeenLastCalledWith(null)
  })

  it('flags the active row and recedes siblings while a row is scrubbed', () => {
    const { container } = render(
      <ToneListPanel
        tone={TONE_NEUTRAL}
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const exposureScrub = container
      .querySelectorAll('[data-adjust-slider-row]')[0]
      .querySelector('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(exposureScrub)
    const rows = container.querySelectorAll('[data-adjust-slider-row]')
    expect(rows[0]).toHaveAttribute('data-active-scrub', 'true')
    expect(rows[0]).not.toHaveAttribute('data-sibling-scrubbing')
    for (const sibling of Array.from(rows).slice(1)) {
      expect(sibling).toHaveAttribute('data-sibling-scrubbing', 'true')
      expect(sibling).not.toHaveAttribute('data-active-scrub')
    }
    fireEvent.pointerUp(exposureScrub)
    for (const row of rows) {
      expect(row).not.toHaveAttribute('data-active-scrub')
      expect(row).not.toHaveAttribute('data-sibling-scrubbing')
    }
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/ToneListPanel.test.tsx`
Expected: FAIL with "Cannot find module './ToneListPanel'".

- [ ] **Step 3: Implement `ToneListPanel.tsx`**

Create `src/modules/raw-processor/components/mobile/ToneListPanel.tsx`:

```tsx
import { useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'
import { AdjustSliderRow } from './AdjustSliderRow'
import { formatToneValueShort, MOBILE_TONE_FIELDS } from './tone-fields'

type ToneListPanelProps = {
  tone: ToneValue
  onChange: (patch: Partial<ToneValue>) => void
  onScrubChange: (field: { key: keyof ToneValue } | null) => void
}

export function ToneListPanel(props: ToneListPanelProps) {
  const { t } = useI18n()
  const [scrubbingKey, setScrubbingKey] = useState<keyof ToneValue | null>(null)
  const { onScrubChange: notifyParent } = props

  return (
    <div
      role="group"
      aria-label={t('raw.mobile.adjustList.toneListAria')}
      className="grid gap-0.5"
    >
      {MOBILE_TONE_FIELDS.map((field) => {
        const label = t(field.labelKey)
        const isActive = scrubbingKey === field.key
        const isSibling = scrubbingKey !== null && !isActive
        return (
          <AdjustSliderRow
            key={field.key}
            label={label}
            value={props.tone[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            formatValue={(v) => formatToneValueShort(field.key, v)}
            resetAriaLabel={t('raw.mobile.adjustList.fieldResetAria', { label })}
            activeScrub={isActive}
            siblingScrubbing={isSibling}
            onChange={(value) => props.onChange({ [field.key]: value })}
            onScrubChange={(scrubbing) => {
              const next = scrubbing ? field.key : null
              setScrubbingKey(next)
              notifyParent(next ? { key: next } : null)
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/ToneListPanel.test.tsx`
Expected: PASS, 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/ToneListPanel.tsx src/modules/raw-processor/components/mobile/ToneListPanel.test.tsx
git -c commit.gpgsign=false commit -m "feat(raw-processor): add mobile ToneListPanel" --no-gpg-sign
```

---

### Task 4: Build ColorListPanel (TDD)

**Files:**
- Create: `src/modules/raw-processor/components/mobile/ColorListPanel.tsx`
- Test: `src/modules/raw-processor/components/mobile/ColorListPanel.test.tsx`

Component contract:

```ts
type ColorListPanelProps = {
  color: ColorValue
  onChange: (patch: Partial<ColorValue>) => void
  onScrubChange: (field: { key: keyof ColorValue } | null) => void
}
```

Identical structure to `ToneListPanel`, but over `MOBILE_COLOR_FIELDS` and using `formatColorValueShort`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/raw-processor/components/mobile/ColorListPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COLOR_NEUTRAL } from './color-fields'
import { ColorListPanel } from './ColorListPanel'

describe('colorListPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders Temperature then Tint with current values', () => {
    render(
      <ColorListPanel
        color={{ ...COLOR_NEUTRAL, userTemperature: 24, userTint: -12 }}
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(2)
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Temperature',
      'Tint',
    ])
    expect(screen.getByText('+24')).toBeInTheDocument()
    expect(screen.getByText('-12')).toBeInTheDocument()
  })

  it('per-field reset emits a single-key patch', async () => {
    const onChange = vi.fn()
    render(
      <ColorListPanel
        color={{ ...COLOR_NEUTRAL, userTint: -18 }}
        onChange={onChange}
        onScrubChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /reset tint/i }))
    expect(onChange).toHaveBeenCalledWith({ userTint: 0 })
  })

  it('forwards scrub state with the originating field key', () => {
    const onScrubChange = vi.fn()
    render(
      <ColorListPanel
        color={{ ...COLOR_NEUTRAL, userTemperature: 10 }}
        onChange={vi.fn()}
        onScrubChange={onScrubChange}
      />,
    )
    const tempRow = screen
      .getByRole('slider', { name: 'Temperature' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(tempRow)
    expect(onScrubChange).toHaveBeenLastCalledWith({ key: 'userTemperature' })
    fireEvent.pointerUp(tempRow)
    expect(onScrubChange).toHaveBeenLastCalledWith(null)
  })

  it('flags the active row and recedes the sibling while scrubbing', () => {
    const { container } = render(
      <ColorListPanel
        color={COLOR_NEUTRAL}
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const tintScrub = container
      .querySelectorAll('[data-adjust-slider-row]')[1]
      .querySelector('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(tintScrub)
    const rows = container.querySelectorAll('[data-adjust-slider-row]')
    expect(rows[1]).toHaveAttribute('data-active-scrub', 'true')
    expect(rows[0]).toHaveAttribute('data-sibling-scrubbing', 'true')
    fireEvent.pointerUp(tintScrub)
    for (const row of rows) {
      expect(row).not.toHaveAttribute('data-active-scrub')
      expect(row).not.toHaveAttribute('data-sibling-scrubbing')
    }
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/ColorListPanel.test.tsx`
Expected: FAIL with "Cannot find module './ColorListPanel'".

- [ ] **Step 3: Implement `ColorListPanel.tsx`**

Create `src/modules/raw-processor/components/mobile/ColorListPanel.tsx`:

```tsx
import { useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { ColorValue } from '../tools/ColorTool'
import { AdjustSliderRow } from './AdjustSliderRow'
import { formatColorValueShort, MOBILE_COLOR_FIELDS } from './color-fields'

type ColorListPanelProps = {
  color: ColorValue
  onChange: (patch: Partial<ColorValue>) => void
  onScrubChange: (field: { key: keyof ColorValue } | null) => void
}

export function ColorListPanel(props: ColorListPanelProps) {
  const { t } = useI18n()
  const [scrubbingKey, setScrubbingKey] = useState<keyof ColorValue | null>(
    null,
  )
  const { onScrubChange: notifyParent } = props

  return (
    <div
      role="group"
      aria-label={t('raw.mobile.adjustList.colorListAria')}
      className="grid gap-0.5"
    >
      {MOBILE_COLOR_FIELDS.map((field) => {
        const label = t(field.labelKey)
        const isActive = scrubbingKey === field.key
        const isSibling = scrubbingKey !== null && !isActive
        return (
          <AdjustSliderRow
            key={field.key}
            label={label}
            value={props.color[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            formatValue={(v) => formatColorValueShort(field.key, v)}
            resetAriaLabel={t('raw.mobile.adjustList.fieldResetAria', { label })}
            activeScrub={isActive}
            siblingScrubbing={isSibling}
            onChange={(value) => props.onChange({ [field.key]: value })}
            onScrubChange={(scrubbing) => {
              const next = scrubbing ? field.key : null
              setScrubbingKey(next)
              notifyParent(next ? { key: next } : null)
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/ColorListPanel.test.tsx`
Expected: PASS, 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/ColorListPanel.tsx src/modules/raw-processor/components/mobile/ColorListPanel.test.tsx
git -c commit.gpgsign=false commit -m "feat(raw-processor): add mobile ColorListPanel" --no-gpg-sign
```

---

### Task 5: Build AdjustListPanel (TDD)

**Files:**
- Create: `src/modules/raw-processor/components/mobile/AdjustListPanel.tsx`
- Test: `src/modules/raw-processor/components/mobile/AdjustListPanel.test.tsx`

Component contract:

```ts
export type ScrubFieldId =
  | { kind: 'tone'; key: keyof ToneValue }
  | { kind: 'color'; key: keyof ColorValue }

type AdjustListPanelProps = {
  tone: ToneValue
  color: ColorValue
  onToneChange: (patch: Partial<ToneValue>) => void
  onColorChange: (patch: Partial<ColorValue>) => void
  onToneReset: () => void
  onColorReset: () => void
  onScrubChange: (field: ScrubFieldId | null) => void
}
```

Owns local `activePanel: 'tone' | 'color'` state and the Tone/Color `SegmentGroup` (same one currently in `AdjustStripPanel`). The section-level Reset button moves out of the strip panels and onto the segment row's right edge. Swapping the segment clears any in-flight scrub (`onScrubChange(null)`).

- [ ] **Step 1: Write the failing tests**

Create `src/modules/raw-processor/components/mobile/AdjustListPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustListPanel } from './AdjustListPanel'
import { COLOR_NEUTRAL } from './color-fields'
import { TONE_NEUTRAL } from './tone-fields'

describe('adjustListPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderPanel(overrides: Partial<React.ComponentProps<typeof AdjustListPanel>> = {}) {
    const props = {
      tone: { ...TONE_NEUTRAL, userContrast: 10 },
      color: { ...COLOR_NEUTRAL, userTemperature: 24 },
      onToneChange: vi.fn(),
      onColorChange: vi.fn(),
      onToneReset: vi.fn(),
      onColorReset: vi.fn(),
      onScrubChange: vi.fn(),
      ...overrides,
    }
    render(<AdjustListPanel {...props} />)
    return props
  }

  it('starts on Tone and shows the six tone sliders + segment reset button', () => {
    renderPanel()
    expect(
      screen.getByRole('group', { name: /tone sliders/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(6)
    expect(screen.getByRole('button', { name: /reset tone/i })).toBeEnabled()
  })

  it('switches to Color and shows the two color sliders', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(
      screen.getByRole('group', { name: /color sliders/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /reset color/i })).toBeEnabled()
  })

  it('disables the section reset when the active section is neutral', async () => {
    renderPanel({ tone: TONE_NEUTRAL, color: COLOR_NEUTRAL })
    expect(screen.getByRole('button', { name: /reset tone/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(screen.getByRole('button', { name: /reset color/i })).toBeDisabled()
  })

  it('section reset calls the section-scoped handler only', async () => {
    const props = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /reset tone/i }))
    expect(props.onToneReset).toHaveBeenCalledTimes(1)
    expect(props.onColorReset).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    await userEvent.click(screen.getByRole('button', { name: /reset color/i }))
    expect(props.onColorReset).toHaveBeenCalledTimes(1)
  })

  it('child scrub events bubble out with the section kind', () => {
    const props = renderPanel()
    const exposureRow = screen
      .getByRole('slider', { name: 'Exposure' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(exposureRow)
    expect(props.onScrubChange).toHaveBeenLastCalledWith({
      kind: 'tone',
      key: 'userExposureEv',
    })
    fireEvent.pointerUp(exposureRow)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(null)
  })

  it('clears any in-flight scrub when the segment is switched', async () => {
    const props = renderPanel()
    const exposureRow = screen
      .getByRole('slider', { name: 'Exposure' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(exposureRow)
    props.onScrubChange.mockClear()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(props.onScrubChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/AdjustListPanel.test.tsx`
Expected: FAIL with "Cannot find module './AdjustListPanel'".

- [ ] **Step 3: Implement `AdjustListPanel.tsx`**

Create `src/modules/raw-processor/components/mobile/AdjustListPanel.tsx`:

```tsx
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { useI18n } from '~/lib/i18n'

import type { ColorValue } from '../tools/ColorTool'
import type { ToneValue } from '../tools/ToneTool'
import { isColorNeutral } from './color-fields'
import { ColorListPanel } from './ColorListPanel'
import { isToneNeutral } from './tone-fields'
import { ToneListPanel } from './ToneListPanel'

type Section = 'tone' | 'color'

export type ScrubFieldId =
  | { kind: 'tone'; key: keyof ToneValue }
  | { kind: 'color'; key: keyof ColorValue }

type AdjustListPanelProps = {
  tone: ToneValue
  color: ColorValue
  onToneChange: (patch: Partial<ToneValue>) => void
  onColorChange: (patch: Partial<ColorValue>) => void
  onToneReset: () => void
  onColorReset: () => void
  onScrubChange: (field: ScrubFieldId | null) => void
}

export function AdjustListPanel(props: AdjustListPanelProps) {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('tone')

  const isNeutral =
    section === 'tone' ? isToneNeutral(props.tone) : isColorNeutral(props.color)
  const resetLabel =
    section === 'tone' ? t('raw.tone.reset') : t('raw.color.reset')
  const onSectionReset =
    section === 'tone' ? props.onToneReset : props.onColorReset

  return (
    <div
      role="region"
      aria-label={t('raw.mobile.adjustList.aria')}
      className="grid gap-2"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <SegmentGroup
          aria-label={t('raw.adjust.title')}
          value={section}
          onValueChanged={(value) => {
            const next = value as Section
            if (next === section) return
            props.onScrubChange(null)
            setSection(next)
          }}
          className="h-9 w-full rounded-md bg-[oklch(0.96_0.006_255/0.05)] p-1"
        >
          <SegmentItem
            value="tone"
            label={t('raw.adjust.tone')}
            className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 transition-colors duration-150 hover:text-lf-on-photo-ink/92 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.10)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
          />
          <SegmentItem
            value="color"
            label={t('raw.adjust.color')}
            className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 transition-colors duration-150 hover:text-lf-on-photo-ink/92 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.10)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
          />
        </SegmentGroup>
        <button
          type="button"
          onClick={onSectionReset}
          disabled={isNeutral}
          aria-label={resetLabel}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft px-2.5 py-1 text-[0.7rem] font-semibold text-lf-on-photo-ink/82 transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          {resetLabel}
        </button>
      </div>
      {section === 'tone' ? (
        <ToneListPanel
          tone={props.tone}
          onChange={props.onToneChange}
          onScrubChange={(field) =>
            props.onScrubChange(
              field ? { kind: 'tone', key: field.key } : null,
            )
          }
        />
      ) : (
        <ColorListPanel
          color={props.color}
          onChange={props.onColorChange}
          onScrubChange={(field) =>
            props.onScrubChange(
              field ? { kind: 'color', key: field.key } : null,
            )
          }
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/AdjustListPanel.test.tsx`
Expected: PASS, 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/AdjustListPanel.tsx src/modules/raw-processor/components/mobile/AdjustListPanel.test.tsx
git -c commit.gpgsign=false commit -m "feat(raw-processor): add mobile AdjustListPanel" --no-gpg-sign
```

---

### Task 6: Build ScrubValueHud (TDD)

**Files:**
- Create: `src/modules/raw-processor/components/mobile/ScrubValueHud.tsx`
- Test: `src/modules/raw-processor/components/mobile/ScrubValueHud.test.tsx`

Component contract:

```ts
type ScrubValueHudProps = {
  field: ScrubFieldId | null
  tone: ToneValue
  color: ColorValue
}
```

Renders nothing when `field === null`. Otherwise renders a `pointer-events-none` floating card with the field's localized label (small uppercase) and the formatted current value (large, tabular). The HUD reads the live value from `tone` / `color` props (single source of truth) and re-formats on every render. Uses `AnimatePresence initial={false}` + `surfaceFade` so jsdom does not need to flush enter animations (per `feedback_motion_test_gotcha` memory).

- [ ] **Step 1: Write the failing tests**

Create `src/modules/raw-processor/components/mobile/ScrubValueHud.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COLOR_NEUTRAL } from './color-fields'
import { ScrubValueHud } from './ScrubValueHud'
import { TONE_NEUTRAL } from './tone-fields'

describe('scrubValueHud', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when no field is scrubbing', () => {
    const { container } = render(
      <ScrubValueHud field={null} tone={TONE_NEUTRAL} color={COLOR_NEUTRAL} />,
    )
    expect(container.querySelector('[data-scrub-value-hud]')).toBeNull()
  })

  it('renders the live tone value with the localized label when scrubbing a tone field', () => {
    render(
      <ScrubValueHud
        field={{ kind: 'tone', key: 'userExposureEv' }}
        tone={{ ...TONE_NEUTRAL, userExposureEv: 1.25 }}
        color={COLOR_NEUTRAL}
      />,
    )
    const hud = screen.getByLabelText(/adjustment readout/i)
    expect(hud).toBeInTheDocument()
    expect(hud).toHaveTextContent(/exposure/i)
    expect(hud).toHaveTextContent('+1.25')
    expect(hud).toHaveAttribute('data-scrub-value-hud')
  })

  it('renders the live color value when scrubbing a color field', () => {
    render(
      <ScrubValueHud
        field={{ kind: 'color', key: 'userTint' }}
        tone={TONE_NEUTRAL}
        color={{ ...COLOR_NEUTRAL, userTint: -18 }}
      />,
    )
    const hud = screen.getByLabelText(/adjustment readout/i)
    expect(hud).toHaveTextContent(/tint/i)
    expect(hud).toHaveTextContent('-18')
  })

  it('is non-interactive (does not capture pointer events over the preview)', () => {
    render(
      <ScrubValueHud
        field={{ kind: 'tone', key: 'userContrast' }}
        tone={{ ...TONE_NEUTRAL, userContrast: 12 }}
        color={COLOR_NEUTRAL}
      />,
    )
    expect(screen.getByLabelText(/adjustment readout/i)).toHaveClass(
      'pointer-events-none',
    )
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/ScrubValueHud.test.tsx`
Expected: FAIL with "Cannot find module './ScrubValueHud'".

- [ ] **Step 3: Implement `ScrubValueHud.tsx`**

Create `src/modules/raw-processor/components/mobile/ScrubValueHud.tsx`:

```tsx
import { AnimatePresence, m } from 'motion/react'

import { useI18n } from '~/lib/i18n'
import { surfaceFade } from '~/lib/spring'

import type { ColorValue } from '../tools/ColorTool'
import type { ToneValue } from '../tools/ToneTool'
import type { ScrubFieldId } from './AdjustListPanel'
import { formatColorValueShort, MOBILE_COLOR_FIELDS } from './color-fields'
import { formatToneValueShort, MOBILE_TONE_FIELDS } from './tone-fields'

type ScrubValueHudProps = {
  field: ScrubFieldId | null
  tone: ToneValue
  color: ColorValue
}

export function ScrubValueHud(props: ScrubValueHudProps) {
  const { t } = useI18n()
  const readout = resolveReadout(props, t)

  return (
    <AnimatePresence initial={false}>
      {readout && (
        <m.div
          key={`${readout.kind}-${readout.key}`}
          data-scrub-value-hud
          aria-label={t('raw.mobile.adjustList.scrubHudAria')}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={surfaceFade}
          className="pointer-events-none absolute left-1/2 top-1/2 z-30 grid -translate-x-1/2 -translate-y-1/2 gap-1 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong px-5 py-3 text-center backdrop-blur-background"
        >
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-lf-amber-soft">
            {readout.label}
          </span>
          <strong className="text-[2rem] font-semibold leading-none tabular-nums text-lf-on-photo-ink">
            {readout.formatted}
          </strong>
        </m.div>
      )}
    </AnimatePresence>
  )
}

type Readout = {
  kind: 'tone' | 'color'
  key: string
  label: string
  formatted: string
}

function resolveReadout(
  props: ScrubValueHudProps,
  t: ReturnType<typeof useI18n>['t'],
): Readout | null {
  if (!props.field) return null
  if (props.field.kind === 'tone') {
    const field = MOBILE_TONE_FIELDS.find((f) => f.key === props.field!.key)
    if (!field) return null
    const value = props.tone[field.key]
    return {
      kind: 'tone',
      key: field.key,
      label: t(field.labelKey),
      formatted: formatToneValueShort(field.key, value),
    }
  }
  const field = MOBILE_COLOR_FIELDS.find((f) => f.key === props.field!.key)
  if (!field) return null
  const value = props.color[field.key]
  return {
    kind: 'color',
    key: field.key,
    label: t(field.labelKey),
    formatted: formatColorValueShort(field.key, value),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/ScrubValueHud.test.tsx`
Expected: PASS, 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/ScrubValueHud.tsx src/modules/raw-processor/components/mobile/ScrubValueHud.test.tsx
git -c commit.gpgsign=false commit -m "feat(raw-processor): add mobile ScrubValueHud" --no-gpg-sign
```

---

### Task 7: Rewire MobileLabChrome to use AdjustListPanel + ScrubValueHud

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`

Goals for this task:

1. Remove all focus-editor state, handlers, effects, and JSX from `MobileLabChrome`.
2. Add `scrubField: ScrubFieldId | null` state, set by `AdjustListPanel.onScrubChange`.
3. Replace `focusActive` with `scrubField !== null` in `previewGesturesEnabled` and the `data-focus` attribute on the chrome root.
4. Render `<ScrubValueHud field={scrubField} tone={props.tone} color={props.color} />` between the immersive button and the dock `AnimatePresence`.
5. Adjust the three lifecycle effects (`hasImage` reset, `handoffActive` reset, `preferExportMode` activate) to clear `scrubField` instead of the old focus state.
6. Update tests to assert against sliders + HUD instead of pills + focus editor.

The implementer must not import `ToneFocusEditor` / `ColorFocusEditor` / `AdjustStripPanel` anywhere in this file — those imports are deleted in this task and the source files are deleted in Task 8.

- [ ] **Step 1: Update `MobileLabChrome.test.tsx` to encode the new contract**

Replace the file's three Adjust-specific tests (`enters focus mode from a tone pill and hides the topbar`, `recedes focus chrome while the slider is scrubbed`, `opens Adjust color controls without adding a dock mode`) and the `tears down focus/sheets when the RAW is cleared` test with the versions below. All other tests in the file remain unchanged.

`tears down focus/sheets when the RAW is cleared (hasImage→false)` — replace the body with:

```tsx
  it('tears down adjust sheets when the RAW is cleared (hasImage→false)', async () => {
    const { rerender } = render(<MobileLabChrome {...base} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /adjust/i }))
    expect(
      screen.getByRole('group', { name: /tone sliders/i }),
    ).toBeInTheDocument()
    rerender(<MobileLabChrome {...base} hasImage={false} />)
    expect(
      screen.queryByRole('group', { name: /tone sliders/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /browse raw files/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /lumaforge raw lab/i }),
    ).toBeInTheDocument()
  })
```

`enters focus mode from a tone pill and hides the topbar` — replace entirely with:

```tsx
  it('opens Adjust inline with tone sliders and keeps the topbar visible', async () => {
    render(<MobileLabChrome {...base} />)
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()

    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /adjust/i }))

    expect(
      screen.getByRole('group', { name: /tone sliders/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(6)
    // The topbar stays present — no focus editor takeover.
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
  })
```

`recedes focus chrome while the slider is scrubbed` — replace entirely with:

```tsx
  it('shows the scrub HUD and flags the chrome while a slider is dragged', async () => {
    const { container } = render(<MobileLabChrome {...base} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /adjust/i }))
    const exposureRow = screen
      .getByRole('slider', { name: 'Exposure' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    expect(container.querySelector('[data-scrub-value-hud]')).toBeNull()
    expect(
      container.querySelector('[data-mobile-lab-chrome]'),
    ).toHaveAttribute('data-focus', 'false')

    fireEvent.pointerDown(exposureRow)
    expect(container.querySelector('[data-scrub-value-hud]')).toBeInTheDocument()
    expect(
      container.querySelector('[data-mobile-lab-chrome]'),
    ).toHaveAttribute('data-focus', 'true')

    fireEvent.pointerUp(exposureRow)
    expect(container.querySelector('[data-scrub-value-hud]')).toBeNull()
    expect(
      container.querySelector('[data-mobile-lab-chrome]'),
    ).toHaveAttribute('data-focus', 'false')
  })
```

`opens Adjust color controls without adding a dock mode` — replace entirely with:

```tsx
  it('opens Adjust color controls without adding a dock mode', async () => {
    render(
      <MobileLabChrome
        {...base}
        color={{ ...COLOR_NEUTRAL, userTemperature: 24, userTint: -12 }}
      />,
    )
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    expect(within(dock).getAllByRole('tab')).toHaveLength(4)

    await userEvent.click(within(dock).getByRole('tab', { name: /adjust/i }))
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))

    expect(
      screen.getByRole('group', { name: /color sliders/i }),
    ).toBeInTheDocument()
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(2)
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Temperature',
      'Tint',
    ])
    expect(screen.getByText('+24')).toBeInTheDocument()
    expect(screen.getByText('-12')).toBeInTheDocument()
    expect(within(dock).queryByRole('tab', { name: /color/i })).toBeNull()
    expect(within(dock).queryByRole('tab', { name: /tone/i })).toBeNull()
  })
```

- [ ] **Step 2: Run the test file to confirm new tests fail**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
Expected: FAIL on the four updated tests above (the source still imports the old strip / focus editor). All other tests in the file should continue to pass.

- [ ] **Step 3: Edit `MobileLabChrome.tsx` — remove the focus-editor surface area**

In `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`:

a. Replace the focus-editor / strip imports with the new ones. Find:

```ts
import { AdjustStripPanel } from './AdjustStripPanel'
import { ColorFocusEditor } from './ColorFocusEditor'
import { FloatingHistogramCard } from './FloatingHistogramCard'
```

…and replace with:

```ts
import { AdjustListPanel, type ScrubFieldId } from './AdjustListPanel'
import { FloatingHistogramCard } from './FloatingHistogramCard'
```

Also remove these imports anywhere they appear in the file:

```ts
import { ToneFocusEditor } from './ToneFocusEditor'
```

b. Replace the focus state block. Find the lines declaring `toneFocusKey`, `colorFocusKey`, `toneSnapshot`, `colorSnapshot`, and the standalone `scrubbing` state:

```ts
  const [toneFocusKey, setToneFocusKey] = useState<keyof ToneValue | null>(null)
  const [colorFocusKey, setColorFocusKey] = useState<keyof ColorValue | null>(
    null,
  )
```

…the matching `toneSnapshot` / `colorSnapshot` refs:

```ts
  const toneSnapshot = useRef<ToneValue | null>(null)
  const colorSnapshot = useRef<ColorValue | null>(null)
```

…and the now-orphan `scrubbing` state (was previously driven only by the focus editor's `onDragChange`):

```ts
  const [scrubbing, setScrubbing] = useState(false)
```

Replace all three with a single piece of scrub state:

```ts
  const [scrubField, setScrubField] = useState<ScrubFieldId | null>(null)
```

c. Delete the eight focus handler functions in their entirety:

```ts
  const startFocus = (k: keyof ToneValue) => { /* … */ }
  const cancelFocus = () => { /* … */ }
  const commitFocus = () => { /* … */ }
  const switchFocus = (k: keyof ToneValue) => { /* … */ }
  const startColorFocus = (k: keyof ColorValue) => { /* … */ }
  const cancelColorFocus = () => { /* … */ }
  const commitColorFocus = () => { /* … */ }
  const switchColorFocus = (k: keyof ColorValue) => { /* … */ }
```

d. Update the three lifecycle reset effects. In each of the `useEffect` blocks gated on `hasImage`, `handoffActive`, and `props.preferExportMode`, remove the focus-state cleanup lines:

```ts
    setToneFocusKey(null)
    setColorFocusKey(null)
```

…the `setScrubbing(false)` cleanup line (the `scrubbing` state itself was removed in step 3b):

```ts
    setScrubbing(false)
```

…and the snapshot cleanup at the bottom of each effect:

```ts
    toneSnapshot.current = null
    colorSnapshot.current = null
```

Insert the single replacement line in their place:

```ts
    setScrubField(null)
```

e. Replace the `focusActive` derivation. Find:

```ts
  const focusActive = toneFocusKey !== null || colorFocusKey !== null
  const previewGesturesEnabled =
    props.hasImage && !handoffActive && !focusActive
```

…with:

```ts
  const focusActive = scrubField !== null
  const previewGesturesEnabled =
    props.hasImage && !handoffActive && !focusActive
```

(`focusActive` keeps its name because it still feeds the chrome `data-focus` attribute and the existing `AnimatePresence initial={false}` gate that hides the dock under takeover-style states. The variable is now purely derived.)

f. Replace the `panelContent` Tone branch. Find:

```tsx
  const panelContent =
    mode === 'tone' ? (
      <AdjustStripPanel
        tone={props.tone}
        color={props.color}
        toneFocusKey={toneFocusKey}
        colorFocusKey={colorFocusKey}
        onPickToneField={startFocus}
        onPickColorField={startColorFocus}
        onToneReset={props.onToneReset}
        onColorReset={props.onColorReset}
      />
    ) : mode === 'look' ? (
```

…with:

```tsx
  const panelContent =
    mode === 'tone' ? (
      <AdjustListPanel
        tone={props.tone}
        color={props.color}
        onToneChange={props.onToneChange}
        onColorChange={props.onColorChange}
        onToneReset={props.onToneReset}
        onColorReset={props.onColorReset}
        onScrubChange={setScrubField}
      />
    ) : mode === 'look' ? (
```

g. Delete both focus editor `AnimatePresence` blocks near the bottom of the JSX (the ones that render `<ToneFocusEditor … />` and `<ColorFocusEditor … />`).

h. Add the `ScrubValueHud` between the immersive-show button block and the dock chrome `AnimatePresence`. Right before the `{/* Topbar + dock recede together as one surface … */}` comment, add:

```tsx
      <ScrubValueHud
        field={scrubField}
        tone={props.tone}
        color={props.color}
      />
```

…and add the import at the top of the file alongside the other mobile component imports:

```ts
import { ScrubValueHud } from './ScrubValueHud'
```

- [ ] **Step 4: Run the test file again to confirm everything passes**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
Expected: PASS for all tests including the four updated ones.

- [ ] **Step 5: Run the full mobile test slice**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile`
Expected: PASS. The legacy `AdjustStripPanel.test.tsx` / `ToneStripPanel.test.tsx` / `ColorStripPanel.test.tsx` / `ToneFocusEditor.test.tsx` / `ColorFocusEditor.test.tsx` files still pass against their soon-to-be-deleted modules — they're cleaned up in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLabChrome.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx
git -c commit.gpgsign=false commit -m "refactor(raw-processor): wire mobile Adjust panel through inline slider list" --no-gpg-sign
```

---

### Task 8: Delete obsolete files and i18n keys

**Files:**
- Delete: `src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx`
- Delete: `src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ToneStripPanel.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ColorStripPanel.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx`
- Delete: `src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Confirm there are no remaining references**

Run: `git grep -n "AdjustStripPanel\|ToneStripPanel\|ColorStripPanel\|ToneFocusEditor\|ColorFocusEditor" -- 'src/**/*.ts' 'src/**/*.tsx'`
Expected: only matches inside the five `*.tsx` files (and their tests) listed above for deletion. If there are matches elsewhere, fix them before deleting.

- [ ] **Step 2: Delete the obsolete files**

```bash
git rm \
  src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx \
  src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx \
  src/modules/raw-processor/components/mobile/ToneStripPanel.tsx \
  src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx \
  src/modules/raw-processor/components/mobile/ColorStripPanel.tsx \
  src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx \
  src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx \
  src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx \
  src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx \
  src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx
```

- [ ] **Step 3: Remove the unused i18n keys**

Edit `src/locales/en.json`: delete these lines:

```json
"raw.mobile.toneStrip.hint": "Tap a tone, drag to fine-tune. Each value is live on the photo.",
"raw.mobile.toneStrip.aria": "Tone parameters",
"raw.mobile.adjustStrip.hint": "Choose tone or color, then drag a value live on the photo.",
"raw.mobile.colorStrip.aria": "Color parameters",
"raw.mobile.focus.cancel": "Cancel",
"raw.mobile.focus.done": "Done",
"raw.mobile.focus.neutral": "neutral",
"raw.mobile.focus.siblingsAria": "Other tone parameters",
"raw.mobile.focus.colorSiblingsAria": "Other color parameters",
```

Edit `src/locales/zh-CN.json`: delete the matching keys:

```json
"raw.mobile.toneStrip.hint": "点选一项影调，拖动微调。每个数值都会实时作用到照片上。",
"raw.mobile.toneStrip.aria": "影调参数",
"raw.mobile.adjustStrip.hint": "先选择影调或色彩，再拖动数值实时调整照片。",
"raw.mobile.colorStrip.aria": "色彩参数",
"raw.mobile.focus.cancel": "取消",
"raw.mobile.focus.done": "完成",
"raw.mobile.focus.neutral": "中性",
"raw.mobile.focus.siblingsAria": "其他影调参数",
"raw.mobile.focus.colorSiblingsAria": "其他色彩参数",
```

Mind the trailing comma on the preceding/following lines after each removal so the JSON remains valid.

- [ ] **Step 4: Verify locale JSON parses and no stale key remains**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/zh-CN.json','utf8'))"`
Expected: no output, exit 0.

Run: `git grep -n "raw.mobile.toneStrip\|raw.mobile.colorStrip\|raw.mobile.adjustStrip\|raw.mobile.focus" -- 'src'`
Expected: empty output.

- [ ] **Step 5: Run the mobile test slice**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile`
Expected: PASS for all remaining mobile component tests.

- [ ] **Step 6: Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json
git -c commit.gpgsign=false commit -m "chore(raw-processor): drop legacy mobile Adjust strip and focus editors" --no-gpg-sign
```

---

### Task 9: Verification

**Files:** none (verification only)

- [ ] **Step 1: Focused UI vitest sweep**

Run: `pnpm test:ui`
Expected: PASS (full UI vitest suite).

- [ ] **Step 2: Lint with autofix**

Run: `pnpm lint`
Expected: clean exit. If autofix changes any of the touched files, review the diff before continuing.

- [ ] **Step 3: Type-checked build**

Per `feedback_verify_with_build_for_types`, vitest skips `tsc` so a full build is required to catch type drift in prop signatures.

Run: `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build`
Expected: clean build, no TypeScript errors. (The env var keeps the native artifact path on its prebuilt fast path so this UI-only change does not trigger a native rebuild.)

- [ ] **Step 4: Browser validation in WebKit mobile**

Per `project_raw_browser_validation`, use `pnpm preview` (not the dev server) and a stable selector for the viewport gate.

1. Run `pnpm preview` in one terminal.
2. Open the preview URL in Playwright / a mobile-emulated browser tab (WebKit-class viewport: 390×844 or similar).
3. Drag a small RAW into the Dropzone (drag-only — the Dropzone does not respond to a click upload in headless mode).
4. Once the photo is rendered, tap the Adjust dock tab.
5. Confirm: the Tone/Color segment and section Reset render on the top row of the dock panel; six tone slider rows are visible without horizontal scroll; each row shows label · slider · value.
6. Drag the Exposure slider thumb left/right. Confirm: a centered HUD appears over the preview showing `EXPOSURE` and the live value; other rows recede; the topbar stays present. Release. Confirm: the HUD fades out, rows return to full opacity.
7. With a dirty Exposure value, tap the value cell on the right. Confirm: Exposure returns to `0` and the value reverts to a plain (non-button) span.
8. Make Contrast and Shadows dirty too, then tap the section Reset button on the top row. Confirm: all tone fields return to neutral and the section reset disables itself.
9. Tap the Color segment. Confirm: Temperature and Tint sliders appear in place of the tone list; the section Reset label/aria updates to `Reset color`.
10. From Adjust mode, long-press the preview area (outside the dock panel). Confirm: peek still toggles `original` view mode and releases back, i.e. preview gestures are intact.

- [ ] **Step 5: Final smoke commit (optional)**

If any of the above surfaced small follow-up edits (e.g. token tweaks, minor a11y fixes), commit them with a `polish(raw-processor):` prefix. If nothing surfaced, skip this step.

---

## Out of scope

- Combining the Tone and Color segments into a single unsegmented list.
- Snap-to-neutral haptics or hold-to-fine-scrub gestures.
- Multi-step undo for adjustments.
- Desktop Adjust UI (`AdjustTool`) — untouched by this plan.
- Color / runtime / native artifact code paths — no contract changes here.
