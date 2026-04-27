#!/usr/bin/env bash

set -euo pipefail

export LUMA_JPEG_CFLAGS="-O3 -flto -ffast-math -DNDEBUG"
export LUMA_JPEG_LDFLAGS="-O3 -flto -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=64MB -s DISABLE_EXCEPTION_CATCHING=0 -s EXPORTED_RUNTIME_METHODS=getExceptionMessage,decrementExceptionRefcount"
