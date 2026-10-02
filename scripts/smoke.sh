#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for command in docker curl jq openssl; do command -v "${command}" >/dev/null; done
project="logtob2b-smoke-$(date +%s)-${RANDOM}"
scratch="$(mktemp -d /tmp/logtob2b-smoke.XXXXXX)"
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export ADMIN_GATE_PASSWORD="$(openssl rand -hex 24)"
export ENDPOINT=http://127.0.0.1:18420 ADMIN_ENDPOINT=http://127.0.0.1:18421 ALLOW_INSECURE_LOCALHOST=1
jq -n --arg backend "${project}-backend" --arg gateway "${project}-gateway" \
  '{services:{logto:{image:$backend},issuer:{image:$gateway},admin:{image:$gateway}}}' >"${scratch}/images.json"
compose=(docker compose -p "${project}" -f "${root}/compose.yaml" -f "${scratch}/images.json")
cleanup() {
  result=$?
  trap - EXIT
  if (( result != 0 )); then
    "${compose[@]}" ps >&2 || true
    "${compose[@]}" logs --tail=60 2>&1 | sed -e "s/${POSTGRES_PASSWORD}/[REDACTED]/g" -e "s/${ADMIN_GATE_PASSWORD}/[REDACTED]/g" >&2 || true
  fi
  "${compose[@]}" down --volumes --remove-orphans --timeout 15 >/dev/null 2>&1 || true
  docker image rm "${project}-backend" "${project}-gateway" >/dev/null 2>&1 || true
  remaining="$(docker ps -aq --filter "label=com.docker.compose.project=${project}")"
  remaining_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=${project}")"
  remaining_networks="$(docker network ls -q --filter "label=com.docker.compose.project=${project}")"
  if [[ -n "${remaining}${remaining_volumes}${remaining_networks}" ]]; then
    echo "Cleanup incomplete for own project ${project}" >&2
    result=1
  else
    echo "Cleanup: zero containers, volumes, and networks for ${project}."
  fi
  rm -rf "${scratch}"
  exit "${result}"
}
trap cleanup EXIT
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${project}")" ]]; then
  echo "Refusing to reuse an existing project" >&2; exit 1
fi
if ! docker buildx version >/dev/null 2>&1; then export DOCKER_BUILDKIT=0; fi
docker build -t "${project}-backend" -f "${root}/Dockerfile" "${root}"
docker build -t "${project}-gateway" -f "${root}/gateway.Dockerfile" "${root}"
docker run --rm --network none --entrypoint node -v "${root}/tests:/opt/railway-logto/tests:ro" -v "${root}/runtime:/opt/railway-logto/runtime:ro" \
  "${project}-backend" --test /opt/railway-logto/tests/gateway.test.mjs
"${compose[@]}" config --format json | jq -e '
  [.services[] | .ports[]? | [.host_ip,.published]] | sort == [["127.0.0.1","18420"],["127.0.0.1","18421"]]
' >/dev/null
"${compose[@]}" up -d --no-build --wait --wait-timeout 300
echo "Cold database: all four services healthy."
request_code() { curl --path-as-is --max-time 10 -sS -o "${scratch}/body" -w '%{http_code}' "$@"; }
expect_code() {
  expected="${1}"; shift
  actual="$(request_code "$@")"
  [[ "${actual}" == "${expected}" ]] || { echo "Expected ${expected}, received ${actual}" >&2; exit 1; }
}
for path in / /welcome /console /me /api/interaction /api/users /oidc/.well-known/openid-configuration /oidc/jwks; do
  expect_code 401 "${ADMIN_ENDPOINT}${path}"
done
expect_code 401 -X POST -H 'Content-Type: application/json' --data '{}' "${ADMIN_ENDPOINT}/api/interaction"
for attempt in 1 2 3 4; do
  curl --max-time 10 -sS -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    --data '{"event":"Register","profile":{"username":"outsider-smoke","password":"not-an-owner-password"}}' \
    "${ADMIN_ENDPOINT}/api/interaction" >"${scratch}/claim-${attempt}" &
done
wait
for attempt in 1 2 3 4; do [[ "$(<"${scratch}/claim-${attempt}")" == 401 ]]; done
expect_code 401 -u operator:incorrect-password "${ADMIN_ENDPOINT}/__gate/login"
expect_code 401 -H 'Cookie: logto_admin_gate_local=forged' "${ADMIN_ENDPOINT}/console"
expect_code 401 -u "operator:${ADMIN_GATE_PASSWORD}" "${ADMIN_ENDPOINT}/console"
for path in /console /welcome /me /%63onsole /%2563onsole /other/../console /me%2fusers /__gate/login; do
  expect_code 404 "${ENDPOINT}${path}"
done
echo "Admin gate: missing/wrong credentials and forged cookies denied, including setup APIs."
curl --max-time 10 -fsS "${ENDPOINT}/oidc/.well-known/openid-configuration" >"${scratch}/discovery.json"
jq -e --arg origin "${ENDPOINT}" '.issuer == ($origin+"/oidc") and .jwks_uri == ($origin+"/oidc/jwks") and .authorization_endpoint == ($origin+"/oidc/auth")' "${scratch}/discovery.json" >/dev/null
curl --max-time 10 -fsS "$(jq -r .jwks_uri "${scratch}/discovery.json")" >"${scratch}/jwks-before.json"
jq -e '.keys | length > 0 and all(.[]; .kid != null and .kty != null and .d == null)' "${scratch}/jwks-before.json" >/dev/null
curl --max-time 10 -fsS -H 'Host: 127.0.0.1:18421' -H 'X-Forwarded-Host: 127.0.0.1:18421' -H 'X-Forwarded-Proto: https' \
  -H 'Forwarded: host=127.0.0.1:18421;proto=https' "${ENDPOINT}/oidc/.well-known/openid-configuration" | jq -e --arg issuer "${ENDPOINT}/oidc" '.issuer == $issuer' >/dev/null
expect_code 303 -D "${scratch}/gate-headers" -c "${scratch}/cookies" -u "operator:${ADMIN_GATE_PASSWORD}" "${ADMIN_ENDPOINT}/__gate/login"
grep -qi 'HttpOnly; SameSite=Lax; Max-Age=28800' "${scratch}/gate-headers"
expect_code 200 -L -b "${scratch}/cookies" "${ADMIN_ENDPOINT}/console"
expect_code 200 -b "${scratch}/cookies" "${ADMIN_ENDPOINT}/oidc/.well-known/openid-configuration"
jq -e --arg issuer "${ADMIN_ENDPOINT}/oidc" '.issuer == $issuer' "${scratch}/body" >/dev/null
expect_code 401 -D "${scratch}/api-headers" -b "${scratch}/cookies" -H 'Authorization: Bearer deliberately-invalid-smoke-token' "${ADMIN_ENDPOINT}/api/users"
grep -qi 'Logto-Core-Request-Id:' "${scratch}/api-headers"
echo "OIDC/JWKS: issuer correct, admin proxy reaches distinct admin issuer, spoofed origin cannot switch tenant."
admin_count="$("${compose[@]}" exec -T postgres psql -U logto -d logto -Atc "SELECT count(*) FROM users WHERE tenant_id='admin'")"
[[ "${admin_count}" == 0 ]]
marker="$(openssl rand -hex 12)"
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U logto -d logto -c "CREATE SCHEMA railway_template_smoke; CREATE TABLE railway_template_smoke.persistence (marker text PRIMARY KEY); INSERT INTO railway_template_smoke.persistence VALUES ('${marker}');" >/dev/null
"${compose[@]}" stop postgres >/dev/null
"${compose[@]}" restart logto >/dev/null
sleep 4
[[ "$("${compose[@]}" ps --format json logto | jq -r '.State')" == running ]]
"${compose[@]}" start postgres >/dev/null
wait_ready() {
  deadline=$((SECONDS + 180))
  while (( SECONDS < deadline )); do
    if curl --max-time 2 -fsS "${ENDPOINT}/healthz" >/dev/null 2>&1 && curl --max-time 2 -fsS "${ADMIN_ENDPOINT}/healthz" >/dev/null 2>&1; then return; fi
    sleep 2
  done
  echo "Bounded readiness wait expired" >&2; exit 1
}
wait_ready
[[ "$("${compose[@]}" exec -T postgres psql -U logto -d logto -Atc 'SELECT marker FROM railway_template_smoke.persistence')" == "${marker}" ]]
curl --max-time 10 -fsS "${ENDPOINT}/oidc/jwks" >"${scratch}/jwks-after.json"
diff <(jq -S '.keys | sort_by(.kid)' "${scratch}/jwks-before.json") <(jq -S '.keys | sort_by(.kid)' "${scratch}/jwks-after.json")
"${compose[@]}" logs logto | grep -q 'Seeding skipped'
[[ "$("${compose[@]}" exec -T postgres psql -U logto -d logto -Atc "SELECT count(*) FROM users WHERE tenant_id='admin'")" == 0 ]]
expect_code 401 "${ADMIN_ENDPOINT}/api/interaction"
expect_code 200 -L -b "${scratch}/cookies" "${ADMIN_ENDPOINT}/console"
expect_code 403 -b "${scratch}/cookies" -X POST -H 'Origin: https://outsider.example.org' "${ADMIN_ENDPOINT}/__gate/logout"
expect_code 204 -b "${scratch}/cookies" -c "${scratch}/cookies" -X POST -H "Origin: ${ADMIN_ENDPOINT}" "${ADMIN_ENDPOINT}/__gate/logout"
expect_code 401 -b "${scratch}/cookies" "${ADMIN_ENDPOINT}/console"
"${compose[@]}" exec -T postgres psql -U logto -d logto -c 'DROP SCHEMA railway_template_smoke CASCADE' >/dev/null
docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} memory={{.MemUsage}}' $("${compose[@]}" ps -q)
echo "PASS: DB-ready retries, restart data/signing-key persistence, unclaimed-owner safety, and gate logout."
echo "NOT TESTED: HTTPS edge/cookies, browser owner claim, real PKCE/login/logout, B2B organization authorization, full backup/restore."
