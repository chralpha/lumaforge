/**
 * Log encoding/decoding functions for various camera log formats.
 * Implements transfer functions matching industry-standard log curves.
 */

/**
 * Log encoding function signature
 */
export type LogEncodingFn = (linear: number) => number
export type LogDecodingFn = (encoded: number) => number

/**
 * S-Log3 encoding (Sony)
 * Reference: S-Log3 Technical Summary
 */
export function sLog3Encode(linear: number): number {
  if (linear >= 0.01125) {
    return (420 + Math.log10((linear + 0.01) / (0.18 + 0.01)) * 261.5) / 1023
  }
  return ((linear * (171.2102946929 - 95)) / 0.01125 + 95) / 1023
}

export function sLog3Decode(encoded: number): number {
  const x = encoded * 1023
  if (x >= 171.2102946929) {
    return Math.pow(10, (x - 420) / 261.5) * (0.18 + 0.01) - 0.01
  }
  return ((x - 95) * 0.01125) / (171.2102946929 - 95)
}

/**
 * V-Log encoding (Panasonic)
 * Reference: V-Log/V-Gamut Technical Documents
 */
export function vLogEncode(linear: number): number {
  const b = 0.00873
  const c = 0.241514
  const d = 0.598206

  if (linear < 0.01) {
    return 5.6 * linear + 0.125
  }
  return c * Math.log10(linear + b) + d
}

export function vLogDecode(encoded: number): number {
  const b = 0.00873
  const c = 0.241514
  const d = 0.598206

  if (encoded < 0.181) {
    return (encoded - 0.125) / 5.6
  }
  return Math.pow(10, (encoded - d) / c) - b
}

/**
 * F-Log encoding (Fujifilm)
 * Reference: F-Log Data Sheet
 */
export function fLogEncode(linear: number): number {
  const a = 0.555556
  const b = 0.009468
  const c = 0.344676
  const d = 0.790453
  const e = 8.735631
  const f = 0.092864
  const cut = 0.00089

  if (linear < cut) {
    return e * linear + f
  }
  return c * Math.log10(a * linear + b) + d
}

export function fLogDecode(encoded: number): number {
  const a = 0.555556
  const b = 0.009468
  const c = 0.344676
  const d = 0.790453
  const e = 8.735631
  const f = 0.092864
  const cut = 0.100537775223865

  if (encoded < cut) {
    return (encoded - f) / e
  }
  return (Math.pow(10, (encoded - d) / c) - b) / a
}

/**
 * F-Log2 encoding (Fujifilm)
 */
export function fLog2Encode(linear: number): number {
  const a = 5.555556
  const b = 0.064829
  const c = 0.245281
  const d = 0.384316
  const e = 8.799461
  const f = 0.092864
  const cut = 0.000889

  if (linear < cut) {
    return e * linear + f
  }
  return c * Math.log10(a * linear + b) + d
}

export function fLog2Decode(encoded: number): number {
  const a = 5.555556
  const b = 0.064829
  const c = 0.245281
  const d = 0.384316
  const e = 8.799461
  const f = 0.092864
  const cut = 0.100686685370811

  if (encoded < cut) {
    return (encoded - f) / e
  }
  return (Math.pow(10, (encoded - d) / c) - b) / a
}

/**
 * N-Log encoding (Nikon)
 */
export function nLogEncode(linear: number): number {
  const a = 650 / 1023
  const b = 0.0075
  const c = 150 / 1023
  const d = 619 / 1023
  const cut = 0.328

  if (linear < cut) {
    return Math.pow(linear, 1 / 3) * a + b
  }
  return Math.log(linear) * c + d
}

export function nLogDecode(encoded: number): number {
  const a = 650 / 1023
  const b = 0.0075
  const c = 150 / 1023
  const d = 619 / 1023
  const cut = 0.363 // Approximate output at input cut

  if (encoded < cut) {
    return Math.pow((encoded - b) / a, 3)
  }
  return Math.exp((encoded - d) / c)
}

/**
 * Canon Log 2 encoding
 */
export function canonLog2Encode(linear: number): number {
  const cut = 0.000023146608
  if (linear < cut) {
    return -(0.235 - 0.000235) * linear + 0.000235
  }
  return 0.092864 * Math.log10(linear + 0.000235) + 0.392964
}

export function canonLog2Decode(encoded: number): number {
  const cut = 0.00023146608
  if (encoded < cut) {
    return (0.000235 - encoded) / (0.235 - 0.000235)
  }
  return Math.pow(10, (encoded - 0.392964) / 0.092864) - 0.000235
}

/**
 * Canon Log 3 encoding
 */
export function canonLog3Encode(linear: number): number {
  const cut = 0.014
  if (linear < cut) {
    return 0.36726845 * linear + 0.12783901
  }
  return 0.09802097 * Math.log10(linear + 0.01) + 0.36726845
}

export function canonLog3Decode(encoded: number): number {
  const cut = 0.13246729 // Approximate
  if (encoded < cut) {
    return (encoded - 0.12783901) / 0.36726845
  }
  return Math.pow(10, (encoded - 0.36726845) / 0.09802097) - 0.01
}

/**
 * ARRI LogC3 encoding (EI 800)
 */
export function logC3Encode(linear: number): number {
  const cut = 0.010591
  const a = 5.555556
  const b = 0.052272
  const c = 0.24719
  const d = 0.385537
  const e = 5.367655
  const f = 0.092809

  if (linear > cut) {
    return c * Math.log10(a * linear + b) + d
  }
  return e * linear + f
}

export function logC3Decode(encoded: number): number {
  const cut = 0.1496 // Approximate output
  const a = 5.555556
  const b = 0.052272
  const c = 0.24719
  const d = 0.385537
  const e = 5.367655
  const f = 0.092809

  if (encoded > cut) {
    return (Math.pow(10, (encoded - d) / c) - b) / a
  }
  return (encoded - f) / e
}

/**
 * ARRI LogC4 encoding
 */
const LOG_C4_A = (Math.pow(2, 18) - 16) / 117.45
const LOG_C4_B = (1023 - 95) / 1023
const LOG_C4_C = 95 / 1023
const LOG_C4_S =
  (7 * Math.log(2) * Math.pow(2, 7 - (14 * LOG_C4_C) / LOG_C4_B)) /
  (LOG_C4_A * LOG_C4_B)
const LOG_C4_T = (Math.pow(2, 14 * (-LOG_C4_C / LOG_C4_B) + 6) - 64) / LOG_C4_A

export function logC4Encode(linear: number): number {
  if (linear < LOG_C4_T) {
    return (linear - LOG_C4_T) / LOG_C4_S
  }

  return ((Math.log2(LOG_C4_A * linear + 64) - 6) / 14) * LOG_C4_B + LOG_C4_C
}

export function logC4Decode(encoded: number): number {
  if (encoded < 0) {
    return encoded * LOG_C4_S + LOG_C4_T
  }

  const p = (14 * (encoded - LOG_C4_C)) / LOG_C4_B + 6
  return (Math.pow(2, p) - 64) / LOG_C4_A
}

/**
 * Log3G10 encoding (RED)
 */
export function log3G10Encode(linear: number): number {
  const a = 0.224282
  const b = 155.975327
  const c = 0.01
  const g = 15.1927

  const y = linear + c
  if (y < 0) return y * g
  return a * Math.log10(b * y + 1)
}

export function log3G10Decode(encoded: number): number {
  const a = 0.224282
  const b = 155.975327
  const c = 0.01
  const g = 15.1927

  if (encoded < 0) return encoded / g - c
  return (Math.pow(10, encoded / a) - 1) / b - c
}

/**
 * L-Log encoding (Leica/Panasonic)
 */
export function lLogEncode(linear: number): number {
  const cut = 0.006
  if (linear < cut) {
    return 8 * linear
  }
  return 0.233161 * Math.log10(linear / 0.006 + 1) + 0.048
}

export function lLogDecode(encoded: number): number {
  const cut = 0.048
  if (encoded < cut) {
    return encoded / 8
  }
  return 0.006 * (Math.pow(10, (encoded - 0.048) / 0.233161) - 1)
}

/**
 * Mapping of log space names to encode/decode functions
 */
export const LOG_FUNCTIONS: Record<
  string,
  { encode: LogEncodingFn; decode: LogDecodingFn }
> = {
  'S-Log3': { encode: sLog3Encode, decode: sLog3Decode },
  'S-Log3.Cine': { encode: sLog3Encode, decode: sLog3Decode },
  'V-Log': { encode: vLogEncode, decode: vLogDecode },
  'F-Log': { encode: fLogEncode, decode: fLogDecode },
  'F-Log2': { encode: fLog2Encode, decode: fLog2Decode },
  'F-Log2C': { encode: fLog2Encode, decode: fLog2Decode },
  'N-Log': { encode: nLogEncode, decode: nLogDecode },
  'Canon Log 2': { encode: canonLog2Encode, decode: canonLog2Decode },
  'Canon Log 3': { encode: canonLog3Encode, decode: canonLog3Decode },
  'Arri LogC3': { encode: logC3Encode, decode: logC3Decode },
  'Arri LogC4': { encode: logC4Encode, decode: logC4Decode },
  Log3G10: { encode: log3G10Encode, decode: log3G10Decode },
  'L-Log': { encode: lLogEncode, decode: lLogDecode },
}

/**
 * Get log encoding function for a given log space
 */
export function getLogEncoder(logSpace: string): LogEncodingFn {
  const funcs = LOG_FUNCTIONS[logSpace]
  if (!funcs) {
    console.warn(`Unknown log space: ${logSpace}, using S-Log3`)
    return sLog3Encode
  }
  return funcs.encode
}

/**
 * Get log decoding function for a given log space
 */
export function getLogDecoder(logSpace: string): LogDecodingFn {
  const funcs = LOG_FUNCTIONS[logSpace]
  if (!funcs) {
    console.warn(`Unknown log space: ${logSpace}, using S-Log3`)
    return sLog3Decode
  }
  return funcs.decode
}
