# Luma RAW Runtime Independent Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current prototype native build, which links against local `LibRaw-Wasm` artifacts, with a CI-reproducible Luma-owned RAW runtime built from pinned upstream LibRaw and LCMS source archives.

**Architecture:** Keep `@lumaforge/luma-raw-runtime` as the monorepo runtime package, but make its native layer hermetic: source lock -> verified download -> local static LibRaw/LCMS build -> Luma wrapper link -> artifact provenance -> CI smoke decode. Treat `libraw-wasm` only as a historical benchmark competitor, never as a build input.

**Tech Stack:** pnpm workspace, TypeScript, Node scripts, GitHub Actions, Emscripten SDK 5.0.6, LibRaw 0.22.1, Little CMS 2.18, Web Worker, Embind, Vitest, browser benchmark harness

---

## Scope Guard

This plan implements the replacement design at:

- `docs/specs/2026-04-24-luma-raw-runtime-independent-build-design.md`

Do not optimize decode algorithms before the independent build chain is working in CI. A faster runtime that cannot be rebuilt from source is not acceptable for this phase.

Do not reintroduce `libraw-wasm` into active package dependencies or native build scripts. If a benchmark needs it, add an explicitly isolated benchmark-only harness after the native build is independent.

## File Structure Map

### Native build files

- Create: `packages/luma-raw-runtime/native/sources.lock.json`
  Pins Emscripten, LibRaw, and LCMS source inputs.

- Create: `packages/luma-raw-runtime/native/scripts/fetch-sources.mjs`
  Downloads locked source archives, verifies SHA-256, and extracts them into `native/vendor`.

- Create: `packages/luma-raw-runtime/native/scripts/build-deps.sh`
  Builds LCMS and LibRaw static libraries into `native/build/sysroot`.

- Create: `packages/luma-raw-runtime/native/scripts/build-wasm.sh`
  Links `native/libraw_wrapper.cpp` against locally built static libraries.

- Create: `packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs`
  Verifies generated `dist/native` artifacts and writes/validates provenance.

- Create: `packages/luma-raw-runtime/native/scripts/verify-no-baseline-deps.mjs`
  Fails if active native/CI files reference `LibRaw-Wasm`, `BASELINE_ROOT`, or local `/workspaces/LumaForge` build inputs.

- Modify: `packages/luma-raw-runtime/native/build-libraw.sh`
  Becomes a thin orchestrator over fetch/build/verify scripts. It must not read `LIBRAW_WASM_ROOT`.

- Modify: `packages/luma-raw-runtime/native/emcc-flags.sh`
  Keeps optimized flags, but the flags are consumed only by the independent build scripts.

- Create: `packages/luma-raw-runtime/native/patches/README.md`
  Documents when patches are allowed and how they are applied.

### Package and CI files

- Modify: `packages/luma-raw-runtime/package.json`
  Adds native fetch/verify scripts and keeps `build:native`.

- Modify: `.github/workflows/build.yml`
  Installs/uses pinned Emscripten, builds native wasm from source, runs runtime package tests, then builds the app.

- Modify: `.gitignore`
  Ignores native caches, vendored extracted sources, and native build directories.

### Fixture and benchmark files

- Create: `packages/luma-raw-runtime/fixtures/public.lock.json`
  Locks one small redistributable RAW fixture for CI smoke decode.

- Create: `packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs`
  Downloads and verifies public fixtures into an ignored fixture cache.

- Modify: `packages/luma-raw-runtime/fixtures/README.md`
  Removes hard-coded absolute fixture paths as required inputs.

- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`
  Keeps local/manual high-megapixel benchmark support, but reads fixtures from file picker or `LUMAFORGE_RAW_FIXTURE_DIR`.

### Documentation files

- Modify: `docs/specs/2026-04-23-luma-raw-runtime-migration-design.md`
  Mark previous runtime-readiness claims as superseded by the independent build design.

- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
  Mark V2 as historical local prototype evidence, not production readiness.

- Modify: `docs/plans/2026-04-23-luma-raw-runtime-default-and-libraw-removal-plan.md`
  Mark default-readiness claims as blocked until independent CI build passes.

- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
  Replace absolute-path fixture wording with local/manual fixture labels plus CI public fixture coverage.

## Acceptance Gates

The implementation is complete only when all commands pass from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm --filter @lumaforge/luma-raw-runtime native:fetch
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime native:verify
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm build
```

And this guard must find no active native or CI build dependency on local baseline artifacts:

```bash
pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
```

Expected: pass. The guard intentionally ignores its own pattern literals, generated artifacts, caches, vendored sources, and historical docs. Historical docs may still mention those strings if clearly marked as historical or superseded.

## Task 1: Make The Current State Honest

**Files:**
- Modify: `docs/specs/2026-04-23-luma-raw-runtime-migration-design.md`
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-default-and-libraw-removal-plan.md`
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`

- [ ] **Step 1: Add supersession banners**

Add this banner near the top of the three 2026-04-23 runtime docs:

```md
> 2026-04-24 correction: This document is superseded for native runtime readiness by `docs/specs/2026-04-24-luma-raw-runtime-independent-build-design.md` and `docs/plans/2026-04-24-luma-raw-runtime-independent-build-implementation-plan.md`. The V2 measurements remain historical prototype evidence, but they do not prove an independent Luma runtime because the native build linked against local `LibRaw-Wasm` artifacts and CI did not rebuild wasm from pinned sources.
```

In `docs/specs/2026-04-22-phase1-test-matrix.md`, change migration rows that say final Luma-only migration is complete so they say independent native-build readiness is blocked until the new source/CI gates pass.

- [ ] **Step 2: Verify docs now distinguish prototype evidence from release evidence**

Run:

```bash
rg -n "Final migration complete|Status: PASS|V2 gate passed|final Luma-only migration is complete" docs
```

Expected: no unqualified production-readiness claims remain. Matches are acceptable only when the surrounding line explicitly labels the result as historical or superseded.

- [ ] **Step 3: Commit Task 1**

```bash
git add docs/specs/2026-04-23-luma-raw-runtime-migration-design.md \
  docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md \
  docs/plans/2026-04-23-luma-raw-runtime-default-and-libraw-removal-plan.md \
  docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "docs(raw): mark prototype runtime evidence as superseded"
```

## Task 2: Add Native Source Lock And Baseline Dependency Guard

**Files:**
- Create: `packages/luma-raw-runtime/native/sources.lock.json`
- Create: `packages/luma-raw-runtime/native/scripts/verify-no-baseline-deps.mjs`
- Modify: `packages/luma-raw-runtime/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add the native source lock**

Create `packages/luma-raw-runtime/native/sources.lock.json`:

```json
{
  "schemaVersion": 1,
  "toolchain": {
    "emsdk": "5.0.6"
  },
  "sources": [
    {
      "name": "libraw",
      "version": "0.22.1",
      "url": "https://github.com/LibRaw/LibRaw/archive/refs/tags/0.22.1.tar.gz",
      "sha256": "e676248284075605aa2697a66eeed7dc258820bd1d4988c724d29edffd726726",
      "archiveName": "libraw-0.22.1.tar.gz",
      "extractDir": "LibRaw-0.22.1"
    },
    {
      "name": "lcms2",
      "version": "2.18",
      "url": "https://downloads.sourceforge.net/project/lcms/lcms/2.18/lcms2-2.18.tar.gz",
      "sha256": "ee67be3566f459362c1ee094fde2c159d33fa0390aa4ed5f5af676f9e5004347",
      "archiveName": "lcms2-2.18.tar.gz",
      "extractDir": "lcms2-2.18"
    }
  ]
}
```

- [ ] **Step 2: Add the baseline dependency guard**

Create `packages/luma-raw-runtime/native/scripts/verify-no-baseline-deps.mjs`:

```js
import { fileURLToPath } from 'node:url'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { argv, exit } from 'node:process'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const nativeRoot = resolve(scriptDir, '..')
const packageRoot = resolve(nativeRoot, '..')
const repoRoot = resolve(packageRoot, '../..')
const defaultRoots = [
  'packages/luma-raw-runtime/native',
  'packages/luma-raw-runtime/package.json',
  '.github/workflows',
]
const ignoredPathParts = new Set([
  '.cache',
  'build',
  'dist',
  'node_modules',
  'vendor',
])
const ignoredFiles = new Set([
  // The guard source intentionally contains the forbidden pattern literals.
  'packages/luma-raw-runtime/native/scripts/verify-no-baseline-deps.mjs',
  'packages/luma-raw-runtime/native/sources.lock.json',
])
const ignoredSuffixes = [
  '.a',
  '.bc',
  '.d',
  '.js',
  '.map',
  '.o',
  '.wasm',
  '.wasm.map',
  '.provenance.json',
]
const patterns = [
  /LibRaw-Wasm/,
  /BASELINE_ROOT/,
  /LIBRAW_WASM_ROOT/,
  /\/workspaces\/LumaForge/,
]

function normalizeRelative(path) {
  return path.split(sep).join('/')
}

function shouldIgnore(path) {
  const normalized = normalizeRelative(path)
  if (ignoredFiles.has(normalized)) return true
  if (ignoredSuffixes.some((suffix) => normalized.endsWith(suffix))) {
    return true
  }
  return normalized.split('/').some((part) => ignoredPathParts.has(part))
}

async function collectFiles(target) {
  const absolutePath = resolve(repoRoot, target)
  const relativePath = relative(repoRoot, absolutePath)

  if (shouldIgnore(relativePath)) return []

  let entry
  try {
    entry = await stat(absolutePath)
  } catch {
    return []
  }

  if (entry.isDirectory()) {
    const children = await readdir(absolutePath)
    const nested = await Promise.all(
      children.map((child) => collectFiles(join(relativePath, child))),
    )
    return nested.flat()
  }

  return entry.isFile() ? [absolutePath] : []
}

const inputs = argv.slice(2)
const targets = inputs.length > 0 ? inputs : defaultRoots
const files = (await Promise.all(targets.map(collectFiles))).flat()
const failures = []

for (const path of files) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    continue
  }

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      failures.push(`${relative(repoRoot, path)} matches ${pattern}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Forbidden native baseline dependencies found:')
  for (const failure of failures) console.error(`- ${failure}`)
  exit(1)
}

console.log('No forbidden native baseline dependencies found.')
```

- [ ] **Step 3: Add native cache ignores**

Append to `.gitignore`:

```gitignore
packages/luma-raw-runtime/native/.cache/
packages/luma-raw-runtime/native/vendor/
packages/luma-raw-runtime/native/build/
packages/luma-raw-runtime/fixtures/.cache/
```

- [ ] **Step 4: Add package scripts**

In `packages/luma-raw-runtime/package.json`, add:

```json
{
  "scripts": {
    "native:verify-baseline": "node native/scripts/verify-no-baseline-deps.mjs"
  }
}
```

Keep existing scripts intact.

- [ ] **Step 5: Verify the guard fails before the build rewrite**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
```

Expected before Task 4: FAIL, because `native/build-libraw.sh` still references `BASELINE_ROOT` and `LibRaw-Wasm`.

- [ ] **Step 6: Commit Task 2**

```bash
git add .gitignore \
  packages/luma-raw-runtime/package.json \
  packages/luma-raw-runtime/native/sources.lock.json \
  packages/luma-raw-runtime/native/scripts/verify-no-baseline-deps.mjs
git commit -m "build(raw): add native source lock and baseline guard"
```

## Task 3: Add Verified Native Source Fetching

**Files:**
- Create: `packages/luma-raw-runtime/native/scripts/fetch-sources.mjs`
- Modify: `packages/luma-raw-runtime/package.json`

- [ ] **Step 1: Implement source fetch script**

Create `packages/luma-raw-runtime/native/scripts/fetch-sources.mjs`:

```js
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { exit } from 'node:process'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const nativeRoot = resolve(scriptDir, '..')
const lockPath = resolve(nativeRoot, 'sources.lock.json')
const cacheRoot = resolve(nativeRoot, '.cache/sources')
const vendorRoot = resolve(nativeRoot, 'vendor')

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
    })
  })
}

async function sha256(path) {
  const hash = createHash('sha256')
  const file = await readFile(path)
  hash.update(file)
  return hash.digest('hex')
}

async function download(url, path) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`)
  }

  await mkdir(dirname(path), { recursive: true })
  await pipeline(response.body, createWriteStream(path))
}

const lock = JSON.parse(await readFile(lockPath, 'utf8'))

await mkdir(cacheRoot, { recursive: true })
await rm(vendorRoot, { recursive: true, force: true })
await mkdir(vendorRoot, { recursive: true })

for (const source of lock.sources) {
  const archivePath = resolve(cacheRoot, source.archiveName)
  try {
    const existingHash = await sha256(archivePath)
    if (existingHash !== source.sha256) {
      await rm(archivePath, { force: true })
      await download(source.url, archivePath)
    }
  } catch {
    await download(source.url, archivePath)
  }

  const actualHash = await sha256(archivePath)
  if (actualHash !== source.sha256) {
    console.error(`${source.name} hash mismatch.`)
    console.error(`Expected: ${source.sha256}`)
    console.error(`Actual:   ${actualHash}`)
    exit(1)
  }

  await run('tar', ['-xzf', archivePath, '-C', vendorRoot])
  console.log(`Fetched ${source.name}@${source.version}`)
}
```

- [ ] **Step 2: Add fetch script to package.json**

Add:

```json
{
  "scripts": {
    "native:fetch": "node native/scripts/fetch-sources.mjs"
  }
}
```

- [ ] **Step 3: Verify source fetching**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime native:fetch
test -d packages/luma-raw-runtime/native/vendor/LibRaw-0.22.1
test -d packages/luma-raw-runtime/native/vendor/lcms2-2.18
```

Expected: both extracted source directories exist.

- [ ] **Step 4: Commit Task 3**

```bash
git add packages/luma-raw-runtime/package.json \
  packages/luma-raw-runtime/native/scripts/fetch-sources.mjs
git commit -m "build(raw): fetch pinned native sources"
```

## Task 4: Replace The `LibRaw-Wasm` Native Build

**Files:**
- Create: `packages/luma-raw-runtime/native/scripts/build-deps.sh`
- Create: `packages/luma-raw-runtime/native/scripts/build-wasm.sh`
- Modify: `packages/luma-raw-runtime/native/build-libraw.sh`
- Modify: `packages/luma-raw-runtime/native/emcc-flags.sh`
- Create: `packages/luma-raw-runtime/native/patches/README.md`

- [ ] **Step 1: Add patch policy**

Create `packages/luma-raw-runtime/native/patches/README.md`:

```md
# Native Patches

This directory is for explicit patches against locked upstream native sources.

Rules:

- Do not patch extracted files directly in `native/vendor`.
- Every patch must mention the upstream source name and version.
- Every patch must be applied by `native/scripts/build-deps.sh`.
- If a patch changes runtime behavior, update benchmark notes after CI build passes.

The initial independent build uses no source patches.
```

- [ ] **Step 2: Add dependency build script**

Create `packages/luma-raw-runtime/native/scripts/build-deps.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDOR_DIR="${NATIVE_DIR}/vendor"
BUILD_DIR="${NATIVE_DIR}/build"
SYSROOT_DIR="${BUILD_DIR}/sysroot"
LCMS_DIR="${VENDOR_DIR}/lcms2-2.18"
LIBRAW_DIR="${VENDOR_DIR}/LibRaw-0.22.1"

source "${NATIVE_DIR}/emcc-flags.sh"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc is required. Activate Emscripten SDK 5.0.6 before building." >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${SYSROOT_DIR}"

pushd "${LCMS_DIR}" >/dev/null
command -v libtoolize >/dev/null 2>&1 && libtoolize || glibtoolize
autoreconf -fi
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --prefix="${SYSROOT_DIR}" \
  --disable-shared \
  --disable-dependency-tracking \
  CFLAGS="${LUMA_RAW_CFLAGS}"
emmake make -j"$(nproc)"
emmake make install
popd >/dev/null

pushd "${LIBRAW_DIR}" >/dev/null
command -v libtoolize >/dev/null 2>&1 && libtoolize || glibtoolize
autoreconf -fi
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --prefix="${SYSROOT_DIR}" \
  --enable-lcms \
  --disable-shared \
  --disable-examples \
  --disable-dependency-tracking \
  CFLAGS="${LUMA_RAW_CFLAGS} -I${SYSROOT_DIR}/include" \
  CXXFLAGS="${LUMA_RAW_CFLAGS} -I${SYSROOT_DIR}/include" \
  LDFLAGS="-L${SYSROOT_DIR}/lib"
emmake make -j"$(nproc)"
emmake make install
popd >/dev/null

test -f "${SYSROOT_DIR}/lib/liblcms2.a"
test -f "${SYSROOT_DIR}/lib/libraw.a"
test -d "${SYSROOT_DIR}/include/libraw"

echo "Built native dependencies into ${SYSROOT_DIR}"
```

- [ ] **Step 3: Add wasm link script**

Create `packages/luma-raw-runtime/native/scripts/build-wasm.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_DIR="$(cd "${NATIVE_DIR}/.." && pwd)"
SYSROOT_DIR="${NATIVE_DIR}/build/sysroot"

source "${NATIVE_DIR}/emcc-flags.sh"

mkdir -p "${PACKAGE_DIR}/dist/native"

emcc \
  --bind \
  -I"${SYSROOT_DIR}/include" \
  ${LUMA_RAW_LDFLAGS} \
  ${LUMA_RAW_CFLAGS} \
  "${NATIVE_DIR}/libraw_wrapper.cpp" \
  "${SYSROOT_DIR}/lib/liblcms2.a" \
  "${SYSROOT_DIR}/lib/libraw.a" \
  -o "${PACKAGE_DIR}/dist/native/luma_raw.js"

node "${NATIVE_DIR}/scripts/verify-native-artifacts.mjs" --write-provenance
echo "Built Luma RAW native runtime into ${PACKAGE_DIR}/dist/native"
```

- [ ] **Step 4: Rewrite build orchestrator**

Replace `packages/luma-raw-runtime/native/build-libraw.sh` with:

```bash
#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

node "${SCRIPT_DIR}/scripts/verify-no-baseline-deps.mjs"

node "${SCRIPT_DIR}/scripts/fetch-sources.mjs"
bash "${SCRIPT_DIR}/scripts/build-deps.sh"
bash "${SCRIPT_DIR}/scripts/build-wasm.sh"

cd "${REPO_ROOT}"
pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
```

- [ ] **Step 5: Keep Emscripten flags explicit**

Update `packages/luma-raw-runtime/native/emcc-flags.sh` so flags are grouped and exported:

```bash
#!/usr/bin/env bash

set -euo pipefail

export LUMA_RAW_CFLAGS="-O3 -flto -ffast-math -msimd128 -DNDEBUG -DUSE_LCMS2"
export LUMA_RAW_LDFLAGS="-O3 -flto -pthread -s USE_PTHREADS=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=256MB -s USE_LIBPNG=1 -s USE_LIBJPEG=1 -s USE_ZLIB=1 -s DISABLE_EXCEPTION_CATCHING=0 -s EXPORTED_RUNTIME_METHODS=HEAPU8"
```

Do not add local include or library paths here.

- [ ] **Step 6: Make scripts executable**

Run:

```bash
chmod +x packages/luma-raw-runtime/native/build-libraw.sh \
  packages/luma-raw-runtime/native/scripts/build-deps.sh \
  packages/luma-raw-runtime/native/scripts/build-wasm.sh
```

- [ ] **Step 7: Verify the guard now passes**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
```

Expected: PASS with `No forbidden native baseline dependencies found.`

- [ ] **Step 8: Commit Task 4**

```bash
git add packages/luma-raw-runtime/native
git commit -m "build(raw): build native runtime from pinned sources"
```

## Task 5: Add Native Artifact Provenance

**Files:**
- Create: `packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs`
- Modify: `packages/luma-raw-runtime/package.json`

- [ ] **Step 1: Implement artifact verification**

Create `packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs`:

```js
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit } from 'node:process'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const nativeRoot = resolve(scriptDir, '..')
const packageRoot = resolve(nativeRoot, '..')
const distRoot = resolve(packageRoot, 'dist/native')
const sourceLockPath = resolve(nativeRoot, 'sources.lock.json')
const provenancePath = resolve(distRoot, 'provenance.json')

async function sha256(path) {
  const data = await readFile(path)
  return createHash('sha256').update(data).digest('hex')
}

async function requireFile(path) {
  try {
    await readFile(path)
  } catch {
    console.error(`Missing native artifact: ${path}`)
    exit(1)
  }
}

const jsPath = resolve(distRoot, 'luma_raw.js')
const wasmPath = resolve(distRoot, 'luma_raw.wasm')
await requireFile(jsPath)
await requireFile(wasmPath)

const sourceLock = JSON.parse(await readFile(sourceLockPath, 'utf8'))
const provenance = {
  schemaVersion: 1,
  sourceLockSha256: await sha256(sourceLockPath),
  toolchain: sourceLock.toolchain,
  sources: sourceLock.sources.map(({ name, version, url, sha256 }) => ({
    name,
    version,
    url,
    sha256,
  })),
  artifacts: {
    js: {
      file: 'luma_raw.js',
      sha256: await sha256(jsPath),
    },
    wasm: {
      file: 'luma_raw.wasm',
      sha256: await sha256(wasmPath),
    },
  },
}

if (argv.includes('--write-provenance')) {
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`Wrote ${provenancePath}`)
} else {
  await requireFile(provenancePath)
  const existing = JSON.parse(await readFile(provenancePath, 'utf8'))
  if (existing.artifacts?.wasm?.sha256 !== provenance.artifacts.wasm.sha256) {
    console.error('Native wasm provenance does not match generated artifact.')
    exit(1)
  }
}

console.log('Native artifacts verified.')
```

- [ ] **Step 2: Add verify script**

Add to `packages/luma-raw-runtime/package.json`:

```json
{
  "scripts": {
    "native:verify": "node native/scripts/verify-native-artifacts.mjs && pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline"
  }
}
```

- [ ] **Step 3: Build and verify native artifacts locally**

Activate Emscripten 5.0.6, then run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime native:verify
```

Expected:

- `packages/luma-raw-runtime/dist/native/luma_raw.js` exists.
- `packages/luma-raw-runtime/dist/native/luma_raw.wasm` exists.
- `packages/luma-raw-runtime/dist/native/provenance.json` exists.
- Baseline guard passes.

- [ ] **Step 4: Commit Task 5**

```bash
git add packages/luma-raw-runtime/package.json \
  packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs
git commit -m "build(raw): record native artifact provenance"
```

## Task 6: Make GitHub Actions Rebuild Native WASM

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Replace CI with native-aware build**

Rewrite `.github/workflows/build.yml` around this shape:

```yaml
name: Build

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false

      - name: Install native build tools
        run: |
          sudo apt-get update
          sudo apt-get install -y autoconf automake libtool pkg-config

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ~/.pnpm-store
          key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-

      - name: Cache Emscripten SDK
        uses: actions/cache@v4
        with:
          path: ~/.cache/lumaforge-emsdk
          key: ${{ runner.os }}-emsdk-5.0.6

      - name: Install Emscripten SDK
        run: |
          if [ ! -d "$HOME/.cache/lumaforge-emsdk/.git" ]; then
            git clone https://github.com/emscripten-core/emsdk.git "$HOME/.cache/lumaforge-emsdk"
          fi
          cd "$HOME/.cache/lumaforge-emsdk"
          git fetch --tags
          ./emsdk install 5.0.6
          ./emsdk activate 5.0.6

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build native RAW runtime
        run: |
          . "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh"
          pnpm --filter @lumaforge/luma-raw-runtime build:native
          pnpm --filter @lumaforge/luma-raw-runtime native:verify

      - name: Test runtime package
        run: pnpm --filter @lumaforge/luma-raw-runtime test

      - name: Build runtime package
        run: pnpm --filter @lumaforge/luma-raw-runtime build

      - name: Build app
        run: pnpm run build
```

- [ ] **Step 2: Run YAML-level local checks**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
```

Expected: PASS. The CI file must not include `LibRaw-Wasm` or `/workspaces/LumaForge`.

- [ ] **Step 3: Commit Task 6**

```bash
git add .github/workflows/build.yml
git commit -m "ci(raw): rebuild native runtime from source"
```

## Task 7: Add CI Public RAW Fixture Smoke

**Files:**
- Create: `packages/luma-raw-runtime/fixtures/public.lock.json`
- Create: `packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs`
- Modify: `packages/luma-raw-runtime/fixtures/README.md`
- Modify: `packages/luma-raw-runtime/package.json`
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add public fixture lock**

Create `packages/luma-raw-runtime/fixtures/public.lock.json`:

```json
{
  "schemaVersion": 1,
  "fixtures": [
    {
      "name": "raw-pixls-iphone-se-dng",
      "file": "raw-pixls-iphone-se.dng",
      "url": "https://raw.pixls.us/data/Apple/iPhone%20SE/A4973FFB-9CBD-4ED8-805D-E30F4AE08A95.dng",
      "sha256": "7a2a9747a0cb1537007233ce7e8b7233c5ee641d683b7b3da29e22387994a0d7",
      "license": "CC0/public-domain declaration on raw.pixls.us upload flow",
      "purpose": "CI smoke decode only"
    }
  ]
}
```

- [ ] **Step 2: Add fixture fetch script**

Create `packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs` using the same download and SHA-256 verification pattern as `native/scripts/fetch-sources.mjs`. Store files under:

```text
packages/luma-raw-runtime/fixtures/.cache/public/
```

The script must print each fetched fixture name and fail on hash mismatch.

- [ ] **Step 3: Add package script**

Add:

```json
{
  "scripts": {
    "fixtures:fetch-public": "node fixtures/scripts/fetch-public-fixtures.mjs"
  }
}
```

- [ ] **Step 4: Update fixture README**

Replace absolute-path-only fixture instructions with:

```md
# Luma RAW Runtime Fixtures

CI uses locked public fixtures:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

The public fixture set proves clean-build decode functionality. It does not prove high-megapixel performance.

Local performance fixtures are supplied explicitly:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/workspaces/LumaForge/test-images \
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Do not hard-code local absolute fixture paths in runtime source or CI.
```

- [ ] **Step 5: Add CI fixture fetch step**

In `.github/workflows/build.yml`, after native build and before runtime package tests:

```yaml
      - name: Fetch public RAW smoke fixtures
        run: pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

- [ ] **Step 6: Commit Task 7**

```bash
git add packages/luma-raw-runtime/fixtures \
  packages/luma-raw-runtime/package.json \
  .github/workflows/build.yml
git commit -m "test(raw): add public fixture smoke inputs"
```

## Task 8: Add Native Smoke Decode Test

**Files:**
- Create: `packages/luma-raw-runtime/src/native-smoke.test.ts`
- Modify: `packages/luma-raw-runtime/package.json`
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add a browser-capable smoke test command**

If the existing Vitest config cannot load the real wasm module in Node, add a separate script:

```json
{
  "scripts": {
    "test:native-smoke": "vitest run src/native-smoke.test.ts --environment jsdom"
  }
}
```

If jsdom cannot run pthread wasm reliably, use a Playwright-backed smoke page instead. The acceptance criterion is real CI-built wasm opening a real RAW fixture, not only mock-native tests.

- [ ] **Step 2: Add smoke test behavior**

The smoke test must:

- Load the CI-built `dist/native/luma_raw.js`.
- Read the public fixture from `fixtures/.cache/public/raw-pixls-iphone-se.dng`.
- Call the runtime through the same public package API used by the app.
- Assert metadata has positive width and height.
- Assert either embedded preview exists with non-zero dimensions or quick decode returns a non-empty RGB16 frame.

- [ ] **Step 3: Add CI smoke test step**

In `.github/workflows/build.yml`, after public fixture fetch:

```yaml
      - name: Smoke test CI-built native runtime
        run: pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

- [ ] **Step 4: Commit Task 8**

```bash
git add packages/luma-raw-runtime/src/native-smoke.test.ts \
  packages/luma-raw-runtime/package.json \
  .github/workflows/build.yml
git commit -m "test(raw): smoke test ci-built wasm"
```

## Task 9: Restore Benchmarking Without Absolute Paths

**Files:**
- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`
- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.html`
- Modify: `packages/luma-raw-runtime/fixtures/README.md`

- [ ] **Step 1: Remove required absolute fixture paths**

Ensure benchmark code has no required path references:

```bash
rg "/workspaces/LumaForge|LibRaw-Wasm" packages/luma-raw-runtime/benchmarks packages/luma-raw-runtime/fixtures
```

Expected after edits: no matches except explanatory text clearly labeled as local examples.

- [ ] **Step 2: Keep file-picker benchmark as the default**

`bench-runtime.html` should accept multiple user-selected files and print JSONL rows with:

- runtime
- stage
- file name
- file size
- width
- height
- megapixels
- total ms
- read/transfer/copy/open/unpack/process/output timings
- heap before/after/peak
- target status
- provenance source lock hash

- [ ] **Step 3: Add environment-driven local fixture helper**

If a headless benchmark helper exists, make it read:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/absolute/path/to/local/fixtures
```

It must fail with a clear message when the env var is missing rather than defaulting to `/workspaces/LumaForge/test-images`.

- [ ] **Step 4: Commit Task 9**

```bash
git add packages/luma-raw-runtime/benchmarks \
  packages/luma-raw-runtime/fixtures/README.md
git commit -m "bench(raw): remove absolute fixture assumptions"
```

## Task 10: Re-Run Performance Gate On The Independent Build

**Files:**
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- Create: `docs/plans/2026-04-24-luma-raw-runtime-independent-benchmark-notes.md`

- [ ] **Step 1: Build from source before measuring**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh"
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime native:verify
pnpm --filter @lumaforge/luma-raw-runtime build
pnpm build
```

Expected: all pass. Do not benchmark stale `dist/native` output.

- [ ] **Step 2: Run real fixture benchmark**

Run the browser benchmark with the local high-megapixel fixture directory:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/workspaces/LumaForge/test-images \
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Select at least:

- one 24MP to 26MP Sony ARW
- one 45MP Nikon NEF
- one 60MP Sony ARW

Save JSONL to:

```text
/tmp/luma-raw-runtime-independent-perf.jsonl
```

- [ ] **Step 3: Apply rollout thresholds**

The independent build passes performance only if:

- embedded preview rows are under 1000ms and dimensions are non-zero
- quick rows are at or below 2.6MP and under 4000ms
- 24MP-class HQ rows are under 8000ms
- 45MP+ and 60MP HQ rows are recorded as directional evidence, not hard pass/fail
- every Luma row has heap telemetry
- provenance source lock hash is present in benchmark output

- [ ] **Step 4: Write independent benchmark notes**

Create `docs/plans/2026-04-24-luma-raw-runtime-independent-benchmark-notes.md` with:

- exact commit hash
- source lock hash
- Emscripten version
- browser version
- fixture list
- JSONL summary table
- pass/fail gate result
- regressions versus V2 prototype

- [ ] **Step 5: Commit Task 10**

```bash
git add docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md \
  docs/plans/2026-04-24-luma-raw-runtime-independent-benchmark-notes.md
git commit -m "docs(raw): record independent runtime benchmark gate"
```

## Task 11: Optimize Only After Independent Regression Is Known

**Files:**
- Modify as evidence requires:
  - `packages/luma-raw-runtime/native/emcc-flags.sh`
  - `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
  - `packages/luma-raw-runtime/worker/runtime-core.ts`
  - `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`

- [ ] **Step 1: Compare independent build against prototype V2**

Use the independent benchmark notes and historical V2 table. Identify the first regressed timing bucket:

- `copyToWasm`
- `librawOpen`
- `thumbnail`
- `unpack`
- `process`
- `makeMemImage`
- `outputCopy`
- heap growth

- [ ] **Step 2: Pick one optimization target**

Only optimize the first dominant regression. Do not tune compiler flags and wrapper behavior in the same commit.

Recommended order:

1. Restore missing `-O3`, `-flto`, `-msimd128`, pthread, or LCMS flags if provenance shows drift.
2. Verify `openWithSettings` does not reload or recopy input bytes across stages.
3. Keep embedded extraction before any `unpack()` path.
4. Keep quick `halfSize=true`, `userQual=0`, `outputBps=16`, and `maxOutputPixels=2_500_000`.
5. Reduce output copy only if `outputCopy` dominates after decode timings are healthy.

- [ ] **Step 3: Re-run focused benchmark after each optimization**

Run the independent build and the same fixture subset after each change:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime native:verify
LUMAFORGE_RAW_FIXTURE_DIR=/workspaces/LumaForge/test-images \
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Record the before/after row in the independent benchmark notes.

- [ ] **Step 4: Commit each optimization separately**

Use one commit per measured optimization:

```bash
git add packages/luma-raw-runtime docs/plans/2026-04-24-luma-raw-runtime-independent-benchmark-notes.md
git commit -m "perf(raw): reduce <measured bottleneck>"
```

## Task 12: Release Readiness Decision

**Files:**
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- Modify: `docs/plans/2026-04-24-luma-raw-runtime-independent-benchmark-notes.md`

- [ ] **Step 1: Run final verification**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
pnpm --filter @lumaforge/luma-raw-runtime native:verify
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Record release status**

If local acceptance gates pass but GitHub Actions has not run yet, record:

```md
Independent Luma RAW runtime status: local release-readiness gates passed for browser-local RAW MVP; production-ready status still requires a GitHub Actions run from a clean checkout.
```

If local and GitHub Actions gates both pass, production-ready status may be recorded.

If any gate fails, record:

```md
Independent Luma RAW runtime status: blocked.

Blocked gate:

- <specific gate name>

Required fix:

- <specific fix>
```

- [ ] **Step 3: Commit final readiness update**

```bash
git add docs/specs/2026-04-22-phase1-test-matrix.md \
  docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md \
  docs/plans/2026-04-24-luma-raw-runtime-independent-benchmark-notes.md
git commit -m "docs(raw): record independent runtime readiness"
```

## Implementation Notes

The expected performance gain over `libraw-wasm` must come from the product-specific execution model, not from pretending a copied static library is a new runtime:

- one runtime package boundary
- one file transfer per image session
- one wasm input copy per session
- embedded-first visual path
- capped quick decode for stylable preview
- deferred HQ decode
- no RAW redecode on style or LUT changes
- CI-built native artifacts with provenance

If the independent build is slower than the prototype, the correct response is to measure and fix the independent build. Reusing `LibRaw-Wasm` artifacts is explicitly out of scope.
