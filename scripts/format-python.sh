#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
paths=()

for path in "$@"; do
  case "$path" in
    backend/*.py)
      paths+=("${path#backend/}")
      ;;
  esac
done

echo "Formatting Python with Ruff..."
if (($# && ! ${#paths[@]})); then
  exit 0
fi

(
  cd "$ROOT_DIR/backend"
  if ((${#paths[@]})); then
    uv run --no-project --isolated --with "ruff>=0.8.0" ruff check --select I --fix "${paths[@]}"
    uv run --no-project --isolated --with "ruff>=0.8.0" ruff format "${paths[@]}"
  else
    uv run --no-project --isolated --with "ruff>=0.8.0" ruff check --select I --fix .
    uv run --no-project --isolated --with "ruff>=0.8.0" ruff format .
  fi
)
