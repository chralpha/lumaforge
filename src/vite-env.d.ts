/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  readonly VITE_RAW_RUNTIME?: 'libraw-wasm' | 'luma'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
