import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { buildReportEntry } from './compatibility-report.mjs'
import {
  fixtureCachePath,
  readFixtureLock,
  selectFixtures,
} from './fixture-registry.mjs'
import {
  diagnoseNativeFixture,
  loadNativeFactory,
} from './native-diagnostics-runtime.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const fixturesDir = path.dirname(scriptDir)
const packageDir = path.dirname(fixturesDir)
const lockPath = path.join(fixturesDir, 'public.lock.json')

export function defaultReportPath(rootFixturesDir = fixturesDir) {
  return path.join(
    rootFixturesDir,
    '.cache',
    'reports',
    'mobile-raw-compatibility.json',
  )
}

export function parseArgs(argv) {
  const result = {
    all: false,
    purpose: 'ci-smoke',
    profile: 'desktop',
    output: undefined,
  }

  let explicitPurpose = false

  for (const arg of argv) {
    if (arg === '--all') {
      result.all = true
      result.purpose = undefined
      continue
    }

    if (arg.startsWith('--purpose=')) {
      explicitPurpose = true
      result.purpose = arg.slice('--purpose='.length)
      continue
    }

    if (arg.startsWith('--profile=')) {
      result.profile = arg.slice('--profile='.length)
      continue
    }

    if (arg.startsWith('--output=')) {
      result.output = arg.slice('--output='.length)
      continue
    }

    throw new TypeError(
      `Unknown diagnose-raw-compatibility argument: ${arg}. Use --all, --purpose=<purpose>, --profile=<profile>, or --output=<path>.`,
    )
  }

  if (result.all && explicitPurpose) {
    throw new TypeError('Use either --all or --purpose=<purpose>, not both.')
  }

  if (result.profile !== 'desktop' && result.profile !== 'low-memory') {
    throw new TypeError('Profile must be desktop or low-memory.')
  }

  return result
}

export function reportPayload({ generatedAt, entries }) {
  return {
    schemaVersion: 1,
    generatedAt,
    entries,
  }
}

async function pathExists(absolutePath) {
  try {
    await fs.stat(absolutePath)
    return true
  } catch {
    return false
  }
}

async function requireCachedFixture(fixture) {
  const absolutePath = fixtureCachePath(fixturesDir, fixture)
  if (await pathExists(absolutePath)) {
    return absolutePath
  }

  throw new Error(
    `Missing cached fixture ${fixture.name}: ${absolutePath}\nRun pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public for CI fixtures or fixtures:fetch-public:all for local compatibility fixtures.`,
  )
}

export async function runDiagnostics(options) {
  const lock = await readFixtureLock(lockPath)
  const fixtures = selectFixtures(lock.fixtures, {
    all: options.all,
    purpose: options.purpose,
  })
  const nativeFactory = await loadNativeFactory({
    packageDir,
    profile: options.profile,
  })
  const entries = []

  for (const fixture of fixtures) {
    const fixturePath = await requireCachedFixture(fixture)
    const raw = await diagnoseNativeFixture({
      fixture,
      fixturePath,
      nativeFactory,
      memoryProfile: options.profile,
    })
    entries.push(buildReportEntry(raw))
    console.log(`${fixture.name}: ${entries.at(-1).classification}`)
  }

  const output = options.output ?? defaultReportPath(fixturesDir)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(
    output,
    `${JSON.stringify(
      reportPayload({
        generatedAt: new Date().toISOString(),
        entries,
      }),
      null,
      2,
    )}\n`,
  )
  console.log(`Wrote ${output}`)

  return output
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runDiagnostics(parseArgs(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
