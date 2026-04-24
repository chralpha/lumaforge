#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDOR_DIR="${NATIVE_DIR}/vendor"
BUILD_DIR="${NATIVE_DIR}/build"
SYSROOT_DIR="${BUILD_DIR}/sysroot"
LCMS_DIR="${VENDOR_DIR}/lcms2-2.18"
LIBRAW_DIR="${VENDOR_DIR}/LibRaw-0.22.1"

source "${NATIVE_DIR}/emcc-flags.sh"

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required to build Luma RAW native dependencies." >&2
    exit 1
  fi
}

require_source_dir() {
  local source_name="$1"
  local source_dir="$2"

  if [ ! -d "${source_dir}" ]; then
    echo "Missing ${source_name} source directory: ${source_dir}" >&2
    echo "Run native/scripts/fetch-sources.mjs before building dependencies." >&2
    exit 1
  fi
}

detect_libtoolize() {
  if command -v libtoolize >/dev/null 2>&1; then
    echo "libtoolize"
    return
  fi

  if command -v glibtoolize >/dev/null 2>&1; then
    echo "glibtoolize"
    return
  fi

  echo "libtoolize or glibtoolize is required to build Luma RAW native dependencies." >&2
  exit 1
}

detect_jobs() {
  if command -v nproc >/dev/null 2>&1; then
    nproc
    return
  fi

  if command -v sysctl >/dev/null 2>&1; then
    sysctl -n hw.ncpu
    return
  fi

  echo "1"
}

run_autotools() {
  local source_dir="$1"

  (
    cd "${source_dir}"
    "${LIBTOOLIZE}" --copy --force
    autoreconf -fi
  )
}

verify_file() {
  local expected_file="$1"

  if [ ! -f "${expected_file}" ]; then
    echo "Expected build output is missing: ${expected_file}" >&2
    exit 1
  fi
}

verify_dir() {
  local expected_dir="$1"

  if [ ! -d "${expected_dir}" ]; then
    echo "Expected build output is missing: ${expected_dir}" >&2
    exit 1
  fi
}

require_command emcc
require_command emconfigure
require_command emmake
require_command autoreconf
require_command pkg-config

LIBTOOLIZE="$(detect_libtoolize)"
JOBS="$(detect_jobs)"

require_source_dir "LCMS" "${LCMS_DIR}"
require_source_dir "LibRaw" "${LIBRAW_DIR}"

rm -rf "${BUILD_DIR}"
mkdir -p "${SYSROOT_DIR}"

echo "Building LCMS into ${SYSROOT_DIR}"
run_autotools "${LCMS_DIR}"
(
  cd "${LCMS_DIR}"
  emconfigure ./configure \
    --host=wasm32-unknown-emscripten \
    --prefix="${SYSROOT_DIR}" \
    --disable-shared \
    --enable-static \
    --disable-dependency-tracking \
    CFLAGS="${LUMA_RAW_CFLAGS}"
  emmake make -j"${JOBS}"
  emmake make install
)

echo "Building LibRaw into ${SYSROOT_DIR}"
run_autotools "${LIBRAW_DIR}"
(
  cd "${LIBRAW_DIR}"
  export EM_PKG_CONFIG_PATH="${SYSROOT_DIR}/lib/pkgconfig${EM_PKG_CONFIG_PATH:+:${EM_PKG_CONFIG_PATH}}"
  export PKG_CONFIG_PATH="${EM_PKG_CONFIG_PATH}"

  if ! pkg-config --exists lcms2; then
    echo "LCMS pkg-config metadata is unavailable after building LCMS: ${SYSROOT_DIR}/lib/pkgconfig/lcms2.pc" >&2
    exit 1
  fi

  emconfigure ./configure \
    --host=wasm32-unknown-emscripten \
    --prefix="${SYSROOT_DIR}" \
    --enable-lcms \
    --disable-shared \
    --enable-static \
    --disable-examples \
    --disable-dependency-tracking \
    CPPFLAGS="-I${SYSROOT_DIR}/include" \
    CFLAGS="${LUMA_RAW_CFLAGS} -I${SYSROOT_DIR}/include" \
    CXXFLAGS="${LUMA_RAW_CFLAGS} -I${SYSROOT_DIR}/include" \
    LDFLAGS="-L${SYSROOT_DIR}/lib" \
    LIBS="-llcms2"

  if ! grep -Eq '^LCMS2_LIBS = .*-llcms2' Makefile; then
    echo "LibRaw configure did not enable LCMS2 support." >&2
    exit 1
  fi

  emmake make -j"${JOBS}"
  emmake make install
)

verify_file "${SYSROOT_DIR}/lib/liblcms2.a"
verify_file "${SYSROOT_DIR}/lib/pkgconfig/lcms2.pc"
verify_file "${SYSROOT_DIR}/lib/libraw.a"
verify_dir "${SYSROOT_DIR}/include/libraw"

echo "Built Luma RAW native dependencies into ${SYSROOT_DIR}"
