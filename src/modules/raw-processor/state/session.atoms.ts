import { atom } from 'jotai'

import type { ImageSession } from '../model/session'

export const currentSessionAtom = atom<ImageSession | null>(null)
