import './index.css'

import {
  ArrowRight,
  GitFork,
  ImageUp,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { m, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'react-router'

import { LandingCompareSvg } from '~/components/common/LandingCompareSvg'
import { LocaleToggle } from '~/components/common/LocaleToggle'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'
import type { SeoRouteHandle } from '~/lib/seo'
import { HOME_ROUTE_SEO } from '~/lib/seo'
import { Spring, surfaceFade } from '~/lib/spring'

import { repository } from '../../../package.json'

const appIcon = '/favicon.png'

export const handle = {
  seo: HOME_ROUTE_SEO,
} satisfies SeoRouteHandle

export const loader = () => null

const workflow = [
  {
    label: 'landing.workflow.0.label',
    detail: 'landing.workflow.0.detail',
  },
  {
    label: 'landing.workflow.1.label',
    detail: 'landing.workflow.1.detail',
  },
  {
    label: 'landing.workflow.2.label',
    detail: 'landing.workflow.2.detail',
  },
] as const

const contractSteps = [
  'landing.contract.0',
  'landing.contract.1',
  'landing.contract.2',
  'landing.contract.3',
  'landing.contract.4',
  'landing.contract.5',
] as const

const proofPoints = [
  {
    icon: ShieldCheck,
    title: 'landing.proof.0.title',
    text: 'landing.proof.0.text',
  },
  {
    icon: LockKeyhole,
    title: 'landing.proof.1.title',
    text: 'landing.proof.1.text',
  },
  {
    icon: SlidersHorizontal,
    title: 'landing.proof.2.title',
    text: 'landing.proof.2.text',
  },
] as const

const profileGroups = [
  'ARRI LogC',
  'RED Log3G10',
  'Sony S-Log',
  'Panasonic V-Log',
  'Fujifilm F-Log',
  'Canon Log',
  'Nikon N-Log',
  'ACES',
]

function useHeroEntrance() {
  const prefersReduced = useReducedMotion() ?? false

  return useMemo(() => {
    const entrance = (delayMs: number) => ({
      initial: prefersReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: prefersReduced
        ? { duration: 0 }
        : { ...Spring.smooth(0.32), delay: delayMs / 1000 },
    })

    const compareEntrance = (delayMs: number) => ({
      initial: { opacity: prefersReduced ? 1 : 0 },
      animate: { opacity: 1 },
      transition: prefersReduced
        ? { duration: 0 }
        : { ...surfaceFade, duration: 0.5, delay: delayMs / 1000 },
    })

    return { entrance, compareEntrance, prefersReduced }
  }, [prefersReduced])
}

function HeroSection({ t }: { t: Translate }) {
  const { entrance, compareEntrance } = useHeroEntrance()

  return (
    <section className="lf-hero" aria-labelledby="lf-hero-title">
      <div className="lf-hero-bg" aria-hidden="true" />
      <div className="lf-hero-vignette" aria-hidden="true" />

      <div className="lf-hero-content">
        <m.p className="lf-kicker" {...entrance(0)}>
          {t('landing.kicker')}
        </m.p>
        <m.h1 id="lf-hero-title" {...entrance(80)}>
          LumaForge
        </m.h1>
        <m.p className="lf-hero-copy" {...entrance(160)}>
          {t('landing.heroCopy')}
        </m.p>
        <m.div
          className="lf-hero-actions"
          aria-label={t('landing.primaryActions')}
          {...entrance(220)}
        >
          <Link to="/raw" className="lf-button lf-button-primary">
            <ImageUp size={18} strokeWidth={1.9} />
            {t('landing.start')}
          </Link>
          <a
            href={repository.url}
            target="_blank"
            rel="noreferrer"
            className="lf-button lf-button-secondary"
          >
            <GitFork size={18} strokeWidth={1.9} />
            {t('landing.viewSource')}
          </a>
        </m.div>
      </div>

      <m.figure
        className="lf-hero-compare"
        aria-label={t('landing.workflowPreview')}
        {...compareEntrance(300)}
      >
        <LandingCompareSvg label={t('landing.heroImageAlt')} />
        <figcaption className="lf-compare-tag lf-tag-left">
          {t('landing.rawPreviewTag')}
        </figcaption>
        <figcaption className="lf-compare-tag lf-tag-right">
          {t('landing.finishedJpegTag')}
        </figcaption>
      </m.figure>
    </section>
  )
}

export const Component = () => {
  const { t } = useI18n()

  return (
    <main className="lf-landing">
      <nav className="lf-nav" aria-label={t('landing.navPrimary')}>
        <Link to="/" className="lf-wordmark" aria-label={t('landing.homeAria')}>
          <img
            className="lf-wordmark-icon"
            src={appIcon}
            alt=""
            aria-hidden="true"
          />
          <span>LumaForge</span>
        </Link>
        <div className="lf-nav-actions">
          <Link to="/raw" className="lf-nav-link">
            {t('landing.openRawLab')}
          </Link>
          <LocaleToggle className="lf-locale-toggle" />
          <a
            href={repository.url}
            className="lf-icon-link"
            aria-label={t('landing.githubAria')}
            target="_blank"
            rel="noreferrer"
          >
            <GitFork size={18} strokeWidth={1.8} />
          </a>
        </div>
      </nav>

      <HeroSection t={t} />

      <section
        className="lf-positioning"
        aria-labelledby="lf-positioning-title"
      >
        <div>
          <p className="lf-section-label">{t('landing.positioning.label')}</p>
          <h2 id="lf-positioning-title">{t('landing.positioning.title')}</h2>
        </div>
        <div className="lf-positioning-copy">
          <p>{t('landing.positioning.copy.0')}</p>
          <p>{t('landing.positioning.copy.1')}</p>
        </div>
      </section>

      <section className="lf-proof" aria-label={t('landing.proofAria')}>
        {proofPoints.map(({ icon: Icon, title, text }) => (
          <article key={title} className="lf-proof-item">
            <Icon size={22} strokeWidth={1.8} />
            <h3>{t(title)}</h3>
            <p>{t(text)}</p>
          </article>
        ))}
      </section>

      <section className="lf-pipeline" aria-labelledby="lf-pipeline-title">
        <div className="lf-pipeline-header">
          <p className="lf-section-label">{t('landing.pipeline.label')}</p>
          <h2 id="lf-pipeline-title">{t('landing.pipeline.title')}</h2>
        </div>
        <div className="lf-rail" aria-label={t('landing.pipelineAria')}>
          {contractSteps.map((step, index) => (
            <div className="lf-rail-step" key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{t(step)}</strong>
            </div>
          ))}
        </div>
        <p className="lf-pipeline-note">{t('landing.pipeline.note')}</p>
      </section>

      <section className="lf-workflow" aria-labelledby="lf-workflow-title">
        <div className="lf-workflow-heading">
          <p className="lf-section-label">{t('landing.workflow.label')}</p>
          <h2 id="lf-workflow-title">{t('landing.workflow.title')}</h2>
        </div>
        <ol className="lf-workflow-list">
          {workflow.map((item, index) => (
            <li key={item.label}>
              <span>{index + 1}</span>
              <div>
                <h3>{t(item.label)}</h3>
                <p>{t(item.detail)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lf-luts" aria-labelledby="lf-luts-title">
        <div>
          <p className="lf-section-label">{t('landing.luts.label')}</p>
          <h2 id="lf-luts-title">{t('landing.luts.title')}</h2>
        </div>
        <div className="lf-profile-cloud" aria-label={t('landing.lutsAria')}>
          {profileGroups.map((profile) => (
            <span key={profile}>{profile}</span>
          ))}
        </div>
      </section>

      <section className="lf-final" aria-labelledby="lf-final-title">
        <img
          className="lf-final-icon"
          src={appIcon}
          alt=""
          aria-hidden="true"
        />
        <h2 id="lf-final-title">{t('landing.final.title')}</h2>
        <p>{t('landing.final.copy')}</p>
        <Link to="/raw" className="lf-button lf-button-primary">
          {t('landing.final.cta')}
          <ArrowRight size={18} strokeWidth={1.9} />
        </Link>
      </section>
    </main>
  )
}

export default Component
