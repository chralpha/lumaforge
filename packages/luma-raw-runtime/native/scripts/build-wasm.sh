#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_DIR="$(cd "${NATIVE_DIR}/.." && pwd)"
SYSROOT_DIR="${NATIVE_DIR}/build/sysroot"
PROFILE="${LUMA_RAW_MEMORY_PROFILE:-desktop}"
OUTPUT_DIR="${PACKAGE_DIR}/dist/native/${PROFILE}"
OUTPUT_JS="${OUTPUT_DIR}/luma_raw.js"

source "${NATIVE_DIR}/emcc-flags.sh"

if ! command -v emcc > /dev/null 2>&1; then
  echo "emcc is required. Activate the Emscripten SDK before running build:native." >&2
  exit 1
fi

if [ ! -f "${SYSROOT_DIR}/lib/liblcms2.a" ] || [ ! -f "${SYSROOT_DIR}/lib/libraw.a" ]; then
  echo "Missing native dependency libraries in ${SYSROOT_DIR}." >&2
  echo "Run native/scripts/build-deps.sh before linking the wasm runtime." >&2
  exit 1
fi

if [ ! -d "${SYSROOT_DIR}/include/libraw" ]; then
  echo "Missing LibRaw headers in ${SYSROOT_DIR}/include/libraw." >&2
  echo "Run native/scripts/build-deps.sh before linking the wasm runtime." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

emcc \
  --bind \
  -I"${SYSROOT_DIR}/include" \
  ${LUMA_RAW_CFLAGS} \
  ${LUMA_RAW_LDFLAGS} \
  "${NATIVE_DIR}/libraw_wrapper.cpp" \
  "${SYSROOT_DIR}/lib/libraw.a" \
  "${SYSROOT_DIR}/lib/liblcms2.a" \
  -o "${OUTPUT_JS}"

node "${SCRIPT_DIR}/verify-native-artifacts.mjs" --write-provenance --profile "${PROFILE}"

echo "Built Luma RAW native runtime into ${OUTPUT_DIR}"
