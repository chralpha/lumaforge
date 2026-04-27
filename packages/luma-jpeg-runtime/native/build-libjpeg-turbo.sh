#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "${SCRIPT_DIR}/scripts/fetch-sources.mjs"
bash "${SCRIPT_DIR}/scripts/build-wasm.sh"
node "${SCRIPT_DIR}/scripts/verify-native-artifacts.mjs"
