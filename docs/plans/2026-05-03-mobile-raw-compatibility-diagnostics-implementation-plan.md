# Mobile RAW Compatibility Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable phone RAW fixture registry and diagnostics runner that classifies public DNG fixtures from runtime facts.

**Architecture:** Keep downloaded RAW files in the existing ignored fixture cache, while committing only fixture provenance, hashes, tests, and scripts. The implementation adds package-local JavaScript utilities for fixture registry validation, report classification, native runtime probing, and a CLI that writes a JSON support matrix without changing LibRaw, processed-window native code, or product support claims.

**Tech Stack:** Node.js ESM scripts, pnpm 10 workspace filters, Vitest 3, `@lumaforge/luma-raw-runtime` native wasm artifacts, LibRaw 0.22.1, raw.pixls.us public fixtures.

---

## Scope Guard

This plan implements
`docs/specs/2026-05-03-mobile-raw-compatibility-diagnostics-design.md`.

Keep these boundaries:

- Do not change the pinned LibRaw version, Emscripten version, LCMS version, or
  native build flags.
- Do not modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp`.
- Do not broaden UI or README copy into official Apple ProRAW, Samsung Expert
  RAW, Google Pixel RAW, or Android DNG support claims.
- Do not commit downloaded RAW files. They remain under
  `packages/luma-raw-runtime/fixtures/.cache/`.
- Do not add a new runtime dependency. Use Node built-ins and existing Vitest.

The implementation can mark ProRAW-like fixtures as local diagnostics inputs,
but the report must not turn one fixture result into official device support.

## Execution Preflight

Run from the current repo checkout:

```bash
git status --short --branch
pnpm install --frozen-lockfile
```

Expected:

- `git status --short --branch` shows only intentional local changes.
- `pnpm install --frozen-lockfile` exits `0`.

This plan modifies only documentation, package-local fixture scripts, package
scripts, and package-local tests. It does not require a new worktree unless the
implementer wants isolation before execution.

## File Structure

Create:

- `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.mjs`
  - Reads and validates `public.lock.json`.
  - Exposes fixture cache path helpers and `purpose` filtering.
- `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs`
  - Tests extended schema validation and selection rules.
- `packages/luma-raw-runtime/fixtures/scripts/compatibility-report.mjs`
  - Normalizes stage results, export capability facts, classifications, and
    JSON report shape.
- `packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs`
  - Tests `supported`, `preview-only`, `metadata-only`, and `open-failed`
    classification.
- `packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.mjs`
  - Loads generated `dist/native/<profile>/luma_raw.js` and probes fixtures
    through the same native wrapper methods used by the runtime.
- `packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs`
  - Tests center-window planning, stage capture, and native-error
    normalization with fake processors.
- `packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.mjs`
  - CLI entrypoint that verifies fixtures, runs diagnostics, and writes JSON.
- `packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs`
  - Tests CLI argument parsing and missing-artifact/missing-fixture messages.

Modify:

- `packages/luma-raw-runtime/fixtures/public.lock.json`
  - Add extended metadata to the existing iPhone SE fixture.
  - Add local-compatibility phone DNG fixture entries from raw.pixls.us hashes.
- `packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs`
  - Reuse `fixture-registry.mjs`.
  - Support `--purpose=<purpose>` and `--all`.
- `packages/luma-raw-runtime/package.json`
  - Add fixture scripts and include fixture script tests in the package test
    command.
- `packages/luma-raw-runtime/fixtures/README.md`
  - Document CI smoke fetch, all-fixture fetch, diagnostics run, and report
    location.

Do not modify:

- `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- `src/modules/raw-processor/**`
- Product UI files

---

### Task 1: Add Fixture Registry Validation

**Files:**

- Create: `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.mjs`
- Create: `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs`

- [ ] **Step 1: Write the failing registry tests**

Create `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs`:

```js
import { describe, expect, it } from 'vitest'

import {
  selectFixtures,
  validateFixtureLock,
  fixtureCachePath,
} from './fixture-registry.mjs'

const validLock = {
  schemaVersion: 1,
  fixtures: [
    {
      name: 'raw-pixls-iphone-se-dng',
      file: 'raw-pixls-iphone-se.dng',
      url: 'https://raw.pixls.us/data/Apple/iPhone%20SE/A4973FFB-9CBD-4ED8-805D-E30F4AE08A95.dng',
      sha256:
        '7a2a9747a0cb1537007233ce7e8b7233c5ee641d683b7b3da29e22387994a0d7',
      license: 'CC0/public-domain declaration on raw.pixls.us upload flow',
      source: 'raw.pixls.us',
      deviceBrand: 'Apple',
      deviceModel: 'iPhone SE',
      rawFamily: 'apple-dng',
      purpose: 'ci-smoke',
    },
    {
      name: 'raw-pixls-pixel-8-pro-dng',
      file: 'raw-pixls-pixel-8-pro.dng',
      url: 'https://raw.pixls.us/data/Google/Pixel%208%20Pro/PXL_20240415_103400204.RAW-02.ORIGINAL.dng',
      sha256:
        '45420c595401547cca950ae58d552bc82b32d31ce1d58c082df33004016197f5',
      license: 'CC0/public-domain declaration on raw.pixls.us upload flow',
      source: 'raw.pixls.us',
      deviceBrand: 'Google',
      deviceModel: 'Pixel 8 Pro',
      rawFamily: 'android-dng',
      purpose: 'local-compatibility',
    },
  ],
}

describe('fixture registry', () => {
  it('validates extended public fixture metadata', () => {
    expect(validateFixtureLock(validLock, 'public.lock.json')).toBe(validLock)
  })

  it('selects fixtures by purpose without mutating the lockfile', () => {
    expect(selectFixtures(validLock.fixtures, { purpose: 'ci-smoke' })).toEqual([
      validLock.fixtures[0],
    ])
    expect(
      selectFixtures(validLock.fixtures, {
        purpose: 'local-compatibility',
      }),
    ).toEqual([validLock.fixtures[1]])
    expect(selectFixtures(validLock.fixtures, { all: true })).toEqual(
      validLock.fixtures,
    )
  })

  it('rejects duplicate fixture names', () => {
    expect(() =>
      validateFixtureLock(
        {
          ...validLock,
          fixtures: [validLock.fixtures[0], validLock.fixtures[0]],
        },
        'public.lock.json',
      ),
    ).toThrow(
      'Invalid public fixture lockfile: duplicate fixture name raw-pixls-iphone-se-dng',
    )
  })

  it('rejects duplicate fixture files', () => {
    expect(() =>
      validateFixtureLock(
        {
          ...validLock,
          fixtures: [
            validLock.fixtures[0],
            {
              ...validLock.fixtures[1],
              name: 'other-name',
              file: validLock.fixtures[0].file,
            },
          ],
        },
        'public.lock.json',
      ),
    ).toThrow(
      'Invalid public fixture lockfile: duplicate fixture file raw-pixls-iphone-se.dng',
    )
  })

  it('rejects unknown raw families and purposes', () => {
    expect(() =>
      validateFixtureLock(
        {
          ...validLock,
          fixtures: [
            {
              ...validLock.fixtures[0],
              rawFamily: 'phone-dng',
            },
          ],
        },
        'public.lock.json',
      ),
    ).toThrow(
      'Invalid public fixture lockfile: fixtures[0].rawFamily must be one of apple-dng, apple-proraw-dng, android-dng, generic-dng',
    )

    expect(() =>
      validateFixtureLock(
        {
          ...validLock,
          fixtures: [
            {
              ...validLock.fixtures[0],
              purpose: 'nightly',
            },
          ],
        },
        'public.lock.json',
      ),
    ).toThrow(
      'Invalid public fixture lockfile: fixtures[0].purpose must be one of ci-smoke, local-compatibility',
    )
  })

  it('builds cache paths under the fixture cache directory', () => {
    expect(
      fixtureCachePath('/repo/packages/luma-raw-runtime/fixtures', {
        file: 'raw-pixls-iphone-se.dng',
      }),
    ).toBe(
      '/repo/packages/luma-raw-runtime/fixtures/.cache/public/raw-pixls-iphone-se.dng',
    )
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs
```

Expected: FAIL with an import error because
`fixtures/scripts/fixture-registry.mjs` does not exist.

- [ ] **Step 3: Implement the registry utility**

Create `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.mjs`:

```js
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const rawFamilies = [
  'apple-dng',
  'apple-proraw-dng',
  'android-dng',
  'generic-dng',
]

export const fixturePurposes = ['ci-smoke', 'local-compatibility']

const sha256Pattern = /^[0-9a-f]{64}$/
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

function validateUrl(value, index) {
  let url
  try {
    url = new URL(value)
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
}

function validateFixture(fixture, index, seenNames, seenFiles) {
  if (!isObject(fixture)) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}] must be an object`,
    )
  }

  for (const field of requiredStringFields) {
    if (typeof fixture[field] !== 'string' || fixture[field].length === 0) {
      throw new TypeError(
        `Invalid public fixture lockfile: fixtures[${index}].${field} must be a non-empty string`,
      )
    }
  }

  if (fixture.deviceBrand !== undefined && typeof fixture.deviceBrand !== 'string') {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].deviceBrand must be a string when present`,
    )
  }
  if (fixture.deviceModel !== undefined && typeof fixture.deviceModel !== 'string') {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].deviceModel must be a string when present`,
    )
  }

  if (!sha256Pattern.test(fixture.sha256)) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].sha256 must be 64 lowercase hex characters`,
    )
  }

  if (!rawFamilies.includes(fixture.rawFamily)) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].rawFamily must be one of ${rawFamilies.join(', ')}`,
    )
  }

  if (!fixturePurposes.includes(fixture.purpose)) {
    throw new TypeError(
      `Invalid public fixture lockfile: fixtures[${index}].purpose must be one of ${fixturePurposes.join(', ')}`,
    )
  }

  validateUrl(fixture.url, index)
  validateBasenameOnlyField(fixture, index, 'file')

  if (seenNames.has(fixture.name)) {
    throw new TypeError(
      `Invalid public fixture lockfile: duplicate fixture name ${fixture.name}`,
    )
  }
  if (seenFiles.has(fixture.file)) {
    throw new TypeError(
      `Invalid public fixture lockfile: duplicate fixture file ${fixture.file}`,
    )
  }

  seenNames.add(fixture.name)
  seenFiles.add(fixture.file)
}

export function validateFixtureLock(lock, lockPath = 'public.lock.json') {
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

  const seenNames = new Set()
  const seenFiles = new Set()
  lock.fixtures.forEach((fixture, index) =>
    validateFixture(fixture, index, seenNames, seenFiles),
  )

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
  if (options.all) return [...fixtures]
  if (options.purpose) {
    if (!fixturePurposes.includes(options.purpose)) {
      throw new TypeError(
        `Fixture purpose must be one of ${fixturePurposes.join(', ')}`,
      )
    }
    return fixtures.filter((fixture) => fixture.purpose === options.purpose)
  }
  return [...fixtures]
}
```

- [ ] **Step 4: Run the registry test and verify it passes**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/luma-raw-runtime/fixtures/scripts/fixture-registry.mjs \
  packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs
git commit -m "test(raw): add public fixture registry validation"
```

---

### Task 2: Extend Public Fixture Lock And Fetch Script

**Files:**

- Modify: `packages/luma-raw-runtime/fixtures/public.lock.json`
- Modify: `packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs`
- Modify: `packages/luma-raw-runtime/package.json`
- Test: `packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs`

- [ ] **Step 1: Add failing coverage for the checked-in lockfile**

At the top of
`packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs`, add:

```js
import { fileURLToPath } from 'node:url'
```

Update the registry import so it includes `readFixtureLock`:

```js
import {
  readFixtureLock,
  selectFixtures,
  validateFixtureLock,
  fixtureCachePath,
} from './fixture-registry.mjs'
```

Then append this test:

```js
it('validates the checked-in public fixture lockfile and phone RAW family split', async () => {
  const publicLockPath = fileURLToPath(
    new URL('../public.lock.json', import.meta.url),
  )
  const lock = await readFixtureLock(publicLockPath)

  expect(lock.fixtures.map((fixture) => fixture.name)).toEqual([
    'raw-pixls-iphone-se-dng',
    'raw-pixls-iphone-12-pro-dng',
    'raw-pixls-pixel-8-pro-dng',
    'raw-pixls-galaxy-s23-ultra-dng',
  ])
  expect(lock.fixtures.map((fixture) => fixture.rawFamily)).toEqual([
    'apple-dng',
    'apple-proraw-dng',
    'android-dng',
    'android-dng',
  ])
  expect(selectFixtures(lock.fixtures, { purpose: 'ci-smoke' })).toHaveLength(1)
  expect(
    selectFixtures(lock.fixtures, { purpose: 'local-compatibility' }),
  ).toHaveLength(3)
})
```

- [ ] **Step 2: Run the test and verify the current lock schema gap**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs
```

Expected: FAIL because the current checked-in `public.lock.json` still has only
the old single-fixture shape and lacks the extended phone RAW metadata.

- [ ] **Step 3: Replace `public.lock.json` with the extended fixture registry**

Replace `packages/luma-raw-runtime/fixtures/public.lock.json` with:

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
      "source": "raw.pixls.us",
      "deviceBrand": "Apple",
      "deviceModel": "iPhone SE",
      "rawFamily": "apple-dng",
      "purpose": "ci-smoke"
    },
    {
      "name": "raw-pixls-iphone-12-pro-dng",
      "file": "raw-pixls-iphone-12-pro.dng",
      "url": "https://raw.pixls.us/data/Apple/iPhone%2012%20Pro/IMG_1361.DNG",
      "sha256": "e91e77a4533ed7cce551d83330676ea5c47dd5e55fb38adda7819366afdbdfc2",
      "license": "CC0/public-domain declaration on raw.pixls.us upload flow",
      "source": "raw.pixls.us",
      "deviceBrand": "Apple",
      "deviceModel": "iPhone 12 Pro",
      "rawFamily": "apple-proraw-dng",
      "purpose": "local-compatibility"
    },
    {
      "name": "raw-pixls-pixel-8-pro-dng",
      "file": "raw-pixls-pixel-8-pro.dng",
      "url": "https://raw.pixls.us/data/Google/Pixel%208%20Pro/PXL_20240415_103400204.RAW-02.ORIGINAL.dng",
      "sha256": "45420c595401547cca950ae58d552bc82b32d31ce1d58c082df33004016197f5",
      "license": "CC0/public-domain declaration on raw.pixls.us upload flow",
      "source": "raw.pixls.us",
      "deviceBrand": "Google",
      "deviceModel": "Pixel 8 Pro",
      "rawFamily": "android-dng",
      "purpose": "local-compatibility"
    },
    {
      "name": "raw-pixls-galaxy-s23-ultra-dng",
      "file": "raw-pixls-galaxy-s23-ultra.dng",
      "url": "https://raw.pixls.us/data/Samsung/Galaxy%20S23%20Ultra/20230817_120455.dng",
      "sha256": "4f9d1b085b328b6c7ae21437c4106889cb38d52fab604a786091bf5fe5ef3da4",
      "license": "CC0/public-domain declaration on raw.pixls.us upload flow",
      "source": "raw.pixls.us",
      "deviceBrand": "Samsung",
      "deviceModel": "Galaxy S23 Ultra",
      "rawFamily": "android-dng",
      "purpose": "local-compatibility"
    }
  ]
}
```

- [ ] **Step 4: Update the fetch script to use the registry helper**

In `packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs`:

1. Remove the local `sha256Pattern`, `fixtureFields`,
   `validateBasenameOnlyField`, `validateFixture`, `validateLockfile`, and
   `readLockfile` definitions.
2. Add imports:

```js
import {
  fixtureCacheDir,
  fixtureCachePath,
  readFixtureLock,
  selectFixtures,
} from './fixture-registry.mjs'
```

3. Replace the current `cacheDir` constant with:

```js
const cacheDir = fixtureCacheDir(fixturesDir)
```

4. Change `ensureFixture` to call `fixtureCachePath`:

```js
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
```

5. Add argument parsing near the bottom:

```js
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
```

6. Replace the `try` block with:

```js
try {
  const lock = await readFixtureLock(lockPath)
  const selectedFixtures = selectFixtures(lock.fixtures, parseArgs(process.argv.slice(2)))

  await fs.mkdir(cacheDir, { recursive: true })

  for (const fixture of selectedFixtures) {
    await ensureFixture(fixture)
    console.log(`Fetched ${fixture.name}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
```

- [ ] **Step 5: Add package scripts**

In `packages/luma-raw-runtime/package.json`, replace:

```json
"fixtures:fetch-public": "node fixtures/scripts/fetch-public-fixtures.mjs",
```

with:

```json
"fixtures:fetch-public": "node fixtures/scripts/fetch-public-fixtures.mjs --purpose=ci-smoke",
"fixtures:fetch-public:all": "node fixtures/scripts/fetch-public-fixtures.mjs --all",
```

Do not add the diagnostics script yet; Task 5 adds it with the CLI.

- [ ] **Step 6: Run schema and fetch smoke commands**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

Expected:

- Registry test passes.
- Fetch command downloads or reuses only `raw-pixls-iphone-se-dng`.
- No local-compatibility fixture is downloaded by the default command.

- [ ] **Step 7: Commit**

```bash
git add packages/luma-raw-runtime/fixtures/public.lock.json \
  packages/luma-raw-runtime/fixtures/scripts/fetch-public-fixtures.mjs \
  packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs \
  packages/luma-raw-runtime/package.json
git commit -m "feat(raw): extend public phone RAW fixture registry"
```

---

### Task 3: Add Compatibility Report Classification

**Files:**

- Create: `packages/luma-raw-runtime/fixtures/scripts/compatibility-report.mjs`
- Create: `packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs`

- [ ] **Step 1: Write failing classification tests**

Create `packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs`:

```js
import { describe, expect, it } from 'vitest'

import {
  buildProcessedWindowRequest,
  classifyEntry,
  normalizeCapability,
  stageError,
  stageOk,
} from './compatibility-report.mjs'

const supportedCapability = {
  supported: true,
  strategy: 'libraw-processed-window',
  width: 4032,
  height: 3024,
  rawWidth: 4048,
  rawHeight: 3040,
  reasons: [],
  sensor: {
    layout: 'bayer',
    colorCount: 3,
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
  },
  orientation: {
    code: 1,
    supported: true,
    outputWidth: 4032,
    outputHeight: 3024,
  },
  visibleCrop: { x: 8, y: 8, width: 4032, height: 3024 },
  windows: { librawProcessed: true, rawMosaic: true },
  diagnostics: {
    librawFilterCode: 512,
    hasRawImage: true,
    hasColor3Image: false,
    hasColor4Image: false,
    hasXTransTable: false,
    canRepeatCropProcess: true,
    lastLibRawWarningMask: 0,
  },
}

describe('compatibility report', () => {
  it('classifies supported entries only when processed-window read succeeds', () => {
    expect(
      classifyEntry({
        stages: {
          open: stageOk(1),
          thumbnail: stageError(new Error('no thumbnail'), 1),
          quick: stageOk(2),
          boundedHq: stageOk(3),
          exportCapability: stageOk(4),
          processedWindow: stageOk(5),
        },
        capability: supportedCapability,
      }),
    ).toBe('supported')
  })

  it('classifies preview-only when full-resolution export is blocked', () => {
    expect(
      classifyEntry({
        stages: {
          open: stageOk(1),
          thumbnail: stageOk(1),
          quick: stageOk(1),
          boundedHq: stageError(new Error('hq failed'), 1),
          exportCapability: stageOk(1),
          processedWindow: stageError(new Error('not attempted'), 0),
        },
        capability: {
          ...supportedCapability,
          supported: false,
          strategy: undefined,
          reasons: ['processed-window-unavailable'],
          windows: { librawProcessed: false, rawMosaic: true },
        },
      }),
    ).toBe('preview-only')
  })

  it('classifies metadata-only when open succeeds but preview stages fail', () => {
    expect(
      classifyEntry({
        stages: {
          open: stageOk(1),
          thumbnail: stageError(new Error('no thumbnail'), 1),
          quick: stageError(new Error('quick failed'), 1),
          boundedHq: stageError(new Error('hq failed'), 1),
          exportCapability: stageError(new Error('capability failed'), 1),
          processedWindow: stageError(new Error('not attempted'), 0),
        },
      }),
    ).toBe('metadata-only')
  })

  it('classifies open-failed when the open stage fails', () => {
    expect(
      classifyEntry({
        stages: {
          open: stageError(Object.assign(new Error('open failed'), { code: 'RAW_OPEN_FAILED' }), 1),
          thumbnail: stageError(new Error('not attempted'), 0),
          quick: stageError(new Error('not attempted'), 0),
          boundedHq: stageError(new Error('not attempted'), 0),
          exportCapability: stageError(new Error('not attempted'), 0),
          processedWindow: stageError(new Error('not attempted'), 0),
        },
      }),
    ).toBe('open-failed')
  })

  it('normalizes capability facts without image payloads', () => {
    expect(normalizeCapability(supportedCapability)).toEqual({
      supported: true,
      strategy: 'libraw-processed-window',
      reasons: [],
      sensor: supportedCapability.sensor,
      orientation: supportedCapability.orientation,
      visibleCrop: supportedCapability.visibleCrop,
      windows: supportedCapability.windows,
      diagnostics: supportedCapability.diagnostics,
    })
  })

  it('builds a center 64x64 processed-window request inside output bounds', () => {
    expect(buildProcessedWindowRequest({ width: 4032, height: 3024 })).toEqual({
      outputRect: { x: 1984, y: 1480, width: 64, height: 64 },
      halo: { left: 0, top: 0, right: 0, bottom: 0 },
    })
    expect(buildProcessedWindowRequest({ width: 40, height: 32 })).toEqual({
      outputRect: { x: 0, y: 0, width: 40, height: 32 },
      halo: { left: 0, top: 0, right: 0, bottom: 0 },
    })
  })
})
```

- [ ] **Step 2: Run the report tests and verify failure**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs
```

Expected: FAIL with an import error because `compatibility-report.mjs` does not
exist.

- [ ] **Step 3: Implement report helpers**

Create `packages/luma-raw-runtime/fixtures/scripts/compatibility-report.mjs`:

```js
export function stableErrorCode(error) {
  if (error && typeof error === 'object' && typeof error.code === 'string') {
    return error.code
  }
  return undefined
}

export function stageOk(durationMs) {
  return Number.isFinite(durationMs) ? { ok: true, durationMs } : { ok: true }
}

export function stageError(error, durationMs) {
  const message = error instanceof Error ? error.message : String(error)
  const code = stableErrorCode(error)
  return {
    ok: false,
    ...(code ? { code } : {}),
    message,
    ...(Number.isFinite(durationMs) ? { durationMs } : {}),
  }
}

export async function captureStage(callback) {
  const start = performance.now()
  try {
    const value = await callback()
    return {
      stage: stageOk(performance.now() - start),
      value,
    }
  } catch (error) {
    return {
      stage: stageError(error, performance.now() - start),
      value: undefined,
    }
  }
}

export function normalizeCapability(capability) {
  if (!capability) return undefined
  return {
    supported: Boolean(capability.supported),
    ...(capability.strategy ? { strategy: capability.strategy } : {}),
    reasons: Array.isArray(capability.reasons) ? [...capability.reasons] : [],
    ...(capability.sensor ? { sensor: capability.sensor } : {}),
    ...(capability.orientation ? { orientation: capability.orientation } : {}),
    ...(capability.visibleCrop ? { visibleCrop: capability.visibleCrop } : {}),
    ...(capability.windows ? { windows: capability.windows } : {}),
    ...(capability.diagnostics ? { diagnostics: capability.diagnostics } : {}),
  }
}

function hasPreview(stages) {
  return stages.thumbnail?.ok || stages.quick?.ok || stages.boundedHq?.ok
}

export function classifyEntry(entry) {
  const stages = entry.stages
  if (!stages.open?.ok) return 'open-failed'
  if (
    hasPreview(stages) &&
    entry.capability?.supported === true &&
    entry.capability?.strategy === 'libraw-processed-window' &&
    entry.capability?.windows?.librawProcessed === true &&
    stages.processedWindow?.ok === true
  ) {
    return 'supported'
  }
  if (hasPreview(stages)) return 'preview-only'
  return 'metadata-only'
}

export function buildProcessedWindowRequest(capability) {
  const width = Math.max(1, Math.min(64, capability.width))
  const height = Math.max(1, Math.min(64, capability.height))
  const x = Math.max(0, Math.floor((capability.width - width) / 2))
  const y = Math.max(0, Math.floor((capability.height - height) / 2))
  return {
    outputRect: { x, y, width, height },
    halo: { left: 0, top: 0, right: 0, bottom: 0 },
  }
}

export function buildReportEntry({ fixture, runtime, metadata, stages, capability }) {
  const normalizedCapability = normalizeCapability(capability)
  const entry = {
    fixture: {
      name: fixture.name,
      file: fixture.file,
      source: fixture.source,
      ...(fixture.deviceBrand ? { deviceBrand: fixture.deviceBrand } : {}),
      ...(fixture.deviceModel ? { deviceModel: fixture.deviceModel } : {}),
      rawFamily: fixture.rawFamily,
      purpose: fixture.purpose,
    },
    runtime,
    ...(metadata ? { metadata } : {}),
    stages,
    ...(normalizedCapability ? { capability: normalizedCapability } : {}),
  }

  return {
    ...entry,
    classification: classifyEntry(entry),
  }
}
```

- [ ] **Step 4: Run the report tests and verify pass**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/luma-raw-runtime/fixtures/scripts/compatibility-report.mjs \
  packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs
git commit -m "feat(raw): classify mobile RAW diagnostics reports"
```

---

### Task 4: Add Native Diagnostics Runtime Bridge

**Files:**

- Create: `packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.mjs`
- Create: `packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs`

- [ ] **Step 1: Write failing native bridge tests**

Create `packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs`:

```js
import { describe, expect, it } from 'vitest'

import {
  createProcessorSession,
  hqSettings,
  quickSettings,
  normalizeMetadata,
  readNativeStage,
} from './native-diagnostics-runtime.mjs'

describe('native diagnostics runtime bridge', () => {
  it('keeps quick and hq settings aligned with runtime policy', () => {
    expect(quickSettings).toMatchObject({
      halfSize: true,
      useCameraWb: true,
      outputColor: 4,
      outputBps: 16,
      noAutoBright: true,
      useAutoWb: false,
      useCameraMatrix: 1,
      bright: 1,
      highlight: 2,
      userQual: 0,
      gamm: [1, 1, 1, 1, 0, 0],
    })
    expect(hqSettings).toMatchObject({
      ...quickSettings,
      halfSize: false,
      userQual: 2,
    })
  })

  it('normalizes metadata without pixel payloads', () => {
    expect(
      normalizeMetadata({
        make: 'Google',
        model: 'Pixel 8 Pro',
        width: 4080,
        height: 3072,
        rawWidth: 4096,
        rawHeight: 3072,
        orientation: 1,
        baselineExposure: 0.25,
        thumbnail: { width: 640, height: 480, format: 'jpeg' },
      }),
    ).toEqual({
      make: 'Google',
      model: 'Pixel 8 Pro',
      width: 4080,
      height: 3072,
      rawWidth: 4096,
      rawHeight: 3072,
      orientation: 1,
      baselineExposure: 0.25,
      thumbnail: { width: 640, height: 480, format: 'jpeg' },
    })
  })

  it('captures native stage success and errors', async () => {
    await expect(readNativeStage(() => 'ok')).resolves.toMatchObject({
      stage: { ok: true },
      value: 'ok',
    })

    const failure = Object.assign(new Error('native failed'), {
      code: 'RAW_OPEN_FAILED',
    })
    await expect(
      readNativeStage(() => {
        throw failure
      }),
    ).resolves.toMatchObject({
      stage: { ok: false, code: 'RAW_OPEN_FAILED', message: 'native failed' },
      value: undefined,
    })
  })

  it('opens processors with quick settings and disposes them once', () => {
    const calls = []
    const processor = {
      loadBuffer(data) {
        calls.push(['loadBuffer', data.byteLength])
        return { copyToWasm: 1 }
      },
      openWithSettings(settings) {
        calls.push(['openWithSettings', settings])
        return { copyToWasm: 0, librawOpen: 2 }
      },
      delete() {
        calls.push(['delete'])
      },
    }

    const session = createProcessorSession(
      { createProcessor: () => processor },
      new Uint8Array([1, 2, 3]),
    )
    session.open(quickSettings)
    session.dispose()
    session.dispose()

    expect(calls).toEqual([
      ['loadBuffer', 3],
      ['openWithSettings', quickSettings],
      ['delete'],
    ])
  })
})
```

- [ ] **Step 2: Run the native bridge tests and verify failure**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs
```

Expected: FAIL with an import error because
`native-diagnostics-runtime.mjs` does not exist.

- [ ] **Step 3: Implement the native bridge**

Create `packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.mjs`:

```js
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { captureStage, stageError, stageOk } from './compatibility-report.mjs'

export const quickSettings = {
  halfSize: true,
  useCameraWb: true,
  outputColor: 4,
  outputBps: 16,
  noAutoBright: true,
  useAutoWb: false,
  useCameraMatrix: 1,
  bright: 1,
  highlight: 2,
  userQual: 0,
  gamm: [1, 1, 1, 1, 0, 0],
}

export const hqSettings = {
  ...quickSettings,
  halfSize: false,
  userQual: 2,
}

export function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return undefined
  const thumbnail =
    metadata.thumbnail ??
    (metadata.thumbWidth && metadata.thumbHeight
      ? {
          width: metadata.thumbWidth,
          height: metadata.thumbHeight,
          format: metadata.thumbFormat ?? 'unknown',
        }
      : undefined)

  return {
    ...(metadata.make ? { make: metadata.make } : {}),
    ...(metadata.model ? { model: metadata.model } : {}),
    ...(metadata.normalizedMake ? { normalizedMake: metadata.normalizedMake } : {}),
    ...(metadata.normalizedModel ? { normalizedModel: metadata.normalizedModel } : {}),
    ...(Number.isFinite(metadata.width) ? { width: metadata.width } : {}),
    ...(Number.isFinite(metadata.height) ? { height: metadata.height } : {}),
    ...(Number.isFinite(metadata.rawWidth) ? { rawWidth: metadata.rawWidth } : {}),
    ...(Number.isFinite(metadata.rawHeight) ? { rawHeight: metadata.rawHeight } : {}),
    ...(Number.isFinite(metadata.orientation) ? { orientation: metadata.orientation } : {}),
    ...(Number.isFinite(metadata.baselineExposure)
      ? { baselineExposure: metadata.baselineExposure }
      : {}),
    ...(thumbnail ? { thumbnail } : {}),
  }
}

export async function readNativeStage(callback) {
  return captureStage(callback)
}

export function createProcessorSession(nativeFactory, bytes) {
  const processor = nativeFactory.createProcessor()
  let disposed = false

  return {
    processor,
    open(settings) {
      processor.loadBuffer(new Uint8Array(bytes))
      processor.openWithSettings(settings)
    },
    dispose() {
      if (disposed) return
      disposed = true
      processor.delete?.()
    },
  }
}

export async function loadNativeFactory({ packageDir, profile = 'desktop' }) {
  const nativeJsPath = path.join(
    packageDir,
    'dist',
    'native',
    profile,
    'luma_raw.js',
  )
  const nativeWasmPath = path.join(
    packageDir,
    'dist',
    'native',
    profile,
    'luma_raw.wasm',
  )
  const nativeModule = await import(pathToFileURL(nativeJsPath).href)
  const module = await nativeModule.default({
    locateFile(filePath) {
      if (filePath.endsWith('.wasm')) return pathToFileURL(nativeWasmPath).href
      return filePath
    },
  })

  return {
    createProcessor() {
      return new module.LumaRawProcessor()
    },
  }
}

export async function diagnoseNativeFixture({
  fixturePath,
  fixture,
  nativeFactory,
  memoryProfile = 'desktop',
  quickMaxOutputPixels = 2_500_000,
  boundedHqMaxOutputPixels = 8_000_000,
}) {
  const bytes = await readFile(fixturePath)
  const session = createProcessorSession(nativeFactory, bytes)
  const stages = {}
  let metadata
  let capability

  try {
    const open = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.readMetadata()
    })
    stages.open = open.stage
    metadata = normalizeMetadata(open.value)

    const thumbnail = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.extractThumbnail?.()
    })
    stages.thumbnail = thumbnail.value ? thumbnail.stage : stageError(new Error('thumbnail unavailable'), thumbnail.stage.durationMs)

    const quick = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.decodePreview({
        maxOutputPixels: quickMaxOutputPixels,
      })
    })
    stages.quick = quick.stage

    const boundedHq = await readNativeStage(() => {
      session.open(hqSettings)
      return session.processor.decodeHq({
        maxOutputPixels: boundedHqMaxOutputPixels,
      })
    })
    stages.boundedHq = boundedHq.stage

    const exportCapability = await readNativeStage(() => {
      session.open(quickSettings)
      return session.processor.probeExportCapability()
    })
    stages.exportCapability = exportCapability.stage
    capability = exportCapability.value

    if (
      capability?.supported === true &&
      capability?.strategy === 'libraw-processed-window' &&
      capability?.windows?.librawProcessed === true
    ) {
      const { buildProcessedWindowRequest } = await import(
        './compatibility-report.mjs'
      )
      const processedWindow = await readNativeStage(() =>
        session.processor.readProcessedWindow(
          buildProcessedWindowRequest(capability),
        ),
      )
      stages.processedWindow = processedWindow.stage
    } else {
      stages.processedWindow = stageError(
        new Error('processed-window not attempted because export capability is unsupported'),
        0,
      )
    }
  } finally {
    session.dispose()
  }

  return {
    fixture,
    runtime: {
      version: '0.1.0',
      memoryProfile,
    },
    metadata,
    stages: {
      open: stages.open ?? stageError(new Error('open not attempted'), 0),
      thumbnail:
        stages.thumbnail ?? stageError(new Error('thumbnail not attempted'), 0),
      quick: stages.quick ?? stageError(new Error('quick not attempted'), 0),
      boundedHq:
        stages.boundedHq ?? stageError(new Error('bounded HQ not attempted'), 0),
      exportCapability:
        stages.exportCapability ??
        stageError(new Error('export capability not attempted'), 0),
      processedWindow:
        stages.processedWindow ??
        stageError(new Error('processed-window not attempted'), 0),
    },
    capability,
  }
}
```

- [ ] **Step 4: Run native bridge tests and verify pass**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.mjs \
  packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs
git commit -m "feat(raw): add native phone RAW diagnostics bridge"
```

---

### Task 5: Add Diagnostics CLI

**Files:**

- Create: `packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.mjs`
- Create: `packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs`
- Modify: `packages/luma-raw-runtime/package.json`

- [ ] **Step 1: Write failing CLI tests**

Create
`packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs`:

```js
import { describe, expect, it } from 'vitest'

import {
  defaultReportPath,
  parseArgs,
  reportPayload,
} from './diagnose-raw-compatibility.mjs'

describe('diagnose RAW compatibility CLI', () => {
  it('parses default CI-smoke selection', () => {
    expect(parseArgs([])).toEqual({
      all: false,
      purpose: 'ci-smoke',
      profile: 'desktop',
      output: undefined,
    })
  })

  it('parses all local fixture diagnostics', () => {
    expect(
      parseArgs([
        '--all',
        '--profile=low-memory',
        '--output=/tmp/report.json',
      ]),
    ).toEqual({
      all: true,
      purpose: undefined,
      profile: 'low-memory',
      output: '/tmp/report.json',
    })
  })

  it('rejects conflicting fixture selectors', () => {
    expect(() => parseArgs(['--all', '--purpose=ci-smoke'])).toThrow(
      'Use either --all or --purpose=<purpose>, not both.',
    )
  })

  it('uses the ignored reports cache as the default output path', () => {
    expect(defaultReportPath('/repo/packages/luma-raw-runtime/fixtures')).toBe(
      '/repo/packages/luma-raw-runtime/fixtures/.cache/reports/mobile-raw-compatibility.json',
    )
  })

  it('wraps entries in a stable report envelope', () => {
    expect(
      reportPayload({
        generatedAt: '2026-05-03T00:00:00.000Z',
        entries: [{ fixture: { name: 'raw' }, classification: 'supported' }],
      }),
    ).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-03T00:00:00.000Z',
      entries: [{ fixture: { name: 'raw' }, classification: 'supported' }],
    })
  })
})
```

- [ ] **Step 2: Run CLI tests and verify failure**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs
```

Expected: FAIL with an import error because
`diagnose-raw-compatibility.mjs` does not exist.

- [ ] **Step 3: Implement the diagnostics CLI**

Create
`packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.mjs`:

```js
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

  for (const arg of argv) {
    if (arg === '--all') {
      result.all = true
      result.purpose = undefined
      continue
    }
    if (arg.startsWith('--purpose=')) {
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

  if (result.all && result.purpose) {
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
  if (!(await pathExists(absolutePath))) {
    throw new Error(
      `Missing cached fixture ${fixture.name}: ${absolutePath}\nRun pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public for CI fixtures or fixtures:fetch-public:all for local compatibility fixtures.`,
    )
  }
  return absolutePath
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
```

- [ ] **Step 4: Add package scripts**

In `packages/luma-raw-runtime/package.json`, add:

```json
"fixtures:diagnose-mobile-raw": "node fixtures/scripts/diagnose-raw-compatibility.mjs --all",
"fixtures:diagnose-mobile-raw:ci": "node fixtures/scripts/diagnose-raw-compatibility.mjs --purpose=ci-smoke",
```

Also update the package test script from:

```json
"test": "vitest run src worker --exclude src/native-smoke.test.ts",
```

to:

```json
"test": "vitest run src worker fixtures/scripts --exclude src/native-smoke.test.ts",
```

- [ ] **Step 5: Run CLI tests and package fixture tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.mjs \
  packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs \
  packages/luma-raw-runtime/package.json
git commit -m "feat(raw): add mobile RAW diagnostics CLI"
```

---

### Task 6: Document The Diagnostics Workflow And Verify Native Smoke

**Files:**

- Modify: `packages/luma-raw-runtime/fixtures/README.md`
- Test: package-local fixture script tests
- Test: existing native smoke path

- [ ] **Step 1: Update the fixture README**

Replace `packages/luma-raw-runtime/fixtures/README.md` with:

````md
# Luma RAW Runtime Fixtures

CI uses locked public fixtures:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

The default fetch command downloads only `purpose: "ci-smoke"` fixtures. It is
kept small so native smoke tests remain practical in CI.

For local compatibility diagnostics, fetch every locked public fixture:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public:all
```

Downloaded RAW files are cached under:

```text
packages/luma-raw-runtime/fixtures/.cache/public/
```

That directory is ignored and must not be committed.

Run the phone RAW diagnostics matrix after native artifacts exist:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native:desktop
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public:all
pnpm --filter @lumaforge/luma-raw-runtime fixtures:diagnose-mobile-raw
```

The diagnostics report is written to:

```text
packages/luma-raw-runtime/fixtures/.cache/reports/mobile-raw-compatibility.json
```

The JSON report is engineering evidence only. Do not convert it into official
Apple ProRAW, Google Pixel RAW, Samsung Expert RAW, or Android DNG support copy
without a separate support-policy decision.

Local performance benchmarks default to the browser file picker:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `benchmarks/bench-runtime.html`, select one or more local RAW files, and
copy the JSONL output. The benchmark page does not read fixture paths from the
environment.

There is currently no headless high-megapixel benchmark helper in this package.
If one is added, its contract is:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/absolute/path/to/local/fixtures \
  pnpm --filter @lumaforge/luma-raw-runtime <headless-benchmark-command>
```

That helper must fail with a clear message when `LUMAFORGE_RAW_FIXTURE_DIR` is
missing. Do not hard-code local absolute fixture paths in runtime source,
benchmark code, or CI.
````

- [ ] **Step 2: Run focused fixture-script tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run package tests with the new fixture test path**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime test
```

Expected: PASS. If this fails because generated native artifacts are missing,
the command is wrong: package `test` excludes `src/native-smoke.test.ts` and
should not require `dist/native`.

- [ ] **Step 4: Run CI fixture fetch**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

Expected: exits `0` and prints:

```text
Fetched raw-pixls-iphone-se-dng
```

It should not fetch Pixel or Samsung fixtures in the default CI-smoke path.

- [ ] **Step 5: Run optional local full diagnostics when native artifacts exist**

First check artifacts:

```bash
test -f packages/luma-raw-runtime/dist/native/desktop/luma_raw.js
test -f packages/luma-raw-runtime/dist/native/desktop/luma_raw.wasm
```

If both commands exit `0`, run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public:all
pnpm --filter @lumaforge/luma-raw-runtime fixtures:diagnose-mobile-raw
```

Expected:

- The fetch command exits `0`.
- The diagnostics command writes
  `packages/luma-raw-runtime/fixtures/.cache/reports/mobile-raw-compatibility.json`.
- Each entry has one of `supported`, `preview-only`, `metadata-only`, or
  `open-failed`.

If native artifacts are absent, do not block this task. Record that the optional
local diagnostics run was skipped and run the existing native smoke after
building artifacts:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native:desktop
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

- [ ] **Step 6: Verify no RAW binaries or reports are staged**

Run:

```bash
git status --short
git status --ignored --short packages/luma-raw-runtime/fixtures/.cache | sed -n '1,40p'
```

Expected:

- `git status --short` includes only source/docs/package files intended for
  commit.
- The fixture cache appears only as ignored output, not as staged files.

- [ ] **Step 7: Commit**

```bash
git add packages/luma-raw-runtime/fixtures/README.md
git commit -m "docs(raw): document mobile RAW diagnostics workflow"
```

---

## Final Verification

Run these commands after all tasks:

```bash
pnpm test:run packages/luma-raw-runtime/fixtures/scripts/fixture-registry.test.mjs packages/luma-raw-runtime/fixtures/scripts/compatibility-report.test.mjs packages/luma-raw-runtime/fixtures/scripts/native-diagnostics-runtime.test.mjs packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.test.mjs
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
git diff --check
git status --short
```

Expected:

- All Vitest commands pass.
- `fixtures:fetch-public` fetches or reuses only the CI iPhone SE fixture.
- `git diff --check` exits `0`.
- `git status --short` shows no downloaded RAW files or diagnostics reports.

If `packages/luma-raw-runtime/dist/native/desktop/luma_raw.js` and
`packages/luma-raw-runtime/dist/native/desktop/luma_raw.wasm` already exist,
also run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public:all
pnpm --filter @lumaforge/luma-raw-runtime fixtures:diagnose-mobile-raw
```

Expected:

- The JSON report is written under the ignored cache path.
- The report contains entries for Apple DNG, Apple ProRAW-like DNG, Google Pixel
  Android DNG, and Samsung Android DNG fixtures.

Do not fail the implementation if this optional diagnostics run is skipped
because native artifacts are absent or network fetches are unavailable. Do fail
if the focused unit tests, package tests, or CI-smoke fixture fetch fail.

## Self-Review Checklist

- Spec coverage:
  - Fixture registry and raw family metadata: Tasks 1 and 2.
  - CI-smoke vs local-compatibility split: Tasks 2 and 6.
  - JSON report and support classifications: Task 3.
  - Native runtime diagnostics stages: Tasks 4 and 5.
  - No product support-claim drift: Task 6.
  - No committed RAW binaries: Task 6 final status checks.
- Placeholder scan:
  - No implementation step uses placeholder markers or undefined function
    names.
- Type and name consistency:
  - `rawFamily`, `purpose`, `classification`, and stage names match the spec.
  - CLI scripts use `fixtures:fetch-public`, `fixtures:fetch-public:all`,
    `fixtures:diagnose-mobile-raw`, and `fixtures:diagnose-mobile-raw:ci`.
