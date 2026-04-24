import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const fixturesDir = path.dirname(scriptDir)
const lockPath = path.join(fixturesDir, 'public.lock.json')
const cacheDir = path.join(fixturesDir, '.cache', 'public')
const downloadTimeoutMs = 120_000
const sha256Pattern = /^[0-9a-f]{64}$/
const fixtureFields = ['name', 'file', 'url', 'sha256', 'license', 'purpose']

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
  const fixturePath = path.join(cacheDir, fixture.file)

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

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateBasenameOnlyField(fixture, index, field) {
  const value = fixture[field]
  if (
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].${field} must be a basename-only relative name`,
    )
  }
}

function validateFixture(fixture, index) {
  if (!isObject(fixture)) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}] must be an object`,
    )
  }

  for (const field of fixtureFields) {
    if (typeof fixture[field] !== 'string' || fixture[field].length === 0) {
      throw new TypeError(
        `Invalid public fixture lockfile: fixtures[${index}].${field} must be a non-empty string`,
      )
    }
  }

  if (!sha256Pattern.test(fixture.sha256)) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].sha256 must be 64 lowercase hex characters`,
    )
  }

  let url
  try {
    url = new URL(fixture.url)
  } catch {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].url must be a valid URL`,
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].url must use http or https`,
    )
  }

  validateBasenameOnlyField(fixture, index, 'file')
}

function validateLockfile(lock) {
  if (!isObject(lock)) {
    throw new TypeError(`Invalid public fixture lockfile: ${lockPath}`)
  }
  if (lock.schemaVersion !== 1) {
    throw new TypeError(
      'Invalid public fixture lockfile: schemaVersion must be 1',
    )
  }
  if (!Array.isArray(lock.fixtures) || lock.fixtures.length === 0) {
    throw new TypeError(
      'Invalid public fixture lockfile: fixtures must be a non-empty array',
    )
  }

  lock.fixtures.forEach(validateFixture)
}

async function readLockfile() {
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  validateLockfile(lock)
  return lock
}

try {
  const lock = await readLockfile()

  await fs.mkdir(cacheDir, { recursive: true })

  for (const fixture of lock.fixtures) {
    await ensureFixture(fixture)
    console.log(`Fetched ${fixture.name}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
