#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

(
  cd "$ROOT_DIR/backend"
  uv run --no-project --isolated --with "pre-commit>=4.0.0" pre-commit install --config "$ROOT_DIR/.pre-commit-config.yaml"
)
