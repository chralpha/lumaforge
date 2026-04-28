import process from 'node:process'
import { pathToFileURL } from 'node:url'

const REQUIRED_ISOLATION_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
}

const WASM_ASSETS = ['native/luma_raw.wasm', 'native/luma_jpeg.wasm']

function normalizeDeployUrl(url) {
  const value = url?.trim()
  if (!value) throw new Error('DEPLOY_URL is required for deploy smoke checks.')
  return value.replace(/\/+$/g, '')
}

function joinDeployUrl(baseUrl, path) {
  return `${baseUrl}/${path.replace(/^\/+/g, '')}`
}

async function head(fetchImpl, url) {
  const response = await fetchImpl(url, {
    method: 'HEAD',
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(
      `Deploy smoke check failed for ${url}: HTTP ${response.status}`,
    )
  }
  return response.headers
}

async function assertIsolationHeaders(fetchImpl, url, label) {
  const headers = await head(fetchImpl, url)

  for (const [header, expected] of Object.entries(REQUIRED_ISOLATION_HEADERS)) {
    const actual = headers.get(header)
    if (actual !== expected) {
      throw new Error(
        `${label} is missing ${header}: expected ${expected}, received ${actual ?? 'null'}.`,
      )
    }
  }
}

async function assertWasmContentType(fetchImpl, url) {
  const headers = await head(fetchImpl, url)
  const contentType = headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/wasm')) {
    throw new Error(
      `${url} must be served as application/wasm, received ${contentType || 'null'}.`,
    )
  }
}

export async function smokeDeployUrl(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError(
      'A Fetch implementation is required for deploy smoke checks.',
    )
  }

  const baseUrl = normalizeDeployUrl(url)
  await assertIsolationHeaders(fetchImpl, joinDeployUrl(baseUrl, '/'), 'Root')
  await assertIsolationHeaders(
    fetchImpl,
    joinDeployUrl(baseUrl, '/raw'),
    'Raw route',
  )

  for (const asset of WASM_ASSETS) {
    await assertWasmContentType(fetchImpl, joinDeployUrl(baseUrl, asset))
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await smokeDeployUrl(process.env.DEPLOY_URL)
  console.log('Deploy smoke checks passed.')
}
