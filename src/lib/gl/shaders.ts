/**
 * GLSL shader source code for the phase-1 RAW processing pipeline.
 * The product path is intentionally small: original preview, optional LUT,
 * and finite intensity mixing.
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
 * It keeps the processing path compatible with a wider range of WebGL2
 * implementations by avoiding unused gamut and log-space transforms.
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

vec3 applyLut(vec3 color) {
  vec3 normalizedColor = (color - u_lutDomainMin) / (u_lutDomainMax - u_lutDomainMin);
  normalizedColor = clamp(normalizedColor, 0.0, 1.0);
  return texture(u_lutTexture, normalizedColor).rgb;
}

void main() {
  vec3 color = clamp(texture(u_inputTexture, v_texCoord).rgb, 0.0, 1.0);

  if (u_useLut) {
    vec3 processedColor = clamp(applyLut(color), 0.0, 1.0);
    color = mix(color, processedColor, u_intensity);
  }

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
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
