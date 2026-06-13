/**
 * Per-RAW calibration state.
 *
 * The selected camera-profile id is RAW-scoped on purpose:
 *
 * - DCP profiles target a specific camera body. A profile selected for one
 *   RAW is meaningless against the next; persisting it across loads would
 *   leak into the silent-by-default contract (a stale id would either
 *   resurface or surface as a "rejected" event for no user action).
 *
 * - Calibration is silent-by-default infra. atomWithStorage would also leak
 *   the selection into a future session that the user hasn't opted into.
 *
 * The atom resets to `null` on every new RAW; the workflow stage hook
 * watches `session.id` and clears the atom when the RAW changes.
 */

import { atom } from 'jotai'

import { createAtomHooks } from '~/lib/jotai'

const baseSelectedCameraProfileIdAtom = atom<string | null>(null)

export const [
  selectedCameraProfileIdAtom,
  useSelectedCameraProfileId,
  useSelectedCameraProfileIdValue,
  useSetSelectedCameraProfileId,
  getSelectedCameraProfileId,
  setSelectedCameraProfileId,
] = createAtomHooks(baseSelectedCameraProfileIdAtom)

export function resetSelectedCameraProfile(): void {
  setSelectedCameraProfileId(null)
}
