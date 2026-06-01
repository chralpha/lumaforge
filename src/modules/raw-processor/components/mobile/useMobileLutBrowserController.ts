import type {
  LUTColorProfile,
  LUTContractResolution,
} from '@lumaforge/luma-color-runtime'
import { useEffect, useId, useRef, useState } from 'react'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTContractSelectionState } from '../../model/session'
import type { LUTOutputOption } from '../tools/lut/lut-output-options'
import { toOutputCarrierProfile } from '../tools/lut/lut-output-options'
import { useOnlineLutResourceState } from '../tools/lut/useOnlineLutResourceState'
import { composeLUTContractProfile } from '../tools/lut-contract'
import type { MobileLutContractStep } from './MobileLutContractView'
import { useMobileLutContractState } from './useMobileLutContractState'

type MobileLutView = 'overview' | 'catalog' | 'contract'

interface UseMobileLutBrowserControllerInput {
  open: boolean
  initialContractEditorOpen?: boolean
  lutProfileSelection?: LUTContractSelectionState | null
  lutProfileResolution?: LUTContractResolution | null
  onlineLutSources?: UseOnlineLutSourcesResult
  onLutProfileSelect: (profile: LUTColorProfile) => void
}

export function useMobileLutBrowserController({
  open,
  initialContractEditorOpen,
  lutProfileSelection,
  lutProfileResolution,
  onlineLutSources,
  onLutProfileSelect,
}: UseMobileLutBrowserControllerInput) {
  const onlineSourceInputId = useId()
  const [view, setView] = useState<MobileLutView>('overview')
  const [catalogResourceId, setCatalogResourceId] = useState<string | null>(
    null,
  )
  const [contractStep, setContractStep] =
    useState<MobileLutContractStep>('input')
  const [contractQuery, setContractQuery] = useState('')
  const initialContractEditorAppliedRef = useRef(false)
  const overviewBodyRef = useRef<HTMLDivElement | null>(null)
  const catalogBodyRef = useRef<HTMLDivElement | null>(null)
  const contractBodyRef = useRef<HTMLDivElement | null>(null)

  const resources = onlineLutSources?.state.resources
  const onlineResourceState = useOnlineLutResourceState({
    state: onlineLutSources?.state,
    resourceId: catalogResourceId,
  })
  const contractState = useMobileLutContractState({
    contractQuery,
    lutProfileSelection,
    lutProfileResolution,
  })
  const [draftInputProfile, setDraftInputProfile] =
    useState<LUTColorProfile | null>(contractState.resolvedProfile ?? null)

  useEffect(() => {
    if (open) return

    setView('overview')
    setCatalogResourceId(null)
    setContractStep('input')
    setContractQuery('')
    setDraftInputProfile(contractState.resolvedProfile ?? null)
    initialContractEditorAppliedRef.current = false
  }, [open, contractState.resolvedProfile])

  useEffect(() => {
    if (
      !open ||
      !initialContractEditorOpen ||
      initialContractEditorAppliedRef.current
    ) {
      return
    }

    initialContractEditorAppliedRef.current = true
    setCatalogResourceId(null)
    setDraftInputProfile(contractState.resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(
      contractState.contractView.status === 'incomplete-output'
        ? 'output'
        : 'input',
    )
    setView('contract')
  }, [
    contractState.contractView.status,
    contractState.resolvedProfile,
    initialContractEditorOpen,
    open,
  ])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (view !== 'catalog' || !catalogResourceId) return
    const resourceExists =
      resources?.some((resource) => resource.id === catalogResourceId) ?? false

    if (!resourceExists) {
      setCatalogResourceId(null)
      setView('overview')
    }
  }, [catalogResourceId, resources, view])

  const scrollOverviewToTop = () => {
    requestAnimationFrame(() => {
      if (overviewBodyRef.current) overviewBodyRef.current.scrollTop = 0
    })
  }

  const returnToOverview = () => {
    setView('overview')
    setCatalogResourceId(null)
    scrollOverviewToTop()
  }

  const openCatalogResource = (resourceId: string) => {
    setCatalogResourceId(resourceId)
    setView('catalog')
  }

  const openContractView = (
    step: MobileLutContractStep = 'input',
    draftOverride?: LUTColorProfile | null,
  ) => {
    setDraftInputProfile(
      draftOverride !== undefined
        ? draftOverride
        : (contractState.resolvedProfile ?? null),
    )
    setContractQuery('')
    setContractStep(step)
    setCatalogResourceId(null)
    setView('contract')
  }

  const handleInputSelect = (profile: LUTColorProfile) => {
    setDraftInputProfile(profile)
    setContractQuery('')
    setContractStep('output')
    if (contractBodyRef.current) contractBodyRef.current.scrollTop = 0
  }

  const handleOutputSelect = (option: LUTOutputOption) => {
    const inputProfile = draftInputProfile ?? option.sourceProfile

    onLutProfileSelect(
      composeLUTContractProfile(inputProfile, toOutputCarrierProfile(option)),
    )
    setContractQuery('')
    returnToOverview()
  }

  return {
    view,
    onlineSourceInputId,
    overviewBodyRef,
    catalogBodyRef,
    contractBodyRef,
    contractStep,
    contractQuery,
    draftInputProfile,
    ...onlineResourceState,
    ...contractState,
    setContractStep,
    setContractQuery,
    returnToOverview,
    openCatalogResource,
    openContractView,
    handleInputSelect,
    handleOutputSelect,
  }
}
