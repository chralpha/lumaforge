import { resolve } from 'node:path'

export interface RawRouteAssets {
  scripts: string[]
  styles: string[]
}

export function resolveRawRouteHtmlOutputPaths(outputDir: string) {
  return [
    resolve(outputDir, 'raw.html'),
    resolve(outputDir, 'raw', 'index.html'),
  ]
}

function toAssetHref(fileName: string) {
  return `/${fileName.replace(/^\/+/, '')}`
}

export function selectRawRouteAssets(fileNames: string[]): RawRouteAssets {
  const rawAssets = fileNames
    .filter((fileName) => /^assets\/raw-[^/]+\.(?:css|js)$/.test(fileName))
    .sort()

  return {
    scripts: rawAssets
      .filter((fileName) => fileName.endsWith('.js'))
      .map(toAssetHref),
    styles: rawAssets
      .filter((fileName) => fileName.endsWith('.css'))
      .map(toAssetHref),
  }
}

export function injectRawRouteResourceHints(
  html: string,
  assets: RawRouteAssets,
) {
  const tags = [
    ...assets.scripts
      .filter((href) => !html.includes(`href="${href}"`))
      .map((href) => `<link rel="modulepreload" crossorigin href="${href}">`),
    ...assets.styles
      .filter((href) => !html.includes(`href="${href}"`))
      .map((href) => `<link rel="stylesheet" crossorigin href="${href}">`),
  ]

  if (tags.length === 0) return html

  const moduleScriptIndex = html.indexOf('<script type="module"')
  if (moduleScriptIndex < 0) {
    return html.replace(
      '</head>',
      `${tags.map((tag) => `    ${tag}`).join('\n')}\n  </head>`,
    )
  }

  const lineStart = html.lastIndexOf('\n', moduleScriptIndex) + 1
  const indent = html.slice(lineStart, moduleScriptIndex)
  const hintBlock = tags.map((tag) => `${indent}${tag}`).join('\n')

  return `${html.slice(0, lineStart)}${hintBlock}\n${html.slice(lineStart)}`
}

function rawAfterFirstPaintLoaderScript() {
  return [
    '<script data-lf-raw-post-paint-loader>',
    '  window.__lfRawAfterFirstPaint = window.__lfRawAfterFirstPaint || ((callback) => {',
    '    let done = false;',
    '    const run = () => {',
    '      if (done) return;',
    '      done = true;',
    '      setTimeout(callback, 0);',
    '    };',
    '    if (performance.getEntriesByName("first-contentful-paint").length > 0) {',
    '      run();',
    '      return;',
    '    }',
    '    try {',
    '      const observer = new PerformanceObserver((list) => {',
    '        if (list.getEntriesByName("first-contentful-paint").length === 0) return;',
    '        observer.disconnect();',
    '        run();',
    '      });',
    '      observer.observe({ type: "paint", buffered: true });',
    '      setTimeout(run, 1600);',
    '    } catch {',
    '      requestAnimationFrame(run);',
    '    }',
    '  });',
    '</script>',
  ].join('\n')
}

function withRawAfterFirstPaintLoader(html: string) {
  if (html.includes('data-lf-raw-post-paint-loader')) return html

  const headEndIndex = html.indexOf('</head>')
  const loader = rawAfterFirstPaintLoaderScript()
  if (headEndIndex < 0) return `${html}\n${loader}`

  const lineStart = html.lastIndexOf('\n', headEndIndex) + 1
  const indent = html.slice(lineStart, headEndIndex)
  const loaderBlock = loader
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')

  return `${html.slice(0, lineStart)}${loaderBlock}\n${html.slice(lineStart)}`
}

export function deferRawRouteStylesheets(html: string) {
  const stylesheetPattern =
    /[ \t]*<link rel="stylesheet" crossorigin href="([^"]+\.css)">\n?/g
  const stylesheetTags: string[] = []
  const stylesheetHrefs: string[] = []
  const withoutStylesheets = html.replace(
    stylesheetPattern,
    (tag, href: string) => {
      stylesheetTags.push(tag.trim())
      stylesheetHrefs.push(href)
      return ''
    },
  )

  if (stylesheetHrefs.length === 0) return html

  const loader = [
    '<script data-lf-raw-css-loader>',
    `  const rawCssHrefs = ${JSON.stringify(stylesheetHrefs)};`,
    '  const loadRawCss = () => {',
    '    for (const href of rawCssHrefs) {',
    '      const link = document.createElement("link");',
    '      link.rel = "stylesheet";',
    '      link.crossOrigin = "";',
    '      link.href = href;',
    '      document.head.appendChild(link);',
    '    }',
    '  };',
    '  window.__lfRawAfterFirstPaint(loadRawCss);',
    '</script>',
    ...stylesheetTags.map((tag) => `<noscript>${tag}</noscript>`),
  ].join('\n')

  const withPostPaintLoader = withRawAfterFirstPaintLoader(withoutStylesheets)
  const headEndIndex = withPostPaintLoader.indexOf('</head>')
  if (headEndIndex < 0) return `${withPostPaintLoader}\n${loader}`

  const lineStart = withPostPaintLoader.lastIndexOf('\n', headEndIndex) + 1
  const indent = withPostPaintLoader.slice(lineStart, headEndIndex)
  const loaderBlock = loader
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')

  return `${withPostPaintLoader.slice(0, lineStart)}${loaderBlock}\n${withPostPaintLoader.slice(lineStart)}`
}

export function deferRawRouteAppModule(html: string) {
  const moduleScriptPattern =
    /[ \t]*<script type="module" crossorigin src="([^"]+\.js)"><\/script>\n?/
  const match = html.match(moduleScriptPattern)
  if (!match) return html

  const [, src] = match
  const withoutModuleScript = html.replace(moduleScriptPattern, '')
  const alreadyPreloaded = withoutModuleScript.includes(`href="${src}"`)
  const loader = [
    alreadyPreloaded
      ? null
      : `<link rel="modulepreload" crossorigin href="${src}">`,
    '<script data-lf-raw-app-loader>',
    `  const rawAppModuleSrc = ${JSON.stringify(src)};`,
    '  window.__lfRawAfterFirstPaint(() => import(rawAppModuleSrc));',
    '</script>',
  ]
    .filter(Boolean)
    .join('\n')

  const withPostPaintLoader = withRawAfterFirstPaintLoader(withoutModuleScript)
  const headEndIndex = withPostPaintLoader.indexOf('</head>')
  if (headEndIndex < 0) return `${withPostPaintLoader}\n${loader}`

  const lineStart = withPostPaintLoader.lastIndexOf('\n', headEndIndex) + 1
  const indent = withPostPaintLoader.slice(lineStart, headEndIndex)
  const loaderBlock = loader
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')

  return `${withPostPaintLoader.slice(0, lineStart)}${loaderBlock}\n${withPostPaintLoader.slice(lineStart)}`
}
