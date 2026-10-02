#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
input="${1:?Usage: restore-template-draft.sh INPUT_SNAPSHOT.json NEW_OUTPUT.json}"
output="${2:?Usage: restore-template-draft.sh INPUT_SNAPSHOT.json NEW_OUTPUT.json}"
exec node "${root}/scripts/template-draft.mjs" restore "${input}" "${output}"
