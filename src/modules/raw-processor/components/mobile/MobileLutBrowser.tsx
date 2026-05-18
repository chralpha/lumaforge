import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import { useMemo } from 'react'

import { IconButton } from '~/components/ui/button'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../model/session'
import { SHEET_SPRING, useToolMotion } from '../../motion'
import { Dropzone } from '../Dropzone'

export interface MobileLutBrowserProps {
  open: boolean
  onClose: () => void
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
}

type OnlineResource = UseOnlineLutSourcesResult['state']['resources'][number]
type OnlineEntry = UseOnlineLutSourcesResult['state']['entries'][number]

function resourceLabel(resource: OnlineResource) {
  return resource.label || resource.url
}

export function MobileLutBrowser(props: MobileLutBrowserProps) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
  const entriesByResourceId = useMemo(() => {
    const entries = new Map<string, OnlineEntry[]>()

    for (const resource of props.onlineLutSources?.state.resources ?? []) {
      entries.set(resource.id, [])
    }

    for (const entry of props.onlineLutSources?.state.entries ?? []) {
      entries.set(entry.resourceId, [
        ...(entries.get(entry.resourceId) ?? []),
        entry,
      ])
    }

    return entries
  }, [
    props.onlineLutSources?.state.entries,
    props.onlineLutSources?.state.resources,
  ])

  const profileSuggestions =
    props.lutProfileResolution?.kind === 'needs-user-selection'
      ? props.lutProfileResolution.suggestions
      : []

  return (
    <AnimatePresence>
      {props.open && (
        <m.aside
          key="lut-browser"
          role="dialog"
          aria-modal="false"
          aria-label={t('raw.mobile.lut.title')}
          data-mobile-substrate="ink-sheet"
          className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] rounded-t-2xl border-t border-white/20 bg-[linear-gradient(180deg,oklch(0.21_0.024_78),oklch(0.13_0.02_76))] pb-safe-offset-3 text-white shadow-[0_-22px_50px_oklch(0.04_0.012_76/0.55)]"
          initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
          animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
          exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
          transition={SHEET_SPRING}
          drag={prefersReduced ? false : 'y'}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 500) props.onClose()
          }}
        >
          <div
            className="grid gap-2 px-3.5 pb-3 pt-2.5"
            onPointerDown={(event) => dragControls.start(event)}
          >
            <div
              aria-hidden="true"
              className="mx-auto h-1 w-9 rounded-full bg-text/30"
            />
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="m-0 text-base font-semibold">
                {t('raw.mobile.lut.title')}
              </h2>
              <IconButton
                icon={X}
                size="md"
                aria-label={t('raw.mobile.lut.close')}
                onClick={props.onClose}
                className="size-11 rounded-md border border-white/25 bg-black/35 text-white [&_svg]:size-5 [&_svg]:stroke-white"
              />
            </div>
          </div>

          <div className="grid min-h-0 gap-[18px] overflow-y-auto px-4 pb-5 pt-1">
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold text-white">
                {t('raw.mobile.lut.currentHeading')}
              </h3>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/15 bg-black/35 p-3">
                <span className="min-w-0 truncate text-sm font-semibold text-white">
                  {props.currentLutName ?? '—'}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!props.currentLutName || props.disabled}
                  onClick={props.onLutClear}
                >
                  {t('raw.mobile.lut.clear')}
                </button>
              </div>
            </section>

            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold text-white">
                {t('raw.mobile.lut.uploadHeading')}
              </h3>
              <Dropzone
                onFileDrop={props.onLutLoad}
                accept={['.cube']}
                multiple
                disabled={props.disabled}
                aria-label={t('raw.mobile.lut.uploadAria')}
                className="grid min-h-20 place-items-center border-white/20 bg-black/35 px-3 py-4 text-center"
                interactiveMotion={false}
              >
                <div className="grid gap-1">
                  <span className="text-sm font-semibold text-white">
                    {t('raw.mobile.lut.uploadTitle')}
                  </span>
                  <span className="text-xs text-white/70">
                    {t('raw.mobile.lut.uploadHint')}
                  </span>
                </div>
              </Dropzone>
            </section>

            {props.onlineLutSources && (
              <section className="grid gap-2.5">
                <h3 className="m-0 text-sm font-semibold text-white">
                  {t('raw.mobile.lut.onlineHeading')}
                </h3>
                <div
                  className="grid gap-2"
                  aria-busy={props.onlineLutSources.state.isLoading}
                >
                  {props.onlineLutSources.state.isLoading && (
                    <p
                      className="m-0 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-2 text-xs font-semibold text-accent"
                      role="status"
                    >
                      {t('raw.mobile.lut.loading')}
                    </p>
                  )}
                  {props.onlineLutSources.state.resources.map((resource) => {
                    const entries = entriesByResourceId.get(resource.id) ?? []

                    return (
                      <div
                        key={resource.id}
                        className="grid gap-1.5 rounded-xl border border-white/15 bg-black/35 p-2.5"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-white">
                            {resourceLabel(resource)}
                          </span>
                          <span className="shrink-0 rounded-full border border-white/20 bg-black/35 px-1.5 py-0.5 text-[0.64rem] font-semibold leading-none text-white/70">
                            {t('raw.mobile.lut.entryCount', {
                              count: entries.length,
                            })}
                          </span>
                        </div>
                        <div className="grid gap-1.5">
                          {entries.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-white/15 bg-black/25 px-2.5 py-2 text-left transition-colors hover:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={props.disabled}
                              aria-label={t('raw.mobile.lut.loadEntry', {
                                label: entry.title,
                              })}
                              onClick={() =>
                                void props.onlineLutSources?.loadEntry(entry.id)
                              }
                            >
                              <span className="min-w-0 truncate text-sm font-medium text-white">
                                {entry.title}
                              </span>
                              <span className="text-xs font-semibold text-amber-400">
                                {t('raw.mobile.lut.load')}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {profileSuggestions.length > 0 && (
              <section className="grid gap-2.5">
                <h3 className="m-0 text-sm font-semibold text-white">
                  {t('raw.mobile.lut.contractHeading')}
                </h3>
                <div className="grid gap-1.5">
                  {profileSuggestions.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className="grid min-w-0 gap-1 rounded-md border border-white/15 bg-black/35 px-2.5 py-2 text-left transition-colors hover:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={props.disabled}
                      onClick={() => props.onLutProfileSelect(profile)}
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-white">
                        {profile.label}
                      </span>
                      <span className="text-xs text-white/70">
                        {profile.role}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  )
}
