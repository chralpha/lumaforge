/**
 * Color constants and mappings for RAW processing pipeline.
 * Based on Raw-Alchemy Python implementation.
 */

// Maps user-facing Log space names to their corresponding linear color gamuts
export const LOG_TO_WORKING_SPACE: Record<string, string> = {
  'F-Log': 'F-Gamut',
  'F-Log2': 'F-Gamut',
  'F-Log2C': 'F-Gamut C',
  'V-Log': 'V-Gamut',
  'N-Log': 'N-Gamut',
  'L-Log': 'ITU-R BT.2020',
  'Canon Log 2': 'Cinema Gamut',
  'Canon Log 3': 'Cinema Gamut',
  'S-Log3': 'S-Gamut3',
  'S-Log3.Cine': 'S-Gamut3.Cine',
  'Arri LogC3': 'ARRI Wide Gamut 3',
  'Arri LogC4': 'ARRI Wide Gamut 4',
  Log3G10: 'REDWideGamutRGB',
}

// Maps composite log names to actual function names
export const LOG_ENCODING_MAP: Record<string, string> = {
  'S-Log3.Cine': 'S-Log3',
  'F-Log2C': 'F-Log2',
}

// Available log spaces for UI selection
export const LOG_SPACES = Object.keys(LOG_TO_WORKING_SPACE)

// ProPhoto RGB luminance coefficients
export const PROPHOTO_LUMA_COEFFS = new Float32Array([
  0.28804, 0.71187, 0.00009,
])

// sRGB luminance coefficients (Rec. 709)
export const SRGB_LUMA_COEFFS = new Float32Array([0.2126, 0.7152, 0.0722])

// Rec. 2020 luminance coefficients
export const REC2020_LUMA_COEFFS = new Float32Array([0.2627, 0.678, 0.0593])

/**
 * Color space primaries and white points for gamut transformations.
 * Using CIE 1931 xyY chromaticity coordinates.
 */
export interface ColorSpaceDef {
  name: string
  primaries: {
    red: [number, number]
    green: [number, number]
    blue: [number, number]
  }
  whitePoint: [number, number] // D50 or D65
  gamma?: number | 'linear'
}

// D65 standard illuminant
export const D65_WHITE: [number, number] = [0.3127, 0.329]

// D50 standard illuminant
export const D50_WHITE: [number, number] = [0.3457, 0.3585]

export const COLOR_SPACES: Record<string, ColorSpaceDef> = {
  'ProPhoto RGB': {
    name: 'ProPhoto RGB',
    primaries: {
      red: [0.7347, 0.2653],
      green: [0.1596, 0.8404],
      blue: [0.0366, 0.0001],
    },
    whitePoint: D50_WHITE,
    gamma: 'linear',
  },
  sRGB: {
    name: 'sRGB',
    primaries: {
      red: [0.64, 0.33],
      green: [0.3, 0.6],
      blue: [0.15, 0.06],
    },
    whitePoint: D65_WHITE,
    gamma: 2.4,
  },
  'Display P3': {
    name: 'Display P3',
    primaries: {
      red: [0.68, 0.32],
      green: [0.265, 0.69],
      blue: [0.15, 0.06],
    },
    whitePoint: D65_WHITE,
    gamma: 2.4,
  },
  'ITU-R BT.2020': {
    name: 'ITU-R BT.2020',
    primaries: {
      red: [0.708, 0.292],
      green: [0.17, 0.797],
      blue: [0.131, 0.046],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'S-Gamut3': {
    name: 'S-Gamut3',
    primaries: {
      red: [0.73, 0.28],
      green: [0.14, 0.855],
      blue: [0.1, -0.05],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'S-Gamut3.Cine': {
    name: 'S-Gamut3.Cine',
    primaries: {
      red: [0.766, 0.275],
      green: [0.225, 0.8],
      blue: [0.089, -0.087],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'V-Gamut': {
    name: 'V-Gamut',
    primaries: {
      red: [0.73, 0.28],
      green: [0.165, 0.84],
      blue: [0.1, -0.03],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'F-Gamut': {
    name: 'F-Gamut',
    primaries: {
      red: [0.708, 0.292],
      green: [0.17, 0.797],
      blue: [0.131, 0.046],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'Cinema Gamut': {
    name: 'Cinema Gamut',
    primaries: {
      red: [0.74, 0.27],
      green: [0.17, 1.14],
      blue: [0.08, -0.1],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'ARRI Wide Gamut 3': {
    name: 'ARRI Wide Gamut 3',
    primaries: {
      red: [0.684, 0.313],
      green: [0.221, 0.848],
      blue: [0.0861, -0.102],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'ARRI Wide Gamut 4': {
    name: 'ARRI Wide Gamut 4',
    primaries: {
      red: [0.7347, 0.2653],
      green: [0.1424, 0.8576],
      blue: [0.0991, -0.0308],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  REDWideGamutRGB: {
    name: 'REDWideGamutRGB',
    primaries: {
      red: [0.780308, 0.304253],
      green: [0.121595, 1.493994],
      blue: [0.095612, -0.084589],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
  'N-Gamut': {
    name: 'N-Gamut',
    primaries: {
      red: [0.708, 0.292],
      green: [0.17, 0.797],
      blue: [0.131, 0.046],
    },
    whitePoint: D65_WHITE,
    gamma: 'linear',
  },
}

// Available metering modes
export const METERING_MODES = [
  'average',
  'center-weighted',
  'highlight-safe',
  'hybrid',
  'matrix',
] as const

export type MeteringMode = (typeof METERING_MODES)[number]
