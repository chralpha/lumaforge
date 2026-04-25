#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <branch-name>" >&2
  exit 1
fi

BRANCH_NAME=$1

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ -d .worktrees ]]; then
  LOCATION=".worktrees"
elif [[ -d worktrees ]]; then
  LOCATION="worktrees"
else
  LOCATION=".worktrees"
  mkdir -p "$LOCATION"
fi

if [[ "$LOCATION" == ".worktrees" || "$LOCATION" == "worktrees" ]]; then
  if ! git check-ignore -q "$LOCATION/" >/dev/null; then
    echo "ERROR: $LOCATION is not ignored in git. Add '$LOCATION/' to .gitignore." >&2
    exit 1
  fi
fi

TARGET="$LOCATION/$BRANCH_NAME"

if [[ -d "$TARGET" ]]; then
  echo "Worktree already exists: $TARGET"
  echo "cd \"$TARGET\""
  exit 0
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  git worktree add "$TARGET" "$BRANCH_NAME"
else
  git worktree add -b "$BRANCH_NAME" "$TARGET"
fi

echo "Worktree ready at: $PROJECT_ROOT/$TARGET"
echo "cd \"$PROJECT_ROOT/$TARGET\""
