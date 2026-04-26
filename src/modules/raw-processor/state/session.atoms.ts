import { atom } from 'jotai'

import {
  deriveCanEdit,
  deriveCanExport,
  deriveExportDisabledReason,
  selectDisplaySource,
} from '../model/derive-session'
import type { ImageSession } from '../model/session'

export const currentSessionAtom = atom<ImageSession | null>(null)

export const displaySourceAtom = atom((get) => {
  const session = get(currentSessionAtom)
  return session ? selectDisplaySource(session.previewBundle) : 'none'
})

export const canEditAtom = atom((get) => {
  const session = get(currentSessionAtom)
  return session ? deriveCanEdit(session) : false
})

export const canExportFromSessionAtom = atom((get) => {
  const session = get(currentSessionAtom)
  return session ? deriveCanExport(session) : false
})

export const exportDisabledReasonAtom = atom((get) => {
  const session = get(currentSessionAtom)
  return session ? deriveExportDisabledReason(session) : undefined
})
