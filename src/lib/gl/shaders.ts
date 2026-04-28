/**
 * GLSL shader source code for the phase-1 RAW processing pipeline.
 * The product path is intentionally small: original preview, style input prep,
 * optional LUT, and finite intensity mixing.
 */

/**
 * Common vertex shader for full-screen quad rendering.
 */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`

/**
 * Main fragment shader for the phase-1 RAW processing pipeline.
 */
const PROCESS_FRAGMENT_SHADER_HEADER = /* glsl */ `
precision highp float;
precision highp sampler3D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler3D u_lutTexture;
uniform bool u_useLut;
uniform vec3 u_lutDomainMin;
uniform vec3 u_lutDomainMax;
uniform float u_intensity;
uniform float u_rawRenderExposureMultiplier;
uniform int u_viewMode;
uniform float u_compareSplit;
uniform int u_styleKind;
uniform int u_builtinPreset;
uniform mat3 u_inputToLutGamut;
uniform mat3 u_lutOutputToDisplayGamut;
uniform int u_lutInputTransfer;
uniform int u_lutOutputTransfer;
uniform int u_lutRole;
uniform int u_lutInputRange;
uniform int u_lutOutputRange;
`

const PROCESS_FRAGMENT_SHADER_BODY = /* glsl */ `
const int VIEW_MODE_PROCESSED = 0;
const int VIEW_MODE_ORIGINAL = 1;
const int VIEW_MODE_COMPARE = 2;
const int STYLE_NONE = 0;
const int STYLE_BUILTIN = 1;
const int STYLE_CUSTOM = 2;
const int LUT_ROLE_DISPLAY_LOOK = 0;
const int LUT_ROLE_SCENE_CREATIVE = 1;
const int LUT_ROLE_COMBINED_LOOK_OUTPUT = 2;
const int LUT_ROLE_TECHNICAL_OUTPUT = 3;
const int LUT_RANGE_FULL = 0;
const int LUT_RANGE_LEGAL = 1;
const int LUT_RANGE_UNKNOWN = 2;
const int TRANSFER_SRGB = 0;
const int TRANSFER_BT709 = 1;
const int TRANSFER_GAMMA24 = 2;
const int TRANSFER_S_LOG2 = 3;
const int TRANSFER_S_LOG3 = 4;
const int TRANSFER_CANON_LOG = 5;
const int TRANSFER_CANON_LOG2 = 6;
const int TRANSFER_CANON_LOG3 = 7;
const int TRANSFER_N_LOG = 8;
const int TRANSFER_F_LOG = 9;
const int TRANSFER_F_LOG2 = 10;
const int TRANSFER_F_LOG2C = 11;
const int TRANSFER_V_LOG = 12;
const int TRANSFER_LOGC3 = 13;
const int TRANSFER_LOGC4 = 14;
const int TRANSFER_LOG3G10 = 15;
const int TRANSFER_ACESCC = 16;
const int TRANSFER_ACESCCT = 17;
const int TRANSFER_L_LOG = 18;
const int TRANSFER_LINEAR = 19;

vec3 clamp01(vec3 color) {
  return clamp(color, 0.0, 1.0);
}

vec3 srgbToLinear(vec3 color) {
  color = clamp01(color);
  vec3 lower = color / 12.92;
  vec3 higher = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
  vec3 lowerMix = 1.0 - step(vec3(0.04045), color);
  return mix(higher, lower, lowerMix);
}

vec3 linearToSrgb(vec3 color) {
  color = max(color, vec3(0.0));
  vec3 lower = color * 12.92;
  vec3 higher = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  vec3 lowerMix = 1.0 - step(vec3(0.0031308), color);
  return clamp01(mix(higher, lower, lowerMix));
}

float encodeBT709(float linearValue) {
  float value = max(linearValue, 0.0);
  if (value <= 0.018) {
    return 4.5 * value;
  }
  return 1.099 * pow(value, 0.45) - 0.099;
}

float decodeBT709(float encodedValue) {
  float value = max(encodedValue, 0.0);
  if (value <= 0.081) {
    return value / 4.5;
  }
  return pow((value + 0.099) / 1.099, 1.0 / 0.45);
}

float luminance709(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 adjustSaturation(vec3 color, float amount) {
  float luma = luminance709(color);
  return max(mix(vec3(luma), color, amount), vec3(0.0));
}

vec3 adjustContrast(vec3 color, float amount, float pivot) {
  return max((color - vec3(pivot)) * amount + vec3(pivot), vec3(0.0));
}

vec3 applyWarmCool(vec3 color, vec3 balance) {
  return max(color * balance, vec3(0.0));
}

vec3 applyBuiltinStyle(vec3 displayColor) {
  vec3 color = srgbToLinear(displayColor);

  if (u_builtinPreset == 1) {
    color = applyWarmCool(color, vec3(1.07, 1.01, 0.94));
    color = adjustContrast(color, 1.05, 0.18);
    color = adjustSaturation(color, 1.06);
  } else if (u_builtinPreset == 2) {
    color = applyWarmCool(color, vec3(0.94, 1.01, 1.09));
    color = adjustContrast(color, 1.04, 0.18);
    color = adjustSaturation(color, 1.04);
  } else if (u_builtinPreset == 3) {
    color = applyWarmCool(color, vec3(1.03, 1.00, 0.98));
    color = adjustContrast(color, 0.94, 0.18);
    color = adjustSaturation(color, 0.95);
    color += vec3(0.012) * (1.0 - smoothstep(0.0, 0.26, color));
  } else if (u_builtinPreset == 4) {
    color = adjustContrast(color, 1.18, 0.18);
    color = adjustSaturation(color, 1.08);
    color = pow(max(color, vec3(0.0)), vec3(0.96));
  } else if (u_builtinPreset == 5) {
    float luma = luminance709(color);
    vec3 shadowTint = vec3(0.93, 1.02, 1.10);
    vec3 highlightTint = vec3(1.08, 1.02, 0.94);
    color *= mix(shadowTint, highlightTint, smoothstep(0.18, 0.75, luma));
    color = adjustContrast(color, 1.1, 0.18);
    color = adjustSaturation(color, 0.92);
  } else if (u_builtinPreset == 6) {
    color = adjustContrast(color, 0.86, 0.18);
    color = adjustSaturation(color, 0.88);
    color = color * 0.94 + vec3(0.026);
  } else if (u_builtinPreset == 7) {
    float luma = luminance709(color);
    color = vec3(luma);
    color = adjustContrast(color, 1.12, 0.18);
  } else {
    color = adjustContrast(color, 1.02, 0.18);
    color = adjustSaturation(color, 1.01);
  }

  return linearToSrgb(color);
}

float encodeSLog2(float linearValue) {
  float reflectedLinear = 0.9 * max(linearValue, 0.0);
  return 0.432699 * (log(reflectedLinear + 0.037584) / log(10.0)) + 0.616596 + 0.03;
}

float decodeSLog2(float encodedValue) {
  return (pow(10.0, (encodedValue - 0.03 - 0.616596) / 0.432699) - 0.037584) / 0.9;
}

float encodeSLog3(float linearValue) {
  float value = max(linearValue, 0.0);
  if (value >= 0.01125) {
    return (420.0 + (log((value + 0.01) / 0.19) / log(10.0)) * 261.5) / 1023.0;
  }
  return ((value * (171.2102946929 - 95.0)) / 0.01125 + 95.0) / 1023.0;
}

float decodeSLog3(float encodedValue) {
  float x = encodedValue * 1023.0;
  if (x >= 171.2102946929) {
    return pow(10.0, (x - 420.0) / 261.5) * 0.19 - 0.01;
  }
  return ((x - 95.0) * 0.01125) / (171.2102946929 - 95.0);
}

float encodeCanonLog(float linearValue) {
  if (linearValue < 0.0) {
    return -0.529136 * (log(-10.1596 * linearValue + 1.0) / log(10.0)) + 0.0730597;
  }
  return 0.529136 * (log(10.1596 * linearValue + 1.0) / log(10.0)) + 0.0730597;
}

float decodeCanonLog(float encodedValue) {
  if (encodedValue < 0.0730597) {
    return -(pow(10.0, (0.0730597 - encodedValue) / 0.529136) - 1.0) / 10.1596;
  }
  return (pow(10.0, (encodedValue - 0.0730597) / 0.529136) - 1.0) / 10.1596;
}

float encodeCanonLog2(float linearValue) {
  if (linearValue < 0.0) {
    return -0.24136077 * (log(1.0 - (87.099375 * linearValue) / 0.9) / log(10.0)) + 0.092864125;
  }
  return 0.24136077 * (log(1.0 + (87.099375 * linearValue) / 0.9) / log(10.0)) + 0.092864125;
}

float decodeCanonLog2(float encodedValue) {
  if (encodedValue < 0.092864125) {
    return (0.9 * (1.0 - pow(10.0, (0.092864125 - encodedValue) / 0.24136077))) / 87.099375;
  }
  return (0.9 * (pow(10.0, (encodedValue - 0.092864125) / 0.24136077) - 1.0)) / 87.099375;
}

float encodeCanonLog3(float linearValue) {
  if (linearValue < -0.0126) {
    return -0.36726845 * (log(1.0 - (14.98325 * linearValue) / 0.9) / log(10.0)) + 0.12783901;
  }
  if (linearValue <= 0.0126) {
    return (linearValue * 1.9754798) / 0.9 + 0.12512219;
  }
  return 0.36726845 * (log(1.0 + (14.98325 * linearValue) / 0.9) / log(10.0)) + 0.12240537;
}

float decodeCanonLog3(float encodedValue) {
  if (encodedValue < 0.097465473) {
    return (0.9 * (1.0 - pow(10.0, (0.12783901 - encodedValue) / 0.36726845))) / 14.98325;
  }
  if (encodedValue <= 0.15277891) {
    return (0.9 * (encodedValue - 0.12512219)) / 1.9754798;
  }
  return (0.9 * (pow(10.0, (encodedValue - 0.12240537) / 0.36726845) - 1.0)) / 14.98325;
}

float encodeNLog(float linearValue) {
  float value = max(linearValue, 0.0);
  if (value < 0.328) {
    return pow(value, 1.0 / 3.0) * (650.0 / 1023.0) + 0.0075;
  }
  return log(value) * (150.0 / 1023.0) + (619.0 / 1023.0);
}

float decodeNLog(float encodedValue) {
  float cut = pow(0.328, 1.0 / 3.0) * (650.0 / 1023.0) + 0.0075;
  if (encodedValue < cut) {
    return pow(max((encodedValue - 0.0075) / (650.0 / 1023.0), 0.0), 3.0);
  }
  return exp((encodedValue - (619.0 / 1023.0)) / (150.0 / 1023.0));
}

float encodeFLog(float linearValue) {
  if (linearValue < 0.00089) {
    return 8.735631 * linearValue + 0.092864;
  }
  return 0.344676 * (log(0.555556 * linearValue + 0.009468) / log(10.0)) + 0.790453;
}

float decodeFLog(float encodedValue) {
  if (encodedValue < 0.100537775223865) {
    return (encodedValue - 0.092864) / 8.735631;
  }
  return (pow(10.0, (encodedValue - 0.790453) / 0.344676) - 0.009468) / 0.555556;
}

float encodeFLog2(float linearValue) {
  if (linearValue < 0.000889) {
    return 8.799461 * linearValue + 0.092864;
  }
  return 0.245281 * (log(5.555556 * linearValue + 0.064829) / log(10.0)) + 0.384316;
}

float decodeFLog2(float encodedValue) {
  if (encodedValue < 0.100686685370811) {
    return (encodedValue - 0.092864) / 8.799461;
  }
  return (pow(10.0, (encodedValue - 0.384316) / 0.245281) - 0.064829) / 5.555556;
}

float vLogEncodeChannel(float linearValue) {
  float value = max(linearValue, 0.0);
  if (value < 0.01) {
    return 5.6 * value + 0.125;
  }
  return 0.241514 * (log(value + 0.00873) / log(10.0)) + 0.598206;
}

float vLogDecodeChannel(float encodedValue) {
  if (encodedValue < 0.181) {
    return (encodedValue - 0.125) / 5.6;
  }
  return pow(10.0, (encodedValue - 0.598206) / 0.241514) - 0.00873;
}

float encodeLogC3(float linearValue) {
  if (linearValue > 0.010591) {
    return 0.24719 * (log(5.555556 * linearValue + 0.052272) / log(10.0)) + 0.385537;
  }
  return 5.367655 * linearValue + 0.092809;
}

float decodeLogC3(float encodedValue) {
  if (encodedValue > 0.1496) {
    return (pow(10.0, (encodedValue - 0.385537) / 0.24719) - 0.052272) / 5.555556;
  }
  return (encodedValue - 0.092809) / 5.367655;
}

float encodeLogC4(float linearValue) {
  float a = (262144.0 - 16.0) / 117.45;
  float b = (1023.0 - 95.0) / 1023.0;
  float c = 95.0 / 1023.0;
  float s = (7.0 * log(2.0) * pow(2.0, 7.0 - (14.0 * c) / b)) / (a * b);
  float t = (pow(2.0, 14.0 * (-c / b) + 6.0) - 64.0) / a;
  if (linearValue < t) {
    return (linearValue - t) / s;
  }
  return ((log2(a * linearValue + 64.0) - 6.0) / 14.0) * b + c;
}

float decodeLogC4(float encodedValue) {
  float a = (262144.0 - 16.0) / 117.45;
  float b = (1023.0 - 95.0) / 1023.0;
  float c = 95.0 / 1023.0;
  float s = (7.0 * log(2.0) * pow(2.0, 7.0 - (14.0 * c) / b)) / (a * b);
  float t = (pow(2.0, 14.0 * (-c / b) + 6.0) - 64.0) / a;
  if (encodedValue < 0.0) {
    return encodedValue * s + t;
  }
  return (pow(2.0, (14.0 * (encodedValue - c)) / b + 6.0) - 64.0) / a;
}

float encodeLog3G10(float linearValue) {
  float y = linearValue + 0.01;
  if (y < 0.0) return y * 15.1927;
  return 0.224282 * (log(155.975327 * y + 1.0) / log(10.0));
}

float decodeLog3G10(float encodedValue) {
  if (encodedValue < 0.0) return encodedValue / 15.1927 - 0.01;
  return (pow(10.0, encodedValue / 0.224282) - 1.0) / 155.975327 - 0.01;
}

float encodeACEScc(float linearValue) {
  if (linearValue <= 0.0) {
    return (-16.0 + 9.72) / 17.52;
  }
  if (linearValue < pow(2.0, -15.0)) {
    return (log2(pow(2.0, -16.0) + linearValue * 0.5) + 9.72) / 17.52;
  }
  return (log2(linearValue) + 9.72) / 17.52;
}

float decodeACEScc(float encodedValue) {
  float cut = (-15.0 + 9.72) / 17.52;
  if (encodedValue <= cut) {
    return (pow(2.0, encodedValue * 17.52 - 9.72) - pow(2.0, -16.0)) * 2.0;
  }
  return pow(2.0, encodedValue * 17.52 - 9.72);
}

float encodeACEScct(float linearValue) {
  if (linearValue <= 0.0078125) {
    return 10.5402377416545 * linearValue + 0.0729055341958355;
  }
  return (log2(linearValue) + 9.72) / 17.52;
}

float decodeACEScct(float encodedValue) {
  if (encodedValue <= 0.155251141552511) {
    return (encodedValue - 0.0729055341958355) / 10.5402377416545;
  }
  return pow(2.0, encodedValue * 17.52 - 9.72);
}

float encodeLLog(float linearValue) {
  float value = max(linearValue, 0.0);
  if (value < 0.006) {
    return 8.0 * value;
  }
  return 0.233161 * (log(value / 0.006 + 1.0) / log(10.0)) + 0.048;
}

float decodeLLog(float encodedValue) {
  if (encodedValue < 0.048) {
    return max(encodedValue / 8.0, 0.0);
  }
  return 0.006 * (pow(10.0, (encodedValue - 0.048) / 0.233161) - 1.0);
}

float encodeTransferChannel(float linearValue, int transfer) {
  if (transfer == TRANSFER_LINEAR) return linearValue;
  if (transfer == TRANSFER_SRGB) return linearToSrgb(vec3(linearValue)).r;
  if (transfer == TRANSFER_BT709) return encodeBT709(linearValue);
  if (transfer == TRANSFER_GAMMA24) return pow(max(linearValue, 0.0), 1.0 / 2.4);
  if (transfer == TRANSFER_S_LOG2) return encodeSLog2(linearValue);
  if (transfer == TRANSFER_S_LOG3) return encodeSLog3(linearValue);
  if (transfer == TRANSFER_CANON_LOG) return encodeCanonLog(linearValue);
  if (transfer == TRANSFER_CANON_LOG2) return encodeCanonLog2(linearValue);
  if (transfer == TRANSFER_CANON_LOG3) return encodeCanonLog3(linearValue);
  if (transfer == TRANSFER_N_LOG) return encodeNLog(linearValue);
  if (transfer == TRANSFER_F_LOG) return encodeFLog(linearValue);
  if (transfer == TRANSFER_F_LOG2) return encodeFLog2(linearValue);
  if (transfer == TRANSFER_F_LOG2C) return encodeFLog2(linearValue);
  if (transfer == TRANSFER_V_LOG) return vLogEncodeChannel(linearValue);
  if (transfer == TRANSFER_LOGC3) return encodeLogC3(linearValue);
  if (transfer == TRANSFER_LOGC4) return encodeLogC4(linearValue);
  if (transfer == TRANSFER_LOG3G10) return encodeLog3G10(linearValue);
  if (transfer == TRANSFER_ACESCC) return encodeACEScc(linearValue);
  if (transfer == TRANSFER_ACESCCT) return encodeACEScct(linearValue);
  if (transfer == TRANSFER_L_LOG) return encodeLLog(linearValue);
  return linearValue;
}

float decodeTransferChannel(float encodedValue, int transfer) {
  if (transfer == TRANSFER_LINEAR) return encodedValue;
  if (transfer == TRANSFER_SRGB) return srgbToLinear(vec3(encodedValue)).r;
  if (transfer == TRANSFER_BT709) return decodeBT709(encodedValue);
  if (transfer == TRANSFER_GAMMA24) return pow(max(encodedValue, 0.0), 2.4);
  if (transfer == TRANSFER_S_LOG2) return decodeSLog2(encodedValue);
  if (transfer == TRANSFER_S_LOG3) return decodeSLog3(encodedValue);
  if (transfer == TRANSFER_CANON_LOG) return decodeCanonLog(encodedValue);
  if (transfer == TRANSFER_CANON_LOG2) return decodeCanonLog2(encodedValue);
  if (transfer == TRANSFER_CANON_LOG3) return decodeCanonLog3(encodedValue);
  if (transfer == TRANSFER_N_LOG) return decodeNLog(encodedValue);
  if (transfer == TRANSFER_F_LOG) return decodeFLog(encodedValue);
  if (transfer == TRANSFER_F_LOG2) return decodeFLog2(encodedValue);
  if (transfer == TRANSFER_F_LOG2C) return decodeFLog2(encodedValue);
  if (transfer == TRANSFER_V_LOG) return vLogDecodeChannel(encodedValue);
  if (transfer == TRANSFER_LOGC3) return decodeLogC3(encodedValue);
  if (transfer == TRANSFER_LOGC4) return decodeLogC4(encodedValue);
  if (transfer == TRANSFER_LOG3G10) return decodeLog3G10(encodedValue);
  if (transfer == TRANSFER_ACESCC) return decodeACEScc(encodedValue);
  if (transfer == TRANSFER_ACESCCT) return decodeACEScct(encodedValue);
  if (transfer == TRANSFER_L_LOG) return decodeLLog(encodedValue);
  return encodedValue;
}

vec3 encodeTransfer(vec3 linearColor, int transfer) {
  return clamp01(vec3(
    encodeTransferChannel(linearColor.r, transfer),
    encodeTransferChannel(linearColor.g, transfer),
    encodeTransferChannel(linearColor.b, transfer)
  ));
}

vec3 decodeTransfer(vec3 encodedColor, int transfer) {
  return vec3(
    decodeTransferChannel(encodedColor.r, transfer),
    decodeTransferChannel(encodedColor.g, transfer),
    decodeTransferChannel(encodedColor.b, transfer)
  );
}

vec3 applySignalRangeForLutInput(vec3 color, int range) {
  if (range == LUT_RANGE_LEGAL) {
    return color * ((940.0 - 64.0) / 1023.0) + vec3(64.0 / 1023.0);
  }
  return color;
}

vec3 removeSignalRangeFromLutOutput(vec3 color, int range) {
  if (range == LUT_RANGE_LEGAL) {
    return (color - vec3(64.0 / 1023.0)) * (1023.0 / (940.0 - 64.0));
  }
  return color;
}

vec3 applyLut(vec3 color) {
  vec3 normalizedColor = (color - u_lutDomainMin) / (u_lutDomainMax - u_lutDomainMin);
  normalizedColor = clamp(normalizedColor, 0.0, 1.0);
  return texture(u_lutTexture, normalizedColor).rgb;
}

vec3 applyDisplayLut(vec3 sceneLinearProPhoto) {
  vec3 displayLinear = max(linearProPhotoToLinearSrgb(sceneLinearProPhoto), vec3(0.0));
  vec3 lutInputEncoded = encodeTransfer(displayLinear, u_lutInputTransfer);
  vec3 lutInput = applySignalRangeForLutInput(lutInputEncoded, u_lutInputRange);
  vec3 lutOutputEncoded = removeSignalRangeFromLutOutput(applyLut(lutInput), u_lutOutputRange);
  vec3 displayLinearOutput = max(decodeTransfer(lutOutputEncoded, u_lutOutputTransfer), vec3(0.0));
  return linearToSrgb(displayLinearOutput);
}

vec3 applySceneLutToDisplayLinear(vec3 sceneLinearProPhoto) {
  vec3 lutInputLinear = max(u_inputToLutGamut * sceneLinearProPhoto, vec3(0.0));
  vec3 lutInputEncoded = applySignalRangeForLutInput(encodeTransfer(lutInputLinear, u_lutInputTransfer), u_lutInputRange);
  vec3 lutOutputEncoded = removeSignalRangeFromLutOutput(applyLut(lutInputEncoded), u_lutOutputRange);
  vec3 lutOutputLinear = max(decodeTransfer(lutOutputEncoded, u_lutOutputTransfer), vec3(0.0));
  return max(u_lutOutputToDisplayGamut * lutOutputLinear, vec3(0.0));
}

vec3 applyCombinedOutputLut(vec3 sceneLinearProPhoto) {
  vec3 lutInputLinear = max(u_inputToLutGamut * sceneLinearProPhoto, vec3(0.0));
  vec3 lutInputEncoded = applySignalRangeForLutInput(encodeTransfer(lutInputLinear, u_lutInputTransfer), u_lutInputRange);
  vec3 lutOutputEncoded = removeSignalRangeFromLutOutput(applyLut(lutInputEncoded), u_lutOutputRange);
  vec3 displayLinear = max(u_lutOutputToDisplayGamut * decodeTransfer(lutOutputEncoded, u_lutOutputTransfer), vec3(0.0));
  return linearToSrgb(displayLinear);
}

void main() {
  vec3 baseSceneLinearProPhoto = max(readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier, vec3(0.0));
  vec3 baseDisplayLinear = linearProPhotoToLinearSrgb(baseSceneLinearProPhoto);
  vec3 baseDisplayColor = linearToSrgb(baseDisplayLinear);
  vec3 styledColor = baseDisplayColor;
  float intensity = clamp(u_intensity, 0.0, 1.0);

  if (u_styleKind == STYLE_BUILTIN) {
    styledColor = mix(baseDisplayColor, applyBuiltinStyle(baseDisplayColor), intensity);
  } else if (u_styleKind == STYLE_CUSTOM && u_useLut) {
    if (u_lutRole == LUT_ROLE_SCENE_CREATIVE) {
      vec3 styledDisplayLinear = applySceneLutToDisplayLinear(baseSceneLinearProPhoto);
      vec3 mixedDisplayLinear = mix(baseDisplayLinear, styledDisplayLinear, intensity);
      styledColor = linearToSrgb(mixedDisplayLinear);
    } else if (u_lutRole == LUT_ROLE_COMBINED_LOOK_OUTPUT || u_lutRole == LUT_ROLE_TECHNICAL_OUTPUT) {
      styledColor = mix(baseDisplayColor, applyCombinedOutputLut(baseSceneLinearProPhoto), intensity);
    } else {
      styledColor = mix(baseDisplayColor, applyDisplayLut(baseSceneLinearProPhoto), intensity);
    }
  }

  if (u_viewMode == VIEW_MODE_ORIGINAL) {
    styledColor = baseDisplayColor;
  } else if (u_viewMode == VIEW_MODE_COMPARE) {
    float finalSide = step(clamp(u_compareSplit, 0.0, 1.0), v_texCoord.x);
    styledColor = mix(baseDisplayColor, styledColor, finalSide);
  }

  fragColor = vec4(clamp01(styledColor), 1.0);
}
`

export const PROCESS_FRAGMENT_SHADER_FLOAT = /* glsl */ `#version 300 es
precision highp sampler2D;
${PROCESS_FRAGMENT_SHADER_HEADER}

uniform sampler2D u_inputTexture;

vec3 srgbToLinear(vec3 color);
vec3 linearToSrgb(vec3 color);

vec3 linearProPhotoToLinearSrgb(vec3 color) {
  return color;
}

vec3 linearProPhotoToDisplaySrgb(vec3 color) {
  return linearToSrgb(color);
}

vec3 readInputSceneLinearProPhoto(vec2 uv) {
  return srgbToLinear(texture(u_inputTexture, uv).rgb);
}

${PROCESS_FRAGMENT_SHADER_BODY}
`

export const PROCESS_FRAGMENT_SHADER_U16 = /* glsl */ `#version 300 es
precision highp usampler2D;
${PROCESS_FRAGMENT_SHADER_HEADER}

uniform usampler2D u_inputTexture;

// Generated from src/lib/color/matrix.ts for ProPhoto RGB D50 -> sRGB D65
// with Bradford chromatic adaptation. Input values are already linear.
vec3 linearProPhotoToLinearSrgb(vec3 color) {
  return vec3(
    dot(color, vec3(2.034367543, -0.727634474, -0.306733069)),
    dot(color, vec3(-0.228826798, 1.231753396, -0.002926598)),
    dot(color, vec3(-0.008558424, -0.153268204, 1.161826628))
  );
}

vec3 linearSrgbToDisplaySrgb(vec3 color) {
  color = max(color, vec3(0.0));
  vec3 lower = color * 12.92;
  vec3 higher = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  vec3 lowerMix = 1.0 - step(vec3(0.0031308), color);
  return clamp(mix(higher, lower, lowerMix), 0.0, 1.0);
}

vec3 linearProPhotoToDisplaySrgb(vec3 color) {
  return linearSrgbToDisplaySrgb(linearProPhotoToLinearSrgb(color));
}

vec3 readInputSceneLinearProPhoto(vec2 uv) {
  highp uvec3 color = texture(u_inputTexture, uv).rgb;
  vec3 linearProPhoto = vec3(color) / 65535.0;
  return linearProPhoto;
}

${PROCESS_FRAGMENT_SHADER_BODY}
`

/**
 * Preview output shader - maps the processed texture to the display canvas.
 */
export const PREVIEW_OUTPUT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;

void main() {
  vec2 displayTexCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
  vec3 color = texture(u_inputTexture, displayTexCoord).rgb;

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

/**
 * Passthrough shader for debugging.
 */
export const PASSTHROUGH_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;

void main() {
  fragColor = texture(u_inputTexture, v_texCoord);
}
`

/**
 * Export shader - outputs the processed pixels directly.
 */
export const EXPORT_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;

void main() {
  fragColor = texture(u_inputTexture, v_texCoord);
}
`
