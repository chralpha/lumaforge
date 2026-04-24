#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PACKAGE_DIR}/../.." && pwd)"

node "${SCRIPT_DIR}/scripts/verify-no-baseline-deps.mjs"
node "${SCRIPT_DIR}/scripts/fetch-sources.mjs"
bash "${SCRIPT_DIR}/scripts/build-deps.sh"
bash "${SCRIPT_DIR}/scripts/build-wasm.sh"

(
  cd "${REPO_ROOT}"
  pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline
)
