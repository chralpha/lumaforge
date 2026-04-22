/**
 * GLSL shader source code for RAW image processing pipeline.
 * Implements exposure, gamut transform, log encoding, and LUT sampling.
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
 * Log encoding functions implemented in GLSL.
 * Matches the JavaScript implementations in log-encoding.ts
 */
export const LOG_ENCODING_FUNCTIONS = /* glsl */ `
// S-Log3 (Sony)
float sLog3Encode(float linear) {
  if (linear >= 0.01125) {
    return (420.0 + log(max((linear + 0.01) / (0.18 + 0.01), 1e-10)) / log(10.0) * 261.5) / 1023.0;
  }
  return (linear * (171.2102946929 - 95.0) / 0.01125 + 95.0) / 1023.0;
}

vec3 sLog3EncodeVec(vec3 linear) {
  return vec3(sLog3Encode(linear.r), sLog3Encode(linear.g), sLog3Encode(linear.b));
}

// V-Log (Panasonic)
float vLogEncode(float linear) {
  const float b = 0.00873;
  const float c = 0.241514;
  const float d = 0.598206;
  
  if (linear < 0.01) {
    return 5.6 * linear + 0.125;
  }
  return c * log(max(linear + b, 1e-10)) / log(10.0) + d;
}

vec3 vLogEncodeVec(vec3 linear) {
  return vec3(vLogEncode(linear.r), vLogEncode(linear.g), vLogEncode(linear.b));
}

// F-Log (Fujifilm)
float fLogEncode(float linear) {
  const float a = 0.555556;
  const float b = 0.009468;
  const float c = 0.344676;
  const float d = 0.790453;
  const float e = 8.735631;
  const float f = 0.092864;
  const float cut = 0.00089;
  
  if (linear < cut) {
    return e * linear + f;
  }
  return c * log(max(a * linear + b, 1e-10)) / log(10.0) + d;
}

vec3 fLogEncodeVec(vec3 linear) {
  return vec3(fLogEncode(linear.r), fLogEncode(linear.g), fLogEncode(linear.b));
}

// F-Log2 (Fujifilm)
float fLog2Encode(float linear) {
  const float a = 5.555556;
  const float b = 0.064829;
  const float c = 0.245281;
  const float d = 0.384316;
  const float e = 8.799461;
  const float f = 0.092864;
  const float cut = 0.000889;
  
  if (linear < cut) {
    return e * linear + f;
  }
  return c * log(max(a * linear + b, 1e-10)) / log(10.0) + d;
}

vec3 fLog2EncodeVec(vec3 linear) {
  return vec3(fLog2Encode(linear.r), fLog2Encode(linear.g), fLog2Encode(linear.b));
}

// N-Log (Nikon)
float nLogEncode(float linear) {
  const float a = 650.0 / 1023.0;
  const float b = 0.0075;
  const float c = 150.0 / 1023.0;
  const float d = 619.0 / 1023.0;
  const float cut = 0.328;
  
  if (linear < cut) {
    return pow(max(linear, 0.0), 1.0 / 3.0) * a + b;
  }
  return log(max(linear, 1e-10)) * c + d;
}

vec3 nLogEncodeVec(vec3 linear) {
  return vec3(nLogEncode(linear.r), nLogEncode(linear.g), nLogEncode(linear.b));
}

// Canon Log 2
float canonLog2Encode(float linear) {
  const float cut = 0.000023146608;
  if (linear < cut) {
    return -(0.235 - 0.000235) * linear + 0.000235;
  }
  return 0.092864 * log(max(linear + 0.000235, 1e-10)) / log(10.0) + 0.392964;
}

vec3 canonLog2EncodeVec(vec3 linear) {
  return vec3(canonLog2Encode(linear.r), canonLog2Encode(linear.g), canonLog2Encode(linear.b));
}

// Canon Log 3
float canonLog3Encode(float linear) {
  const float cut = 0.014;
  if (linear < cut) {
    return 0.36726845 * linear + 0.12783901;
  }
  return 0.09802097 * log(max(linear + 0.01, 1e-10)) / log(10.0) + 0.36726845;
}

vec3 canonLog3EncodeVec(vec3 linear) {
  return vec3(canonLog3Encode(linear.r), canonLog3Encode(linear.g), canonLog3Encode(linear.b));
}

// ARRI LogC3 (EI 800)
float logC3Encode(float linear) {
  const float cut = 0.010591;
  const float a = 5.555556;
  const float b = 0.052272;
  const float c = 0.247190;
  const float d = 0.385537;
  const float e = 5.367655;
  const float f = 0.092809;
  
  if (linear > cut) {
    return c * log(max(a * linear + b, 1e-10)) / log(10.0) + d;
  }
  return e * linear + f;
}

vec3 logC3EncodeVec(vec3 linear) {
  return vec3(logC3Encode(linear.r), logC3Encode(linear.g), logC3Encode(linear.b));
}

// ARRI LogC4
float logC4Encode(float linear) {
  const float a = (pow(2.0, 18.0) - 16.0) / 117.45;
  const float b = (16.0 - 64.0) / 117.45;
  const float c = 14.0;
  float s = (7.0 * log(2.0) * pow(2.0, 7.0 - c * a)) / (a * 117.45);
  float t = (pow(2.0, 7.0 - c * a) - b) / a;
  
  if (linear >= t) {
    return (log2(max(a * linear + b, 1e-10)) + c) / 14.0;
  }
  return (linear - t) / s;
}

vec3 logC4EncodeVec(vec3 linear) {
  return vec3(logC4Encode(linear.r), logC4Encode(linear.g), logC4Encode(linear.b));
}

// Log3G10 (RED)
float log3G10Encode(float linear) {
  const float a = 0.224282;
  const float b = 155.975327;
  const float c = 0.01;
  const float g = 15.1927;
  
  float y = linear + c;
  if (y < 0.0) return y * g;
  return a * log(max(b * y + 1.0, 1e-10)) / log(10.0);
}

vec3 log3G10EncodeVec(vec3 linear) {
  return vec3(log3G10Encode(linear.r), log3G10Encode(linear.g), log3G10Encode(linear.b));
}

// L-Log (Leica/Panasonic)
float lLogEncode(float linear) {
  const float cut = 0.006;
  if (linear < cut) {
    return 8.0 * linear;
  }
  return 0.233161 * log(max(linear / 0.006 + 1.0, 1e-10)) / log(10.0) + 0.048;
}

vec3 lLogEncodeVec(vec3 linear) {
  return vec3(lLogEncode(linear.r), lLogEncode(linear.g), lLogEncode(linear.b));
}
`

/**
 * Main fragment shader for RAW processing pipeline.
 * Implements: exposure → gamut matrix → log encoding → LUT → output
 */
export const PROCESS_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler3D;

in vec2 v_texCoord;
out vec4 fragColor;

// Input texture (linear RGB from RAW decode)
uniform sampler2D u_inputTexture;

// LUT texture (3D)
uniform sampler3D u_lutTexture;
uniform bool u_useLut;
uniform vec3 u_lutDomainMin;
uniform vec3 u_lutDomainMax;
uniform float u_intensity;

// Processing parameters
uniform float u_exposure;       // EV stops
uniform float u_saturation;     // 1.0 = normal
uniform float u_contrast;       // 1.0 = normal
uniform mat3 u_gamutMatrix;     // Color space transform
uniform int u_logSpace;         // Log encoding type (0=none, 1=S-Log3, etc.)

// Luminance coefficients for saturation
const vec3 LUMA_COEFFS = vec3(0.2126, 0.7152, 0.0722);

${LOG_ENCODING_FUNCTIONS}

// Apply log encoding based on selected space
vec3 applyLogEncoding(vec3 linear, int logSpace) {
  // Clamp small values to prevent log of negative/zero
  linear = max(linear, vec3(1e-6));
  
  if (logSpace == 1) return sLog3EncodeVec(linear);
  if (logSpace == 2) return vLogEncodeVec(linear);
  if (logSpace == 3) return fLogEncodeVec(linear);
  if (logSpace == 4) return fLog2EncodeVec(linear);
  if (logSpace == 5) return nLogEncodeVec(linear);
  if (logSpace == 6) return canonLog2EncodeVec(linear);
  if (logSpace == 7) return canonLog3EncodeVec(linear);
  if (logSpace == 8) return logC3EncodeVec(linear);
  if (logSpace == 9) return logC4EncodeVec(linear);
  if (logSpace == 10) return log3G10EncodeVec(linear);
  if (logSpace == 11) return lLogEncodeVec(linear);
  
  return linear; // No encoding
}

// Apply 3D LUT with trilinear interpolation
vec3 applyLut(vec3 color) {
  // Normalize to LUT domain
  vec3 normalizedColor = (color - u_lutDomainMin) / (u_lutDomainMax - u_lutDomainMin);
  normalizedColor = clamp(normalizedColor, 0.0, 1.0);
  
  // Sample 3D texture (automatic trilinear interpolation)
  return texture(u_lutTexture, normalizedColor).rgb;
}

// Apply saturation adjustment
vec3 applySaturation(vec3 color, float saturation) {
  float luma = dot(color, LUMA_COEFFS);
  return mix(vec3(luma), color, saturation);
}

// Apply contrast adjustment
vec3 applyContrast(vec3 color, float contrast) {
  const float pivot = 0.18; // Middle gray
  return (color - pivot) * contrast + pivot;
}

void main() {
  // Sample input texture
  vec4 inputColor = texture(u_inputTexture, v_texCoord);
  vec3 color = inputColor.rgb;
  
  // Step 1: Apply exposure gain
  float gain = pow(2.0, u_exposure);
  color *= gain;
  
  // Step 2: Apply saturation and contrast (pre-transform boost)
  color = applySaturation(color, u_saturation);
  color = applyContrast(color, u_contrast);
  color = max(color, vec3(0.0));
  
  // Step 3: Apply gamut matrix (ProPhoto RGB → target gamut)
  color = u_gamutMatrix * color;
  
  // Step 4: Apply log encoding
  if (u_logSpace > 0) {
    color = applyLogEncoding(color, u_logSpace);
  }
  
  // Step 5: Apply LUT
  if (u_useLut) {
    vec3 processedColor = applyLut(color);
    processedColor = clamp(processedColor, 0.0, 1.0);
    color = mix(color, processedColor, u_intensity);
  }
  
  fragColor = vec4(color, 1.0);
}
`

/**
 * Preview output shader - applies tone mapping for display.
 */
export const PREVIEW_OUTPUT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;
uniform float u_displayGamma;
uniform bool u_srgbOutput;

// sRGB OETF (Opto-Electronic Transfer Function)
vec3 linearToSRGB(vec3 linear) {
  vec3 lo = linear * 12.92;
  vec3 hi = 1.055 * pow(max(linear, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), linear));
}

void main() {
  vec3 color = texture(u_inputTexture, v_texCoord).rgb;
  
  // Apply output transfer function
  if (u_srgbOutput) {
    color = linearToSRGB(color);
  } else {
    color = pow(max(color, vec3(0.0)), vec3(1.0 / u_displayGamma));
  }
  
  // Clamp output
  color = clamp(color, 0.0, 1.0);
  
  fragColor = vec4(color, 1.0);
}
`

/**
 * Passthrough shader for debugging
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
 * Export shader - outputs full precision for TIFF export
 */
export const EXPORT_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;

void main() {
  // Direct passthrough, no tone mapping
  fragColor = texture(u_inputTexture, v_texCoord);
}
`

/**
 * Log space enum matching the shader's u_logSpace values
 */
export const LOG_SPACE_ENUM: Record<string, number> = {
  none: 0,
  'S-Log3': 1,
  'S-Log3.Cine': 1, // Same as S-Log3
  'V-Log': 2,
  'F-Log': 3,
  'F-Log2': 4,
  'F-Log2C': 4, // Same as F-Log2
  'N-Log': 5,
  'Canon Log 2': 6,
  'Canon Log 3': 7,
  'Arri LogC3': 8,
  'Arri LogC4': 9,
  Log3G10: 10,
  'L-Log': 11,
}
