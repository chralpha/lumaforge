#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PACKAGE_DIR}/../.." && pwd)"
BASELINE_ROOT="${LIBRAW_WASM_ROOT:-/workspaces/LumaForge/LibRaw/LibRaw-Wasm}"

source "${SCRIPT_DIR}/emcc-flags.sh"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc is required. Activate the Emscripten SDK before running build:native." >&2
  exit 1
fi

if [ ! -d "${BASELINE_ROOT}/includes" ] || [ ! -d "${BASELINE_ROOT}/libs" ]; then
  echo "Expected LibRaw-Wasm baseline at ${BASELINE_ROOT} with includes/ and libs/." >&2
  exit 1
fi

mkdir -p "${PACKAGE_DIR}/dist/native"

emcc \
  --bind \
  -I"${BASELINE_ROOT}/includes" \
  ${LUMA_RAW_LDFLAGS} \
  ${LUMA_RAW_CFLAGS} \
  "${SCRIPT_DIR}/libraw_wrapper.cpp" \
  "${BASELINE_ROOT}/libs/liblcms2.a" \
  "${BASELINE_ROOT}/libs/libraw.a" \
  -o "${PACKAGE_DIR}/dist/native/luma_raw.js"

node -e "const fs=require('fs'); for (const f of ['luma_raw.js','luma_raw.wasm']) { const p='${PACKAGE_DIR}/dist/native/'+f; if (!fs.existsSync(p)) { throw new Error('Missing native build artifact '+p) } }"

echo "Built Luma RAW native runtime into ${PACKAGE_DIR}/dist/native"
