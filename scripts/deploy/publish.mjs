import { spawn } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { createDeployConfig, resolveDeployOptions } from './config.mjs'

function readRequiredEnv(env, key) {
  const value = env[key]?.trim()
  if (!value) throw new Error(`${key} is required for deployment.`)
  return value
}

export function createPublishCommand(
  config = createDeployConfig(),
  { target, deployEnv, env = process.env } = resolveDeployOptions(),
) {
  if (target === 'cloudflare') {
    const projectName = readRequiredEnv(env, config.cloudflare.projectNameEnv)
    readRequiredEnv(env, 'CLOUDFLARE_API_TOKEN')
    readRequiredEnv(env, 'CLOUDFLARE_ACCOUNT_ID')

    const branch =
      env.CLOUDFLARE_PAGES_BRANCH?.trim() || env.GITHUB_REF_NAME?.trim()
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

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: config.root,
      env,
      stdio: 'inherit',
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
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await publishDeployTarget()
}
