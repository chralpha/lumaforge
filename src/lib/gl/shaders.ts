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
export const PROCESS_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;
uniform sampler3D u_lutTexture;
uniform bool u_useLut;
uniform vec3 u_lutDomainMin;
uniform vec3 u_lutDomainMax;
uniform float u_intensity;
uniform int u_styleKind;
uniform int u_builtinPreset;
uniform int u_lutInputProfile;

const int STYLE_NONE = 0;
const int STYLE_BUILTIN = 1;
const int STYLE_CUSTOM = 2;
const int LUT_INPUT_DISPLAY_SRGB = 0;
const int LUT_INPUT_V_LOG = 1;

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

vec3 rec709LinearToVGamutLinear(vec3 color) {
  return vec3(
    dot(color, vec3(0.585196147, 0.322641622, 0.092162231)),
    dot(color, vec3(0.078588567, 0.819627115, 0.101784318)),
    dot(color, vec3(0.022794238, 0.114217024, 0.862988738))
  );
}

float vLogEncodeChannel(float linearValue) {
  float value = max(linearValue, 0.0);
  if (value < 0.01) {
    return 5.6 * value + 0.125;
  }
  return 0.241514 * (log(value + 0.00873) / log(10.0)) + 0.598206;
}

vec3 encodeVLog(vec3 linearColor) {
  return clamp01(vec3(
    vLogEncodeChannel(linearColor.r),
    vLogEncodeChannel(linearColor.g),
    vLogEncodeChannel(linearColor.b)
  ));
}

vec3 prepareLutInput(vec3 displayColor) {
  if (u_lutInputProfile == LUT_INPUT_V_LOG) {
    vec3 linearColor = srgbToLinear(displayColor);
    vec3 vlogGamut = rec709LinearToVGamutLinear(linearColor);
    return encodeVLog(vlogGamut);
  }

  return displayColor;
}

vec3 applyLut(vec3 color) {
  vec3 normalizedColor = (color - u_lutDomainMin) / (u_lutDomainMax - u_lutDomainMin);
  normalizedColor = clamp(normalizedColor, 0.0, 1.0);
  return texture(u_lutTexture, normalizedColor).rgb;
}

void main() {
  vec3 baseColor = clamp01(texture(u_inputTexture, v_texCoord).rgb);
  vec3 styledColor = baseColor;
  float intensity = clamp(u_intensity, 0.0, 1.0);

  if (u_styleKind == STYLE_BUILTIN) {
    styledColor = applyBuiltinStyle(baseColor);
  } else if (u_styleKind == STYLE_CUSTOM && u_useLut) {
    vec3 lutInput = prepareLutInput(baseColor);
    styledColor = clamp01(applyLut(lutInput));
  }

  fragColor = vec4(clamp01(mix(baseColor, styledColor, intensity)), 1.0);
}
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
