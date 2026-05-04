import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  assertNativeRuntimeAssets,
  resolveNativeRuntimeAssets,
  resolveWorkspaceRoot,
} from './assets.mjs'

export function prepareNativeRuntimeAssets({
  rootDir = process.cwd(),
  mode,
  env = process.env,
} = {}) {
  rootDir = resolveWorkspaceRoot(rootDir)
  const assetSets = resolveNativeRuntimeAssets({ rootDir, mode, env })
  assertNativeRuntimeAssets(assetSets)
  return assetSets
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const assetSets = prepareNativeRuntimeAssets()
    const sources = [...new Set(assetSets.map((assetSet) => assetSet.source))]
    console.log(`Using ${sources.join(', ')} native runtime assets.`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
