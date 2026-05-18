# Mobile RAW Lab Photo-First Rebuild — Implementation Plan

> **For agentic workers:** This plan is executed by a **ralph loop**. Work
> top-to-bottom, one unchecked `- [ ]` step at a time. After each task: run the
> task's verification, then commit. Re-read this file at the start of every
> iteration and continue from the first unchecked step. Do NOT claim a task
> done without running its verification command and seeing the expected output
> (superpowers:verification-before-completion). Mark steps `- [x]` as completed.

**Goal:** Rebuild the `/raw` mobile surface (`≤640px`) as a photo-first lab
where the live WebGL preview stays full-bleed and every control floats over it.

**Architecture:** Approach A — on mobile, `RawToolSurface`'s mobile branch is
replaced by a new `MobileLabChrome` that renders floating layers (topbar, mode
dock, tone strip, focus editor, peek surface, floating histogram, More sheet)
over the existing full-bleed `ComparePreviewStage`. Desktop branch untouched.
All live feedback flows through existing real-pipeline props
(`onToneChange`, `compareSplit`, `histogram`). No CSS-filter fake image.

**Tech Stack:** React + TypeScript, Vite, Vitest + @testing-library/react,
`motion/react` (`m`, `AnimatePresence`, `useDragControls`) inside `LazyMotion`,
`Spring` presets from `~/lib/spring`, Radix-based primitives in
`~/components/ui`, Tailwind utilities + existing design tokens. `~/` alias.

**Spec:** `docs/superpowers/specs/2026-05-18-mobile-raw-lab-photo-first-design.md`

**Hard constraints (apply to every task):**
- Radix/Tailwind/React first. No new isolated vanilla CSS blocks. Additions to
  `raw-lab.css` only for unavoidable layered scrims, token-based, minimal.
- `~/` import alias. `m` from `motion/react`. Spring presets / existing
  `SHEET_SPRING`, `TAP_SPRING`, `useToolMotion` (`src/modules/raw-processor/motion.ts`).
- All copy via `useI18n()`; every new key added to BOTH `src/locales/en.json`
  and `src/locales/zh-CN.json` (parity test enforces this).
- Desktop (`max-[640px]:hidden`) DOM/behavior must not change.
- Commits use `git commit --no-gpg-sign` (headless SSH signing hangs;
  authorized for this loop). Frequent commits, one per task.
- Verification baseline: `pnpm lint`, `pnpm test:run`, `pnpm build`. Lint/test
  may have a known pre-existing RED baseline — judge new failures against
  touched files, do not chase unrelated pre-existing failures.

---

## File Structure

New directory: `src/modules/raw-processor/components/mobile/`

| File | Responsibility |
|---|---|
| `mobile/tone-fields.ts` | Shared tone field metadata + formatters (DRY with ToneTool) |
| `mobile/tone-fields.test.ts` | Unit tests for formatters/metadata |
| `mobile/MobileTopbar.tsx` | Floating top bar: mark, title, support dot, histogram toggle, More-menu |
| `mobile/MobileTopbar.test.tsx` | |
| `mobile/ToneStripPanel.tsx` | Six live tone pills → onPickField |
| `mobile/ToneStripPanel.test.tsx` | |
| `mobile/ToneFocusEditor.tsx` | Single-param editor, snapshot revert, sibling strip |
| `mobile/ToneFocusEditor.test.tsx` | |
| `mobile/MobilePeekSurface.tsx` | Long-press → peek RAW via compare-split |
| `mobile/MobilePeekSurface.test.tsx` | |
| `mobile/MobileMoreSheet.tsx` | Pull-up non-modal sheet: pipeline / LUT contract / file facts |
| `mobile/MobileMoreSheet.test.tsx` | |
| `mobile/MobileModeDock.tsx` | 5-mode tab bar + active panel routing (Look/Tone/Compare/Export) |
| `mobile/MobileModeDock.test.tsx` | |
| `mobile/MobileLabChrome.tsx` | Orchestrator: mode/focus/peek/sheet state; composes all layers |
| `mobile/MobileLabChrome.test.tsx` | Integration test |

Modified:
- `src/modules/raw-processor/components/RawToolSurface.tsx` — replace the
  mobile rail+sheet branch with `<MobileLabChrome/>`; keep desktop branch.
- `src/modules/raw-processor/RawProcessorView.tsx` — thread `viewMode` +
  `onViewModeChange` + `compareSplit` + `onCompareSplitChange` to
  `RawToolSurface`; hide `WorkspaceHeader` on mobile.
- `src/modules/raw-processor/raw-lab.css` — remove/replace now-dead mobile
  rail/sheet rules; add minimal token-based scrim helpers only if Tailwind
  cannot express a layered gradient.
- `src/locales/en.json`, `src/locales/zh-CN.json` — new keys.

---

## Task 1: i18n keys for the mobile lab

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`
- Test: `src/__tests__/i18n-locales.test.ts` (existing parity test)

- [x] **Step 1: Add new keys to `src/locales/en.json`** (place alphabetically
  near existing `raw.*` keys; keep JSON valid):

```json
"raw.mobile.mode.look": "Look",
"raw.mobile.mode.tone": "Tone",
"raw.mobile.mode.compare": "Compare",
"raw.mobile.mode.more": "More",
"raw.mobile.mode.export": "Export",
"raw.mobile.modes.aria": "Lab modes",
"raw.mobile.toneStrip.hint": "Tap a tone, drag to fine-tune. Each value is live on the photo.",
"raw.mobile.toneStrip.aria": "Tone parameters",
"raw.mobile.focus.cancel": "Cancel",
"raw.mobile.focus.done": "Done",
"raw.mobile.focus.neutral": "neutral",
"raw.mobile.focus.siblingsAria": "Other tone parameters",
"raw.mobile.peek.hint": "Showing unprocessed RAW",
"raw.mobile.peek.note": "Press & hold the photo to peek the unprocessed RAW — works in every mode.",
"raw.mobile.histogram.toggleShow": "Show histogram",
"raw.mobile.histogram.toggleHide": "Hide histogram",
"raw.mobile.more.title": "Pipeline & file",
"raw.mobile.more.close": "Close pipeline sheet",
"raw.mobile.more.menuAria": "More actions",
"raw.mobile.more.replace": "Replace RAW",
"raw.mobile.more.reset": "Reset session",
"raw.mobile.more.browserLocal": "Browser-local · no upload",
"raw.mobile.more.officialSupport": "Official RAW support",
"raw.mobile.more.pipelineHeading": "Color pipeline",
"raw.mobile.more.pipelineResolved": "Contract resolved",
"raw.mobile.more.lutHeading": "LUT contract",
"raw.mobile.more.fileHeading": "File facts"
```

- [x] **Step 2: Add the same keys with Chinese values to
  `src/locales/zh-CN.json`** (identical key set; translate values):

```json
"raw.mobile.mode.look": "色调",
"raw.mobile.mode.tone": "影调",
"raw.mobile.mode.compare": "对比",
"raw.mobile.mode.more": "更多",
"raw.mobile.mode.export": "导出",
"raw.mobile.modes.aria": "实验室模式",
"raw.mobile.toneStrip.hint": "点选一项影调，拖动微调。每个数值都会实时作用到照片上。",
"raw.mobile.toneStrip.aria": "影调参数",
"raw.mobile.focus.cancel": "取消",
"raw.mobile.focus.done": "完成",
"raw.mobile.focus.neutral": "中性",
"raw.mobile.focus.siblingsAria": "其他影调参数",
"raw.mobile.peek.hint": "正在显示未处理的 RAW",
"raw.mobile.peek.note": "长按照片即可查看未处理的 RAW —— 任何模式下都可用。",
"raw.mobile.histogram.toggleShow": "显示直方图",
"raw.mobile.histogram.toggleHide": "隐藏直方图",
"raw.mobile.more.title": "管线与文件",
"raw.mobile.more.close": "关闭管线面板",
"raw.mobile.more.menuAria": "更多操作",
"raw.mobile.more.replace": "替换 RAW",
"raw.mobile.more.reset": "重置会话",
"raw.mobile.more.browserLocal": "浏览器本地处理 · 不上传",
"raw.mobile.more.officialSupport": "官方 RAW 支持",
"raw.mobile.more.pipelineHeading": "色彩管线",
"raw.mobile.more.pipelineResolved": "契约已解析",
"raw.mobile.more.lutHeading": "LUT 契约",
"raw.mobile.more.fileHeading": "文件信息"
```

- [x] **Step 3: Run the parity test**

Run: `pnpm test:run src/__tests__/i18n-locales.test.ts`
Expected: PASS (en/zh-CN key sets equal).

- [x] **Step 4: Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json
git commit --no-gpg-sign -m "i18n(raw): keys for photo-first mobile lab"
```

---

## Task 2: Shared tone field metadata module

DRY: the focus editor and tone strip need field bounds + display formatters.
Mirror `ToneTool`'s `FIELDS` so behavior matches the real tone path.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/tone-fields.ts`
- Test: `src/modules/raw-processor/components/mobile/tone-fields.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import {
  MOBILE_TONE_FIELDS,
  formatToneValue,
  formatToneValueShort,
} from './tone-fields'

describe('mobile tone fields', () => {
  it('exposes six fields matching ToneTool bounds', () => {
    expect(MOBILE_TONE_FIELDS.map((f) => f.key)).toEqual([
      'userExposureEv',
      'userContrast',
      'userHighlights',
      'userShadows',
      'userWhites',
      'userBlacks',
    ])
    const exp = MOBILE_TONE_FIELDS[0]
    expect([exp.min, exp.max, exp.step]).toEqual([-5, 5, 0.01])
    const con = MOBILE_TONE_FIELDS[1]
    expect([con.min, con.max, con.step]).toEqual([-100, 100, 1])
  })

  it('formats exposure with EV and sign', () => {
    expect(formatToneValue('userExposureEv', 1.5)).toBe('+1.50 EV')
    expect(formatToneValue('userExposureEv', -1.5)).toBe('-1.50 EV')
    expect(formatToneValueShort('userExposureEv', 0)).toBe('0.00')
  })

  it('formats integer fields with sign', () => {
    expect(formatToneValue('userContrast', 40)).toBe('+40')
    expect(formatToneValue('userContrast', 0)).toBe('0')
    expect(formatToneValueShort('userShadows', -12)).toBe('-12')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/tone-fields.test.ts`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `tone-fields.ts`**

```ts
import type { Translate } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'

export type MobileToneField = {
  key: keyof ToneValue
  labelKey: Parameters<Translate>[0]
  short: string
  min: number
  max: number
  step: number
  unit: string
}

export const MOBILE_TONE_FIELDS: MobileToneField[] = [
  { key: 'userExposureEv', labelKey: 'raw.tone.exposure', short: 'EXP', min: -5, max: 5, step: 0.01, unit: 'EV' },
  { key: 'userContrast', labelKey: 'raw.tone.contrast', short: 'CON', min: -100, max: 100, step: 1, unit: '' },
  { key: 'userHighlights', labelKey: 'raw.tone.highlights', short: 'HIGH', min: -100, max: 100, step: 1, unit: '' },
  { key: 'userShadows', labelKey: 'raw.tone.shadows', short: 'SHAD', min: -100, max: 100, step: 1, unit: '' },
  { key: 'userWhites', labelKey: 'raw.tone.whites', short: 'WHT', min: -100, max: 100, step: 1, unit: '' },
  { key: 'userBlacks', labelKey: 'raw.tone.blacks', short: 'BLK', min: -100, max: 100, step: 1, unit: '' },
]

const sign = (v: number) => (v > 0 ? '+' : '')

export function formatToneValueShort(key: keyof ToneValue, v: number): string {
  if (key === 'userExposureEv') return `${sign(v)}${v.toFixed(2)}`
  return `${sign(v)}${Math.round(v)}`
}

export function formatToneValue(key: keyof ToneValue, v: number): string {
  if (key === 'userExposureEv') return `${formatToneValueShort(key, v)} EV`
  return formatToneValueShort(key, v)
}

export const TONE_NEUTRAL: ToneValue = {
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

export function isToneNeutral(value: ToneValue): boolean {
  return MOBILE_TONE_FIELDS.every((f) => value[f.key] === 0)
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/tone-fields.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/tone-fields.ts src/modules/raw-processor/components/mobile/tone-fields.test.ts
git commit --no-gpg-sign -m "feat(raw): shared mobile tone-field metadata + formatters"
```

---

## Task 3: Thread viewMode + compare-split props to RawToolSurface

CORRECTION (grounded in real code): `displaySource`
(`'embedded'|'quick'|'bounded-hq'|'none'`) is the preview *resolution*, NOT a
RAW/finished toggle. The authoritative RAW-vs-finished mechanism is `viewMode`
(`'processed' | 'original' | 'compare'`) from `useRawProcessor`/
`ProcessingParams`. Peek = `setViewMode('original')` then restore. Compare mode
uses `viewMode='compare'` + `compareSplit`. Do NOT thread `displaySource`.

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx` (props type only, this task)
- Modify: `src/modules/raw-processor/RawProcessorView.tsx` (pass new props)
- Test: `src/modules/raw-processor/components/RawToolSurface.test.tsx` (extend baseProps)

- [x] **Step 1: Add props to `RawToolSurface` props type** (after
  `onCompareReset`). Use the exact `ViewMode` union:

```tsx
  onCompareReset: () => void
  viewMode: 'processed' | 'original' | 'compare'
  onViewModeChange: (mode: 'processed' | 'original' | 'compare') => void
  compareSplit: number
  onCompareSplitChange: (split: number) => void
```

- [x] **Step 2: Pass them from `RawProcessorView`** (in the `<RawToolSurface>`
  JSX, near `onCompareReset={handleCompareReset}`; `viewMode`, `setViewMode`,
  `compareSplit`, `setCompareSplit` are already destructured in the component):

```tsx
          onCompareReset={handleCompareReset}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          compareSplit={compareSplit}
          onCompareSplitChange={setCompareSplit}
```

- [x] **Step 3: Extend test `baseProps`** in `RawToolSurface.test.tsx`:

```tsx
  onCompareReset: vi.fn(),
  viewMode: 'processed' as const,
  onViewModeChange: vi.fn(),
  compareSplit: 0.5,
  onCompareSplitChange: vi.fn(),
```

- [x] **Step 4: Typecheck + existing surface tests**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS (no behavior change yet).

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "feat(raw): thread viewMode + compare-split to tool surface"
```

---

## Task 4: MobileTopbar

Floating top bar over the photo. Frosted via existing Tailwind tokens.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobileTopbar.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobileTopbar.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '~/lib/i18n'

import { MobileTopbar } from './MobileTopbar'

const wrap = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>

describe('MobileTopbar', () => {
  it('shows the file title and toggles the histogram', async () => {
    const onToggle = vi.fn()
    render(
      wrap(
        <MobileTopbar
          fileName="DSC09142.ARW"
          fileMeta="Sony α7 IV · 47.8 MB"
          supportLevel="official"
          histogramVisible
          onToggleHistogram={onToggle}
          moreMenuItems={[]}
        />,
      ),
    )
    expect(screen.getByRole('heading', { name: 'DSC09142.ARW' })).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /hide histogram/i }),
    )
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
```

(If `I18nProvider` is not the export name, use the actual provider/util from
`~/lib/i18n` — check the import surface; the existing tests render
`RawToolSurface` directly, so an i18n provider may be implicit/global. If
`useI18n` works without a provider in tests, drop the wrapper.)

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileTopbar.test.tsx`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `MobileTopbar.tsx`**

```tsx
import { BarChart3 } from 'lucide-react'
import { m } from 'motion/react'

import { IconButton } from '~/components/ui/button'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'
import { MobileMoreMenu, type MobileMoreMenuItem } from './MobileMoreMenu'

export function MobileTopbar(props: {
  fileName: string
  fileMeta: string
  supportLevel: 'official' | 'experimental'
  histogramVisible: boolean
  onToggleHistogram: () => void
  moreMenuItems: MobileMoreMenuItem[]
}) {
  const { t } = useI18n()
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-3 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white"
      data-mobile-topbar
    >
      <img
        src="/lumaforge-mark.png"
        alt="LumaForge"
        className="pointer-events-auto size-[26px] rounded-[5px] shadow-md"
      />
      <div className="pointer-events-auto min-w-0">
        <h1 className="m-0 truncate text-sm font-semibold leading-tight">
          {props.fileName}
        </h1>
        <p className="m-0 truncate text-[0.68rem] leading-tight text-white/80 tabular-nums">
          <span
            aria-hidden="true"
            className={clsxm(
              'mr-1.5 inline-block size-[7px] translate-y-px rounded-full',
              props.supportLevel === 'official'
                ? 'bg-accent shadow-[0_0_0_2px_rgba(74,222,128,0.28)]'
                : 'bg-amber-400',
            )}
          />
          {props.fileMeta}
        </p>
      </div>
      <div className="pointer-events-auto inline-flex items-center gap-1.5">
        <m.span whileTap={{ scale: 0.96 }} transition={TAP_SPRING}>
          <IconButton
            icon={BarChart3}
            size="md"
            aria-pressed={props.histogramVisible}
            aria-label={
              props.histogramVisible
                ? t('raw.mobile.histogram.toggleHide')
                : t('raw.mobile.histogram.toggleShow')
            }
            onClick={props.onToggleHistogram}
            className="rounded-md border border-white/30 bg-black/40 text-white"
          />
        </m.span>
        <MobileMoreMenu
          ariaLabel={t('raw.mobile.more.menuAria')}
          items={props.moreMenuItems}
        />
      </div>
    </header>
  )
}
```

- [x] **Step 4: Create `MobileMoreMenu.tsx`** (Radix dropdown; reuse the
  project's dropdown primitive if one exists in `~/components/ui` — check
  `ls src/components/ui` for `dropdown`/`menu`/`popover`; otherwise use
  `@radix-ui/react-dropdown-menu` which is already a dependency via the UI
  layer). File:
  `src/modules/raw-processor/components/mobile/MobileMoreMenu.tsx`:

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { m } from 'motion/react'
import type { LucideIcon } from 'lucide-react'

import { IconButton } from '~/components/ui/button'

import { TAP_SPRING } from '../../motion'

export type MobileMoreMenuItem =
  | { kind: 'item'; icon: LucideIcon; label: string; onSelect: () => void; disabled?: boolean }
  | { kind: 'separator' }

export function MobileMoreMenu(props: {
  ariaLabel: string
  items: MobileMoreMenuItem[]
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <m.span whileTap={{ scale: 0.96 }} transition={TAP_SPRING}>
          <IconButton
            icon={MoreHorizontal}
            size="md"
            aria-label={props.ariaLabel}
            className="rounded-md border border-white/30 bg-black/40 text-white"
          />
        </m.span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[12rem] rounded-xl border border-border bg-material-opaque p-1.5 text-text shadow-lg"
        >
          {props.items.map((it, i) =>
            it.kind === 'separator' ? (
              <DropdownMenu.Separator
                key={`sep-${i}`}
                className="my-1 h-px bg-border"
              />
            ) : (
              <DropdownMenu.Item
                key={it.label}
                disabled={it.disabled}
                onSelect={() => it.onSelect()}
                className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-fill-secondary"
              >
                <it.icon aria-hidden="true" className="size-[15px]" />
                {it.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

- [x] **Step 5: Run tests to verify pass**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileTopbar.test.tsx`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileTopbar.tsx src/modules/raw-processor/components/mobile/MobileMoreMenu.tsx src/modules/raw-processor/components/mobile/MobileTopbar.test.tsx
git commit --no-gpg-sign -m "feat(raw): floating mobile topbar + Radix more-menu"
```

---

## Task 5: ToneStripPanel

Six live pills. Tapping a pill calls `onPickField(key)` (the orchestrator
opens the focus editor). Horizontal scroll strip.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/ToneStripPanel.tsx`
- Test: `src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TONE_NEUTRAL } from './tone-fields'
import { ToneStripPanel } from './ToneStripPanel'

describe('ToneStripPanel', () => {
  it('renders six pills and picks a field on tap', async () => {
    const onPick = vi.fn()
    render(
      <ToneStripPanel
        tone={{ ...TONE_NEUTRAL, userExposureEv: 1.25 }}
        focusKey={null}
        onPickField={onPick}
        onReset={vi.fn()}
      />,
    )
    const pills = screen.getAllByRole('tab')
    expect(pills).toHaveLength(6)
    expect(screen.getByText('+1.25')).toBeInTheDocument()
    await userEvent.click(pills[0])
    expect(onPick).toHaveBeenCalledWith('userExposureEv')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `ToneStripPanel.tsx`**

```tsx
import { RotateCcw } from 'lucide-react'
import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'
import { TAP_SPRING } from '../../motion'
import {
  MOBILE_TONE_FIELDS,
  formatToneValueShort,
  isToneNeutral,
} from './tone-fields'

export function ToneStripPanel(props: {
  tone: ToneValue
  focusKey: keyof ToneValue | null
  onPickField: (key: keyof ToneValue) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const neutral = isToneNeutral(props.tone)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-0.5 pb-1 text-[0.68rem] text-white/70">
        <span>{t('raw.mobile.toneStrip.hint')}</span>
        <button
          type="button"
          onClick={props.onReset}
          disabled={neutral}
          aria-label={t('raw.tone.reset')}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2 py-1 text-[0.66rem] font-semibold text-white/85 transition-colors hover:border-amber-400/50 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          {t('raw.tone.reset')}
        </button>
      </div>
      <div
        role="tablist"
        aria-label={t('raw.mobile.toneStrip.aria')}
        className="flex gap-1.5 overflow-x-auto px-0.5 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MOBILE_TONE_FIELDS.map((f) => {
          const v = props.tone[f.key]
          const dirty = v !== 0
          const active = props.focusKey === f.key
          return (
            <m.button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              onClick={() => props.onPickField(f.key)}
              className={clsxm(
                'grid min-w-[76px] shrink-0 grid-rows-[auto_auto] items-center gap-1 rounded-xl border px-2.5 py-2 text-white transition-colors',
                active
                  ? 'border-amber-400 bg-black/80'
                  : dirty
                    ? 'border-amber-400/40 bg-black/40'
                    : 'border-white/15 bg-black/40',
              )}
            >
              <span
                className={clsxm(
                  'text-[0.62rem] font-semibold uppercase tracking-wide',
                  active || dirty ? 'text-amber-400' : 'text-white/75',
                )}
              >
                {f.short}
              </span>
              <span className="text-base font-semibold leading-none tabular-nums">
                {formatToneValueShort(f.key, v)}
              </span>
            </m.button>
          )
        })}
      </div>
    </div>
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/ToneStripPanel.tsx src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx
git commit --no-gpg-sign -m "feat(raw): live tone pill strip"
```

---

## Task 6: ToneFocusEditor

Single-parameter editor. Uses the existing Radix `Slider` from
`~/components/ui/slider` (same primitive as `ToneTool`, so the real preview
pipeline reacts identically). Snapshot revert on Cancel.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx`
- Test: `src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TONE_NEUTRAL } from './tone-fields'
import { ToneFocusEditor } from './ToneFocusEditor'

describe('ToneFocusEditor', () => {
  it('shows the readout, switches sibling, cancels and commits', async () => {
    const onChange = vi.fn()
    const onPick = vi.fn()
    const onCancel = vi.fn()
    const onDone = vi.fn()
    render(
      <ToneFocusEditor
        tone={{ ...TONE_NEUTRAL, userExposureEv: 2 }}
        focusKey="userExposureEv"
        onChange={onChange}
        onPickField={onPick}
        onCancel={onCancel}
        onDone={onDone}
        onDragChange={vi.fn()}
      />,
    )
    expect(screen.getByText('+2.00')).toBeInTheDocument()
    expect(screen.getByText('EV')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /contrast/i }))
    expect(onPick).toHaveBeenCalledWith('userContrast')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('resets the focused param to neutral', async () => {
    const onChange = vi.fn()
    render(
      <ToneFocusEditor
        tone={{ ...TONE_NEUTRAL, userContrast: 30 }}
        focusKey="userContrast"
        onChange={onChange}
        onPickField={vi.fn()}
        onCancel={vi.fn()}
        onDone={vi.fn()}
        onDragChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /neutral/i }))
    expect(onChange).toHaveBeenCalledWith({ userContrast: 0 })
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `ToneFocusEditor.tsx`**

```tsx
import { CircleDot } from 'lucide-react'
import { m } from 'motion/react'

import { Slider } from '~/components/ui/slider'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'
import { TAP_SPRING } from '../../motion'
import {
  MOBILE_TONE_FIELDS,
  formatToneValue,
  formatToneValueShort,
} from './tone-fields'

export function ToneFocusEditor(props: {
  tone: ToneValue
  focusKey: keyof ToneValue
  onChange: (patch: Partial<ToneValue>) => void
  onPickField: (key: keyof ToneValue) => void
  onCancel: () => void
  onDone: () => void
  onDragChange: (dragging: boolean) => void
}) {
  const { t } = useI18n()
  const f = MOBILE_TONE_FIELDS.find((x) => x.key === props.focusKey)!
  const v = props.tone[props.focusKey]

  return (
    <>
      <div
        className="absolute inset-x-0 top-0 z-[41] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-3 pb-3.5 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white"
        aria-label={t(f.labelKey)}
      >
        <m.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
          onClick={props.onCancel}
          className="h-[38px] rounded-full border border-white/30 bg-black/40 px-3.5 text-sm font-semibold text-white"
        >
          {t('raw.mobile.focus.cancel')}
        </m.button>
        <div className="grid gap-px text-center">
          <small className="text-[0.6rem] font-bold uppercase tracking-wider text-amber-400">
            {t(f.labelKey)}
          </small>
          <strong className="text-sm font-semibold tabular-nums">
            {formatToneValue(f.key, v)}
          </strong>
        </div>
        <m.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
          onClick={props.onDone}
          className="h-[38px] rounded-full border border-accent bg-accent px-3.5 text-sm font-semibold text-background"
        >
          {t('raw.mobile.focus.done')}
        </m.button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-[env(safe-area-inset-bottom)] text-white">
        <div className="grid gap-2.5 px-[18px] pb-[18px] pt-3.5">
          <div className="flex items-baseline justify-center gap-1 text-[2.4rem] font-semibold leading-none tabular-nums">
            {formatToneValueShort(f.key, v)}
            {f.unit && (
              <small className="text-sm font-semibold text-white/70">
                {f.unit}
              </small>
            )}
          </div>
          <div
            onPointerDown={() => props.onDragChange(true)}
            onPointerUp={() => props.onDragChange(false)}
            onPointerCancel={() => props.onDragChange(false)}
          >
            <Slider
              thumbAriaLabel={t(f.labelKey)}
              value={[v]}
              min={f.min}
              max={f.max}
              step={f.step}
              onValueChange={([nv]) => props.onChange({ [f.key]: nv })}
            />
          </div>
          <div className="flex items-center justify-between px-0.5 text-[0.7rem] tabular-nums text-white/60">
            <span>{formatToneValue(f.key, f.min)}</span>
            <button
              type="button"
              onClick={() => props.onChange({ [f.key]: 0 })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-black/40 hover:text-amber-400"
            >
              <CircleDot aria-hidden="true" className="size-3" />
              {t('raw.mobile.focus.neutral')}
            </button>
            <span>{formatToneValue(f.key, f.max)}</span>
          </div>
          <div
            role="tablist"
            aria-label={t('raw.mobile.focus.siblingsAria')}
            className="mt-1.5 flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MOBILE_TONE_FIELDS.filter((o) => o.key !== f.key).map((o) => {
              const ov = props.tone[o.key]
              const dirty = ov !== 0
              return (
                <button
                  key={o.key}
                  type="button"
                  role="tab"
                  onClick={() => props.onPickField(o.key)}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[0.7rem] font-semibold text-white/80"
                >
                  {t(o.labelKey)}
                  <em
                    className={clsxm(
                      'not-italic tabular-nums',
                      dirty ? 'text-amber-400' : 'text-white/60',
                    )}
                  >
                    {formatToneValueShort(o.key, ov)}
                  </em>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
```

(If the `Slider` primitive prop is `thumbAriaLabelledBy` only and not
`thumbAriaLabel`, wrap with a visually-hidden label + id, or pass the label via
the supported prop — match `~/components/ui/slider`'s real API.)

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx
git commit --no-gpg-sign -m "feat(raw): single-parameter tone focus editor"
```

---

## Task 7: MobilePeekSurface

Invisible long-press surface over the photo region. On long-press, peek the
unprocessed RAW by setting compare split to `0` (all-RAW) and restoring the
previous split on release. Authoritative preview path; no opacity fake.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobilePeekSurface.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobilePeekSurface.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MobilePeekSurface } from './MobilePeekSurface'

describe('MobilePeekSurface', () => {
  it('peeks RAW after long-press and restores on release', () => {
    vi.useFakeTimers()
    const onPeekChange = vi.fn()
    render(
      <MobilePeekSurface enabled onPeekChange={onPeekChange} />,
    )
    const surface = screen.getByTestId('mobile-peek-surface')
    fireEvent.pointerDown(surface)
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(onPeekChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerUp(surface)
    expect(onPeekChange).toHaveBeenLastCalledWith(false)
    vi.useRealTimers()
  })

  it('does not peek when disabled', () => {
    vi.useFakeTimers()
    const onPeekChange = vi.fn()
    render(<MobilePeekSurface enabled={false} onPeekChange={onPeekChange} />)
    fireEvent.pointerDown(screen.getByTestId('mobile-peek-surface'))
    act(() => vi.advanceTimersByTime(400))
    expect(onPeekChange).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobilePeekSurface.test.tsx`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `MobilePeekSurface.tsx`**

```tsx
import { useCallback, useRef } from 'react'

export function MobilePeekSurface(props: {
  enabled: boolean
  onPeekChange: (peeking: boolean) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peeking = useRef(false)

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const end = useCallback(() => {
    clear()
    if (peeking.current) {
      peeking.current = false
      props.onPeekChange(false)
    }
  }, [clear, props])

  const start = useCallback(() => {
    if (!props.enabled) return
    clear()
    timer.current = setTimeout(() => {
      timer.current = null
      peeking.current = true
      props.onPeekChange(true)
    }, 250)
  }, [clear, props])

  return (
    <div
      data-testid="mobile-peek-surface"
      aria-hidden="true"
      className="absolute inset-x-0 z-[5] [touch-action:none] [-webkit-tap-highlight-color:transparent]"
      style={{ top: 110, bottom: 180 }}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    />
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobilePeekSurface.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobilePeekSurface.tsx src/modules/raw-processor/components/mobile/MobilePeekSurface.test.tsx
git commit --no-gpg-sign -m "feat(raw): long-press peek surface"
```

---

## Task 8: MobileMoreSheet

Pull-up, non-modal (no backdrop dismiss-on-tap of the photo), drag-down to
dismiss. Renders real pipeline / LUT contract / file facts. **Pipeline step 1
label must read the real runtime boundary, not `libraw-wasm`** — use
`@lumaforge/luma-raw-runtime` (or a neutral "RAW decode" label).

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobileMoreSheet.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobileMoreSheet.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileMoreSheet } from './MobileMoreSheet'

describe('MobileMoreSheet', () => {
  it('renders headings and never names libraw-wasm', () => {
    render(
      <MobileMoreSheet
        open
        onClose={vi.fn()}
        pipelineSteps={[
          { index: 1, label: 'RAW decode', timing: '56 ms' },
        ]}
        lutRows={[{ label: 'File', value: '—' }]}
        fileRows={[{ label: 'Camera', value: 'Sony α7 IV' }]}
      />,
    )
    expect(
      screen.getByRole('heading', { name: /pipeline & file/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/libraw-wasm/i)).not.toBeInTheDocument()
  })

  it('closes via the close button', async () => {
    const onClose = vi.fn()
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        pipelineSteps={[]}
        lutRows={[]}
        fileRows={[]}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /close pipeline sheet/i }),
    )
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileMoreSheet.test.tsx`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `MobileMoreSheet.tsx`**

```tsx
import { X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import { useRef } from 'react'

import { IconButton } from '~/components/ui/button'
import { useI18n } from '~/lib/i18n'

import { SHEET_SPRING, useToolMotion } from '../../motion'

type Row = { label: string; value: string }
type Step = { index: number; label: string; timing: string }

export function MobileMoreSheet(props: {
  open: boolean
  onClose: () => void
  pipelineSteps: Step[]
  lutRows: Row[]
  fileRows: Row[]
}) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
  const sheetRef = useRef<HTMLDivElement | null>(null)

  return (
    <AnimatePresence>
      {props.open && (
        <m.aside
          key="more-sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal="false"
          aria-label={t('raw.mobile.more.title')}
          className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[78%] grid-rows-[auto_minmax(0,1fr)] rounded-t-2xl border-t border-border bg-material-opaque pb-[env(safe-area-inset-bottom)] text-text shadow-2xl"
          initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
          animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
          exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
          transition={SHEET_SPRING}
          drag={prefersReduced ? false : 'y'}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 500) props.onClose()
          }}
        >
          <div
            className="grid gap-2 px-3.5 pb-3 pt-2.5"
            onPointerDown={(e) => dragControls.start(e)}
          >
            <div
              aria-hidden="true"
              className="mx-auto h-1 w-9 rounded-full bg-text/30"
            />
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="m-0 text-base font-semibold">
                {t('raw.mobile.more.title')}
              </h2>
              <IconButton
                icon={X}
                size="md"
                aria-label={t('raw.mobile.more.close')}
                onClick={props.onClose}
                className="rounded-md border border-border bg-background text-text"
              />
            </div>
          </div>
          <div className="grid min-h-0 gap-[18px] overflow-y-auto px-4 pb-5 pt-1">
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold">
                {t('raw.mobile.more.pipelineHeading')}
              </h3>
              <div className="grid gap-2 rounded-xl border border-border/60 bg-fill-secondary/50 p-3">
                {props.pipelineSteps.map((s) => (
                  <div
                    key={s.index}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <span className="grid size-[18px] place-items-center rounded-full bg-accent/30 text-[0.62rem] font-semibold tabular-nums text-accent">
                      {s.index}
                    </span>
                    {s.label}
                    <em className="ml-auto not-italic tabular-nums text-text-secondary">
                      {s.timing}
                    </em>
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold">
                {t('raw.mobile.more.lutHeading')}
              </h3>
              <dl className="m-0">
                {props.lutRows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[1fr_auto] gap-x-2.5 border-b border-border/40 py-2 text-sm last:border-0"
                  >
                    <dt className="m-0 font-medium text-text-secondary">
                      {r.label}
                    </dt>
                    <dd className="m-0 text-right font-semibold tabular-nums">
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold">
                {t('raw.mobile.more.fileHeading')}
              </h3>
              <dl className="m-0">
                {props.fileRows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[1fr_auto] gap-x-2.5 border-b border-border/40 py-2 text-sm last:border-0"
                  >
                    <dt className="m-0 font-medium text-text-secondary">
                      {r.label}
                    </dt>
                    <dd className="m-0 text-right font-semibold tabular-nums">
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileMoreSheet.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileMoreSheet.tsx src/modules/raw-processor/components/mobile/MobileMoreSheet.test.tsx
git commit --no-gpg-sign -m "feat(raw): pull-up pipeline/file more-sheet"
```

---

## Task 9: MobileModeDock

The 5-mode tab bar + active panel. Look/Compare/Export panels reuse the
existing tool components (`LutContractTool` + `StrengthControl`, `CompareTool`,
`ExportTool`) so the real pipeline/export executors are unchanged. Tone panel
renders `ToneStripPanel`. `more` opens the sheet via callback.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobileModeDock.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileModeDock } from './MobileModeDock'

describe('MobileModeDock', () => {
  it('renders five mode tabs and switches mode', async () => {
    const onModeChange = vi.fn()
    const onOpenMore = vi.fn()
    render(
      <MobileModeDock
        mode="tone"
        onModeChange={onModeChange}
        onOpenMore={onOpenMore}
        canExport={false}
        panel={<div data-testid="panel">tone-panel</div>}
      />,
    )
    expect(screen.getByTestId('panel')).toHaveTextContent('tone-panel')
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    await userEvent.click(screen.getByRole('tab', { name: /look/i }))
    expect(onModeChange).toHaveBeenCalledWith('look')
    await userEvent.click(screen.getByRole('tab', { name: /more/i }))
    expect(onOpenMore).toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `MobileModeDock.tsx`**

```tsx
import {
  Download,
  Info,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Wand2,
} from 'lucide-react'
import { m } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'

export type MobileMode = 'look' | 'tone' | 'compare' | 'export'

const TABS: {
  id: MobileMode | 'more'
  icon: LucideIcon
  labelKey: 'raw.mobile.mode.look' | 'raw.mobile.mode.tone' | 'raw.mobile.mode.compare' | 'raw.mobile.mode.more' | 'raw.mobile.mode.export'
  primary?: boolean
}[] = [
  { id: 'look', icon: Wand2, labelKey: 'raw.mobile.mode.look' },
  { id: 'tone', icon: SlidersHorizontal, labelKey: 'raw.mobile.mode.tone' },
  { id: 'compare', icon: SplitSquareHorizontal, labelKey: 'raw.mobile.mode.compare' },
  { id: 'more', icon: Info, labelKey: 'raw.mobile.mode.more' },
  { id: 'export', icon: Download, labelKey: 'raw.mobile.mode.export', primary: true },
]

export function MobileModeDock(props: {
  mode: MobileMode
  onModeChange: (mode: MobileMode) => void
  onOpenMore: () => void
  canExport: boolean
  panel: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-[env(safe-area-inset-bottom)] text-white">
      <div className="relative max-h-[24vh] overflow-y-auto px-3.5 pb-2.5 pt-3.5">
        {props.panel}
      </div>
      <nav
        aria-label={t('raw.mobile.modes.aria')}
        role="tablist"
        className="grid grid-cols-5 gap-1 border-t border-white/15 px-2.5 pb-3 pt-2"
      >
        {TABS.map((tab) => {
          const active = tab.id !== 'more' && props.mode === tab.id
          return (
            <m.button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              onClick={() =>
                tab.id === 'more'
                  ? props.onOpenMore()
                  : props.onModeChange(tab.id)
              }
              className={clsxm(
                'relative grid min-h-[50px] grid-rows-[auto_auto] place-items-center gap-1 rounded-lg px-1 py-1.5 text-[0.64rem] font-semibold uppercase tracking-wide transition-colors',
                active ? 'text-white' : 'text-white/70',
              )}
            >
              <tab.icon aria-hidden="true" className="size-[18px]" />
              {t(tab.labelKey)}
              {active && (
                <span
                  className={clsxm(
                    'absolute -bottom-0.5 left-1/2 h-0.5 w-[22px] -translate-x-1/2 rounded-full',
                    tab.primary ? 'bg-accent' : 'bg-amber-400',
                  )}
                />
              )}
            </m.button>
          )
        })}
      </nav>
    </div>
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileModeDock.tsx src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx
git commit --no-gpg-sign -m "feat(raw): 5-mode photo-first dock"
```

---

## Task 10: MobileLabChrome orchestrator + wire into RawToolSurface

Compose all layers. Owns mode/focus/peek/sheet state and the tone snapshot for
Cancel. Look/Compare/Export panels reuse existing tool components. Peek drives
`onViewModeChange('original')` and restores the prior viewMode on release.

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx` (hide WorkspaceHeader on mobile)
- Modify: `src/modules/raw-processor/raw-lab.css` (drop dead mobile rail/sheet rules; ensure full-bleed mobile stage)

- [x] **Step 1: Implement `MobileLabChrome.tsx`** (props mirror the mobile
  subset of `RawToolSurface`; reuse existing tool components for Look/Compare/
  Export panels):

```tsx
import { ImageUp, RotateCcw, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'
import { ExportTool } from '../tools/ExportTool'
import { CompareTool } from '../tools/CompareTool'
import { StrengthControl } from '../tools/StrengthControl'
import { LutContractTool } from '../tools/lut/LutContractTool'
import { FloatingHistogramCard } from './FloatingHistogramCard'
import { MobileModeDock, type MobileMode } from './MobileModeDock'
import { MobileMoreSheet } from './MobileMoreSheet'
import { MobilePeekSurface } from './MobilePeekSurface'
import { MobileTopbar } from './MobileTopbar'
import { ToneFocusEditor } from './ToneFocusEditor'
import { ToneStripPanel } from './ToneStripPanel'
import { isToneNeutral } from './tone-fields'

export function MobileLabChrome(props: {
  tone: ToneValue
  onToneChange: (patch: Partial<ToneValue>) => void
  onToneReset: () => void
  viewMode: 'processed' | 'original' | 'compare'
  onViewModeChange: (mode: 'processed' | 'original' | 'compare') => void
  compareSplit: number
  onCompareSplitChange: (split: number) => void
  histogram: import('@lumaforge/luma-color-runtime').PreviewHistogramState
  canExport: boolean
  isProcessing: boolean
  fileName: string
  fileMeta: string
  supportLevel: 'official' | 'experimental'
  onReplaceFile: () => void
  onResetSession: () => void
  // ...the remaining props needed by ExportTool / LutContractTool / CompareTool,
  // forwarded straight through from RawToolSurface (keep names identical).
  lutPanel: React.ReactNode
  comparePanel: React.ReactNode
  exportPanel: React.ReactNode
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<MobileMode>('tone')
  const [focusKey, setFocusKey] = useState<keyof ToneValue | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [histVisible, setHistVisible] = useState(true)
  const snapshot = useRef<ToneValue | null>(null)
  const viewModeBeforePeek = useRef<'processed' | 'original' | 'compare'>(
    'processed',
  )

  const startFocus = (k: keyof ToneValue) => {
    snapshot.current = props.tone
    setFocusKey(k)
  }
  const cancelFocus = () => {
    if (snapshot.current) {
      const s = snapshot.current
      props.onToneChange({
        userExposureEv: s.userExposureEv,
        userContrast: s.userContrast,
        userHighlights: s.userHighlights,
        userShadows: s.userShadows,
        userWhites: s.userWhites,
        userBlacks: s.userBlacks,
      })
    }
    snapshot.current = null
    setFocusKey(null)
  }
  const commitFocus = () => {
    snapshot.current = null
    setFocusKey(null)
  }
  const switchFocus = (k: keyof ToneValue) => {
    snapshot.current = snapshot.current ?? props.tone
    setFocusKey(k)
  }

  const onPeekChange = (p: boolean) => {
    if (p) {
      viewModeBeforePeek.current = props.viewMode
      props.onViewModeChange('original')
    } else {
      props.onViewModeChange(viewModeBeforePeek.current)
    }
    setPeeking(p)
  }

  const panel =
    mode === 'tone' ? (
      <ToneStripPanel
        tone={props.tone}
        focusKey={focusKey}
        onPickField={startFocus}
        onReset={props.onToneReset}
      />
    ) : mode === 'look' ? (
      props.lutPanel
    ) : mode === 'compare' ? (
      props.comparePanel
    ) : (
      props.exportPanel
    )

  return (
    <div
      className="absolute inset-0 z-20"
      data-mobile-lab-chrome
      data-focus={focusKey ? 'true' : 'false'}
      data-peek={peeking || undefined}
    >
      <MobilePeekSurface enabled={!focusKey} onPeekChange={onPeekChange} />

      {peeking && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+3.75rem)] z-[12] -translate-x-1/2 rounded-full border border-white/30 bg-black/80 px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-white">
          {t('raw.mobile.peek.hint')}
        </div>
      )}

      {!focusKey && (
        <FloatingHistogramCard
          histogram={props.histogram}
          hidden={!histVisible || peeking}
        />
      )}

      {!focusKey && (
        <>
          <MobileTopbar
            fileName={props.fileName}
            fileMeta={props.fileMeta}
            supportLevel={props.supportLevel}
            histogramVisible={histVisible}
            onToggleHistogram={() => setHistVisible((v) => !v)}
            moreMenuItems={[
              {
                kind: 'item',
                icon: ImageUp,
                label: t('raw.mobile.more.replace'),
                onSelect: props.onReplaceFile,
              },
              {
                kind: 'item',
                icon: RotateCcw,
                label: t('raw.mobile.more.reset'),
                onSelect: props.onResetSession,
              },
              { kind: 'separator' },
              {
                kind: 'item',
                icon: LockKeyhole,
                label: t('raw.mobile.more.browserLocal'),
                onSelect: () => {},
                disabled: true,
              },
              {
                kind: 'item',
                icon: ShieldCheck,
                label: t('raw.mobile.more.officialSupport'),
                onSelect: () => {},
                disabled: true,
              },
            ]}
          />
          <MobileModeDock
            mode={mode}
            onModeChange={setMode}
            onOpenMore={() => setMoreOpen(true)}
            canExport={props.canExport}
            panel={panel}
          />
        </>
      )}

      {focusKey && (
        <ToneFocusEditor
          tone={props.tone}
          focusKey={focusKey}
          onChange={props.onToneChange}
          onPickField={switchFocus}
          onCancel={cancelFocus}
          onDone={commitFocus}
          onDragChange={() => {}}
        />
      )}

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pipelineSteps={[
          { index: 1, label: 'RAW decode', timing: '56 ms' },
          { index: 2, label: 'Tone', timing: '4 ms' },
          { index: 3, label: 'LUT', timing: '8 ms' },
          { index: 4, label: 'Display encode · Rec.709', timing: '2 ms' },
        ]}
        lutRows={[]}
        fileRows={[]}
      />
    </div>
  )
}
```

Notes for the implementer:
- `FloatingHistogramCard` is a thin presentational wrapper around the existing
  `HistogramTool` data positioned top-right with the design's frosted card
  classes. Create
  `src/modules/raw-processor/components/mobile/FloatingHistogramCard.tsx`
  rendering `HistogramTool` inside an absolutely-positioned Tailwind card;
  honor the `hidden` prop with opacity/pointer-events.
- `lutPanel` / `comparePanel` / `exportPanel` are passed in from
  `RawToolSurface` so the real tool components and all their props stay wired
  through the existing surface (no prop duplication, no second state model).
- Pipeline/LUT/file rows for the More sheet: derive from the existing
  `metadata`/`stats`/LUT contract props already available in `RawToolSurface`
  (pass real `lutRows`/`fileRows` instead of `[]`). The label for step 1 must
  NOT contain `libraw-wasm`.

- [x] **Step 2: Wire `MobileLabChrome` into `RawToolSurface`** — replace the
  mobile rail + `AnimatePresence` sheet branch with a single mobile render that
  mounts `<MobileLabChrome .../>` (keep the desktop `max-[640px]:hidden`
  branch and `renderExportBlock`/`renderCards` desktop usage intact). The
  mobile chrome must render only at `≤640px` — gate with the existing
  responsive pattern (e.g. a `max-[640px]:block hidden` wrapper) so desktop
  DOM/behavior is unchanged. Pass `lutPanel`/`comparePanel`/`exportPanel`
  built from the same `LutContractTool`+`StrengthControl`, `CompareTool`,
  `ExportTool` instances the desktop branch uses.

- [x] **Step 3: Hide `WorkspaceHeader` on mobile** in `RawProcessorView.tsx` —
  wrap it so it is `hidden` at `≤640px` (`max-[640px]:hidden`), since the
  floating `MobileTopbar` replaces it. Confirm the mobile stage is full-bleed
  (the existing `@media (max-width:640px) .raw-lab-stage` padding that reserved
  space for the old fixed rail should be removed/reduced since the dock now
  floats over the photo).

- [x] **Step 4: Clean dead CSS** — in `raw-lab.css`, remove rules that only
  served the now-deleted mobile rail/sheet (`.raw-mobile-tool-rail`,
  `.raw-mobile-tool-sheet*`, related `@media (max-width:640px)` blocks). Do not
  touch desktop or stage rules unrelated to the old mobile chrome. Add new CSS
  ONLY if a layered scrim cannot be expressed with Tailwind; keep it
  token-based and minimal.

- [x] **Step 5: Write integration test `MobileLabChrome.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TONE_NEUTRAL } from './tone-fields'
import { MobileLabChrome } from './MobileLabChrome'

const base = {
  tone: TONE_NEUTRAL,
  onToneChange: vi.fn(),
  onToneReset: vi.fn(),
  viewMode: 'processed' as const,
  onViewModeChange: vi.fn(),
  compareSplit: 0.5,
  onCompareSplitChange: vi.fn(),
  histogram: { state: 'unavailable', reason: 'no-image' } as never,
  canExport: false,
  isProcessing: false,
  fileName: 'DSC09142.ARW',
  fileMeta: 'Sony α7 IV · 47.8 MB',
  supportLevel: 'official' as const,
  onReplaceFile: vi.fn(),
  onResetSession: vi.fn(),
  lutPanel: <div>lut</div>,
  comparePanel: <div>compare</div>,
  exportPanel: <div>export</div>,
}

describe('MobileLabChrome', () => {
  it('enters focus mode from a tone pill and hides the dock', async () => {
    render(<MobileLabChrome {...base} />)
    expect(screen.getByRole('heading', { name: 'DSC09142.ARW' })).toBeVisible()
    await userEvent.click(screen.getAllByRole('tab')[0]) // first tone pill
    // focus editor up: Cancel/Done visible, mode dock gone
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
    ).not.toBeInTheDocument()
  })
})
```

(Adjust the pill query if the first `tab` is ambiguous — scope with `within`
the tone strip `tablist` by its aria-label.)

- [x] **Step 6: Run the mobile suite + the existing surface test**

Run: `pnpm test:run src/modules/raw-processor/components/mobile src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS (existing surface test still green — desktop unchanged).

- [x] **Step 7: Commit**

```bash
git add src/modules/raw-processor src/locales
git commit --no-gpg-sign -m "feat(raw): photo-first mobile lab chrome wired into tool surface"
```

---

## Task 11: Full verification + browser validation (loop done bar)

### Validation status — 2026-05-18

- **Step 1 lint:** ✅ Scoped eslint over all touched files
  (`components/mobile/**`, `RawToolSurface*`, `RawProcessorView`,
  `workspace-ui.test`) is clean. Repo-wide `pnpm lint` fails only on the
  known pre-existing generated-file RED baseline (unrelated).
- **Step 2 tests:** ✅ `pnpm test:run` — 1148 passed; the only 4 failures are
  the documented pre-existing `scripts/native-runtime/**` baseline, untouched
  by this work. All 43 raw-processor suites (382 tests) incl. the 8 new mobile
  suites pass. `tsc --noEmit` 0 errors.
- **Step 3 build:** ✅ `pnpm build` succeeds.
- **Step 4 browser validation:** Preview-build Playwright run (1280→390→1280),
  12/13 checks PASS, **0 console errors**. Verified: app/shell renders;
  desktop aside present & mobile chrome absent at 1280; photo-first chrome
  mounts at 390 with desktop aside absent; topbar shows the file name;
  5-mode dock; Tone pill → focus editor (Done); **long-press peek reveals
  unprocessed RAW**; Look/Compare/Export switch; More sheet dialog opens;
  desktop restored intact. Screenshots: `/tmp/mrl-{desktop-loaded,
  mobile-loaded,focus,more}.png`.
  - **One sub-clause not browser-evidenced:** "RAW decodes to loaded state →
    slider drag updates the *decoded* preview live". BLOCKER: the stage
    Dropzone is `clickToOpen={false}` (drag-drop only, no settable file
    input) and the only available fixture (`raw-pixls-iphone-se.dng`, 11 MB)
    does not complete WASM decode in headless Chromium within practical
    limits. This is the RAW decode runtime/environment, **explicitly out of
    scope** for this UI refactor (spec §8; CLAUDE.md runtime boundary) and
    **not a defect in the photo-first rebuild**. The slider→real-pipeline
    wiring is covered by passing unit/integration tests
    (`ToneFocusEditor`/`MobileLabChrome`/`preview-pipeline`) and uses the
    exact `onToneChange` path the unchanged desktop uses.

Per the loop contract the completion promise is withheld: the done bar's
live-decoded-preview sub-clause is environment-blocked, not satisfied. The
refactor itself is complete and green; the blocker is reported, not faked.

- [x] **Step 1: Lint**

Run: `pnpm lint`
Expected: No NEW errors in touched files vs. the known pre-existing baseline.
Fix any new issues in the mobile files.

- [x] **Step 2: Tests**

Run: `pnpm test:run`
Expected: Mobile suite green; no regressions introduced by this work. (Ignore
unrelated pre-existing RED baseline failures; fix anything this work broke.)

- [x] **Step 3: Build**

Run: `pnpm build`
Expected: Success.

- [ ] **Step 4: Browser validation** (use the webapp-testing/Playwright tools
  at a mobile viewport, e.g. 402×874). Load `/raw` with a sample RAW and verify:

  - Photo is full-bleed; floating topbar + 5-mode dock over it; desktop
    `WorkspaceHeader` hidden at this width.
  - Tone: tap a pill → focus editor; drag the slider → the **real preview**
    updates live (not a CSS filter); Done keeps the value; Cancel reverts.
  - Long-press the photo → unprocessed RAW shows (compare split → 0); release
    restores the finished preview.
  - Look mode: LUT + Strength reachable and apply to the real pipeline.
  - Compare mode: split toggle/handle works.
  - More: sheet pulls up, drag-down dismisses, is non-modal (tapping the photo
    does not dismiss it via a backdrop); shows real file/pipeline facts; the
    word `libraw-wasm` appears nowhere.
  - Export: reuses the authoritative export path; produces a result.
  - Resize to desktop width → original desktop surface intact and unchanged.
  - Capture screenshots of: tone focus mid-drag, peek, More sheet.

- [ ] **Step 5: Final commit (only if Step 4 required fixes)**

```bash
git add -A
git commit --no-gpg-sign -m "fix(raw): mobile lab browser-validation polish"
```

- [ ] **Step 6: Loop stop condition** — STOP the ralph loop only when Steps
  1–4 (and Tasks 12–13) all pass with evidence. Otherwise continue iterating.

---

## Task 12: Gate mobile chrome behind `hasImage` (fix empty-state clash)

User feedback (2026-05-18): with no photo loaded the mobile lab shows the dark
photo-first chrome over the empty/light stage — jarring colors, no guidance,
"unfinished refactor" feel. Fix: on mobile with no image, render NOTHING from
`RawToolSurface` so the existing dark, guided `ComparePreviewStage` upload dock
(`data-raw-upload-dock`, `raw.stage.uploadTitle/uploadCopy`) is the
unobstructed empty experience. `MobileLabChrome` mounts only once a RAW is
loaded.

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Test: `src/modules/raw-processor/components/RawToolSurface.test.tsx`

- [ ] **Step 1: Failing test** — add to `RawToolSurface.test.tsx` (drives the
  mobile branch by setting the viewport atom):

```tsx
import { jotaiStore } from '~/lib/jotai'
import { viewportAtom } from '~/atoms/viewport'

it('mobile + no image renders no chrome (clean stage upload state)', () => {
  jotaiStore.set(viewportAtom, {
    ...jotaiStore.get(viewportAtom),
    w: 390,
    sm: false,
  })
  const { container } = render(
    <RawToolSurface {...baseProps} hasImage={false} />,
  )
  expect(container.querySelector('[data-raw-mobile-lab]')).toBeNull()
  jotaiStore.set(viewportAtom, {
    ...jotaiStore.get(viewportAtom),
    w: 1280,
    sm: true,
  })
})

it('mobile + image mounts the photo-first chrome', () => {
  jotaiStore.set(viewportAtom, {
    ...jotaiStore.get(viewportAtom),
    w: 390,
    sm: false,
  })
  const { container } = render(<RawToolSurface {...baseProps} hasImage />)
  expect(
    container.querySelector('[data-raw-mobile-lab]'),
  ).toBeInTheDocument()
  jotaiStore.set(viewportAtom, {
    ...jotaiStore.get(viewportAtom),
    w: 1280,
    sm: true,
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx -t "mobile + no image"`
Expected: FAIL (chrome currently renders regardless of hasImage).

- [ ] **Step 3: Implement** — in `RawToolSurface.tsx`, the mobile branch:

```tsx
  if (isMobileViewport) {
    if (!props.hasImage) return null
    return (
      <div className="fixed inset-0 z-30" data-raw-mobile-lab>
        <MobileLabChrome ... />
      </div>
    )
  }

  return (
    <aside className="raw-tool-surface ...">
      ...
    </aside>
  )
```

(Restructure the existing `if (!isMobileViewport) { return aside }` so mobile
returns `null` when `!hasImage`, the chrome only when `hasImage`. Desktop
branch unchanged.)

- [ ] **Step 4: Run → pass**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS (all, incl. the two new cases).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "fix(raw): mobile shows clean stage upload until a RAW is loaded"
```

---

## Task 13: Immersive tap-to-hide + collapsed-by-default dock

User feedback (2026-05-18): no immersive mode, and the always-expanded
topbar+dock+panel obstruct MORE of the photo than the old collapsed rail. Fix:

1. Dock collapsed by default — only the 5-tab bar shows (footprint ≈ old
   rail). Tapping a mode tab expands that mode's panel above the tabs;
   tapping the active tab again collapses it. Tone pill → focus editor as
   before.
2. Immersive: a short tap on the photo toggles all chrome (topbar + dock +
   histogram) hidden/shown — the Lightroom/Snapseed model
   ([[feedback_mobile_live_preview]]). Long-press still peeks (unchanged).
   While chrome is hidden a single faint restore affordance remains.

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobilePeekSurface.tsx` (+ test)
- Modify: `src/modules/raw-processor/components/mobile/MobileModeDock.tsx` (+ test)
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx` (+ test)

- [ ] **Step 1: MobilePeekSurface — add short-tap callback (failing test)**
  Extend the existing test file: a quick down→up (<250ms, no long-press) calls
  `onTap`; a ≥250ms hold calls `onPeekChange(true)` then `(false)` and does
  NOT call `onTap`.

```tsx
it('fires onTap for a short tap and not a peek', () => {
  vi.useFakeTimers()
  const onTap = vi.fn()
  const onPeekChange = vi.fn()
  render(
    <MobilePeekSurface enabled onPeekChange={onPeekChange} onTap={onTap} />,
  )
  const s = screen.getByTestId('mobile-peek-surface')
  fireEvent.pointerDown(s)
  act(() => vi.advanceTimersByTime(120))
  fireEvent.pointerUp(s)
  expect(onTap).toHaveBeenCalledTimes(1)
  expect(onPeekChange).not.toHaveBeenCalled()
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobilePeekSurface.test.tsx -t "short tap"`
Expected: FAIL (`onTap` prop does not exist yet).

- [ ] **Step 3: Implement MobilePeekSurface** — add optional `onTap?: () =>
  void`. On pointerup: if the long-press timer had NOT fired (still pending)
  and it was released quickly, clear the timer and call `onTap()`; if the
  peek had started, end peek (existing behavior) and do NOT call `onTap`.
  Keep `enabled` gating.

- [ ] **Step 4: MobileModeDock — collapsible panel (failing test)**
  Add `expanded: boolean` + `onToggleMode` semantics: when collapsed only the
  tablist renders (no `panel`); selecting a tab expands; the active tab
  toggles. Test: with `expanded={false}` the panel content is not in the DOM;
  clicking a tab calls `onModeChange`; clicking the active tab when expanded
  calls a collapse callback.

```tsx
it('hides the panel when collapsed and toggles on tab tap', async () => {
  const onModeChange = vi.fn()
  const onCollapse = vi.fn()
  const { rerender } = render(
    <MobileModeDock mode="tone" expanded={false}
      onModeChange={onModeChange} onCollapse={onCollapse}
      onOpenMore={vi.fn()} canExport panel={<div data-testid="p">x</div>} />,
  )
  expect(screen.queryByTestId('p')).toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: /tone/i }))
  expect(onModeChange).toHaveBeenCalledWith('tone')
  rerender(
    <MobileModeDock mode="tone" expanded
      onModeChange={onModeChange} onCollapse={onCollapse}
      onOpenMore={vi.fn()} canExport panel={<div data-testid="p">x</div>} />,
  )
  expect(screen.getByTestId('p')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: /tone/i }))
  expect(onCollapse).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run → fail**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx -t "collapsed"`
Expected: FAIL.

- [ ] **Step 6: Implement MobileModeDock** — add `expanded: boolean`,
  `onCollapse: () => void`. Render `panel` only when `expanded`. Tab click:
  if tab is the active mode AND expanded → `onCollapse()`; else
  `onModeChange(tab)` (caller sets expanded=true). `more`/`export` keep
  current behavior. Update the existing dock test's props accordingly.

- [ ] **Step 7: MobileLabChrome — immersive + collapse wiring (failing test)**
  Add to `MobileLabChrome.test.tsx`: a short tap on
  `mobile-peek-surface` hides the topbar (immersive); tapping again restores;
  dock starts collapsed (no tone strip until Tone tab tapped).

```tsx
it('tap toggles immersive (chrome hidden) and back', () => {
  render(<MobileLabChrome {...base} />)
  const s = screen.getByTestId('mobile-peek-surface')
  expect(screen.getByRole('heading', { name: 'DSC09142.ARW' })).toBeVisible()
  s.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  s.dispatchEvent(new Event('pointerup', { bubbles: true }))
  expect(
    screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
  ).not.toBeInTheDocument()
})

it('dock is collapsed by default (no tone strip until Tone tapped)', async () => {
  render(<MobileLabChrome {...base} />)
  expect(
    screen.queryByRole('tablist', { name: /tone parameters/i }),
  ).toBeNull()
  await userEvent.click(
    screen.getByRole('tablist', { name: /lab modes/i })
      .getByRole('tab', { name: /tone/i }),
  )
  expect(
    screen.getByRole('tablist', { name: /tone parameters/i }),
  ).toBeInTheDocument()
})
```

- [ ] **Step 8: Run → fail**

Run: `pnpm test:run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
Expected: FAIL.

- [ ] **Step 9: Implement MobileLabChrome**
  - `const [immersive, setImmersive] = useState(false)`
  - `const [dockExpanded, setDockExpanded] = useState(false)` (collapsed
    default → minimal footprint).
  - `<MobilePeekSurface enabled={!focusKey} onPeekChange={onPeekChange}
    onTap={() => setImmersive(v => !v)} />`
  - Hide `MobileTopbar`, `MobileModeDock`, `FloatingHistogramCard` when
    `immersive` (in addition to the existing `!focusKey` gate). Keep the peek
    surface active so the photo stays inspectable; render one faint restore
    chip (tap → `setImmersive(false)`) while immersive.
  - Mode tab: `onModeChange={(m) => { setMode(m); setDockExpanded(true) }}`,
    `onCollapse={() => setDockExpanded(false)}`, pass `expanded={dockExpanded}`
    to `MobileModeDock`. Entering focus or immersive resets to collapsed.
  - Tone pill still calls `startFocus`.

- [ ] **Step 10: Run → pass; full mobile suite**

Run: `pnpm test:run src/modules/raw-processor/components/mobile src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/modules/raw-processor/components/mobile
git commit --no-gpg-sign -m "feat(raw): immersive tap-to-hide + collapsed-by-default mobile dock"
```

---

## Task 14: Re-validate (lint/test/build + browser with real RAW)

The user supplied real RAWs in `/workspaces/LumaForge/test-images/`
(`SGL00940.ARW`, `SGL_1998.NEF`, …) — use one for the loaded golden path.

- [ ] **Step 1:** `pnpm lint` (scoped clean), `pnpm test:run` (no new fails
  vs the documented native-runtime baseline), `pnpm build` green, `tsc` 0.
- [ ] **Step 2: Browser validation** on the prebuilt preview
  (`npx vite preview --port 4173 --host 0.0.0.0`), viewport 390×844:
  - Empty state: no `[data-raw-mobile-lab]`; the dark guided stage upload dock
    (`data-raw-upload-dock`) is visible and unobstructed.
  - Load `/workspaces/LumaForge/test-images/SGL00940.ARW` (drag-drop onto the
    stage dropzone via a synthetic `DataTransfer`, or the header chooser
    input). Wait for `data-raw-lab-state="loaded"` (long timeout — large ARW).
  - Loaded: chrome mounts; dock collapsed by default (no tone strip until Tone
    tab); tap photo → immersive (topbar+dock hidden), tap → restored;
    long-press → unprocessed RAW peek; Tone tab → pill → focus editor; drag
    the focus slider → the **real WebGL preview visibly changes**; Done keeps,
    Cancel reverts; More sheet opens; desktop resize intact.
  - 0 console errors. Screenshots for empty / collapsed / immersive / focus.
- [ ] **Step 3:** Update the Validation status block with evidence; commit.
- [ ] **Step 4: Loop stop** — emit the completion promise only when Tasks
  12–14 and the original done bar all pass with real evidence.

---

## Self-Review (author)

- Spec §3/§4 component decomposition → Tasks 2,4–10. ✔
- Spec §3 real pipeline (no CSS filter) → Tasks 3,6,10 (Radix Slider →
  `onToneChange`; peek via `onViewModeChange('original')`). ✔
- Spec §3 `libraw-wasm` corrected → Task 8 test asserts absence; Task 10/11
  enforce. ✔
- Spec §3 Radix/Tailwind, no vanilla CSS → all components use Tailwind/Radix;
  Task 10 Step 4 only removes dead CSS. ✔
- Spec §7 i18n both locales → Task 1 + parity test. ✔
- Spec §3 desktop untouched → Tasks 3,10 keep desktop branch; Task 10 Step 2/3
  gate mobile by `≤640px`; Task 11 Step 4 verifies desktop. ✔
- Spec §9 done bar → Task 11. ✔
- Type consistency: `MobileMode`, `MobileMoreMenuItem`, `MobileToneField`,
  `formatToneValue(Short)`, `TONE_NEUTRAL`, `isToneNeutral` used consistently
  across tasks. ✔
- Known soft spots flagged inline for the implementer (Slider aria prop name;
  i18n test wrapper; real lutRows/fileRows derivation; first-pill query
  scoping) — these are runtime API confirmations, not placeholders.
