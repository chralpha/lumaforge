# RAW Lab Motion Polish Design

> Upgrade the RAW lab's transition animations from plain CSS to `motion/react` spring physics, adding entrance reveals, a backdrop scrim, drag gesture migration, and tactile press feedback.

## Problem

Three classes of motion feel lacking in the RAW lab:

1. **Abrupt pop-in.** Tool sections mount instantly with no entrance animation — they appear in a single frame when the page loads (desktop) or the mobile sheet opens.
2. **Cheap/mechanical easing.** The mobile bottom sheet slides via a CSS `cubic-bezier` transition. Buttons use flat 160–180ms CSS color tweaks. Nothing uses spring physics despite the project having a `Spring` preset system.
3. **No depth or feedback.** The mobile sheet has no backdrop scrim (the preview behind it stays fully bright), and interactive controls lack tactile press response (no scale-on-tap).

## Approach

Full migration to `motion/react` (`m` elements inside the existing `LazyMotion` provider, `Spring` presets from `src/lib/spring.ts`). The hand-rolled pointer-based drag gesture on the mobile sheet is replaced by motion's `drag` system.

## Conventions

- **Spring character:** `Spring.presets.snappy` (duration 0.4, bounce 0.15) is the default for sheet and section reveals. Buttons use a faster `Spring.snappy(0.25)` for responsiveness.
- **Reduced motion:** `useReducedMotion()` from `motion/react` gates every spatial animation. When active, all `y`/`scale` transforms collapse to identity and stagger delays become 0 — only opacity crossfades remain. The existing CSS `@media (prefers-reduced-motion: reduce)` block in `raw-lab.css` stays as a belt-and-suspenders fallback.
- **Variants pattern:** Shared `containerVariants` / `itemVariants` objects so the desktop tool stack and the mobile sheet content reuse one stagger definition.

## Section 1: Mobile bottom sheet

### What changes

The entire hand-rolled pointer drag system in `RawToolSurface.tsx` (`handleSheetPointerDown`, `handleSheetPointerMove`, `handleSheetPointerUp`, `handleSheetPointerCancel`, `sheetDragY` state, `sheetDragStartRef`, `sheetDragYRef`, and the inline-style transform override) is **removed** and replaced by motion primitives.

### Sheet element

The sheet `div.raw-mobile-tool-sheet` becomes `m.div`. Its open/close animation is driven by:

```
animate={{ y: open ? '0%' : '100%' }}
transition={Spring.presets.snappy}
```

`AnimatePresence` wraps the sheet so the exit also springs (down-and-out) rather than snapping to `display: none`.

### Drag gesture

```
// On the sheet m.div:
drag="y"
dragControls={dragControls}
dragListener={false}          // don't let the whole sheet initiate drag
dragConstraints={{ top: 0, bottom: 0 }}
dragElastic={{ top: 0, bottom: 0.4 }}
onDragEnd={(_, info) => {
  const sheet = sheetRef.current
  const threshold = sheet ? Math.max(80, sheet.offsetHeight * 0.28) : 80
  if (info.offset.y > threshold || info.velocity.y > 500) {
    setMobilePanel(null)
  }
}}

// On the drag-handle/header area:
onPointerDown={(e) => dragControls.start(e)}
```

- `useDragControls()` ensures only the handle/header area initiates drag — prevents conflict with the scrollable content area below.
- Cannot drag above the open position (`top: 0`).
- Rubber-bands downward with 0.4 elasticity.
- Dismisses on **distance** (offset > 28% of sheet height or 80px) **OR velocity** (flick > 500 px/s) — velocity-flick dismiss is a premium upgrade the current code lacks.
- On sub-threshold release, motion's spring automatically settles back to `y: '0%'`.

### Backdrop scrim

A new `m.div` element inserted before the sheet in the DOM:

```
className="raw-mobile-tool-backdrop"
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
transition={Spring.smooth(0.3)}
```

- Visually: dims the preview area ~40% (`background: oklch(0.18 0.018 76 / 0.40)`).
- `pointer-events: auto` only when mounted; tapping it calls `setMobilePanel(null)`.
- Wrapped in `AnimatePresence` alongside the sheet so it fades in/out in sync.

### CSS changes

The CSS transition rules on `.raw-mobile-tool-sheet` (`transition: transform 280ms ..., visibility 280ms ...`) are **removed** — motion owns the transform now. The `visibility: hidden` / `visible` toggle via `[data-raw-tool-sheet]` is also removed since `AnimatePresence` handles mount/unmount. Structural CSS (size, radius, shadow, grid, border) stays unchanged.

New rule added:

```css
.raw-mobile-tool-backdrop {
  position: fixed;
  inset: 0;
  background: oklch(0.18 0.018 76 / 0.40);
  -webkit-tap-highlight-color: transparent;
}
```

The backdrop must render visually behind the sheet and rail but in front of the preview canvas. The exact `z-index` depends on the aside's stacking context and is an implementation detail — the visual ordering is the contract.

### Reduced motion

When `useReducedMotion()` is true:

- Sheet: `animate={{ opacity: open ? 1 : 0 }}` instead of `y` transform. No drag (drag is spatial).
- Backdrop: opacity fade only (already non-spatial, so unchanged).

## Section 2: Tool section staggered reveal

### Container + item variants

```ts
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: Spring.presets.snappy },
}
```

Reduced-motion override: `itemVariants.hidden.y = 0`, `containerVariants.visible.transition.staggerChildren = 0`.

### ToolSection

The root `<section>` in `ToolSection.tsx` becomes `m.section` with `variants={itemVariants}`. The component does not set `initial`/`animate` itself — it inherits from the parent container via motion's variant propagation.

### Desktop stack

The `.raw-tool-stack-desktop` wrapper becomes `m.div` with:

```
variants={containerVariants}
initial="hidden"
animate="visible"
```

Stagger runs once on mount. No exit animation (the stack never unmounts).

### Mobile sheet content

The `.raw-mobile-tool-sheet-scroll` content area (where `renderStyleTools` / `renderExportTools` renders) is wrapped in `AnimatePresence mode="wait"`:

- The outgoing panel's container animates to `exit={{ opacity: 0 }}` with a quick 100ms transition.
- The incoming panel's container enters as a stagger container (`initial="hidden"` → `animate="visible"`), triggering the section-by-section reveal.

Keying: each panel's container is keyed by `mobilePanel` value (`"style"` or `"export"`) so `AnimatePresence` correctly detects the swap.

## Section 3: Button/control tactile feedback

### Targets (become `m.button`)

| Element | `whileTap` | Spring |
|---------|-----------|--------|
| Mobile rail tabs (Style / Export) | `{ scale: 0.96 }` | `Spring.snappy(0.25)` |
| Sheet close button (X) | `{ scale: 0.92 }` | `Spring.snappy(0.25)` |
| Strength segmented buttons (×4) | `{ scale: 0.97 }` | `Spring.snappy(0.25)` |
| "Export full-resolution JPEG" button | `{ scale: 0.97 }` | `Spring.snappy(0.25)` |

### What stays CSS

- **Hover color/border transitions** on all buttons — already adequate as CSS, no spring needed, and they target `color`/`background`/`border-color` which don't conflict with motion's `transform`.
- **Range sliders** (`<input type="range">`) — native elements, `whileTap` doesn't apply meaningfully.
- **Secondary buttons** ("Reset tone", "Reset compare view") — minor actions, CSS hover feedback is sufficient.

### Interaction layering

`whileTap` (motion, controls `transform: scale`) stacks on top of CSS hover transitions (color/background). No conflict: they target different properties. The existing `160–180ms cubic-bezier` CSS hover rules stay unchanged.

## Out of scope

- **Compare split handle** — user confirmed this transition is fine.
- **Preview stage transitions** (embedded → quick → HQ fade) — not flagged.
- **Desktop layout animations** (panel resize, etc.) — not applicable.
- **New Spring presets** — the existing `smooth`/`snappy`/`bouncy` + tunable methods cover all needs.

## Files changed

| File | Change |
|------|--------|
| `src/modules/raw-processor/components/RawToolSurface.tsx` | Remove pointer-drag state/handlers; sheet → `m.div` + `drag="y"`; add backdrop `m.div`; `AnimatePresence` for sheet + content swap; rail tabs → `m.button` with `whileTap`; close → `m.button` with `whileTap` |
| `src/modules/raw-processor/components/tools/ToolSection.tsx` | `<section>` → `m.section` with `variants={itemVariants}` |
| `src/modules/raw-processor/raw-lab.css` | Remove sheet CSS transition + visibility rules; add `.raw-mobile-tool-backdrop` rule |
| `src/modules/raw-processor/components/tools/StrengthControl.tsx` | Buttons → `m.button` with `whileTap` |
| `src/modules/raw-processor/components/tools/ExportTool.tsx` | Export button → `m.button` with `whileTap` |

Shared variants (container/item) are defined in a new `src/modules/raw-processor/motion.ts` file or inline in `RawToolSurface.tsx` — whichever is cleaner after implementation reveals the import graph. If more than 2 files import them, extract to `motion.ts`.

## Verification

- `pnpm lint && pnpm test:run && pnpm build` — all pass.
- **Desktop (>640px):** stagger reveal on initial load; strength press feedback; no backdrop (no sheet on desktop).
- **Mobile (<640px):**
  - Sheet open: backdrop fades in, sheet springs up with snappy settle.
  - Sheet close (X): sheet springs down, backdrop fades out.
  - Drag dismiss (distance): pull past 28% threshold → springs away.
  - Drag dismiss (velocity flick): quick downward flick → dismisses even below distance threshold.
  - Drag spring-back: pull below threshold + slow release → springs back to open.
  - Backdrop tap-to-dismiss: tap dimmed preview → sheet closes.
  - Style ↔ Export content swap: outgoing fades (100ms), incoming staggers in.
  - `whileTap` scale on rail tabs, close, strength, export button.
- **Reduced motion:** Toggle in DevTools. No spatial transforms, no slide, no scale. Only opacity crossfades. Sheet appears/disappears without sliding.
