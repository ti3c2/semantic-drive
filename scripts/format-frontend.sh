#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
paths=()

for path in "$@"; do
  case "$path" in
    frontend/*)
      paths+=("${path#frontend/}")
      ;;
  esac
done

echo "Formatting frontend with Prettier..."
if (($# && ! ${#paths[@]})); then
  exit 0
fi

(
  cd "$ROOT_DIR/frontend"
  if ((${#paths[@]})); then
    npm exec -- prettier --write "${paths[@]}"
  else
    npm run format
  fi
)
