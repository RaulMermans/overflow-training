#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Scope: app/ and src/ (excludes src/theme/tokens.ts where hex is canonical)
MATCHES="$(grep -rn --include="*.ts" --include="*.tsx" '#[0-9A-Fa-f]\{6\}\b\|#[0-9A-Fa-f]\{3\}\b' app/ src/ \
  | grep -v 'src/theme/tokens.ts' || true)"

if [[ -n "$MATCHES" ]]; then
  echo "Found hardcoded hex color values outside src/theme/tokens.ts:"
  echo "$MATCHES"
  exit 1
fi

echo "No hardcoded hex color values found in app/ and src/ (outside src/theme/tokens.ts)."
