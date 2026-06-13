import { readFile } from 'node:fs/promises'

const VALID_KINDS = new Set(['raw', 'jpeg'])
const VALID_RAW_PROFILES = new Set(['desktop', 'low-memory'])

function isPlainObject(value) {
  return typeof value === 'object' && value !== null
}

function resolveArtifactPaths(kind, memoryProfile) {
  if (kind === 'jpeg') {
    return {
      gluePath: './native/luma_jpeg.js',
      wasmPath: './native/luma_jpeg.wasm',
    }
  }
  return {
    gluePath: `./native/${memoryProfile}/luma_raw.js`,
    wasmPath: `./native/${memoryProfile}/luma_raw.wasm`,
  }
}

/**
 * Load a LumaForge native module (RAW or JPEG) in Node.js.
 *
 * The Emscripten glue ships with a Node `ENVIRONMENT_IS_NODE` flag but the
 * Node I/O branch is empty (no fs imports, no `readAsync`). This loader
 * sidesteps the gap by reading the `.wasm` bytes with `fs.readFile` and
 * passing them as `Module.wasmBinary`, which short-circuits the glue's
 * `fetch()` / `readAsync` paths.
 *
 * @param {{ kind: 'raw' | 'jpeg', memoryProfile?: 'desktop' | 'low-memory' }} options
 * @returns {Promise<unknown>} the populated Emscripten Module instance
 */
export async function loadNativeModuleForNode(options) {
  if (!isPlainObject(options)) {
    throw new TypeError(
      'loadNativeModuleForNode: options must be an object with { kind }',
    )
  }
  const { kind, memoryProfile = 'desktop' } = options
  if (!VALID_KINDS.has(kind)) {
    throw new TypeError(
      `loadNativeModuleForNode: kind must be "raw" or "jpeg", got ${JSON.stringify(kind)}`,
    )
  }
  if (kind === 'raw' && !VALID_RAW_PROFILES.has(memoryProfile)) {
    throw new TypeError(
      `loadNativeModuleForNode: memoryProfile must be "desktop" or "low-memory", got ${JSON.stringify(memoryProfile)}`,
    )
  }

  const { gluePath, wasmPath } = resolveArtifactPaths(kind, memoryProfile)
  const glueUrl = new URL(gluePath, import.meta.url)
  const wasmUrl = new URL(wasmPath, import.meta.url)

  const wasmBinary = await readFile(wasmUrl)
  const glueModule = await import(glueUrl.href)
  const factory = glueModule.default

  if (typeof factory !== 'function') {
    throw new TypeError(
      `loadNativeModuleForNode: ${gluePath} default export is not a factory function`,
    )
  }

  return factory({ wasmBinary })
}
