#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
input="${1:?Usage: audit-template.sh LOCAL_SERIALIZED_CONFIG.json}"
exec node "${root}/scripts/template-draft.mjs" audit "${input}"
