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
const provenancePath = path.join(distNativeDir, 'provenance.json')
const jsArtifact = {
  file: 'luma_jpeg.js',
  path: path.join(distNativeDir, 'luma_jpeg.js'),
}
const wasmArtifact = {
  file: 'luma_jpeg.wasm',
  path: path.join(distNativeDir, 'luma_jpeg.wasm'),
}
const writeProvenance = process.argv.includes('--write-provenance')
const unknownArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== '--write-provenance')
const forbiddenGeneratedMarkers = [
  ['LIBJPEG', 'TURBO', 'ROOT'].join('_'),
  ['/workspaces', 'LumaForge'].join('/'),
]
const absolutePathLeakPatterns = [
  {
    label: 'POSIX absolute build/source path',
    pattern:
      /(?:^|[\s"'`=:[({,])(?<path>\/(?:home|Users|tmp|private\/tmp|var\/folders|workspaces?|builds?|mnt|opt|Volumes)\/[^\s"'`),;]+)/g,
  },
  {
    label: 'Windows absolute build/source path',
    pattern:
      /(?:^|[\s"'`=:[({,])(?<path>[A-Za-z]:[\\/](?:Users|workspaces?|builds?|tmp|Temp|msys64|Projects)[\\/][^\s"'`),;]+)/g,
  },
  {
    label: 'Windows UNC build/source path',
    pattern:
      /(?:^|[\s"'`=:[({,])(?<path>\\\\[^\\/\s"'`),;]+\\(?:Users|workspaces?|builds?|tmp|Temp|Projects)\\[^\s"'`),;]+)/g,
  },
]
const allowedGeneratedAbsolutePaths = new Set(['/home/web_user'])

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

function validateProvenance(provenance) {
  if (!isObject(provenance)) {
    throw new TypeError(`Invalid native artifact provenance: ${provenancePath}`)
  }

  if (provenance.schemaVersion !== 1) {
    throw new TypeError(
      'Invalid native artifact provenance: schemaVersion must be 1',
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

function isAllowedGeneratedAbsolutePath(leakedPath) {
  return allowedGeneratedAbsolutePaths.has(leakedPath)
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

  const markerMatches = forbiddenGeneratedMarkers
    .filter((marker) => contents.includes(marker))
    .map(
      (marker) =>
        `${artifact.file} contains forbidden native baseline marker: ${marker}`,
    )

  const pathMatches = absolutePathLeakPatterns.flatMap(({ label, pattern }) => {
    pattern.lastIndex = 0
    const matches = []
    for (const match of contents.matchAll(pattern)) {
      const leakedPath = match.groups?.path ?? match[0].trim()
      if (isAllowedGeneratedAbsolutePath(leakedPath)) continue

      matches.push(`${artifact.file} contains ${label}: ${leakedPath}`)
    }

    return matches
  })

  return [...markerMatches, ...pathMatches]
}

async function verifyGeneratedOutputs() {
  const matches = [
    ...(await scanGeneratedOutput(jsArtifact)),
    ...(await scanGeneratedOutput({
      file: 'provenance.json',
      path: provenancePath,
    })),
    ...(await scanGeneratedOutput(wasmArtifact, { required: false })),
  ]

  if (matches.length > 0) {
    throw new Error(
      `Forbidden native baseline markers found in generated artifacts:\n${matches.join('\n')}`,
    )
  }
}

async function buildProvenance() {
  await requireFile(sourceLockPath, 'native source lockfile')
  await requireFile(jsArtifact.path, 'native JS artifact')
  await requireFile(wasmArtifact.path, 'native WASM artifact')

  const sourceLock = await readJsonFile(
    sourceLockPath,
    'native source lockfile',
  )
  validateSourceLock(sourceLock)

  const [sourceLockSha256, jsSha256, wasmSha256] = await Promise.all([
    sha256File(sourceLockPath),
    sha256File(jsArtifact.path),
    sha256File(wasmArtifact.path),
  ])

  return {
    schemaVersion: 1,
    sourceLockSha256,
    toolchain: sourceLock.toolchain,
    sources: sourceLock.sources.map(formatSource),
    artifacts: {
      js: {
        file: jsArtifact.file,
        sha256: jsSha256,
      },
      wasm: {
        file: wasmArtifact.file,
        sha256: wasmSha256,
      },
    },
  }
}

async function main() {
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArgs.join(', ')}`)
  }

  const currentProvenance = await buildProvenance()

  if (writeProvenance) {
    await fs.writeFile(
      provenancePath,
      `${JSON.stringify(currentProvenance, null, 2)}\n`,
    )
    await verifyGeneratedOutputs()
    console.log(`Wrote ${provenancePath}`)
    console.log('Native artifacts verified.')
    return
  }

  await requireFile(provenancePath, 'native artifact provenance')
  const recordedProvenance = await readJsonFile(
    provenancePath,
    'native artifact provenance',
  )
  validateProvenance(recordedProvenance)

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
  await verifyGeneratedOutputs()

  console.log('Native artifacts verified.')
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
