import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const moduleUrl = import.meta.url.startsWith('file:')
  ? import.meta.url
  : pathToFileURL(import.meta.url).href
const packageRoot = fileURLToPath(new URL('../', moduleUrl))
const sourceRoot = join(packageRoot, 'src')
const forbiddenImportPatterns = [
  /(?:from\s+|import\s*)['"]~\//,
  /(?:from\s+|import\s*)['"]@lumaforge\/luma-raw-runtime/,
  /(?:from\s+|import\s*)['"]@lumaforge\/luma-jpeg-runtime/,
  /(?:from\s+|import\s*)['"]node:/,
  /(?:from\s+|import\s*)['"]react[/'"]/,
  /(?:from\s+|import\s*)['"]react-dom[/'"]/,
  /(?:from\s+|import\s*)['"]jotai[/'"]/,
]

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) return listTypeScriptFiles(path)
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) return [path]

    return []
  })
}

describe('luma color runtime package boundary', () => {
  it('does not import app, raw runtime, jpeg runtime, or React modules', () => {
    const violations = listTypeScriptFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return forbiddenImportPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(packageRoot, filePath)}: ${pattern}`)
    })

    expect(violations).toEqual([])
  })

  it('exports preview histogram API from the package root', async () => {
    const runtime = await import('./index')

    expect(runtime).toHaveProperty('createPreviewHistogramProcessor')
  })
})
