import { createElement } from 'react'
import { render } from 'takumi-js'

export const LUMAFORGE_OG_IMAGE_WIDTH = 1200
export const LUMAFORGE_OG_IMAGE_HEIGHT = 630
export const LUMAFORGE_OG_HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=86'

interface LumaForgeOgImageAssets {
  fontData: Uint8Array
  heroImageSrc: string
  logoSrc: string
}

const colors = {
  paper: '#f0e8dc',
  paperWarm: '#d6c4aa',
  ink: '#251f18',
  green: '#30b96b',
  amber: '#d59724',
  heroInk: '#f0e8dc',
}

const e = createElement

function chip(label: string, marginLeft = 0) {
  return e(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: 32,
        marginLeft,
        padding: '0 12px',
        borderRadius: 999,
        border: '1px solid rgba(240, 232, 220, 0.34)',
        backgroundColor: 'rgba(37, 31, 24, 0.58)',
        color: colors.heroInk,
        fontSize: 16,
        fontWeight: 740,
      },
    },
    label,
  )
}

function comparePanel(heroImageSrc: string) {
  return e(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        width: 488,
        height: 470,
        overflow: 'hidden',
        borderRadius: 8,
        border: '1px solid rgba(236, 230, 221, 0.58)',
        backgroundColor: colors.ink,
        boxShadow: '0 34px 84px rgba(8, 6, 4, 0.42)',
      },
    },
    e('img', {
      src: heroImageSrc,
      width: 488,
      height: 470,
      style: {
        position: 'absolute',
        inset: 0,
        width: 488,
        height: 470,
        objectFit: 'cover',
      },
    }),
    e('div', {
      style: {
        position: 'absolute',
        inset: 0,
        background:
          'linear-gradient(90deg, rgba(29, 24, 18, 0.62) 0%, rgba(29, 24, 18, 0.28) 49%, rgba(29, 24, 18, 0.04) 49%, rgba(29, 24, 18, 0) 100%)',
      },
    }),
    e('div', {
      style: {
        position: 'absolute',
        left: 239,
        top: 0,
        width: 249,
        height: 470,
        background:
          'linear-gradient(160deg, rgba(48, 185, 107, 0.1), rgba(213, 151, 36, 0.32))',
      },
    }),
    e('div', {
      style: {
        position: 'absolute',
        left: 238,
        top: 0,
        width: 2,
        height: 470,
        backgroundColor: colors.heroInk,
      },
    }),
    e(
      'div',
      {
        style: {
          position: 'absolute',
          left: 216,
          top: 212,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 46,
          height: 46,
          borderRadius: 999,
          border: '1px solid rgba(240, 232, 220, 0.82)',
          backgroundColor: 'rgba(37, 31, 24, 0.74)',
        },
      },
      e('div', {
        style: {
          width: 18,
          height: 2,
          borderRadius: 999,
          backgroundColor: colors.heroInk,
        },
      }),
    ),
    e(
      'div',
      {
        style: {
          position: 'absolute',
          left: 18,
          bottom: 18,
          display: 'flex',
          height: 30,
          alignItems: 'center',
          padding: '0 11px',
          borderRadius: 999,
          backgroundColor: 'rgba(37, 31, 24, 0.76)',
          color: colors.heroInk,
          fontSize: 15,
          fontWeight: 740,
        },
      },
      'RAW preview',
    ),
    e(
      'div',
      {
        style: {
          position: 'absolute',
          right: 18,
          bottom: 18,
          display: 'flex',
          height: 30,
          alignItems: 'center',
          padding: '0 11px',
          borderRadius: 999,
          backgroundColor: 'rgba(37, 31, 24, 0.76)',
          color: colors.heroInk,
          fontSize: 15,
          fontWeight: 740,
        },
      },
      'LUT look',
    ),
  )
}

function ogImageElement({ heroImageSrc, logoSrc }: LumaForgeOgImageAssets) {
  return e(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        width: LUMAFORGE_OG_IMAGE_WIDTH,
        height: LUMAFORGE_OG_IMAGE_HEIGHT,
        overflow: 'hidden',
        backgroundColor: colors.ink,
        color: colors.heroInk,
        fontFamily: 'Geist Sans',
      },
    },
    e('img', {
      src: heroImageSrc,
      width: LUMAFORGE_OG_IMAGE_WIDTH,
      height: LUMAFORGE_OG_IMAGE_HEIGHT,
      style: {
        position: 'absolute',
        inset: 0,
        width: LUMAFORGE_OG_IMAGE_WIDTH,
        height: LUMAFORGE_OG_IMAGE_HEIGHT,
        objectFit: 'cover',
      },
    }),
    e('div', {
      style: {
        position: 'absolute',
        inset: 0,
        background:
          'linear-gradient(90deg, rgba(18, 13, 9, 0.84) 0%, rgba(18, 13, 9, 0.58) 45%, rgba(18, 13, 9, 0.7) 100%), linear-gradient(0deg, rgba(18, 13, 9, 0.88), rgba(18, 13, 9, 0.04) 58%, rgba(18, 13, 9, 0.74))',
      },
    }),
    e('div', {
      style: {
        position: 'absolute',
        inset: 0,
        background:
          'linear-gradient(90deg, rgba(240, 232, 220, 0.12) 0 1px, transparent 1px 94px), linear-gradient(180deg, rgba(240, 232, 220, 0.08) 0 1px, transparent 1px 94px)',
      },
    }),
    e(
      'div',
      {
        style: {
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100%',
          padding: 58,
        },
      },
      e(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: 592,
            height: '100%',
            justifyContent: 'space-between',
          },
        },
        e(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
            },
          },
          e('img', {
            src: logoSrc,
            width: 56,
            height: 56,
            style: {
              width: 56,
              height: 56,
              borderRadius: 8,
              boxShadow: '0 14px 34px rgba(8, 6, 4, 0.34)',
            },
          }),
          e(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                marginLeft: 16,
              },
            },
            e(
              'div',
              {
                style: {
                  fontSize: 31,
                  fontWeight: 850,
                  lineHeight: 1,
                  color: colors.heroInk,
                },
              },
              'LumaForge',
            ),
            e(
              'div',
              {
                style: {
                  marginTop: 7,
                  color: 'rgba(240, 232, 220, 0.76)',
                  fontSize: 17,
                  fontWeight: 740,
                },
              },
              'browser-local RAW lab',
            ),
          ),
        ),
        e(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
            },
          },
          e(
            'div',
            {
              style: {
                color: colors.amber,
                fontSize: 24,
                fontWeight: 820,
                marginBottom: 14,
              },
            },
            '',
          ),
          e(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                color: colors.heroInk,
                fontSize: 96,
                fontWeight: 880,
                lineHeight: 0.86,
                letterSpacing: 0,
              },
            },
            e('div', null, 'RAW photo'),
            e('div', null, 'LUT look'),
          ),
          e(
            'div',
            {
              style: {
                marginTop: 30,
                color: 'rgba(240, 232, 220, 0.82)',
                fontSize: 27,
                fontWeight: 520,
                lineHeight: 1.24,
              },
            },
            '',
          ),
        ),
        e(
          'div',
          {
            style: {
              display: 'flex',
            },
          },
          chip('No upload'),
          chip('Declared LUT', 10),
        ),
      ),
      e(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            width: 488,
            height: '100%',
          },
        },
        comparePanel(heroImageSrc),
      ),
    ),
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
