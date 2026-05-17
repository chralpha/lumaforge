import type { CSSProperties, ReactNode } from 'react'
import { createElement } from 'react'
import { render } from 'takumi-js'

export const LUMAFORGE_OG_IMAGE_WIDTH = 1200
export const LUMAFORGE_OG_IMAGE_HEIGHT = 630
export const LUMAFORGE_OG_HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=86'

interface LumaForgeOgImageAssets {
  fontData: Uint8Array
  heroImageSrc: string
  logoSrc: string
}

const colors = {
  dark: 'oklch(0.18 0.02 76)',
  heroInk: 'oklch(0.97 0.014 86)',
  amber: 'oklch(0.78 0.16 63)',
  green: 'oklch(0.59 0.15 153)',
  status: 'oklch(0.86 0.02 82 / 0.66)',
  hairline: 'oklch(0.82 0.03 82 / 0.30)',
  onPhotoBg: 'oklch(0.16 0.018 76 / 0.80)',
  onPhotoBgStrong: 'oklch(0.16 0.018 76 / 0.86)',
  onPhotoBorder: 'oklch(0.96 0.012 86 / 0.26)',
  rawDot: 'oklch(0.86 0.13 72)',
  fileMuted: 'oklch(0.86 0.02 82 / 0.72)',
  divider: 'oklch(0.96 0.012 86 / 0.94)',
  dividerBorder: 'oklch(0.96 0.012 86 / 0.82)',
  dividerHandleBg: 'oklch(0.16 0.018 76 / 0.72)',
}

const e = createElement

function checkIcon(size = 12, stroke = 2.4) {
  return e(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: colors.green,
      strokeWidth: stroke,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: {
        display: 'block',
        flexShrink: 0,
      },
    },
    e('polyline', { points: '20 6 9 17 4 12' }),
  )
}

function imageUpIcon() {
  return e(
    'svg',
    {
      width: 14,
      height: 14,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: colors.amber,
      strokeWidth: 1.9,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: {
        display: 'block',
        flexShrink: 0,
      },
    },
    e('path', {
      d: 'M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12',
    }),
    e('path', { d: 'M3 16l5-5 4 4' }),
    e('path', { d: 'M18 22v-6' }),
    e('polyline', { points: '15 19 18 16 21 19' }),
  )
}

function compareHandleIcon() {
  return e(
    'svg',
    {
      width: 20,
      height: 14,
      viewBox: '0 0 20 14',
      fill: 'none',
      stroke: 'oklch(0.96 0.012 86 / 0.92)',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style: {
        display: 'block',
      },
    },
    e('polyline', { points: '5 2 1 7 5 12' }),
    e('polyline', { points: '15 2 19 7 15 12' }),
  )
}

function markLockup(logoSrc: string) {
  return e(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: 36,
      },
    },
    e('img', {
      src: logoSrc,
      width: 36,
      height: 36,
      style: {
        width: 36,
        height: 36,
        borderRadius: 5,
        boxShadow: '0 8px 22px oklch(0.05 0.02 78 / 0.40)',
      },
    }),
    e(
      'div',
      {
        style: {
          marginLeft: 12,
          color: colors.heroInk,
          fontSize: 18,
          fontWeight: 760,
          letterSpacing: '-0.005em',
          lineHeight: 1,
        },
      },
      'LumaForge',
    ),
  )
}

function eyebrow() {
  return e(
    'div',
    {
      style: {
        marginBottom: 22,
        color: colors.amber,
        fontSize: 12.5,
        fontWeight: 780,
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        textTransform: 'uppercase',
      },
    },
    'RAW → LUT → JPEG',
  )
}

function headlineLine(children: ReactNode) {
  return e('div', { style: { whiteSpace: 'nowrap' } }, children)
}

function headline() {
  const accent = (text: string, color: string) =>
    e('span', { style: { color } }, text)

  return e(
    'div',
    {
      style: {
        margin: 0,
        color: colors.heroInk,
        fontSize: 70,
        fontWeight: 860,
        lineHeight: 0.94,
        letterSpacing: '-0.028em',
      },
    },
    headlineLine('The easiest'),
    headlineLine('way to finish'),
    headlineLine(e('span', null, 'a ', accent('RAW', colors.amber), ' with')),
    headlineLine(e('span', null, 'a ', accent('LUT', colors.green), '.')),
  )
}

function statusLine() {
  return e(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        color: colors.status,
        fontSize: 13.5,
        fontWeight: 620,
        lineHeight: 1,
      },
    },
    e('div', {
      style: {
        width: 6,
        height: 6,
        borderRadius: 999,
        backgroundColor: colors.green,
      },
    }),
    e(
      'div',
      {
        style: {
          marginLeft: 10,
        },
      },
      'Browser-local · no upload',
    ),
  )
}

function rawTag() {
  return e(
    'div',
    {
      style: {
        position: 'absolute',
        top: 28,
        left: 28,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 13px',
        borderRadius: 999,
        border: `1px solid ${colors.onPhotoBorder}`,
        backgroundColor: colors.onPhotoBg,
        color: colors.heroInk,
        fontSize: 12.5,
        fontWeight: 720,
        letterSpacing: '0.01em',
        lineHeight: 1,
      },
    },
    e('div', {
      style: {
        width: 6,
        height: 6,
        borderRadius: 999,
        backgroundColor: colors.rawDot,
        boxShadow: `0 0 8px ${colors.rawDot}`,
      },
    }),
    e('div', { style: { marginLeft: 8 } }, 'RAW preview'),
  )
}

function finishedTag() {
  return e(
    'div',
    {
      style: {
        position: 'absolute',
        top: 28,
        right: 28,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 13px',
        borderRadius: 999,
        border: `1px solid ${colors.onPhotoBorder}`,
        backgroundColor: colors.onPhotoBg,
        color: colors.heroInk,
        fontSize: 12.5,
        fontWeight: 720,
        letterSpacing: '0.01em',
        lineHeight: 1,
      },
    },
    checkIcon(),
    e('div', { style: { marginLeft: 8 } }, 'Finished JPEG · Rec.709'),
  )
}

function contractChip() {
  return e(
    'div',
    {
      style: {
        position: 'absolute',
        bottom: 28,
        left: 28,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 13px 8px 11px',
        borderRadius: 999,
        border: `1px solid ${colors.onPhotoBorder}`,
        backgroundColor: colors.onPhotoBg,
        color: colors.heroInk,
        fontSize: 12.5,
        fontWeight: 720,
        letterSpacing: '0.01em',
        lineHeight: 1,
      },
    },
    checkIcon(),
    e('div', { style: { marginLeft: 8 } }, 'ARRI LogC → Rec.709'),
  )
}

function filePill() {
  return e(
    'div',
    {
      style: {
        position: 'absolute',
        right: 28,
        bottom: 28,
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        borderRadius: 8,
        border: `1px solid ${colors.onPhotoBorder}`,
        backgroundColor: colors.onPhotoBgStrong,
        color: colors.heroInk,
        fontSize: 12.5,
        fontWeight: 720,
        lineHeight: 1,
        fontFeatureSettings: '"tnum" 1',
      },
    },
    imageUpIcon(),
    e('div', { style: { marginLeft: 10 } }, 'DSC_0421.ARW'),
    e('div', {
      style: {
        width: 1,
        height: 14,
        marginLeft: 10,
        backgroundColor: 'oklch(0.96 0.012 86 / 0.24)',
      },
    }),
    e(
      'div',
      {
        style: {
          marginLeft: 10,
          color: colors.fileMuted,
        },
      },
      '24.3 MB',
    ),
  )
}

function rightPane(heroImageSrc: string) {
  const fullImageStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: 670,
    height: 630,
    objectFit: 'cover',
  }

  return e(
    'div',
    {
      style: {
        position: 'relative',
        width: 670,
        height: 630,
        overflow: 'hidden',
      },
    },
    e('img', {
      src: heroImageSrc,
      width: 670,
      height: 630,
      style: {
        ...fullImageStyle,
        filter: 'saturate(0.50) contrast(0.88) brightness(0.82)',
      },
    }),
    e(
      'div',
      {
        style: {
          position: 'absolute',
          top: 0,
          left: 335,
          width: 335,
          height: 630,
          overflow: 'hidden',
        },
      },
      e('img', {
        src: heroImageSrc,
        width: 670,
        height: 630,
        style: {
          position: 'absolute',
          top: 0,
          left: -335,
          width: 670,
          height: 630,
          objectFit: 'cover',
          filter: 'saturate(1.20) contrast(1.08) brightness(1.06)',
        },
      }),
    ),
    e('div', {
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 335,
        background:
          'linear-gradient(90deg, oklch(0.86 0.13 63 / 0.06), oklch(0.86 0.13 63 / 0.14))',
      },
    }),
    e('div', {
      style: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 334,
        width: 2,
        backgroundColor: colors.divider,
        boxShadow: '0 0 14px oklch(0.05 0.02 78 / 0.45)',
      },
    }),
    e(
      'div',
      {
        style: {
          position: 'absolute',
          top: 289,
          left: 309,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: `1.5px solid ${colors.dividerBorder}`,
          backgroundColor: colors.dividerHandleBg,
        },
      },
      compareHandleIcon(),
    ),
    rawTag(),
    finishedTag(),
    contractChip(),
    filePill(),
  )
}

function ogImageElement({ heroImageSrc, logoSrc }: LumaForgeOgImageAssets) {
  return e(
    'div',
    {
      style: {
        display: 'flex',
        width: LUMAFORGE_OG_IMAGE_WIDTH,
        height: LUMAFORGE_OG_IMAGE_HEIGHT,
        overflow: 'hidden',
        backgroundColor: colors.dark,
        color: colors.heroInk,
        fontFamily: 'Geist Sans',
        fontFeatureSettings: '"ss01" 1, "cv11" 1',
      },
    },
    e(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 530,
          height: 630,
          padding: '56px 44px 52px 64px',
          borderRight: `1px solid ${colors.hairline}`,
          boxSizing: 'border-box',
        },
      },
      markLockup(logoSrc),
      e('div', null, eyebrow(), headline()),
      statusLine(),
    ),
    rightPane(heroImageSrc),
  )
}

export async function renderLumaForgeOgImage(assets: LumaForgeOgImageAssets) {
  return render(ogImageElement(assets), {
    width: LUMAFORGE_OG_IMAGE_WIDTH,
    height: LUMAFORGE_OG_IMAGE_HEIGHT,
    fonts: [
      {
        name: 'Geist Sans',
        data: assets.fontData,
      },
    ],
    loadDefaultFonts: false,
    emoji: 'from-font',
  })
}
