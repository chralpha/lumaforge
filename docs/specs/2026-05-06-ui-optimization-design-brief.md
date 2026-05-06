# Design Brief: RAW Lab UI/UX Optimization

## 1. Feature Summary

A comprehensive UI/UX overhaul that eliminates LumaForge's dual-design-system problem by migrating all RAW Lab surfaces and shared UI components to a unified Radix UI + Tailwind foundation. The tool panel is reorganized around progressive disclosure guided by the "film darkroom" metaphor. Mobile and desktop share the same information architecture while adapting interaction to each platform.

Target: enthusiast photographers who want to quickly apply stylized LUTs and basic tonal adjustments to RAW photos — fast results, trustworthy pipeline, no professional grading complexity.

## 2. Primary User Action

Drop RAW → pick a LUT → set intensity → optionally tweak tone → export JPEG.

The interface should make this flow feel like walking through a small darkroom: place the negative, choose the chemistry, check the result, make the print. Every step is intentional but none requires a degree in color science.

## 3. Design Direction

**Color strategy:** Restrained. Warm paper neutrals carry 90% of the surface. Lab Green (`oklch(0.59 0.15 153)`) is the single action accent, reserved for primary CTAs and active/safe states. Calibration Amber (`oklch(0.78 0.16 63)`) marks contract and color-science labels. Sensor Rose (`oklch(0.62 0.17 346)`) and Preview Sky (`oklch(0.65 0.1 214)`) appear only in rare proof-point contexts.

The green has a story now: early color film processes produced cyan-tinted highlights due to emulsion limitations. Modern film simulations deliberately reproduce this "retro film" character. Lab Green carries that history — it's not decorative, it's photographic heritage.

**Theme scene sentence:** A photography enthusiast at their desk in the evening, window light fading, reviewing today's RAW shots on a laptop. They want to see how each frame looks through a film-like LUT before sharing. The room is quiet; the screen should feel like a light table, not a cockpit.

**Anchor references:**
- **Anthropic Console** — unified component system, progressive disclosure from simple to advanced, single design token source of truth
- **Minttr** — philosophical constraint drives every design decision, radical simplicity, everything on screen must justify its existence
- **Physical darkroom** — warm safelight tones, chemical bath sequence (developer → stop → fix → wash), tactile precision without clutter

## 4. Scope

| Dimension | Decision |
|---|---|
| Fidelity | Production-ready |
| Breadth | RAW Lab page (topbar + preview stage + tool panel + mobile sheet/rail) + shared UI components (Button, Select, Dialog, DropdownMenu, Slider, Input, Switch, Checkbox, Tooltip, Accordion, Divider, ContextMenu) |
| Interactivity | Shipped-quality components with hover, focus, active, disabled, loading states |
| Time intent | Polish until it ships |
| Excluded | Compare Split WebGL core changes (future memo only), landing page redesign, new features beyond reorganization |

## 5. Layout Strategy

### Desktop (≥981px)

```
┌─ Topbar ─────────────────────────────────────────────┐
│ [Logo] FileName  [SupportBadge]  [Reset] [Export]    │
├─ Stage + Tools (grid: 1fr / minmax(340px, 400px)) ───┤
│                                                        │
│  ┌─ Preview Stage (dark frame) ─┐  ┌─ Tool Panel ─┐  │
│  │                              │  │ Phase 1: LUT  │  │
│  │    RAW image / compare       │  │ + Intensity   │  │
│  │                              │  ├───────────────┤  │
│  │                              │  │ Phase 2: Tone │  │
│  │                              │  │ (collapsible) │  │
│  │                              │  ├───────────────┤  │
│  │                              │  │ Phase 3:      │  │
│  │                              │  │ Export        │  │
│  │                              │  ├───────────────┤  │
│  │  [Upload dock when empty]    │  │ File facts    │  │
│  └──────────────────────────────┘  └───────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Tool Panel phases (top to bottom):**

1. **LUT + Intensity** (always visible) — the primary action. LUT source selector, intensity chips (4 levels), current LUT name/profile. This is what most users will interact with 80% of the time.
2. **Tone** (collapsible, collapsed by default) — exposure, contrast, highlights, shadows, whites, blacks. Hidden behind a "Fine-tune" disclosure. Opens with expand animation; remembers open/closed state per session.
3. **Export** (always visible at bottom) — sticky action area with primary export button, format/quality options in a popover or inline selector. This is the workflow terminus, not a buried scroll-to-find button.
4. **File Facts + Histogram** (collapsible metadata) — camera, lens, dimensions, color space. Informational, not actionable.

### Mobile / Tablet (≤980px)

Same information architecture, different interaction:

```
┌─ Topbar (compact) ────────────────────────────────────┐
│ [Logo] FileName  [▤ More]                             │
├─ Stage (full width) ──────────────────────────────────┤
│                                                        │
│  ┌─ Preview Stage ──────────────────────────────────┐  │
│  │                                                   │  │
│  │    RAW image / compare                           │  │
│  │                                                   │  │
│  │  [Upload dock when empty]                        │  │
│  └───────────────────────────────────────────────────┘  │
│                                                        │
├─ Bottom Rail (2 tabs) ────────────────────────────────┤
│  [🎨 Look]          [☐ Export]                        │
└────────────────────────────────────────────────────────┘

[🎨 Look] sheet (slides up):
  Phase 1: LUT + Intensity
  Phase 2: Tone (collapsible)

[☐ Export] sheet (slides up):
  Export button + options
  File facts summary
```

The bottom rail replaces the current 2-tab model but maps directly to the desktop panel's phase grouping. "Look" covers LUT + Intensity + Tone (the creative decisions). "Export" covers the final action. Two tabs instead of many reduces cognitive load.

### Tablet (641–980px)

The breakpoint where the panel moves from sidebar to bottom. Uses the same layout as mobile but with more generous sheet height and optional two-column sheet content when space allows.

## 6. Key States

### Tool Panel States

| State | Behavior |
|---|---|
| **Empty (no file)** | Panel shows a simplified placeholder: "Drop a RAW file to start" with supported format hints. No controls visible. |
| **Loading / Decoding** | Panel skeleton with subtle shimmer. Export button disabled with "Processing..." label. |
| **Loaded (default)** | Phase 1 visible. Phase 2 collapsed. Phase 3 (export) enabled and visible. |
| **Loaded (tone expanded)** | Phase 2 revealed with animation. Sliders at neutral/default values. Reset button visible. |
| **LUT loaded** | Current LUT name displayed. Clear button visible. Profile info badge if contract is known. |
| **Unsupported LUT contract** | Amber inline notice in Phase 1 explaining what's unknown. Export disabled with plain-language reason. |
| **Exporting** | Export button shows spinner + "Exporting...". Panel stays interactive but export actions disabled. |
| **Export complete** | Result card slides in below export button. Download/Share/Copy actions visible. |
| **Error** | Inline error in relevant phase. Dismissible. Does not block other phases. |

### Mobile Sheet States

| State | Behavior |
|---|---|
| **Sheet closed** | Rail visible. Sheet hidden below viewport. |
| **Sheet open (half)** | Sheet at 42-56svh. Drag handle visible. Backdrop semi-transparent. |
| **Sheet open (full)** | Sheet at ~85svh after user drags up. Full scroll access to all controls. |
| **Sheet dragging** | Follows finger. Snaps to half/full/closed on release. |

### Preview Stage States (unchanged from current, noted for completeness)

| State | Behavior |
|---|---|
| Empty | Dark frame with upload dock centered |
| Loaded | Image displayed, compare handle visible |
| Processing | Progress overlay |
| Error | Error overlay with dismiss |

## 7. Interaction Model

### Phase 1: LUT + Intensity (Primary)

- **LUT source selector**: Dropdown or searchable select for built-in LUTs + online sources. Selecting a source opens its LUT browser (dialog on desktop, sheet on mobile).
- **LUT drop zone**: Drag .cube file onto the drop zone or the preview stage. Visual feedback on dragover.
- **Intensity chips**: 4-button segmented control (Subtle / Medium / Strong / Full). Mutually exclusive. Instant preview update.
- **LUT info**: When a LUT with a known contract is active, show a compact badge: "ARRI LogC → Rec.709". When unknown, show amber warning.

### Phase 2: Tone (Secondary, Collapsible)

- **Disclosure trigger**: "Fine-tune" button/link below intensity chips. Chevron indicates expand/collapse.
- **Sliders**: 6 vertical-stack sliders (Exposure, Contrast, Highlights, Shadows, Whites, Blacks). Each: label + current value + range input.
- **Reset**: "Reset tone" button at bottom of expanded section. Only enabled when values differ from defaults.
- **Toggle**: Quick A/B toggle between tone on/off to preview the effect (bonus if time allows).

### Phase 3: Export (Terminus)

- **Primary export button**: Full-width, green, always visible at panel bottom. Sticky within the panel scroll.
- **Quality selector**: Compact popover or segmented control (Standard / High).
- **Fidelity selector**: Popover or segmented control (Safe / Balanced / Max). "Safe" is default.
- **Post-export**: Result card reveals below export button with file name, size, dimensions, and action buttons.

### Mobile Rail + Sheet

- **Rail tabs**: Two tabs (Look / Export). Active tab has green border + light green background. Tapping opens corresponding sheet.
- **Sheet drag**: Drag handle at top. Fling up to expand, fling down to collapse. Springs to nearest snap point.
- **Sheet close**: Tap backdrop, tap close button, or drag below threshold.
- **Tab switch within sheet**: Not needed — tabs switch by tapping rail, not within sheet.

## 8. Content Requirements

### Section Labels & Microcopy

| Location | Copy | Notes |
|---|---|---|
| Phase 1 heading | "Look" | Short, evocative |
| LUT selector placeholder | "Choose a LUT..." | |
| LUT drop zone (empty) | "Drop a .cube file" | |
| LUT drop zone (has LUT) | "{filename}.cube" | With clear button |
| Intensity chips | "Subtle" / "Medium" / "Strong" / "Full" | Keep current labels |
| Phase 2 trigger | "Fine-tune" | With chevron |
| Tone sliders | "Exposure" / "Contrast" / "Highlights" / "Shadows" / "Whites" / "Blacks" | Keep current |
| Tone reset | "Reset tone" | |
| Phase 3 heading | "Export" | |
| Export button (idle) | "Export JPEG" | |
| Export button (loading) | "Exporting..." | |
| Quality options | "Standard" / "High" | |
| Fidelity options | "Safe" / "Balanced" / "Max" | |
| File facts heading | "File info" | Collapsible |

### Empty States

| Location | Message |
|---|---|
| Panel (no file) | "Drop a RAW file to start" with supported formats below |
| LUT drop zone (no LUT) | "Drop a .cube LUT file here" with browse alternative |
| Online LUT search (no results) | "No LUTs found for '{query}'" |

### Error States

| Condition | Message |
|---|---|
| Unsupported RAW format | "{filename} — this RAW format isn't supported yet" |
| LUT contract unknown | "This LUT's color contract couldn't be verified. Export may not match preview." |
| Export failed | "Export failed — {reason}. Try again or choose a different file." |
| WebGL unavailable | "Your browser doesn't support WebGL2, which is required for RAW processing." |

### Dynamic Content Ranges

- LUT source list: 0–20+ items (built-in + online)
- Tone slider values: -100 to +100 (typical range)
- File name: up to 255 chars, truncated with ellipsis
- Export result file size: 0.5–50 MB (typical JPEG from RAW)

## 9. Component Migration Map

Every current custom-CSS component mapped to a Radix UI + Tailwind target:

| Current | Target | Notes |
|---|---|---|
| `.raw-lab-topbar-button` | Custom Button (Radix `Slot` + Tailwind) | Already partially migrated via Tremor Button. Unify variant tokens. |
| `.raw-lab-more-menu` | Radix `DropdownMenu` | Already exists in shared UI |
| `.raw-tool-section` | Tailwind-styled `section` with semantic heading | Replace arbitrary padding with spacing scale |
| `.raw-tool-reset-button` | Button variant: `ghost` or `outline` | |
| `.raw-lut-dropzone` | Custom dropzone using Radix primitives + Tailwind | |
| `.raw-lut-source-controls` | Tailwind grid + shared Input/Select | |
| `.raw-strength-control` | Radix `ToggleGroup` | Segmented control pattern |
| `.raw-tone-control` | Tailwind-styled range inputs + shared Slider | |
| `.raw-export-result` | Inline card with Tailwind | |
| `.raw-export-button` | Button variant: `primary` | |
| `.raw-file-facts` | Description list with Tailwind | |
| `.raw-mobile-tool-rail` | Fixed bottom bar with Tailwind | |
| `.raw-mobile-tool-sheet` | Radix `Dialog` or custom sheet with Tailwind | |
| `.raw-histogram` | Canvas + Tailwind wrapper | Keep canvas rendering, restyle wrapper |
| `.raw-lab-compare-handle` | Keep custom implementation (WebGL dependent) | Excluded from this plan |
| All `oklch()` inline values | Mapped to shared Tailwind theme tokens | Single source of truth |
| `.raw-lab-*` CSS classes | Remove file entirely; all styles via Tailwind utilities + theme | |

## 10. Design Token Unification

All color and spacing values currently split across `raw-lab.css` and `index.css` merge into the Tailwind theme:

### Colors → Tailwind Theme

```
raw-paper       → --color-surface-paper
raw-paper-high  → --color-surface-paper-high
raw-paper-low   → --color-surface-paper-low
raw-paper-warm  → --color-surface-paper-warm
raw-ink         → --color-text-primary
raw-ink-soft    → --color-text-secondary
raw-hairline    → --color-border-primary
raw-green       → --color-accent (already mapped)
raw-green-deep  → --color-accent-deep
raw-green-soft  → --color-accent-soft
raw-amber       → --color-signal-amber
raw-amber-soft  → --color-signal-amber-soft
raw-dark        → --color-surface-dark
raw-hero-ink    → --color-text-inverse
```

### Typography → Design System Scale

Reduce from 13+ arbitrary font weights to 5: 400 (body), 500 (emphasis), 600 (label), 700 (heading), 800 (hero). Map all current bespoke weights to nearest standard.

Reduce from 15+ arbitrary font sizes to a defined scale: xs (0.625rem), sm (0.75rem), base (0.875rem), lg (1rem), xl (1.25rem), 2xl (1.5rem), display (responsive clamp).

### Spacing → Tailwind Scale

All raw `px` values (6, 7, 8, 10, 12, 14, etc.) mapped to Tailwind spacing scale (1=4px): 1.5→6px approximation, 2→8px, 2.5→10px, 3→12px, 3.5→14px, etc. Where exact pixel values matter critically, use arbitrary values sparingly.

### Border Radius → Unified Scale

```
5px  → rounded-sm (from --radius - 4px)
8px  → rounded-lg (from --radius)
999px → rounded-full
```

## 11. Open Questions

1. **Dark mode**: Does the RAW Lab need dark mode support now, or defer? The preview stage is already dark; the tool panel could remain light (paper metaphor) or switch. Decision deferred but token naming should support future dark variants.

2. **Histogram placement**: Currently in the scrollable tool stack. Could move to a fixed position below the preview stage (always visible during tone adjustment). Worth exploring but not blocking.

3. **LUT browser dialog vs inline**: Currently uses a floating dialog. Could become an inline panel that replaces the Phase 1 content temporarily. Keep dialog for now, note for future.

4. **Tone section default state**: Should "Fine-tune" be collapsed or expanded by default? Recommendation: collapsed for new sessions, remember state within session.

5. **Animation library**: Currently using `motion/react` (LazyMotion setup). Continue using for sheet transitions, disclosure animations, and export result reveal. No change needed.

6. **Online LUT sources integration**: The URL-driven LUT loading from community sources — keep as-is or redesign the browsing UX? Keep as-is for this plan; it's functional and not part of the visual inconsistency problem.

## 12. Recommended References

For implementation, the following impeccable references apply:
- **layout.md** — fixing spacing rhythm and visual hierarchy in the reorganized panel
- **distill.md** — stripping the tool panel to essentials, removing visual noise
- **clarify.md** — UX copy, labels, error messages, empty states
- **adapt.md** — mobile/desktop responsive behavior verification
- **typeset.md** — typography scale consolidation and weight reduction
