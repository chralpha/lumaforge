import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const nativeDir = path.dirname(scriptDir);
const packageDir = path.dirname(nativeDir);
const repoRoot = path.resolve(packageDir, '..', '..');

const defaultRoots = [
  'packages/luma-raw-runtime/native',
  'packages/luma-raw-runtime/package.json',
  '.github/workflows',
];

const ignoredPathSegments = new Set([
  '.cache',
  'build',
  'cache',
  'dist',
  'generated',
  'vendor',
]);

const skippedPathSegments = new Set([
  '.git',
  'node_modules',
]);

const guardScriptPath = 'packages/luma-raw-runtime/native/scripts/verify-no-baseline-deps.mjs';

const forbiddenPatterns = [
  'LibRaw-Wasm',
  'BASELINE_ROOT',
  'LIBRAW_WASM_ROOT',
  '/workspaces/LumaForge',
].map((literal) => {
  const regex = new RegExp(escapeRegExp(literal));
  return {
    regex,
    label: regex.source,
  };
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRelativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function isIgnored(absolutePath) {
  const relativePath = toRelativePath(absolutePath);

  if (relativePath === guardScriptPath) {
    return true;
  }

  const pathSegments = relativePath.split('/');
  return pathSegments.some((segment) => skippedPathSegments.has(segment) || ignoredPathSegments.has(segment));
}

async function collectFiles(absolutePath, files) {
  if (isIgnored(absolutePath)) {
    return;
  }

  let entry;
  try {
    entry = await fs.lstat(absolutePath);
  } catch {
    return;
  }

  if (entry.isSymbolicLink()) {
    return;
  }

  if (entry.isDirectory()) {
    let entries;
    try {
      entries = await fs.readdir(absolutePath);
    } catch {
      return;
    }

    for (const child of entries) {
      await collectFiles(path.join(absolutePath, child), files);
    }
    return;
  }

  if (entry.isFile()) {
    files.push(absolutePath);
  }
}

async function pathExists(absolutePath) {
  try {
    await fs.lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExplicitRoot(inputPath) {
  const candidates = path.isAbsolute(inputPath)
    ? [inputPath]
    : [
        path.resolve(repoRoot, inputPath),
        path.resolve(packageDir, inputPath),
        path.resolve(process.cwd(), inputPath),
      ];

  for (const candidate of [...new Set(candidates)]) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Missing native baseline scan target: ${inputPath}`);
}

async function scanFile(absolutePath) {
  let contents;
  try {
    contents = await fs.readFile(absolutePath, 'utf8');
  } catch {
    return [];
  }

  return forbiddenPatterns
    .filter(({ regex }) => regex.test(contents))
    .map(({ label }) => `${toRelativePath(absolutePath)} matches /${label}/`);
}

const explicitRoots = process.argv.slice(2);
let roots;
try {
  roots = explicitRoots.length > 0
    ? await Promise.all(explicitRoots.map(resolveExplicitRoot))
    : defaultRoots.map((entry) => path.resolve(repoRoot, entry));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const files = [];
try {
  for (const root of roots) {
    await collectFiles(root, files);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const matches = [];
for (const file of files.sort()) {
  matches.push(...await scanFile(file));
}

if (matches.length > 0) {
  console.error('Forbidden native baseline dependencies found:');
  for (const match of matches) {
    console.error(match);
  }
  process.exit(1);
}

console.log('No forbidden native baseline dependencies found.');
