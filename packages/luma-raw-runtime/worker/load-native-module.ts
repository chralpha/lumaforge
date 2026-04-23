import { LumaRawRuntimeError } from '../src/errors'
import type { LumaRawNativeFactory } from './native-types'

export async function loadNativeFactory(): Promise<LumaRawNativeFactory> {
  return {
    createProcessor() {
      throw new LumaRawRuntimeError(
        'RAW_RUNTIME_UNAVAILABLE',
        'RAW native runtime loader has not been implemented yet.',
      )
    },
  }
}
