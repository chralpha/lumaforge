import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const nativeDir = path.dirname(scriptDir)
const packageDir = path.dirname(nativeDir)
const distNativeDir = path.join(packageDir, 'dist', 'native')
const sourceLockPath = path.join(nativeDir, 'sources.lock.json')
const nativeProfiles = ['desktop', 'low-memory']
const forbiddenGeneratedMarkers = [
  ['LibRaw', 'Wasm'].join('-'),
  ['BASELINE', 'ROOT'].join('_'),
  ['LIBRAW', 'WASM', 'ROOT'].join('_'),
  ['/workspaces', 'LumaForge'].join('/'),
]

const parsedArgs = parseArgs(process.argv.slice(2))
const writeProvenance = parsedArgs.writeProvenance
const profilesToVerify = writeProvenance
  ? [parsedArgs.profile ?? process.env.LUMA_RAW_MEMORY_PROFILE ?? 'desktop']
  : parsedArgs.profile
    ? [parsedArgs.profile]
    : nativeProfiles

function parseArgs(args) {
  let writeProvenance = false
  let profile
  const unknownArgs = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--write-provenance') {
      writeProvenance = true
      continue
    }
    if (arg === '--profile') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error('--profile requires a profile name')
      }
      profile = args[index + 1]
      index += 1
      continue
    }
    if (arg.startsWith('--profile=')) {
      profile = arg.slice('--profile='.length)
      continue
    }
    unknownArgs.push(arg)
  }

  if (unknownArgs.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArgs.join(', ')}`)
  }
  if (profile && !nativeProfiles.includes(profile)) {
    throw new Error(`Unknown Luma RAW native profile: ${profile}`)
  }

  return { writeProvenance, profile }
}

function artifactsForProfile(profile) {
  const profileDir = path.join(distNativeDir, profile)
  return {
    profile,
    profileDir,
    provenancePath: path.join(profileDir, 'provenance.json'),
    js: {
      file: 'luma_raw.js',
      path: path.join(profileDir, 'luma_raw.js'),
    },
    wasm: {
      file: 'luma_raw.wasm',
      path: path.join(profileDir, 'luma_raw.wasm'),
    },
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function requireFile(absolutePath, label) {
  let entry
  try {
    entry = await fs.lstat(absolutePath)
  } catch {
    throw new Error(`Missing ${label}: ${absolutePath}`)
  }

  if (!entry.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${absolutePath}`)
  }
}

async function sha256File(absolutePath) {
  const hash = createHash('sha256')

  for await (const chunk of createReadStream(absolutePath)) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

async function readJsonFile(absolutePath, label) {
  try {
    return JSON.parse(await fs.readFile(absolutePath, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Missing ${label}: ${absolutePath}`)
    }

    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid ${label}: ${absolutePath}\n${details}`)
  }
}

function validateSourceLock(sourceLock) {
  if (!isObject(sourceLock)) {
    throw new TypeError(`Invalid native source lockfile: ${sourceLockPath}`)
  }

  if (sourceLock.schemaVersion !== 1) {
    throw new TypeError(
      'Invalid native source lockfile: schemaVersion must be 1',
    )
  }

  if (!isObject(sourceLock.toolchain)) {
    throw new TypeError(
      'Invalid native source lockfile: toolchain must be an object',
    )
  }

  if (!Array.isArray(sourceLock.sources) || sourceLock.sources.length === 0) {
    throw new TypeError(
      'Invalid native source lockfile: sources must be a non-empty array',
    )
  }

  sourceLock.sources.forEach((source, index) => {
    if (!isObject(source)) {
      throw new TypeError(
        `Invalid native source lockfile: sources[${index}] must be an object`,
      )
    }

    for (const field of ['name', 'version', 'url', 'sha256']) {
      if (typeof source[field] !== 'string' || source[field].length === 0) {
        throw new TypeError(
          `Invalid native source lockfile: sources[${index}].${field} must be a non-empty string`,
        )
      }
    }
  })
}

function validateProvenance(provenance, provenancePath) {
  if (!isObject(provenance)) {
    throw new TypeError(`Invalid native artifact provenance: ${provenancePath}`)
  }

  if (provenance.schemaVersion !== 1) {
    throw new TypeError(
      'Invalid native artifact provenance: schemaVersion must be 1',
    )
  }

  if (!nativeProfiles.includes(provenance.memoryProfile)) {
    throw new TypeError(
      'Invalid native artifact provenance: memoryProfile is unknown',
    )
  }

  if (!isObject(provenance.artifacts)) {
    throw new TypeError(
      'Invalid native artifact provenance: artifacts must be an object',
    )
  }

  for (const key of ['js', 'wasm']) {
    if (!isObject(provenance.artifacts[key])) {
      throw new TypeError(
        `Invalid native artifact provenance: artifacts.${key} must be an object`,
      )
    }
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }

  if (isObject(value)) {
    const fields = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    return `{${fields.join(',')}}`
  }

  return JSON.stringify(value)
}

function formatSource(source) {
  return {
    name: source.name,
    version: source.version,
    url: source.url,
    sha256: source.sha256,
  }
}

function mismatchError(field, recorded, current) {
  return new Error(
    `Native artifact provenance mismatch: ${field}\nRecorded: ${formatValue(recorded)}\nCurrent:  ${formatValue(current)}`,
  )
}

function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function verifyField(provenance, fieldPath, current) {
  const recorded = fieldPath
    .split('.')
    .reduce((value, field) => value?.[field], provenance)
  if (stableJson(recorded) !== stableJson(current)) {
    throw mismatchError(fieldPath, recorded, current)
  }
}

async function scanGeneratedOutput(artifact, { required = true } = {}) {
  let contents
  try {
    contents = (await fs.readFile(artifact.path)).toString('latin1')
  } catch (error) {
    if (required) {
      const details = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to scan ${artifact.file} for forbidden native baseline markers: ${details}`,
      )
    }

    return []
  }

  return forbiddenGeneratedMarkers
    .filter((marker) => contents.includes(marker))
    .map(
      (marker) =>
        `${artifact.file} contains forbidden native baseline marker: ${marker}`,
    )
}

async function verifyGeneratedOutputs(artifactSet) {
  const matches = [
    ...(await scanGeneratedOutput(artifactSet.js)),
    ...(await scanGeneratedOutput({
      file: `${artifactSet.profile}/provenance.json`,
      path: artifactSet.provenancePath,
    })),
    ...(await scanGeneratedOutput(artifactSet.wasm, { required: false })),
  ]

  if (matches.length > 0) {
    throw new Error(
      `Forbidden native baseline markers found in generated artifacts:\n${matches.join('\n')}`,
    )
  }
}

async function buildProvenance(profile) {
  const artifactSet = artifactsForProfile(profile)
  await requireFile(sourceLockPath, 'native source lockfile')
  await requireFile(artifactSet.js.path, `${profile} native JS artifact`)
  await requireFile(artifactSet.wasm.path, `${profile} native WASM artifact`)

  const sourceLock = await readJsonFile(
    sourceLockPath,
    'native source lockfile',
  )
  validateSourceLock(sourceLock)

  const [sourceLockSha256, jsSha256, wasmSha256] = await Promise.all([
    sha256File(sourceLockPath),
    sha256File(artifactSet.js.path),
    sha256File(artifactSet.wasm.path),
  ])

  return {
    schemaVersion: 1,
    memoryProfile: profile,
    sourceLockSha256,
    toolchain: sourceLock.toolchain,
    sources: sourceLock.sources.map(formatSource),
    artifacts: {
      js: {
        file: artifactSet.js.file,
        sha256: jsSha256,
      },
      wasm: {
        file: artifactSet.wasm.file,
        sha256: wasmSha256,
      },
    },
  }
}

async function verifyProfile(profile) {
  const artifactSet = artifactsForProfile(profile)
  const currentProvenance = await buildProvenance(profile)

  if (writeProvenance) {
    await fs.writeFile(
      artifactSet.provenancePath,
      `${JSON.stringify(currentProvenance, null, 2)}\n`,
    )
    await verifyGeneratedOutputs(artifactSet)
    console.log(`Wrote ${artifactSet.provenancePath}`)
    console.log(`${profile} native artifacts verified.`)
    return
  }

  await requireFile(
    artifactSet.provenancePath,
    `${profile} native artifact provenance`,
  )
  const recordedProvenance = await readJsonFile(
    artifactSet.provenancePath,
    `${profile} native artifact provenance`,
  )
  validateProvenance(recordedProvenance, artifactSet.provenancePath)

  verifyField(recordedProvenance, 'memoryProfile', profile)
  verifyField(
    recordedProvenance,
    'sourceLockSha256',
    currentProvenance.sourceLockSha256,
  )
  verifyField(recordedProvenance, 'toolchain', currentProvenance.toolchain)
  verifyField(recordedProvenance, 'sources', currentProvenance.sources)
  verifyField(
    recordedProvenance,
    'artifacts.js.file',
    currentProvenance.artifacts.js.file,
  )
  verifyField(
    recordedProvenance,
    'artifacts.js.sha256',
    currentProvenance.artifacts.js.sha256,
  )
  verifyField(
    recordedProvenance,
    'artifacts.wasm.file',
    currentProvenance.artifacts.wasm.file,
  )
  verifyField(
    recordedProvenance,
    'artifacts.wasm.sha256',
    currentProvenance.artifacts.wasm.sha256,
  )
  await verifyGeneratedOutputs(artifactSet)
}

async function main() {
  for (const profile of profilesToVerify) {
    await verifyProfile(profile)
  }

  if (!writeProvenance) {
    console.log('Native artifacts verified.')
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
