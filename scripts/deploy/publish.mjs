import { spawn } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { createDeployConfig, resolveDeployOptions } from './config.mjs'

function readRequiredEnv(env, key) {
  const value = env[key]?.trim()
  if (!value) throw new Error(`${key} is required for deployment.`)
  return value
}

function resolveCloudflareBranch({ deployEnv, env }) {
  if (deployEnv === 'production') {
    return (
      env.CLOUDFLARE_PAGES_PRODUCTION_BRANCH?.trim() ||
      (env.DEPLOY_PRODUCTION_BRANCHES || 'main')
        .split(',')
        .map((branch) => branch.trim())
        .find(Boolean)
    )
  }

  const explicitBranch = env.CLOUDFLARE_PAGES_BRANCH?.trim()
  if (explicitBranch) return explicitBranch

  const pullRequestBranch = env.GITHUB_HEAD_REF?.trim()
  if (pullRequestBranch) return pullRequestBranch

  const refName = env.GITHUB_REF_NAME?.trim()
  if (refName) return refName

  return undefined
}

function normalizeCloudflarePreviewBranch(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function extractDeploymentUrl(output) {
  return output.match(/https:\/\/[^\s"')>]+/)?.[0] ?? null
}

function extractUrls(output) {
  return Array.from(
    output.matchAll(/https:\/\/[^\s"')>]+/g),
    (match) => match[0],
  )
}

function hostnameForUrl(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function selectDeploymentUrl(target, output) {
  const urls = extractUrls(output)

  if (target === 'cloudflare') {
    return (
      urls.find((url) => hostnameForUrl(url).endsWith('.pages.dev')) ?? null
    )
  }

  return (
    urls.find((url) => hostnameForUrl(url).endsWith('.vercel.app')) ??
    urls.find((url) => {
      const hostname = hostnameForUrl(url)
      return (
        hostname &&
        hostname !== 'vercel.com' &&
        !hostname.endsWith('.vercel.com')
      )
    }) ??
    null
  )
}

export function resolveDeploymentUrl({ target, deployEnv, env, output }) {
  const printedUrl = selectDeploymentUrl(target, output)
  if (printedUrl) return printedUrl

  if (target !== 'cloudflare') return null

  const projectName = env.CLOUDFLARE_PAGES_PROJECT?.trim()
  if (!projectName) return null
  if (deployEnv === 'production') return `https://${projectName}.pages.dev`

  const branch = resolveCloudflareBranch({ deployEnv, env })
  const alias = branch ? normalizeCloudflarePreviewBranch(branch) : ''
  return alias ? `https://${alias}.${projectName}.pages.dev` : null
}

async function writeGithubOutput(env, name, value) {
  if (!env.GITHUB_OUTPUT || !value) return
  await appendFile(env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

async function appendGithubSummary(env, { target, deployEnv, deploymentUrl }) {
  if (!env.GITHUB_STEP_SUMMARY) return

  const body = [
    '### LumaForge deployment',
    '',
    `- Target: \`${target}\``,
    `- Environment: \`${deployEnv}\``,
    deploymentUrl ? `- URL: ${deploymentUrl}` : '- URL: not detected',
    '',
  ].join('\n')
  await appendFile(env.GITHUB_STEP_SUMMARY, body)
}

export function createPublishCommand(
  config = createDeployConfig(),
  { target, deployEnv, env = process.env } = resolveDeployOptions(),
) {
  if (target === 'cloudflare') {
    const projectName = readRequiredEnv(env, config.cloudflare.projectNameEnv)
    readRequiredEnv(env, 'CLOUDFLARE_API_TOKEN')
    readRequiredEnv(env, 'CLOUDFLARE_ACCOUNT_ID')

    const branch = resolveCloudflareBranch({ deployEnv, env })
    const args = [
      'exec',
      'wrangler',
      'pages',
      'deploy',
      config.outputDir,
      '--project-name',
      projectName,
    ]
    if (branch) args.push('--branch', branch)

    return { command: 'pnpm', args }
  }

  readRequiredEnv(env, 'VERCEL_TOKEN')
  readRequiredEnv(env, config.vercel.orgIdEnv)
  readRequiredEnv(env, config.vercel.projectIdEnv)

  return {
    command: 'pnpm',
    args: [
      'exec',
      'vercel',
      'deploy',
      '--prebuilt',
      '--archive=tgz',
      ...(deployEnv === 'production' ? ['--prod'] : []),
    ],
  }
}

export async function publishDeployTarget(
  config = createDeployConfig(),
  options = resolveDeployOptions(),
  env = process.env,
) {
  const { command, args } = createPublishCommand(config, { ...options, env })
  let output = ''

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: config.root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(`Deploy command failed with exit code ${code ?? 'unknown'}.`),
      )
    })
  })

  const deploymentUrl = resolveDeploymentUrl({ ...options, env, output })
  await writeGithubOutput(env, 'deployment_url', deploymentUrl)
  await appendGithubSummary(env, { ...options, deploymentUrl })
  return { deploymentUrl }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await publishDeployTarget()
}
