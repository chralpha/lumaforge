import type { LumaRawRuntimeMemoryProfile } from '../src/types'

export type BenchProvenance = {
  sourceLockSha256: string | null
}

export type LoadBenchmarkProvenanceOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
  memoryProfile?: LumaRawRuntimeMemoryProfile
}

export function createBenchmarkProvenanceUrl(
  baseUrl: string,
  memoryProfile: LumaRawRuntimeMemoryProfile,
) {
  return new URL(`../dist/native/${memoryProfile}/provenance.json`, baseUrl)
}

function asBenchmarkProvenance(value: unknown): BenchProvenance {
  if (value && typeof value === 'object') {
    const sourceLockSha256 = (value as { sourceLockSha256?: unknown })
      .sourceLockSha256
    if (typeof sourceLockSha256 === 'string' && sourceLockSha256.length > 0) {
      return { sourceLockSha256 }
    }
  }

  return { sourceLockSha256: null }
}

export async function loadBenchmarkProvenance({
  baseUrl = import.meta.url,
  fetchImpl = fetch,
  memoryProfile = 'desktop',
}: LoadBenchmarkProvenanceOptions = {}): Promise<BenchProvenance> {
  try {
    const provenanceUrl = createBenchmarkProvenanceUrl(baseUrl, memoryProfile)
    const response = await fetchImpl(provenanceUrl, { cache: 'no-store' })
    if (!response.ok) return { sourceLockSha256: null }

    return asBenchmarkProvenance(await response.json())
  } catch {
    return { sourceLockSha256: null }
  }
}
