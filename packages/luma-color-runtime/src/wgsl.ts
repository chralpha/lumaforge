import type { TransferFunctionId } from './log-encoding'
import type { LUTRole, SignalRange } from './registry'

export { LUMA_COLOR_OKLAB_WGSL } from './oklab'
export { LUMA_COLOR_USER_SATURATION_WGSL } from './saturation-wgsl'
export { LUMA_COLOR_SELECTIVE_COLOR_WGSL } from './selective-color-wgsl'

export const LUT_ROLE_UNIFORMS: Record<LUTRole, number> = {
  'display-look': 0,
  'scene-creative': 1,
  'combined-look-output': 2,
  'technical-output': 3,
}

export const LUT_RANGE_UNIFORMS: Record<SignalRange, number> = {
  full: 0,
  legal: 1,
  unknown: 2,
}

export const LUT_TRANSFER_UNIFORMS: Record<TransferFunctionId, number> = {
  srgb: 0,
  bt709: 1,
  gamma24: 2,
  's-log2': 3,
  's-log3': 4,
  'canon-log': 5,
  'canon-log2': 6,
  'canon-log3': 7,
  'n-log': 8,
  'f-log': 9,
  'f-log2': 10,
  'f-log2c': 11,
  'v-log': 12,
  logc3: 13,
  logc4: 14,
  log3g10: 15,
  acescc: 16,
  acescct: 17,
  'l-log': 18,
  linear: 19,
  'apple-log': 20,
  'dji-d-log': 21,
}

export const LUMA_COLOR_TRANSFER_WGSL = /* wgsl */ `
const TRANSFER_SRGB: i32 = 0;
const TRANSFER_BT709: i32 = 1;
const TRANSFER_GAMMA24: i32 = 2;
const TRANSFER_S_LOG2: i32 = 3;
const TRANSFER_S_LOG3: i32 = 4;
const TRANSFER_CANON_LOG: i32 = 5;
const TRANSFER_CANON_LOG2: i32 = 6;
const TRANSFER_CANON_LOG3: i32 = 7;
const TRANSFER_N_LOG: i32 = 8;
const TRANSFER_F_LOG: i32 = 9;
const TRANSFER_F_LOG2: i32 = 10;
const TRANSFER_F_LOG2C: i32 = 11;
const TRANSFER_V_LOG: i32 = 12;
const TRANSFER_LOGC3: i32 = 13;
const TRANSFER_LOGC4: i32 = 14;
const TRANSFER_LOG3G10: i32 = 15;
const TRANSFER_ACESCC: i32 = 16;
const TRANSFER_ACESCCT: i32 = 17;
const TRANSFER_L_LOG: i32 = 18;
const TRANSFER_LINEAR: i32 = 19;
const TRANSFER_APPLE_LOG: i32 = 20;
const TRANSFER_DJI_D_LOG: i32 = 21;

fn clamp01v(color: vec3f) -> vec3f {
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

fn srgbToLinear(color: vec3f) -> vec3f {
  let c = clamp01v(color);
  let lower = c / 12.92;
  let higher = pow(max((c + 0.055) / 1.055, vec3f(0.0)), vec3f(2.4));
  let lowerMix = 1.0 - step(vec3f(0.04045), c);
  return mix(higher, lower, lowerMix);
}

fn linearToSrgb(color: vec3f) -> vec3f {
  let c = max(color, vec3f(0.0));
  let lower = c * 12.92;
  let higher = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  let lowerMix = 1.0 - step(vec3f(0.0031308), c);
  return clamp01v(mix(higher, lower, lowerMix));
}

fn encodeSrgbTransfer(linearValue: f32) -> f32 {
  if (linearValue <= 0.0031308) {
    return 12.92 * linearValue;
  }
  return 1.055 * pow(max(linearValue, 0.0), 1.0 / 2.4) - 0.055;
}

fn decodeSrgbTransfer(encodedValue: f32) -> f32 {
  if (encodedValue <= 0.04045) {
    return encodedValue / 12.92;
  }
  return pow(max((encodedValue + 0.055) / 1.055, 0.0), 2.4);
}

fn encodeBT709(linearValue: f32) -> f32 {
  if (linearValue <= 0.018) {
    return 4.5 * linearValue;
  }
  return 1.099 * pow(max(linearValue, 0.0), 0.45) - 0.099;
}

fn decodeBT709(encodedValue: f32) -> f32 {
  if (encodedValue <= 0.081) {
    return encodedValue / 4.5;
  }
  return pow(max((encodedValue + 0.099) / 1.099, 0.0), 1.0 / 0.45);
}

fn encodeSLog2(linearValue: f32) -> f32 {
  let reflectedLinear = 0.9 * max(linearValue, 0.0);
  return 0.432699 * (log(reflectedLinear + 0.037584) / log(10.0)) + 0.616596 + 0.03;
}

fn decodeSLog2(encodedValue: f32) -> f32 {
  return (pow(10.0, (encodedValue - 0.03 - 0.616596) / 0.432699) - 0.037584) / 0.9;
}

fn encodeSLog3(linearValue: f32) -> f32 {
  if (linearValue >= 0.01125) {
    return (420.0 + (log((max(linearValue, 0.0) + 0.01) / 0.19) / log(10.0)) * 261.5) / 1023.0;
  }
  return ((linearValue * (171.2102946929 - 95.0)) / 0.01125 + 95.0) / 1023.0;
}

fn decodeSLog3(encodedValue: f32) -> f32 {
  let x = encodedValue * 1023.0;
  if (x >= 171.2102946929) {
    return pow(10.0, (x - 420.0) / 261.5) * 0.19 - 0.01;
  }
  return ((x - 95.0) * 0.01125) / (171.2102946929 - 95.0);
}

fn encodeCanonLog(linearValue: f32) -> f32 {
  if (linearValue < 0.0) {
    return -0.529136 * (log(-10.1596 * linearValue + 1.0) / log(10.0)) + 0.0730597;
  }
  return 0.529136 * (log(10.1596 * linearValue + 1.0) / log(10.0)) + 0.0730597;
}

fn decodeCanonLog(encodedValue: f32) -> f32 {
  if (encodedValue < 0.0730597) {
    return -(pow(10.0, (0.0730597 - encodedValue) / 0.529136) - 1.0) / 10.1596;
  }
  return (pow(10.0, (encodedValue - 0.0730597) / 0.529136) - 1.0) / 10.1596;
}

fn encodeCanonLog2(linearValue: f32) -> f32 {
  if (linearValue < 0.0) {
    return -0.24136077 * (log(1.0 - (87.099375 * linearValue) / 0.9) / log(10.0)) + 0.092864125;
  }
  return 0.24136077 * (log(1.0 + (87.099375 * linearValue) / 0.9) / log(10.0)) + 0.092864125;
}

fn decodeCanonLog2(encodedValue: f32) -> f32 {
  if (encodedValue < 0.092864125) {
    return (0.9 * (1.0 - pow(10.0, (0.092864125 - encodedValue) / 0.24136077))) / 87.099375;
  }
  return (0.9 * (pow(10.0, (encodedValue - 0.092864125) / 0.24136077) - 1.0)) / 87.099375;
}

fn encodeCanonLog3(linearValue: f32) -> f32 {
  if (linearValue < -0.0126) {
    return -0.36726845 * (log(1.0 - (14.98325 * linearValue) / 0.9) / log(10.0)) + 0.12783901;
  }
  if (linearValue <= 0.0126) {
    return (linearValue * 1.9754798) / 0.9 + 0.12512219;
  }
  return 0.36726845 * (log(1.0 + (14.98325 * linearValue) / 0.9) / log(10.0)) + 0.12240537;
}

fn decodeCanonLog3(encodedValue: f32) -> f32 {
  if (encodedValue < 0.097465473) {
    return (0.9 * (1.0 - pow(10.0, (0.12783901 - encodedValue) / 0.36726845))) / 14.98325;
  }
  if (encodedValue <= 0.15277891) {
    return (0.9 * (encodedValue - 0.12512219)) / 1.9754798;
  }
  return (0.9 * (pow(10.0, (encodedValue - 0.12240537) / 0.36726845) - 1.0)) / 14.98325;
}

fn encodeNLog(linearValue: f32) -> f32 {
  if (linearValue < 0.328) {
    return sign(linearValue) * pow(abs(linearValue), 1.0 / 3.0) * (650.0 / 1023.0) + 0.0075;
  }
  return log(linearValue) * (150.0 / 1023.0) + (619.0 / 1023.0);
}

fn decodeNLog(encodedValue: f32) -> f32 {
  let cut = pow(0.328, 1.0 / 3.0) * (650.0 / 1023.0) + 0.0075;
  if (encodedValue < cut) {
    let toe = (encodedValue - 0.0075) / (650.0 / 1023.0);
    return toe * toe * toe;
  }
  return exp((encodedValue - (619.0 / 1023.0)) / (150.0 / 1023.0));
}

fn encodeFLog(linearValue: f32) -> f32 {
  if (linearValue < 0.00089) {
    return 8.735631 * linearValue + 0.092864;
  }
  return 0.344676 * (log(0.555556 * linearValue + 0.009468) / log(10.0)) + 0.790453;
}

fn decodeFLog(encodedValue: f32) -> f32 {
  if (encodedValue < 0.100537775223865) {
    return (encodedValue - 0.092864) / 8.735631;
  }
  return (pow(10.0, (encodedValue - 0.790453) / 0.344676) - 0.009468) / 0.555556;
}

fn encodeFLog2(linearValue: f32) -> f32 {
  if (linearValue < 0.000889) {
    return 8.799461 * linearValue + 0.092864;
  }
  return 0.245281 * (log(5.555556 * linearValue + 0.064829) / log(10.0)) + 0.384316;
}

fn decodeFLog2(encodedValue: f32) -> f32 {
  if (encodedValue < 0.100686685370811) {
    return (encodedValue - 0.092864) / 8.799461;
  }
  return (pow(10.0, (encodedValue - 0.384316) / 0.245281) - 0.064829) / 5.555556;
}

fn vLogEncodeChannel(linearValue: f32) -> f32 {
  if (linearValue < 0.01) {
    return 5.6 * linearValue + 0.125;
  }
  return 0.241514 * (log(max(linearValue, 0.0) + 0.00873) / log(10.0)) + 0.598206;
}

fn vLogDecodeChannel(encodedValue: f32) -> f32 {
  if (encodedValue < 0.181) {
    return (encodedValue - 0.125) / 5.6;
  }
  return pow(10.0, (encodedValue - 0.598206) / 0.241514) - 0.00873;
}

fn encodeLogC3(linearValue: f32) -> f32 {
  if (linearValue > 0.010591) {
    return 0.24719 * (log(5.555556 * linearValue + 0.052272) / log(10.0)) + 0.385537;
  }
  return 5.367655 * linearValue + 0.092809;
}

fn decodeLogC3(encodedValue: f32) -> f32 {
  if (encodedValue > 0.1496) {
    return (pow(10.0, (encodedValue - 0.385537) / 0.24719) - 0.052272) / 5.555556;
  }
  return (encodedValue - 0.092809) / 5.367655;
}

fn encodeLogC4(linearValue: f32) -> f32 {
  let a = (262144.0 - 16.0) / 117.45;
  let b = (1023.0 - 95.0) / 1023.0;
  let c = 95.0 / 1023.0;
  let s = (7.0 * log(2.0) * pow(2.0, 7.0 - (14.0 * c) / b)) / (a * b);
  let t = (pow(2.0, 14.0 * (-c / b) + 6.0) - 64.0) / a;
  if (linearValue < t) {
    return (linearValue - t) / s;
  }
  return ((log2(a * linearValue + 64.0) - 6.0) / 14.0) * b + c;
}

fn decodeLogC4(encodedValue: f32) -> f32 {
  let a = (262144.0 - 16.0) / 117.45;
  let b = (1023.0 - 95.0) / 1023.0;
  let c = 95.0 / 1023.0;
  let s = (7.0 * log(2.0) * pow(2.0, 7.0 - (14.0 * c) / b)) / (a * b);
  let t = (pow(2.0, 14.0 * (-c / b) + 6.0) - 64.0) / a;
  if (encodedValue < 0.0) {
    return encodedValue * s + t;
  }
  return (pow(2.0, (14.0 * (encodedValue - c)) / b + 6.0) - 64.0) / a;
}

fn encodeLog3G10(linearValue: f32) -> f32 {
  let y = linearValue + 0.01;
  if (y < 0.0) { return y * 15.1927; }
  return 0.224282 * (log(155.975327 * y + 1.0) / log(10.0));
}

fn decodeLog3G10(encodedValue: f32) -> f32 {
  if (encodedValue < 0.0) { return encodedValue / 15.1927 - 0.01; }
  return (pow(10.0, encodedValue / 0.224282) - 1.0) / 155.975327 - 0.01;
}

fn encodeACEScc(linearValue: f32) -> f32 {
  if (linearValue <= 0.0) {
    return (-16.0 + 9.72) / 17.52;
  }
  if (linearValue < pow(2.0, -15.0)) {
    return (log2(pow(2.0, -16.0) + linearValue * 0.5) + 9.72) / 17.52;
  }
  return (log2(linearValue) + 9.72) / 17.52;
}

fn decodeACEScc(encodedValue: f32) -> f32 {
  let cut = (-15.0 + 9.72) / 17.52;
  if (encodedValue <= cut) {
    return (pow(2.0, encodedValue * 17.52 - 9.72) - pow(2.0, -16.0)) * 2.0;
  }
  return pow(2.0, encodedValue * 17.52 - 9.72);
}

fn encodeACEScct(linearValue: f32) -> f32 {
  if (linearValue <= 0.0078125) {
    return 10.5402377416545 * linearValue + 0.0729055341958355;
  }
  return (log2(linearValue) + 9.72) / 17.52;
}

fn decodeACEScct(encodedValue: f32) -> f32 {
  if (encodedValue <= 0.155251141552511) {
    return (encodedValue - 0.0729055341958355) / 10.5402377416545;
  }
  return pow(2.0, encodedValue * 17.52 - 9.72);
}

fn encodeLLog(linearValue: f32) -> f32 {
  if (linearValue <= 0.006) {
    return 8.0 * linearValue + 0.09;
  }
  return 0.27 * (log(1.3 * linearValue + 0.0115) / log(10.0)) + 0.6;
}

fn decodeLLog(encodedValue: f32) -> f32 {
  if (encodedValue <= 0.138) {
    return (encodedValue - 0.09) / 8.0;
  }
  return (pow(10.0, (encodedValue - 0.6) / 0.27) - 0.0115) / 1.3;
}

fn encodeAppleLog(linearValue: f32) -> f32 {
  let r0 = -0.05641088;
  let rt = 0.01;
  let c = 47.28711236;
  let beta = 0.00964052;
  let gamma = 0.08550479;
  let delta = 0.69336945;
  if (linearValue < r0) {
    return 0.0;
  }
  if (linearValue < rt) {
    return c * pow(linearValue - r0, 2.0);
  }
  return gamma * log2(linearValue + beta) + delta;
}

fn decodeAppleLog(encodedValue: f32) -> f32 {
  let r0 = -0.05641088;
  let rt = 0.01;
  let c = 47.28711236;
  let beta = 0.00964052;
  let gamma = 0.08550479;
  let delta = 0.69336945;
  let pt = c * pow(rt - r0, 2.0);
  if (encodedValue < 0.0) {
    return r0;
  }
  if (encodedValue < pt) {
    return sqrt(encodedValue / c) + r0;
  }
  return pow(2.0, (encodedValue - delta) / gamma) - beta;
}

fn encodeDjiDLog(linearValue: f32) -> f32 {
  if (linearValue <= 0.0078) {
    return 6.025 * linearValue + 0.0929;
  }
  return (log(0.9892 * linearValue + 0.0108) / log(10.0)) * 0.256663 + 0.584555;
}

fn decodeDjiDLog(encodedValue: f32) -> f32 {
  if (encodedValue <= 0.14) {
    return (encodedValue - 0.0929) / 6.025;
  }
  return (pow(10.0, 3.89616 * encodedValue - 2.27752) - 0.0108) / 0.9892;
}

fn encodeTransferChannel(linearValue: f32, transfer: i32) -> f32 {
  if (transfer == TRANSFER_LINEAR) { return linearValue; }
  if (transfer == TRANSFER_SRGB) { return encodeSrgbTransfer(linearValue); }
  if (transfer == TRANSFER_BT709) { return encodeBT709(linearValue); }
  if (transfer == TRANSFER_GAMMA24) { return pow(max(linearValue, 0.0), 1.0 / 2.4); }
  if (transfer == TRANSFER_S_LOG2) { return encodeSLog2(linearValue); }
  if (transfer == TRANSFER_S_LOG3) { return encodeSLog3(linearValue); }
  if (transfer == TRANSFER_CANON_LOG) { return encodeCanonLog(linearValue); }
  if (transfer == TRANSFER_CANON_LOG2) { return encodeCanonLog2(linearValue); }
  if (transfer == TRANSFER_CANON_LOG3) { return encodeCanonLog3(linearValue); }
  if (transfer == TRANSFER_N_LOG) { return encodeNLog(linearValue); }
  if (transfer == TRANSFER_F_LOG) { return encodeFLog(linearValue); }
  if (transfer == TRANSFER_F_LOG2) { return encodeFLog2(linearValue); }
  if (transfer == TRANSFER_F_LOG2C) { return encodeFLog2(linearValue); }
  if (transfer == TRANSFER_V_LOG) { return vLogEncodeChannel(linearValue); }
  if (transfer == TRANSFER_LOGC3) { return encodeLogC3(linearValue); }
  if (transfer == TRANSFER_LOGC4) { return encodeLogC4(linearValue); }
  if (transfer == TRANSFER_LOG3G10) { return encodeLog3G10(linearValue); }
  if (transfer == TRANSFER_ACESCC) { return encodeACEScc(linearValue); }
  if (transfer == TRANSFER_ACESCCT) { return encodeACEScct(linearValue); }
  if (transfer == TRANSFER_L_LOG) { return encodeLLog(linearValue); }
  if (transfer == TRANSFER_APPLE_LOG) { return encodeAppleLog(linearValue); }
  if (transfer == TRANSFER_DJI_D_LOG) { return encodeDjiDLog(linearValue); }
  return linearValue;
}

fn decodeTransferChannel(encodedValue: f32, transfer: i32) -> f32 {
  if (transfer == TRANSFER_LINEAR) { return encodedValue; }
  if (transfer == TRANSFER_SRGB) { return decodeSrgbTransfer(encodedValue); }
  if (transfer == TRANSFER_BT709) { return decodeBT709(encodedValue); }
  if (transfer == TRANSFER_GAMMA24) { return pow(max(encodedValue, 0.0), 2.4); }
  if (transfer == TRANSFER_S_LOG2) { return decodeSLog2(encodedValue); }
  if (transfer == TRANSFER_S_LOG3) { return decodeSLog3(encodedValue); }
  if (transfer == TRANSFER_CANON_LOG) { return decodeCanonLog(encodedValue); }
  if (transfer == TRANSFER_CANON_LOG2) { return decodeCanonLog2(encodedValue); }
  if (transfer == TRANSFER_CANON_LOG3) { return decodeCanonLog3(encodedValue); }
  if (transfer == TRANSFER_N_LOG) { return decodeNLog(encodedValue); }
  if (transfer == TRANSFER_F_LOG) { return decodeFLog(encodedValue); }
  if (transfer == TRANSFER_F_LOG2) { return decodeFLog2(encodedValue); }
  if (transfer == TRANSFER_F_LOG2C) { return decodeFLog2(encodedValue); }
  if (transfer == TRANSFER_V_LOG) { return vLogDecodeChannel(encodedValue); }
  if (transfer == TRANSFER_LOGC3) { return decodeLogC3(encodedValue); }
  if (transfer == TRANSFER_LOGC4) { return decodeLogC4(encodedValue); }
  if (transfer == TRANSFER_LOG3G10) { return decodeLog3G10(encodedValue); }
  if (transfer == TRANSFER_ACESCC) { return decodeACEScc(encodedValue); }
  if (transfer == TRANSFER_ACESCCT) { return decodeACEScct(encodedValue); }
  if (transfer == TRANSFER_L_LOG) { return decodeLLog(encodedValue); }
  if (transfer == TRANSFER_APPLE_LOG) { return decodeAppleLog(encodedValue); }
  if (transfer == TRANSFER_DJI_D_LOG) { return decodeDjiDLog(encodedValue); }
  return encodedValue;
}

fn encodeTransfer(linearColor: vec3f, transfer: i32) -> vec3f {
  return vec3f(
    encodeTransferChannel(linearColor.r, transfer),
    encodeTransferChannel(linearColor.g, transfer),
    encodeTransferChannel(linearColor.b, transfer)
  );
}

fn decodeTransfer(encodedColor: vec3f, transfer: i32) -> vec3f {
  return vec3f(
    decodeTransferChannel(encodedColor.r, transfer),
    decodeTransferChannel(encodedColor.g, transfer),
    decodeTransferChannel(encodedColor.b, transfer)
  );
}
`

export const LUMA_COLOR_RANGE_WGSL = /* wgsl */ `
const LUT_RANGE_FULL: i32 = 0;
const LUT_RANGE_LEGAL: i32 = 1;
const LUT_RANGE_UNKNOWN: i32 = 2;

fn applySignalRangeForLutInput(color: vec3f, range: i32) -> vec3f {
  if (range == LUT_RANGE_LEGAL) {
    return color * ((940.0 - 64.0) / 1023.0) + vec3f(64.0 / 1023.0);
  }
  return color;
}

fn removeSignalRangeFromLutOutput(color: vec3f, range: i32) -> vec3f {
  if (range == LUT_RANGE_LEGAL) {
    return (color - vec3f(64.0 / 1023.0)) * (1023.0 / (940.0 - 64.0));
  }
  return color;
}
`

export const LUMA_COLOR_BALANCE_WGSL = /* wgsl */ `
fn applyUserColorBalance(color: vec3f, gain: vec3f) -> vec3f {
  return color * gain;
}
`

export const LUMA_COLOR_LUT_WGSL = /* wgsl */ `
const LUT_ROLE_DISPLAY_LOOK: i32 = 0;
const LUT_ROLE_SCENE_CREATIVE: i32 = 1;
const LUT_ROLE_COMBINED_LOOK_OUTPUT: i32 = 2;
const LUT_ROLE_TECHNICAL_OUTPUT: i32 = 3;

fn isSceneCreativeLut() -> bool {
  return params.lutRole == LUT_ROLE_SCENE_CREATIVE;
}

fn isOutputLut() -> bool {
  return params.lutRole == LUT_ROLE_COMBINED_LOOK_OUTPUT || params.lutRole == LUT_ROLE_TECHNICAL_OUTPUT;
}

fn normalizeLutInputChannel(value: f32, domainMin: f32, domainMax: f32) -> f32 {
  let span = domainMax - domainMin;
  if (value != value || span != span || abs(value) > 3.4e38 || abs(span) > 3.4e38 || span <= 0.0) {
    return 0.0;
  }
  return max((value - domainMin) / span, 0.0);
}

fn lutTextureCoordinate(normalizedColor: vec3f) -> vec3f {
  let size = max(params.lutSize, 1.0);
  return (normalizedColor * (size - 1.0) + vec3f(0.5)) / size;
}

fn compressLutInputToDomain(color: vec3f) -> vec3f {
  let normalizedColor = vec3f(
    normalizeLutInputChannel(color.r, params.lutDomainMin.r, params.lutDomainMax.r),
    normalizeLutInputChannel(color.g, params.lutDomainMin.g, params.lutDomainMax.g),
    normalizeLutInputChannel(color.b, params.lutDomainMin.b, params.lutDomainMax.b)
  );
  let peak = max(max(normalizedColor.r, normalizedColor.g), normalizedColor.b);
  let scale = select(1.0, 1.0 / peak, peak > 1.0);
  let compressedColor = normalizedColor * scale;
  return params.lutDomainMin + compressedColor * (params.lutDomainMax - params.lutDomainMin);
}

fn applyLut(color: vec3f) -> vec3f {
  let domainColor = compressLutInputToDomain(color);
  var normalizedColor = vec3f(
    normalizeLutInputChannel(domainColor.r, params.lutDomainMin.r, params.lutDomainMax.r),
    normalizeLutInputChannel(domainColor.g, params.lutDomainMin.g, params.lutDomainMax.g),
    normalizeLutInputChannel(domainColor.b, params.lutDomainMin.b, params.lutDomainMax.b)
  );
  normalizedColor = clamp(normalizedColor, vec3f(0.0), vec3f(1.0));
  return textureSampleLevel(lutTexture, lutSampler, lutTextureCoordinate(normalizedColor), 0.0).rgb;
}

fn applyDisplayLut(sceneLinearProPhoto: vec3f) -> vec3f {
  let displayLinear = max(linearProPhotoToLinearSrgb(sceneLinearProPhoto), vec3f(0.0));
  let lutInputEncoded = encodeTransfer(displayLinear, params.lutInputTransfer);
  let lutInput = applySignalRangeForLutInput(lutInputEncoded, params.lutInputRange);
  let lutOutputEncoded = removeSignalRangeFromLutOutput(applyLut(lutInput), params.lutOutputRange);
  let displayLinearOutput = decodeTransfer(lutOutputEncoded, params.lutOutputTransfer);
  return linearToSrgb(displayLinearOutput);
}

fn applySceneLutToDisplayLinear(sceneLinearProPhoto: vec3f) -> vec3f {
  let lutInputLinear = params.inputToLutGamut * sceneLinearProPhoto;
  let lutInputEncoded = applySignalRangeForLutInput(encodeTransfer(lutInputLinear, params.lutInputTransfer), params.lutInputRange);
  let lutOutputEncoded = removeSignalRangeFromLutOutput(applyLut(lutInputEncoded), params.lutOutputRange);
  let lutOutputLinear = decodeTransfer(lutOutputEncoded, params.lutOutputTransfer);
  return max(params.lutOutputToDisplayGamut * lutOutputLinear, vec3f(0.0));
}

fn applyCombinedOutputLut(sceneLinearProPhoto: vec3f) -> vec3f {
  let lutInputLinear = params.inputToLutGamut * sceneLinearProPhoto;
  let lutInputEncoded = applySignalRangeForLutInput(encodeTransfer(lutInputLinear, params.lutInputTransfer), params.lutInputRange);
  let lutOutputEncoded = removeSignalRangeFromLutOutput(applyLut(lutInputEncoded), params.lutOutputRange);
  let displayLinear = max(params.lutOutputToDisplayGamut * decodeTransfer(lutOutputEncoded, params.lutOutputTransfer), vec3f(0.0));
  return linearToSrgb(displayLinear);
}
`

export const LUMA_COLOR_TONE_WGSL = /* wgsl */ `
const LINEAR_PROPHOTO_LUMINANCE: vec3f = vec3f(0.2880402, 0.7118741, 0.0000857);
const USER_CONTRAST_PIVOT: f32 = 0.18;
const USER_REGIONAL_TONE_PIVOT: f32 = 0.18;

fn applyUserExposure(sceneLinear: vec3f, exposureMultiplier: f32) -> vec3f {
  return sceneLinear * exposureMultiplier;
}

fn applyUserContrast(exposedSceneLinear: vec3f, contrastAmount: f32, contrastFactor: f32) -> vec3f {
  if (contrastAmount == 0.0) {
    return exposedSceneLinear;
  }
  let contrastInput = max(exposedSceneLinear, vec3f(0.0));
  let y = dot(contrastInput, LINEAR_PROPHOTO_LUMINANCE);
  if (y <= 0.0) {
    return vec3f(0.0);
  }
  let targetY = USER_CONTRAST_PIVOT * pow(y / USER_CONTRAST_PIVOT, contrastFactor);
  return contrastInput * (targetY / y);
}

fn regionalAmountToEv(amount: f32, maxAbsEv: f32) -> f32 {
  return (amount / 100.0) * maxAbsEv;
}

fn regionalToneEvFromLuminance(luminance: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32) -> f32 {
  if (highlights == 0.0 && shadows == 0.0 && whites == 0.0 && blacks == 0.0) {
    return 0.0;
  }
  if (luminance <= 0.0) {
    return 0.0;
  }
  let logLuminance = log2(luminance / USER_REGIONAL_TONE_PIVOT);
  let highlightsMask = smoothstep(-1.0, 3.0, logLuminance);
  let shadowsMask = 1.0 - smoothstep(-4.0, 1.0, logLuminance);
  let whitesMask = smoothstep(2.0, 5.5, logLuminance);
  let blacksMask = 1.0 - smoothstep(-8.0, -3.0, logLuminance);
  return
    highlightsMask * regionalAmountToEv(highlights, 1.25) +
    shadowsMask * regionalAmountToEv(shadows, 1.25) +
    whitesMask * regionalAmountToEv(whites, 1.0) +
    blacksMask * regionalAmountToEv(blacks, 1.0);
}

fn applyUserRegionalTone(contrastedSceneLinear: vec3f, highlights: f32, shadows: f32, whites: f32, blacks: f32) -> vec3f {
  if (highlights == 0.0 && shadows == 0.0 && whites == 0.0 && blacks == 0.0) {
    return contrastedSceneLinear;
  }
  let regionalInput = max(contrastedSceneLinear, vec3f(0.0));
  let y = dot(regionalInput, LINEAR_PROPHOTO_LUMINANCE);
  if (y <= 0.0) {
    return vec3f(0.0);
  }
  let ev = regionalToneEvFromLuminance(y, highlights, shadows, whites, blacks);
  return regionalInput * exp2(ev);
}

fn applyUserTone(sceneLinear: vec3f, exposureMultiplier: f32, contrastAmount: f32, contrastFactor: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32) -> vec3f {
  return applyUserRegionalTone(
    applyUserContrast(
      applyUserExposure(sceneLinear, exposureMultiplier),
      contrastAmount,
      contrastFactor
    ),
    highlights,
    shadows,
    whites,
    blacks
  );
}
`
