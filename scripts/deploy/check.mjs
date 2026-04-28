import { access } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { createDeployConfig } from './config.mjs'

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function checkDeployArtifact(config = createDeployConfig()) {
  const requiredFiles = ['index.html', ...config.nativeAssets]

  for (const file of requiredFiles) {
    if (!(await fileExists(join(config.outputDir, file)))) {
      throw new Error(`Missing deploy artifact: ${file}`)
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await checkDeployArtifact()
}
