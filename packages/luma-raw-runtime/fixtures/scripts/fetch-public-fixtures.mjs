import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

import {
  fixtureCacheDir,
  fixtureCachePath,
  readFixtureLock,
  selectFixtures,
} from './fixture-registry.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const fixturesDir = path.dirname(scriptDir)
const lockPath = path.join(fixturesDir, 'public.lock.json')
const cacheDir = fixtureCacheDir(fixturesDir)
const downloadTimeoutMs = 120_000

async function pathExists(absolutePath) {
  try {
    await fs.lstat(absolutePath)
    return true
  } catch {
    return false
  }
}

async function sha256File(absolutePath) {
  const hash = createHash('sha256')

  for await (const chunk of createReadStream(absolutePath)) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

async function downloadFixture(fixture, fixturePath) {
  const tempPath = `${fixturePath}.download-${process.pid}`
  try {
    const response = await fetch(fixture.url, {
      signal: AbortSignal.timeout(downloadTimeoutMs),
    })
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    if (!response.body) {
      throw new Error('response body is empty')
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath))
    await fs.rename(tempPath, fixturePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true })
    const details = error instanceof Error ? error.message : String(error)
    const timeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
        ? ` timed out after ${downloadTimeoutMs}ms`
        : ''
    throw new Error(
      `Failed to download ${fixture.name} from ${fixture.url}${timeout}: ${details}`,
    )
  }
}

function hashMismatchError(fixture, actual) {
  return new Error(
    `SHA-256 mismatch for ${fixture.name}\nExpected: ${fixture.sha256}\nActual:   ${actual}`,
  )
}

async function ensureFixture(fixture) {
  const fixturePath = fixtureCachePath(fixturesDir, fixture)

  if (await pathExists(fixturePath)) {
    const cachedHash = await sha256File(fixturePath)
    if (cachedHash === fixture.sha256) {
      return fixturePath
    }

    await fs.rm(fixturePath, { force: true })
  }

  await downloadFixture(fixture, fixturePath)

  const downloadedHash = await sha256File(fixturePath)
  if (downloadedHash !== fixture.sha256) {
    await fs.rm(fixturePath, { force: true })
    throw hashMismatchError(fixture, downloadedHash)
  }

  return fixturePath
}

function parseArgs(argv) {
  const result = { all: false, purpose: undefined }
  for (const arg of argv) {
    if (arg === '--all') {
      result.all = true
      continue
    }
    if (arg.startsWith('--purpose=')) {
      result.purpose = arg.slice('--purpose='.length)
      continue
    }
    throw new TypeError(
      `Unknown fetch-public-fixtures argument: ${arg}. Use --all or --purpose=<purpose>.`,
    )
  }
  if (result.all && result.purpose) {
    throw new TypeError('Use either --all or --purpose=<purpose>, not both.')
  }
  return result
}

try {
  const lock = await readFixtureLock(lockPath)
  const selectedFixtures = selectFixtures(
    lock.fixtures,
    parseArgs(process.argv.slice(2)),
  )

  await fs.mkdir(cacheDir, { recursive: true })

  for (const fixture of selectedFixtures) {
    await ensureFixture(fixture)
    console.log(`Fetched ${fixture.name}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
