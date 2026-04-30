import type { LUTContractSelection } from '@lumaforge/luma-color-runtime'
import { mapProfileLUTContract as mapRuntimeProfileLUTContract } from '@lumaforge/luma-color-runtime'

import type { OnlineProfileResult } from './catalog'

export function mapProfileLUTContract(
  lut: unknown,
): OnlineProfileResult<LUTContractSelection> {
  return mapRuntimeProfileLUTContract(lut)
}
