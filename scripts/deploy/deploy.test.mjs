import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkDeployArtifact } from './check.mjs'
import { createDeployConfig, resolveDeployOptions } from './config.mjs'
import { prepareCloudflareDeploy, prepareVercelDeploy } from './prepare.mjs'
import { createPublishCommand } from './publish.mjs'

const tempDirs = []

async function makeTempProject() {
  const root = await mkdtemp(join(tmpdir(), 'lumaforge-deploy-'))
  tempDirs.push(root)
  return root
}

async function writeFixtureDist(root) {
  const config = createDeployConfig(root)
  await mkdir(join(config.outputDir, 'native'), { recursive: true })
  await writeFile(
    join(config.outputDir, 'index.html'),
    '<main>LumaForge</main>',
  )
  await writeFile(join(config.outputDir, 'app.js'), 'console.log("app")')

  for (const asset of config.nativeAssets) {
    await writeFile(join(config.outputDir, asset), asset)
  }

  return config
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  )
})

describe('deploy configuration', () => {
  it('requires a single supported deploy target from DEPLOY_TARGET', () => {
    expect(
      resolveDeployOptions({
        DEPLOY_TARGET: 'cloudflare',
        DEPLOY_ENV: 'production',
      }),
    ).toEqual({ target: 'cloudflare', deployEnv: 'production' })

    expect(
      resolveDeployOptions({
        DEPLOY_TARGET: 'vercel',
        DEPLOY_ENV: 'preview',
      }),
    ).toEqual({ target: 'vercel', deployEnv: 'preview' })

    expect(() => resolveDeployOptions({ DEPLOY_TARGET: 'netlify' })).toThrow(
      'DEPLOY_TARGET must be one of: cloudflare, vercel',
    )
  })

  it('defaults DEPLOY_ENV to preview', () => {
    expect(resolveDeployOptions({ DEPLOY_TARGET: 'vercel' })).toEqual({
      target: 'vercel',
      deployEnv: 'preview',
    })
  })
})

describe('deploy artifact checks', () => {
  it('fails when a required native runtime asset is missing', async () => {
    const root = await makeTempProject()
    const config = await writeFixtureDist(root)
    await rm(join(config.outputDir, 'native/luma_raw.wasm'))

    await expect(checkDeployArtifact(config)).rejects.toThrow(
      'Missing deploy artifact: native/luma_raw.wasm',
    )
  })

  it('accepts a complete static artifact with native runtime files', async () => {
    const root = await makeTempProject()
    const config = await writeFixtureDist(root)

    await expect(checkDeployArtifact(config)).resolves.toBeUndefined()
  })
})

describe('platform preparation', () => {
  it('writes Cloudflare Pages headers and SPA redirects into dist', async () => {
    const root = await makeTempProject()
    const config = await writeFixtureDist(root)

    await prepareCloudflareDeploy(config)

    await expect(readFile(join(config.outputDir, '_headers'), 'utf8')).resolves
      .toMatchInlineSnapshot(`
        "/*
          Cross-Origin-Opener-Policy: same-origin
          Cross-Origin-Embedder-Policy: require-corp

        /*.wasm
          Content-Type: application/wasm
        "
      `)
    await expect(
      readFile(join(config.outputDir, '_redirects'), 'utf8'),
    ).resolves.toBe('/* /index.html 200\n')
  })

  it('creates a Vercel Build Output API directory from dist', async () => {
    const root = await makeTempProject()
    const config = await writeFixtureDist(root)
    await writeFile(join(config.outputDir, '_headers'), 'cloudflare-only')
    await writeFile(join(config.outputDir, '_redirects'), 'cloudflare-only')

    await prepareVercelDeploy(config)

    await expect(
      readFile(join(config.vercel.outputStaticDir, 'index.html'), 'utf8'),
    ).resolves.toBe('<main>LumaForge</main>')
    await expect(
      readFile(
        join(config.vercel.outputStaticDir, 'native/luma_jpeg.wasm'),
        'utf8',
      ),
    ).resolves.toBe('native/luma_jpeg.wasm')
    await expect(
      readFile(join(config.vercel.outputStaticDir, '_headers'), 'utf8'),
    ).rejects.toThrow()
    await expect(
      readFile(join(config.vercel.outputStaticDir, '_redirects'), 'utf8'),
    ).rejects.toThrow()

    const vercelConfig = JSON.parse(
      await readFile(join(config.vercel.outputDir, 'config.json'), 'utf8'),
    )
    expect(vercelConfig).toEqual({
      version: 3,
      routes: [
        {
          src: '/(.*)',
          headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
          },
          continue: true,
        },
        {
          src: '/(.*)\\.wasm',
          headers: {
            'Content-Type': 'application/wasm',
          },
          continue: true,
        },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    })
  })
})

describe('publish command selection', () => {
  it('builds a Cloudflare direct-upload command', () => {
    const config = createDeployConfig('/repo')
    expect(
      createPublishCommand(config, {
        target: 'cloudflare',
        deployEnv: 'production',
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'account',
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_PAGES_PROJECT: 'lumaforge',
          GITHUB_REF_NAME: 'main',
        },
      }),
    ).toEqual({
      command: 'pnpm',
      args: [
        'exec',
        'wrangler',
        'pages',
        'deploy',
        '/repo/dist',
        '--project-name',
        'lumaforge',
        '--branch',
        'main',
      ],
    })
  })

  it('builds a Vercel prebuilt command and only adds --prod for production', () => {
    const config = createDeployConfig('/repo')
    expect(
      createPublishCommand(config, {
        target: 'vercel',
        deployEnv: 'production',
        env: {
          VERCEL_TOKEN: 'token',
          VERCEL_ORG_ID: 'org',
          VERCEL_PROJECT_ID: 'project',
        },
      }),
    ).toEqual({
      command: 'pnpm',
      args: [
        'exec',
        'vercel',
        'deploy',
        '--prebuilt',
        '--archive=tgz',
        '--prod',
      ],
    })

    expect(
      createPublishCommand(config, {
        target: 'vercel',
        deployEnv: 'preview',
        env: {
          VERCEL_TOKEN: 'token',
          VERCEL_ORG_ID: 'org',
          VERCEL_PROJECT_ID: 'project',
        },
      }).args,
    ).not.toContain('--prod')
  })
})
