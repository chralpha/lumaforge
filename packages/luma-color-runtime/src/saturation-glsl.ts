import {
  SKIN_HUE_CENTER_DEG,
  SKIN_HUE_SIGMA_DEG,
  SKIN_PROTECT_STRENGTH,
  USER_SATURATION_MAX_FACTOR,
  USER_VIBRANCE_MAX_FACTOR,
  VIBRANCE_CHROMA_REF,
} from './saturation'

export const LUMA_COLOR_USER_SATURATION_GLSL = /* glsl */ `
const float USER_SAT_MAX = ${USER_SATURATION_MAX_FACTOR.toFixed(6)};
const float USER_VIB_MAX = ${USER_VIBRANCE_MAX_FACTOR.toFixed(6)};
const float VIBRANCE_CHROMA_REF = ${VIBRANCE_CHROMA_REF.toFixed(6)};
const float SKIN_HUE_CENTER = ${SKIN_HUE_CENTER_DEG.toFixed(6)};
const float SKIN_HUE_SIGMA = ${SKIN_HUE_SIGMA_DEG.toFixed(6)};
const float SKIN_PROTECT_STR = ${SKIN_PROTECT_STRENGTH.toFixed(6)};

vec3 applyUserSaturation(vec3 colorProPhoto, float saturation, float vibrance) {
  if (saturation == 0.0 && vibrance == 0.0) return colorProPhoto;
  vec3 oklab = linearProPhotoToOklab(colorProPhoto);
  float L = oklab.x;
  vec2 ab = oklab.yz;
  float C = length(ab);

  float gC_boost = clamp((VIBRANCE_CHROMA_REF - C) / VIBRANCE_CHROMA_REF, 0.0, 1.0);
  float gC_cut   = clamp(C / VIBRANCE_CHROMA_REF, 0.0, 1.0);
  float gC       = vibrance >= 0.0 ? gC_boost : gC_cut;

  float hueDeg   = degrees(atan(ab.y, ab.x));
  float deltaHue = mod(hueDeg - SKIN_HUE_CENTER + 540.0, 360.0) - 180.0;
  float t        = deltaHue / SKIN_HUE_SIGMA;
  float gSkin    = 1.0 - SKIN_PROTECT_STR * exp(-t * t);

  float satFactor    = clamp(1.0 + (saturation / 100.0) * USER_SAT_MAX, 0.0, 2.0);
  float vibFactor    = 1.0 + (vibrance / 100.0) * USER_VIB_MAX * gC * gSkin;
  float chromaFactor = max(0.0, satFactor * vibFactor);

  return oklabToLinearProPhoto(vec3(L, ab * chromaFactor));
}
`
