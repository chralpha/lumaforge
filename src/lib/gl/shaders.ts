import {
  LUMA_COLOR_BALANCE_GLSL,
  LUMA_COLOR_LUT_GLSL,
  LUMA_COLOR_OKLAB_GLSL,
  LUMA_COLOR_RANGE_GLSL,
  LUMA_COLOR_SELECTIVE_COLOR_GLSL,
  LUMA_COLOR_TONE_GLSL,
  LUMA_COLOR_TRANSFER_GLSL,
  LUMA_COLOR_USER_SATURATION_GLSL,
} from '@lumaforge/luma-color-runtime/glsl'

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
uniform float u_lutSize;
uniform vec3 u_lutDomainMin;
uniform vec3 u_lutDomainMax;
uniform float u_intensity;
uniform float u_rawRenderExposureMultiplier;
uniform vec3 u_userColorBalanceGain;
uniform float u_userExposureMultiplier;
uniform float u_userContrastAmount;
uniform float u_userContrastFactor;
uniform float u_userHighlights;
uniform float u_userShadows;
uniform float u_userWhites;
uniform float u_userBlacks;
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
uniform sampler2D u_selectiveColorLUT;
uniform vec2 u_selectiveColorChromaClamp;
uniform bool u_selectiveColorActive;
uniform float u_userSaturation;
uniform float u_userVibrance;
`

const PROCESS_FRAGMENT_SHADER_BODY = /* glsl */ `
const int VIEW_MODE_PROCESSED = 0;
const int VIEW_MODE_ORIGINAL = 1;
const int VIEW_MODE_COMPARE = 2;
const int STYLE_NONE = 0;
const int STYLE_BUILTIN = 1;
const int STYLE_CUSTOM = 2;

${LUMA_COLOR_TRANSFER_GLSL}
${LUMA_COLOR_RANGE_GLSL}
${LUMA_COLOR_LUT_GLSL}
${LUMA_COLOR_BALANCE_GLSL}
${LUMA_COLOR_TONE_GLSL}
${LUMA_COLOR_OKLAB_GLSL}
${LUMA_COLOR_SELECTIVE_COLOR_GLSL}
${LUMA_COLOR_USER_SATURATION_GLSL}

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
void main() {
  vec3 technicalBaseSceneLinearProPhoto =
    readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier;
  vec3 colorBalancedSceneLinearProPhoto = applyUserColorBalance(
    technicalBaseSceneLinearProPhoto,
    u_userColorBalanceGain
  );
  vec3 editedBaseSceneLinearProPhoto = applyUserTone(
    colorBalancedSceneLinearProPhoto,
    u_userExposureMultiplier,
    u_userContrastAmount,
    u_userContrastFactor,
    u_userHighlights,
    u_userShadows,
    u_userWhites,
    u_userBlacks
  );
  editedBaseSceneLinearProPhoto = applyUserSaturation(
    editedBaseSceneLinearProPhoto,
    u_userSaturation,
    u_userVibrance
  );
  if (u_selectiveColorActive) {
    editedBaseSceneLinearProPhoto = applyUserSelectiveColor(
      editedBaseSceneLinearProPhoto,
      u_selectiveColorLUT,
      u_selectiveColorChromaClamp
    );
  }
  vec3 technicalBaseDisplayLinear =
    max(linearProPhotoToLinearSrgb(technicalBaseSceneLinearProPhoto), vec3(0.0));
  vec3 editedBaseDisplayLinear =
    max(linearProPhotoToLinearSrgb(editedBaseSceneLinearProPhoto), vec3(0.0));
  vec3 technicalBaseDisplayColor = linearToSrgb(technicalBaseDisplayLinear);
  vec3 editedBaseDisplayColor = linearToSrgb(editedBaseDisplayLinear);
  vec3 styledColor = editedBaseDisplayColor;
  float intensity = clamp(u_intensity, 0.0, 1.0);

  if (u_styleKind == STYLE_BUILTIN) {
    styledColor = mix(editedBaseDisplayColor, applyBuiltinStyle(editedBaseDisplayColor), intensity);
  } else if (u_styleKind == STYLE_CUSTOM && u_useLut) {
    if (isSceneCreativeLut()) {
      vec3 styledDisplayLinear = applySceneLutToDisplayLinear(editedBaseSceneLinearProPhoto);
      vec3 mixedDisplayLinear = mix(editedBaseDisplayLinear, styledDisplayLinear, intensity);
      styledColor = linearToSrgb(mixedDisplayLinear);
    } else if (isOutputLut()) {
      styledColor = mix(editedBaseDisplayColor, applyCombinedOutputLut(editedBaseSceneLinearProPhoto), intensity);
    } else {
      styledColor = mix(editedBaseDisplayColor, applyDisplayLut(editedBaseSceneLinearProPhoto), intensity);
    }
  }

  if (u_viewMode == VIEW_MODE_ORIGINAL) {
    styledColor = technicalBaseDisplayColor;
  } else if (u_viewMode == VIEW_MODE_COMPARE) {
    float finalSide = step(clamp(u_compareSplit, 0.0, 1.0), v_texCoord.x);
    styledColor = mix(technicalBaseDisplayColor, styledColor, finalSide);
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
