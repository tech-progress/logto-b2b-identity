#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${SOURCE_REPO:?Set SOURCE_REPO to your actual accessible owner/repository for the local render}"
for file in Dockerfile gateway.Dockerfile compose.yaml package.json package-lock.json .railway/railway.ts \
  .env.example .gitignore .dockerignore VERSION CHANGELOG.md README.md MARKETPLACE.md PUBLISHING.md SUPPORT.md \
  UPGRADE.md LICENSE_REVIEW.md marketplace-metadata.json template-defaults.json template-descriptions.json \
  template-networking.json template-volumes.json runtime/backend.mjs runtime/config.mjs runtime/gateway.mjs \
  scripts/smoke.sh scripts/verify.sh scripts/restore-template-draft.sh scripts/audit-template.sh scripts/template-draft.mjs \
  tests/gateway.test.mjs tests/template.test.mjs tests/docs.test.mjs scripts/verify-docs.mjs; do
  test -f "${root}/${file}" || { echo "Missing ${file}" >&2; exit 1; }
done
version="$(<"${root}/VERSION")"
[[ "${version}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
grep -Fq "## [${version}] - " "${root}/CHANGELOG.md"
for file in "${root}"/*.json; do jq empty "${file}"; done
for file in "${root}"/scripts/*.sh; do bash -n "${file}"; done
for file in "${root}"/runtime/*.mjs "${root}"/scripts/*.mjs; do node --check "${file}"; done
jq -e '.devDependencies.railway == "3.6.0" and .dependencies.pg == "8.23.1"' "${root}/package.json" >/dev/null
jq -e '.packages["node_modules/railway"].version == "3.6.0" and .packages["node_modules/pg"].version == "8.23.1" and .packages["node_modules/pg"].integrity != null' "${root}/package-lock.json" >/dev/null
POSTGRES_PASSWORD=verify-only-not-a-real-database-password ADMIN_GATE_PASSWORD=verify-only-not-a-real-operator-password-123 \
  docker compose -f "${root}/compose.yaml" config --format json | jq -e '
  ([.services[] | .ports[]? | [.host_ip,.published]] | sort) == [["127.0.0.1","18420"],["127.0.0.1","18421"]] and
  (.services.logto.ports == null and .services.postgres.ports == null) and
  ([.services[] | .volumes[]? | select(.type == "volume")] | length) == 1 and
  .services.admin.environment.GATEWAY_ROLE == "admin" and .services.issuer.environment.GATEWAY_ROLE == "issuer" and
  .services.postgres.image == "public.ecr.aws/docker/library/postgres:17.11-bookworm@sha256:91eb910c44c7ed13f7f1a4ccadaa9ca72ef14cddc04cacb6e070e48eb44731a3"
' >/dev/null
grep -Fq '1.44.0@sha256:75c0767d7c907c79066c77bd1919d0598b17278d0f2c14c4520fa1d1ba4589b8' "${root}/Dockerfile"
grep -Fq '22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a' "${root}/gateway.Dockerfile"
(cd "${root}" && node --input-type=module -e 'import {contract,renderGraph} from "./scripts/template-draft.mjs"; contract(renderGraph());')
if (cd "${root}" && env -u SOURCE_REPO ./node_modules/.bin/railway-iac-ts) > /dev/null 2>&1; then
  echo "Missing SOURCE_REPO must fail closed" >&2; exit 1
fi
jq -e '(.description | length) >= 45 and (.description | length) <= 75 and .directory == "logto-b2b-identity" and .category == "Authentication" and (.icon | contains("logto-io/logto")) and (has("id") | not) and (has("code") | not)' "${root}/marketplace-metadata.json" >/dev/null
for file in README.md MARKETPLACE.md; do
  while read -r url; do grep -Fq "${url}" "${root}/${file}"; done < <(jq -r '.origins[].url' "${root}/marketplace-metadata.json")
done
for heading in '# Deploy and Host' '## About Hosting' '## Why Deploy' '## Common Use Cases' '## Dependencies for' '### Deployment Dependencies'; do
  grep -Fq "${heading}" "${root}/MARKETPLACE.md"
done
if find "${root}" -path '*/node_modules' -prune -o -type f \( -name .env -o -name '*.local' -o -name '*.dump' \) -print | grep -q .; then
  echo "Local secret or backup file found inside the template" >&2; exit 1
fi
(cd "${root}" && npm test)
(cd "${root}" && node scripts/verify-docs.mjs)
echo "PASS: local IaC exact source/root, pinned dependencies, permanent gate, private backend, DB-only volume, metadata, and drift tests."
echo "Run bash scripts/smoke.sh separately for the actual isolated Docker build/start/restart test. No cloud operation was performed."
