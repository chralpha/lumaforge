import { promises as fs } from 'node:fs'
import path from 'node:path'

export const rawFamilies = [
  'apple-dng',
  'apple-proraw-dng',
  'android-dng',
  'generic-dng',
]
export const fixturePurposes = ['ci-smoke', 'local-compatibility']

const requiredStringFields = [
  'name',
  'file',
  'url',
  'sha256',
  'license',
  'source',
  'rawFamily',
  'purpose',
]
const sha256Pattern = /^[0-9a-f]{64}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function publicLockfileError(message) {
  return new TypeError(`Invalid public fixture lockfile: ${message}`)
}

function allowedValues(values) {
  return values.join(', ')
}

function validateBasenameOnlyFile(value, index) {
  if (
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw publicLockfileError(
      `fixtures[${index}].file must be a basename-only relative name`,
    )
  }
}

function validateFixtureUrl(value, index) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw publicLockfileError(`fixtures[${index}].url must be a valid URL`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw publicLockfileError(`fixtures[${index}].url must use http or https`)
  }
}

function validateFixture(fixture, index) {
  if (!isObject(fixture)) {
    throw publicLockfileError(`fixtures[${index}] must be an object`)
  }

  for (const field of requiredStringFields) {
    if (typeof fixture[field] !== 'string' || fixture[field].length === 0) {
      throw publicLockfileError(
        `fixtures[${index}].${field} must be a non-empty string`,
      )
    }
  }

  if (
    fixture.deviceBrand !== undefined &&
    typeof fixture.deviceBrand !== 'string'
  ) {
    throw publicLockfileError(`fixtures[${index}].deviceBrand must be a string`)
  }

  if (
    fixture.deviceModel !== undefined &&
    typeof fixture.deviceModel !== 'string'
  ) {
    throw publicLockfileError(`fixtures[${index}].deviceModel must be a string`)
  }

  if (!sha256Pattern.test(fixture.sha256)) {
    throw publicLockfileError(
      `fixtures[${index}].sha256 must be 64 lowercase hex characters`,
    )
  }

  if (!rawFamilies.includes(fixture.rawFamily)) {
    throw publicLockfileError(
      `fixtures[${index}].rawFamily must be one of ${allowedValues(rawFamilies)}`,
    )
  }

  if (!fixturePurposes.includes(fixture.purpose)) {
    throw publicLockfileError(
      `fixtures[${index}].purpose must be one of ${allowedValues(fixturePurposes)}`,
    )
  }

  validateFixtureUrl(fixture.url, index)
  validateBasenameOnlyFile(fixture.file, index)
}

export function validateFixtureLock(lock, lockPath = 'public.lock.json') {
  if (!isObject(lock)) {
    throw publicLockfileError(`${lockPath} must be an object`)
  }

  if (lock.schemaVersion !== 1) {
    throw publicLockfileError('schemaVersion must be 1')
  }

  if (!Array.isArray(lock.fixtures) || lock.fixtures.length === 0) {
    throw publicLockfileError('fixtures must be a non-empty array')
  }

  const fixtureNames = new Set()
  const fixtureFiles = new Set()

  lock.fixtures.forEach((fixture, index) => {
    validateFixture(fixture, index)

    if (fixtureNames.has(fixture.name)) {
      throw publicLockfileError(`duplicate fixture name ${fixture.name}`)
    }
    fixtureNames.add(fixture.name)

    if (fixtureFiles.has(fixture.file)) {
      throw publicLockfileError(`duplicate fixture file ${fixture.file}`)
    }
    fixtureFiles.add(fixture.file)
  })

  return lock
}

export async function readFixtureLock(lockPath) {
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  return validateFixtureLock(lock, lockPath)
}

export function fixtureCacheDir(fixturesDir) {
  return path.join(fixturesDir, '.cache', 'public')
}

export function fixtureCachePath(fixturesDir, fixture) {
  return path.join(fixtureCacheDir(fixturesDir), fixture.file)
}

export function selectFixtures(fixtures, options = {}) {
  if (options.all) {
    return [...fixtures]
  }

  if (options.purpose !== undefined) {
    if (!fixturePurposes.includes(options.purpose)) {
      throw new TypeError(
        `Fixture purpose must be one of ${allowedValues(fixturePurposes)}`,
      )
    }

    return fixtures.filter((fixture) => fixture.purpose === options.purpose)
  }

  return [...fixtures]
}
