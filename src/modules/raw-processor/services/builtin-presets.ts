export const BUILTIN_PRESETS = [
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Clean baseline look',
    inputPrepProfile: {
      profileId: 'normalized-neutral',
      description: 'Neutral normalized path',
    },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Softer warm contrast',
    inputPrepProfile: {
      profileId: 'normalized-warm',
      description: 'Warm normalized path',
    },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'cool',
    name: 'Cool',
    description: 'Cooler blue-green separation',
    inputPrepProfile: {
      profileId: 'normalized-cool',
      description: 'Cool normalized path',
    },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'film-soft',
    name: 'Film Soft',
    description: 'Gentle filmic contrast',
    inputPrepProfile: {
      profileId: 'normalized-film-soft',
      description: 'Soft film prep',
    },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'film-contrast',
    name: 'Film Contrast',
    description: 'Punchier film response',
    inputPrepProfile: {
      profileId: 'normalized-film-contrast',
      description: 'Contrast film prep',
    },
    defaultIntensityLevel: 'strong' as const,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic crossover look',
    inputPrepProfile: {
      profileId: 'normalized-cinematic',
      description: 'Cinematic prep',
    },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'fade',
    name: 'Fade',
    description: 'Lifted shadows and gentle rolloff',
    inputPrepProfile: {
      profileId: 'normalized-fade',
      description: 'Faded prep',
    },
    defaultIntensityLevel: 'light' as const,
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Black and white finish',
    inputPrepProfile: {
      profileId: 'normalized-mono',
      description: 'Mono prep',
    },
    defaultIntensityLevel: 'standard' as const,
  },
] as const

export type BuiltinPresetId = (typeof BUILTIN_PRESETS)[number]['id']
