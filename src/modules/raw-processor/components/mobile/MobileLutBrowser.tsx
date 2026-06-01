import type {
  LUTColorProfile,
  LUTContractResolution,
} from '@lumaforge/luma-color-runtime'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowLeft, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'

import { IconButton } from '~/components/ui/button'
import { Dialog } from '~/components/ui/dialog'
import { useI18n } from '~/lib/i18n'
import { sheetSpring } from '~/lib/spring'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTContractSelectionState } from '../../model/session'
import { useToolMotion } from '../../motion'
import type { LUTOutputOption } from '../tools/lut/lut-output-options'
import { toOutputCarrierProfile } from '../tools/lut/lut-output-options'
import { useOnlineLutResourceState } from '../tools/lut/useOnlineLutResourceState'
import { composeLUTContractProfile } from '../tools/lut-contract'
import type { StrengthLevel } from '../tools/StrengthControl'
import { MobileLutCatalogView } from './MobileLutCatalogView'
import { MobileLutContractStatusSection } from './MobileLutContractStatusSection'
import type { MobileLutContractStep } from './MobileLutContractView'
import { MobileLutContractView } from './MobileLutContractView'
import { MobileLutCurrentSections } from './MobileLutCurrentSections'
import { MobileLutOnlineSourcesSection } from './MobileLutOnlineSourcesSection'
import { useMobileLutContractState } from './useMobileLutContractState'

export interface MobileLutBrowserProps {
  open: boolean
  onClose: () => void
  initialContractEditorOpen?: boolean
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTContractSelectionState | null
  lutProfileResolution?: LUTContractResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
  activeIntensity?: StrengthLevel
  onIntensitySelect?: (level: StrengthLevel) => void
  strengthDisabled?: boolean
}

type OnlineResource = UseOnlineLutSourcesResult['state']['resources'][number]
type MobileLutView = 'overview' | 'catalog' | 'contract'

function resourceLabel(resource: OnlineResource) {
  return resource.label || resource.url
}

export function MobileLutBrowser(props: MobileLutBrowserProps) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
  const onlineSourceInputId = useId()
  const activeIntensity = props.activeIntensity ?? 'standard'
  const strengthDisabled = props.strengthDisabled ?? true
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

  const {
    entriesByResourceId,
    issuesByResourceId,
    selectedResource,
    selectedEntries,
    selectedIssues,
    selectedResourceLoading,
    selectedEntryGroups,
  } = useOnlineLutResourceState({
    state: props.onlineLutSources?.state,
    resourceId: catalogResourceId,
  })

  const {
    resolvedProfile,
    displayOutputLabel,
    contractView,
    visibleSuggestions,
    groupedInputProfiles,
    suggestedOutputOptions,
    groupedOutputOptions,
    activeOutputOptionId,
    hasInputMatches,
    hasOutputMatches,
  } = useMobileLutContractState({
    contractQuery,
    lutProfileSelection: props.lutProfileSelection,
    lutProfileResolution: props.lutProfileResolution,
  })
  const [draftInputProfile, setDraftInputProfile] =
    useState<LUTColorProfile | null>(resolvedProfile ?? null)

  useEffect(() => {
    if (props.open) return

    setView('overview')
    setCatalogResourceId(null)
    setContractStep('input')
    setContractQuery('')
    setDraftInputProfile(resolvedProfile ?? null)
    initialContractEditorAppliedRef.current = false
  }, [props.open, resolvedProfile])

  useEffect(() => {
    if (
      !props.open ||
      !props.initialContractEditorOpen ||
      initialContractEditorAppliedRef.current
    ) {
      return
    }

    initialContractEditorAppliedRef.current = true
    setCatalogResourceId(null)
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(
      contractView.status === 'incomplete-output' ? 'output' : 'input',
    )
    setView('contract')
  }, [
    contractView.status,
    props.initialContractEditorOpen,
    props.open,
    resolvedProfile,
  ])

  useEffect(() => {
    if (!props.open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [props.open])

  useEffect(() => {
    if (view !== 'catalog' || !catalogResourceId) return
    const resourceExists =
      props.onlineLutSources?.state.resources.some(
        (resource) => resource.id === catalogResourceId,
      ) ?? false

    if (!resourceExists) {
      setCatalogResourceId(null)
      setView('overview')
    }
  }, [catalogResourceId, props.onlineLutSources?.state.resources, view])

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

  const openContractView = (
    step: MobileLutContractStep = 'input',
    draftOverride?: LUTColorProfile | null,
  ) => {
    setDraftInputProfile(
      draftOverride !== undefined ? draftOverride : (resolvedProfile ?? null),
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

    props.onLutProfileSelect(
      composeLUTContractProfile(inputProfile, toOutputCarrierProfile(option)),
    )
    setContractQuery('')
    returnToOverview()
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) props.onClose()
  }

  const viewMotion = prefersReduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      }

  const renderOverview = () => (
    <m.div
      key="overview"
      ref={overviewBodyRef}
      className="grid min-h-0 content-start gap-3 overflow-y-auto px-4 pb-5 pt-1"
      {...viewMotion}
      transition={sheetSpring}
    >
      <MobileLutCurrentSections
        currentLutName={props.currentLutName}
        disabled={props.disabled}
        onLutLoad={props.onLutLoad}
        onLutClear={props.onLutClear}
        activeIntensity={activeIntensity}
        onIntensitySelect={props.onIntensitySelect}
        strengthDisabled={strengthDisabled}
      />
      <MobileLutContractStatusSection
        visible={Boolean(
          props.currentLutName ||
          props.lutProfileSelection ||
          props.lutProfileResolution,
        )}
        contractView={contractView}
        displayOutputLabel={displayOutputLabel}
        disabled={props.disabled}
        onLutProfileSelect={props.onLutProfileSelect}
        onOpenContractView={openContractView}
      />
      <MobileLutOnlineSourcesSection
        onlineLutSources={props.onlineLutSources}
        sourceInputId={onlineSourceInputId}
        entriesByResourceId={entriesByResourceId}
        issuesByResourceId={issuesByResourceId}
        onBrowseResource={(resourceId) => {
          setCatalogResourceId(resourceId)
          setView('catalog')
        }}
      />
    </m.div>
  )

  const renderCatalog = () => (
    <MobileLutCatalogView
      bodyRef={catalogBodyRef}
      viewMotion={viewMotion}
      selectedResource={selectedResource}
      selectedEntries={selectedEntries}
      selectedIssues={selectedIssues}
      selectedResourceLoading={selectedResourceLoading}
      selectedEntryGroups={selectedEntryGroups}
      disabled={props.disabled}
      loadEntry={props.onlineLutSources?.loadEntry}
      onEntryLoaded={returnToOverview}
    />
  )

  const renderContract = () => (
    <MobileLutContractView
      bodyRef={contractBodyRef}
      viewMotion={viewMotion}
      contractStep={contractStep}
      onContractStepChange={setContractStep}
      contractQuery={contractQuery}
      onContractQueryChange={setContractQuery}
      visibleSuggestions={visibleSuggestions}
      groupedInputProfiles={groupedInputProfiles}
      suggestedOutputOptions={suggestedOutputOptions}
      groupedOutputOptions={groupedOutputOptions}
      activeOutputOptionId={activeOutputOptionId}
      hasInputMatches={hasInputMatches}
      hasOutputMatches={hasOutputMatches}
      draftInputProfile={draftInputProfile}
      onInputSelect={handleInputSelect}
      onOutputSelect={handleOutputSelect}
    />
  )

  const title =
    view === 'contract'
      ? t('raw.mobile.lut.editContract')
      : view === 'catalog' && selectedResource
        ? resourceLabel(selectedResource)
        : t('raw.mobile.lut.title')
  const canGoBack = view !== 'overview'

  return (
    <Dialog modal={false} open={props.open} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {props.open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Content
              asChild
              forceMount
              aria-label={t('raw.mobile.lut.title')}
              aria-describedby={undefined}
              onPointerDownOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <m.aside
                key="lut-browser"
                data-mobile-substrate="ink-sheet"
                data-mobile-lut-view={view}
                className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] rounded-t-xl border-t border-lf-on-photo-bord-soft bg-gradient-to-t from-black/92 via-black/82 to-lf-darkroom-stage-low/94 pb-safe-offset-3 text-lf-on-photo-ink shadow-[0_-18px_42px_oklch(0.04_0.012_76/0.62)] backdrop-blur-background"
                initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
                animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
                exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
                transition={sheetSpring}
                drag={prefersReduced ? false : 'y'}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 500)
                    props.onClose()
                }}
              >
                <div
                  className="grid gap-2 px-3.5 pb-3 pt-2.5"
                  onPointerDown={(event) => dragControls.start(event)}
                >
                  <div
                    aria-hidden="true"
                    className="mx-auto h-1 w-9 rounded-lf-pill bg-lf-on-photo-ink/28"
                  />
                  <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2.5">
                    {canGoBack ? (
                      <IconButton
                        icon={ArrowLeft}
                        size="md"
                        aria-label={t('raw.mobile.lut.back')}
                        onClick={returnToOverview}
                        className="size-[44px] rounded-md bg-transparent text-lf-on-photo-ink/55 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink [&_svg]:size-5 [&_svg]:stroke-current"
                      />
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <DialogPrimitive.Title asChild>
                      <h2 className="m-0 min-w-0 truncate text-center text-[0.95rem] font-semibold text-lf-on-photo-ink">
                        {title}
                      </h2>
                    </DialogPrimitive.Title>
                    <IconButton
                      icon={X}
                      size="md"
                      aria-label={t('raw.mobile.lut.close')}
                      onClick={props.onClose}
                      className="size-[44px] rounded-md bg-transparent text-lf-on-photo-ink/55 transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-on-photo-ink [&_svg]:size-5 [&_svg]:stroke-current"
                    />
                  </div>
                </div>

                <AnimatePresence mode="popLayout" initial={false}>
                  {view === 'overview'
                    ? renderOverview()
                    : view === 'catalog'
                      ? renderCatalog()
                      : renderContract()}
                </AnimatePresence>
              </m.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
