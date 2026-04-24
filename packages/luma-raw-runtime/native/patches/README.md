# Native Patches

This directory is for explicit patches against locked upstream native sources.

Rules:

- Do not patch extracted files directly in `native/vendor`.
- Every patch must mention the upstream source name and version.
- Every patch must be applied by `native/scripts/build-deps.sh`.
- If a patch changes runtime behavior, update benchmark notes after CI build passes.

The initial independent build uses no source patches.
