export default {
  outputDir: 'dist',
  nativeAssets: [
    'native/desktop/luma_raw.js',
    'native/desktop/luma_raw.wasm',
    'native/low-memory/luma_raw.js',
    'native/low-memory/luma_raw.wasm',
    'native/luma_jpeg.js',
    'native/luma_jpeg.wasm',
  ],
  crossOriginIsolationHeaders: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
  wasmHeaders: {
    'Content-Type': 'application/wasm',
  },
  cloudflare: {
    projectNameEnv: 'CLOUDFLARE_PAGES_PROJECT',
  },
  vercel: {
    outputDir: '.vercel/output',
    orgIdEnv: 'VERCEL_ORG_ID',
    projectIdEnv: 'VERCEL_PROJECT_ID',
  },
}
