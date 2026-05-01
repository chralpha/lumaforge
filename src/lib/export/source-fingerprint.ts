const SOURCE_FINGERPRINT_HASH_BYTES = 1024 * 1024

export type SourceFingerprintFacts = {
  width?: number
  height?: number
}

export type SourceFingerprint = SourceFingerprintFacts & {
  name: string
  size: number
  lastModified: number
  hashPrefixHex: string
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function getSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SOURCE_FINGERPRINT_CRYPTO_UNAVAILABLE')

  return subtle
}

function readBlobAsArrayBuffer(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error('SOURCE_FINGERPRINT_FILE_READ_FAILED'))
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })
}

async function hashSourcePrefix(file: File) {
  const prefix = file.slice(
    0,
    Math.min(file.size, SOURCE_FINGERPRINT_HASH_BYTES),
  )
  const digest = await getSubtleCrypto().digest(
    'SHA-256',
    await readBlobAsArrayBuffer(prefix),
  )

  return toHex(digest)
}

export async function createSourceFingerprint(
  file: File,
  facts: SourceFingerprintFacts = {},
): Promise<SourceFingerprint> {
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    width: facts.width,
    height: facts.height,
    hashPrefixHex: await hashSourcePrefix(file),
  }
}

export async function sourceFingerprintMatches(
  file: File,
  expected: SourceFingerprint,
  facts: SourceFingerprintFacts = {},
) {
  if (file.name !== expected.name) return false
  if (file.size !== expected.size) return false
  if (file.lastModified !== expected.lastModified) return false
  if (expected.width !== undefined && facts.width !== expected.width) {
    return false
  }
  if (expected.height !== undefined && facts.height !== expected.height) {
    return false
  }

  const actual = await createSourceFingerprint(file, facts)
  return actual.hashPrefixHex === expected.hashPrefixHex
}
