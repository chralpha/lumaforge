import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        'src/**/*.{test,spec}.{ts,tsx,js,jsx,mjs}',
        'scripts/**/*.{test,spec}.{ts,tsx,js,jsx,mjs}',
        'packages/luma-color-runtime/src/**/*.{test,spec}.{ts,tsx,js,jsx,mjs}',
      ],
      exclude: ['src/lib/export/full-res-export.real.test.ts'],
    },
  }),
)
