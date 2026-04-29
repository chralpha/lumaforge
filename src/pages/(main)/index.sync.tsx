import './index.css'

import {
  ArrowRight,
  Check,
  GitFork,
  ImageUp,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { Link } from 'react-router'

import type { SeoRouteHandle } from '~/lib/seo'
import { HOME_ROUTE_SEO } from '~/lib/seo'

import { repository } from '../../../package.json'

const heroImage =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=86'
const appIcon = '/favicon.png'

export const handle = {
  seo: HOME_ROUTE_SEO,
} satisfies SeoRouteHandle

const workflow = [
  {
    label: 'Drop a RAW',
    detail: 'ARW, NEF, RAF, DNG, RW2 and more stay in the browser.',
  },
  {
    label: 'Choose the look',
    detail:
      'Use a built-in finish or bring a `.cube` LUT with a declared contract.',
  },
  {
    label: 'Export the file',
    detail: 'The full-resolution JPEG path runs in bounded worker strips.',
  },
]

const contractSteps = [
  'RAW technical development',
  'Linear ProPhoto scene handoff',
  'Target gamut',
  'Target log curve',
  'LUT output',
  'Rec.709 JPEG',
]

const proofPoints = [
  {
    icon: ShieldCheck,
    title: 'Color-safe by default',
    text: 'LumaForge refuses mismatched gamma, log, gamut, and LUT output choices instead of calculating a misleading result.',
  },
  {
    icon: LockKeyhole,
    title: 'Local by design',
    text: 'No account, no upload queue, no native helper, no license manager. The source image stays on the device.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Less surface area',
    text: 'The workflow is intentionally smaller than a pro node graph, because the goal is a finished photo, not an editing cockpit.',
  },
]

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

export const Component = () => {
  return (
    <main className="lf-landing">
      <nav className="lf-nav" aria-label="Primary">
        <Link to="/" className="lf-wordmark" aria-label="LumaForge home">
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
            Open RAW lab
          </Link>
          <a
            href={repository.url}
            className="lf-icon-link"
            aria-label="View LumaForge on GitHub"
            target="_blank"
            rel="noreferrer"
          >
            <GitFork size={18} strokeWidth={1.8} />
          </a>
        </div>
      </nav>

      <section className="lf-hero" aria-labelledby="lf-hero-title">
        <img
          className="lf-hero-image"
          src={heroImage}
          alt="A desert road photograph used as the hero image for the RAW finishing workflow."
        />
        <div className="lf-hero-shade" aria-hidden="true" />
        <div className="lf-hero-content">
          <p className="lf-kicker">Browser RAW finishing lab</p>
          <h1 id="lf-hero-title">LumaForge</h1>
          <p className="lf-hero-copy">
            RAW to finished JPEG, with the color-science traps removed. It gives
            casual photographers the convenient path they wanted from LUTs,
            without asking them to become a grading-suite operator first.
          </p>
          <div className="lf-hero-actions" aria-label="Primary actions">
            <Link to="/raw" className="lf-button lf-button-primary">
              <ImageUp size={18} strokeWidth={1.9} />
              Start in the browser
            </Link>
            <a
              href={repository.url}
              target="_blank"
              rel="noreferrer"
              className="lf-button lf-button-secondary"
            >
              <GitFork size={18} strokeWidth={1.9} />
              View source
            </a>
          </div>
        </div>
        <div
          className="lf-hero-panel"
          aria-label="LumaForge color workflow preview"
        >
          <div className="lf-compare-stage">
            <img src={heroImage} alt="" aria-hidden="true" />
            <div className="lf-compare-finish" aria-hidden="true" />
            <div className="lf-compare-divider" aria-hidden="true" />
            <span className="lf-compare-tag lf-tag-left">RAW preview</span>
            <span className="lf-compare-tag lf-tag-right">Finished JPEG</span>
          </div>
          <div className="lf-contract-strip" aria-label="Color contract checks">
            {contractSteps.map((step) => (
              <span key={step}>
                <Check size={14} strokeWidth={2.2} />
                {step}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section
        className="lf-positioning"
        aria-labelledby="lf-positioning-title"
      >
        <div>
          <p className="lf-section-label">Why not just use Resolve?</p>
          <h2 id="lf-positioning-title">
            Professional freedom is powerful. It is also easy to misuse.
          </h2>
        </div>
        <div className="lf-positioning-copy">
          <p>
            DaVinci Resolve can build this workflow, and much more. It is made
            for operators who know when to override the pipeline. If the gamma,
            log curve, gamut, or LUT output is wrong, Resolve will still obey
            and calculate.
          </p>
          <p>
            LumaForge is narrower on purpose. It keeps the same color intent,
            but turns the dangerous decisions into explicit guardrails so a user
            can get a good straight-out image without falling into the color
            management pit.
          </p>
        </div>
      </section>

      <section className="lf-proof" aria-label="LumaForge product advantages">
        {proofPoints.map(({ icon: Icon, title, text }) => (
          <article key={title} className="lf-proof-item">
            <Icon size={22} strokeWidth={1.8} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="lf-pipeline" aria-labelledby="lf-pipeline-title">
        <div className="lf-pipeline-header">
          <p className="lf-section-label">The contract rail</p>
          <h2 id="lf-pipeline-title">
            The page only lets compatible math meet.
          </h2>
        </div>
        <div className="lf-rail" aria-label="RAW to JPEG color workflow">
          {contractSteps.map((step, index) => (
            <div className="lf-rail-step" key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
        <p className="lf-pipeline-note">
          Unknown LUTs are not guessed into camera-log space. LumaForge asks for
          the contract, resolves the graph, and disables export when the answer
          is not safe enough to reproduce.
        </p>
      </section>

      <section className="lf-workflow" aria-labelledby="lf-workflow-title">
        <div className="lf-workflow-heading">
          <p className="lf-section-label">A smaller ritual</p>
          <h2 id="lf-workflow-title">
            Three moves from camera file to shareable photo.
          </h2>
        </div>
        <ol className="lf-workflow-list">
          {workflow.map((item, index) => (
            <li key={item.label}>
              <span>{index + 1}</span>
              <div>
                <h3>{item.label}</h3>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lf-luts" aria-labelledby="lf-luts-title">
        <div>
          <p className="lf-section-label">Declared LUT profiles</p>
          <h2 id="lf-luts-title">
            Camera-log looks, without the guessing game.
          </h2>
        </div>
        <div
          className="lf-profile-cloud"
          aria-label="Supported LUT profile families"
        >
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
        <h2 id="lf-final-title">Open the RAW lab. Finish the photo.</h2>
        <p>
          The workflow is browser-local, export-aware, and deliberately hard to
          misconfigure.
        </p>
        <Link to="/raw" className="lf-button lf-button-primary">
          Try LumaForge
          <ArrowRight size={18} strokeWidth={1.9} />
        </Link>
      </section>
    </main>
  )
}

export default Component
