# Logto B2B identity on Railway

An evaluation recipe for [Logto](https://logto.io) 1.44.0, with a private backend, independently routed issuer and operator-gated administrator origins, and durable [PostgreSQL](https://www.postgresql.org) 17.11. The gateways run [Node.js](https://nodejs.org) 22.23.3. Recipe versions describe the deployment contract separately from these upstream versions.

**Source-only freeze candidate — 2026-10-06:** Recipe **1.0.2 is selected for immutable source-only publication**. The [standalone `v1.0.2` tag](https://github.com/tech-progress/logto-b2b-identity/tree/v1.0.2) is the intended immutable navigation target; `release-v1` is the prospective moving compatibility channel. These are publication targets, not a source-push receipt. Selection remains valid after a source push and does not qualify a Railway marketplace release. All remote qualification and marketplace publication receipts remain **PENDING**; see [PUBLISHING.md](PUBLISHING.md).

> **Historical pre-live snapshot — 2026-10-06 (before source freeze):** Recipe 1.0.2 was staged, not released; Recipe 1.0.1 was the public source release then. This records earlier history, not the current public source version.
> At that historical snapshot, `main` and `release-v1` were recorded at [9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554](https://github.com/tech-progress/logto-b2b-identity/commit/9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554). Existing immutable tags are preserved; this is not a claim about the channels after publication.

Logto upstream source is [logto-io/logto](https://github.com/logto-io/logto/tree/v1.44.0), licensed MPL-2.0. This recipe targets self-hosted OIDC and organization-scoped B2B evaluation. The source candidate passed all ten native acceptance gates on an initially empty, isolated local four-service stack: genuine browser owner creation, native authorization code + PKCE, organization allow/deny authorization, logout, restart continuity, account recovery, and a fresh full database restore. The local run used distinct loopback HTTPS origins with a private test certificate and an explicit, bounded test opt-in. The entire matrix on trusted public Railway HTTPS and remote source qualification remain **pending**; local receipts do not establish production readiness. See the acceptance details below.

## Topology and security boundary

| Service | Role | Public routing | Persistent storage |
| --- | --- | --- | --- |
| Issuer | Fixed-origin gateway to private Logto port **3001** | Its own HTTPS domain on gateway port 8080 | None |
| Admin | Permanent independent access gate, then fixed admin-origin proxy to port **3002** | A different HTTPS domain on gateway port 8080 | None |
| Logto | Unmodified upstream app plus serialized initialization wrapper | **None**; private ports 3001 and 3002 only | None |
| Postgres | Dedicated database | **None**; private TCP 5432 only | Exactly one **5000 MB** volume, `/var/lib/postgresql/data` |

There is no shared disk, Docker socket, Redis requirement, public database proxy, or application volume. Run one backend replica. Other services/users with access to the project's private network are trusted operators; private networking is not an isolation boundary from a malicious co-deployed service.

Logto chooses its administrator tenant from the request **origin**, not merely the port. Each gateway chooses a fixed port by `GATEWAY_ROLE`, rewrites Host and all forwarding headers to the configured origin, and never accepts a client-selected upstream. The issuer gateway also denies `/console`, `/welcome`, `/me`, and `/__gate` (including encoded aliases). Core OIDC and the ordinary tenant's Logto-authenticated Management API remain available at the issuer. There is no internet route to the underlying admin tenant outside the gated origin.

The Admin gate protects **every** upstream path, including welcome/setup, administrator registration interactions, `/api`, `/me`, static files, and the admin tenant's own OIDC flow. The only anonymous exceptions are `/healthz` (a readiness boolean, no proxied content) and the gate's login challenge. It is enabled from the first request, before any owner exists, and stays enabled after setup.

## Preparing Railway sources

The standalone source repository is [tech-progress/logto-b2b-identity](https://github.com/tech-progress/logto-b2b-identity). Recipe 1.0.2 is the selected source-only candidate; no qualified Railway template ID or deploy code is supplied. To render the standalone layout locally, use its repository root `/`. From this directory:

```bash
npm ci --ignore-scripts
export SOURCE_REPO=tech-progress/logto-b2b-identity
export SOURCE_BRANCH=release-v1
export SOURCE_ROOT_DIR=/
DOCS_EXPECTED_VERSION=1.0.2 bash scripts/verify.sh
./node_modules/.bin/railway-iac-ts
```

For this monorepo instead, set `SOURCE_REPO` to its actual accessible repository and `SOURCE_ROOT_DIR=/logto-b2b-identity`. `release-v1` is a moving compatibility channel: inspect its exact commit again before deployment. Public source visibility does not establish Railway GitHub App access or stored-template qualification. Rendering requires `SOURCE_REPO`; leaving it empty fails closed. The local renderer does not verify remote repository visibility or branch existence and does not provision resources. All three GitHub services use exactly the same source/branch/root. Logto builds `Dockerfile`; both gateways build `gateway.Dockerfile`.

`template-defaults.json` supplies **template** generated-secret expressions and cross-service references; the independent Issuer and Admin domains are each attached to port 8080. Direct IaC renders instead use independent Node `crypto.randomBytes(32)` values, with native `preserveExisting` intent, and never use the deterministic SDK helper. Treat rendered graphs as sensitive and never publish them. Existing-secret preservation has not been tested against the live API; review it before direct IaC reapplication so a stored database password is not accidentally changed. Do not assign a public domain or TCP proxy to Logto or Postgres. The configured source contract and offline draft checks are documented in [PUBLISHING.md](PUBLISHING.md).

## Operator gate and first-owner procedure

For a future authorized HTTPS deployment, before performing owner setup:

1. Confirm that `ENDPOINT` is the Issuer HTTPS origin and `ADMIN_ENDPOINT` is a **different** Admin HTTPS origin, with no path suffix. Never point both at one service domain.
2. Verify issuer discovery at `ENDPOINT/oidc/.well-known/openid-configuration`, and verify that `ADMIN_ENDPOINT/console` and `/api/interaction` return 401 without a gate session. Check the backend has no public domain/proxy.
3. Open `ADMIN_ENDPOINT/__gate/login` in a browser. Enter HTTP Basic username **`operator`** and the generated **`ADMIN_GATE_PASSWORD`** from the Admin service. The gateway issues an eight-hour, signed, HttpOnly, SameSite=Lax cookie (`__Host-logto_admin_gate`, Secure on HTTPS) and redirects to Logto's console.
4. Use **Logto's upstream Welcome UI** to create the initial administrator with your own strong account password. The operator gate secret is **not** the Logto account password; there is no invented `ADMIN_PASSWORD`, `ADMIN_EMAIL`, or auto-created account. This protected browser ceremony passed locally; repeat it on the actual Railway HTTPS deployment before release.
5. Keep the operator secret available only to the setup operator until owner setup is complete. Logto source switches admin registration to sign-in-only after its first owner is created; do not rely on that eventual switch to prevent an outsider's first-claim race. The independent gate closes the anonymous external window before upstream is ready. Do not run competing setup operators.

Gate authentication happens only at `/__gate/login`; the resulting cookie permits Logto's own Bearer and OIDC Basic authorization headers to pass unchanged. Cached `operator` Basic credentials and the gate cookie are stripped before proxying. An API operator must obtain and send a gate cookie **as well as** the normal Logto API credentials. The gate alone never grants Logto privileges. For example, use a cookie jar with `curl -c` at gate login and then `curl -b` for subsequent requests; do not put secrets into URLs, committed files, or shared command histories.

To clear the current browser's gate cookie, POST to `/__gate/logout` with a valid gate session and an `Origin` equal to `ADMIN_ENDPOINT`. An individual copied cookie remains valid until its eight-hour expiry; rotate `ADMIN_GATE_PASSWORD` and redeploy Admin to revoke all gate sessions. Basic credentials cached by the browser may require closing the browser profile as well. Do not remove the gate after claiming the owner. End-user OIDC traffic does not need the gate.

## Environment variables

All template-provided runtime defaults and descriptions are in the JSON contract files. Railway secrets are generated per deployment, not hardcoded offline render samples.

| Variable | Location | Requirement / behavior |
| --- | --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER` | Postgres | Defaults `logto`; dedicated database and migration owner. Do not change after initialization without a planned migration. |
| `POSTGRES_PASSWORD` | Postgres / local input | Generated 48-character secret on Railway; local Compose requires one. Changing an env variable does not rotate a stored PostgreSQL role password. |
| `PGDATA` | Postgres | `/var/lib/postgresql/data/pgdata`, under the Postgres-only volume. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Logto wrapper | Required private database coordinates, supplied through Postgres references; port 5432. |
| `DB_URL` | Upstream Logto | Constructed in memory by the wrapper using URL-escaped credentials. Do not override it independently; the documented upstream DSN variable is used by seed, alterations, and server. |
| `ENDPOINT` | Logto / both gateways | Required canonical issuer HTTPS origin, default `https://${{Issuer.RAILWAY_PUBLIC_DOMAIN}}`; immutable in normal operation. |
| `ADMIN_ENDPOINT` | Logto / both gateways | Required independent admin HTTPS origin, default `https://${{Admin.RAILWAY_PUBLIC_DOMAIN}}`. |
| `ADMIN_GATE_PASSWORD` | Admin / local input | Required generated secret, minimum 32 characters, default 48; no default owner is created. Rotating it invalidates gate cookies. |
| `PORT` | All services | Logto 3001, gateways 8080, Postgres 5432. Wrapper enforces backend port 3001. |
| `ADMIN_PORT` | Logto | Private admin listener 3002, enforced by wrapper. |
| `GATEWAY_ROLE` | Gateways | Must be `issuer` or `admin`; selects backend port 3001 or 3002, respectively. |
| `UPSTREAM_HOST` | Gateways | Required Logto private hostname; no URL, port suffix, or caller-controlled target. |
| `NODE_ENV`, `TRUST_PROXY_HEADER` | Logto | Enforced `production` and `1`. Forwarded values are overwritten by the only publicly routed gateways. |
| `ALLOW_INSECURE_LOCALHOST` | Local stack only | Explicit `1` permits HTTP **only** for localhost, 127.0.0.1, or ::1 origins; absent from Railway defaults. Never use this as a remote TLS bypass. |
| `SOURCE_REPO`, `SOURCE_BRANCH`, `SOURCE_ROOT_DIR` | Local IaC render only | Actual `owner/repository` required; slash-free branch defaults `release-v1`; root defaults `/logto-b2b-identity`. Not runtime application credentials. |
| `DOCS_EXPECTED_VERSION` | Local doc tests only | Optional expected local version; checks default to the current `VERSION` (`1.0.2` for this source candidate). This is not a published-version selector or runtime variable. |

Mail, social login, enterprise SSO, and organization-specific application setup depend on operator-configured Logto connectors and secrets; none are auto-provisioned. Upstream SSRF protection remains on. Secret Vault is not enabled by this recipe: enabling it requires the documented `SECRET_VAULT_KEK` and a separate key preservation/recovery review. See the [upstream configuration](https://docs.logto.io/concepts/core-service/configuration) and [deployment guide](https://docs.logto.io/logto-oss/deployment-and-configuration).

## Local build and smoke

```bash
npm ci --ignore-scripts
SOURCE_REPO=tech-progress/logto-b2b-identity SOURCE_ROOT_DIR=/ DOCS_EXPECTED_VERSION=1.0.2 bash scripts/verify.sh
bash scripts/smoke.sh
```

Smoke builds both real pinned images, runs gateway security tests inside the backend image, and starts an isolated Compose project with fresh generated secrets and an empty database. Only `127.0.0.1:18420` (issuer) and `127.0.0.1:18421` (gated admin) are published; both must be free. The test exercises discovery/JWKS, correct independent admin tenant routing, missing/wrong gate credentials, spoofed origins, owner remaining unclaimed, database-unavailable startup retries, restart persistence of a safe sentinel record and signing keys, and gate logout. It cleans up only its own named containers, volumes, networks, and image tags on success or failure. No remote deployment, signup, paid resource, or owner account is created. Discovery-only historical smoke does not qualify the source candidate; discovery/JWKS and restart persistence do not prove native PKCE login, B2B authorization, recovery, or fresh restore.

Startup waits for a working PostgreSQL connection with bounded retries, holds a database advisory lock across the documented `npm run cli db seed -- --swe` and `npm run cli db alteration deploy` commands, then starts `npm start`. Seeding does not rerun on an initialized database. Migrations run during startup (not a platform predeploy command); back up before changing Logto versions. A health check proves only issuer readiness, not full authentication or authorization correctness.

## B2B acceptance gates

The subsequent native local regression passed all ten gates on the exact pinned upstream versions, beyond the discovery-only smoke:

1. Genuine Welcome UI owner creation and password login behind the independent operator gate.
2. Native default-tenant Management client registration, secret, and role grant.
3. Genuine end-user password signup and native authorization code + PKCE S256, with JWKS signature, issuer, audience, fresh nonce, and state validation.
4. Actual token-endpoint rejection of code replay, wrong verifier, and wrong callback.
5. Native end-user denial at Management and admin APIs, including after passing the independent gate.
6. Two organizations with distinct user roles/scopes: signed organization JWTs produced HTTP 200 for granted access and HTTP 403 across organizations. Membership deletion was read back and a subsequent native grant returned HTTP 403 `access_denied`.
7. Native logout followed by `prompt=none` returning `login_required`.
8. Actual PostgreSQL, backend, and gateway restarts with identity/client/signing/role/grant continuity.
9. A quiesced whole-database dump plus globals restored to an independently empty, different volume and cluster. All 79 public tables' rows and four native roles' credentials, properties, and memberships matched before application startup; native users, clients, callbacks, signing keys, roles, and refresh grants survived.
10. Recovery through the existing seeded admin Management client and native password API, without the old owner password or identity SQL writes: new-password UI login passed, the old password failed, and the owner subject and remaining continuity were preserved.

The native Console SDK omitted its optional nonce; its signed ID token, state, and S256 were validated, with nonce enforcement when requested. The test SPA always required a fresh nonce. Console Account API tokens can be opaque; genuine Me and default Management JWTs were obtained through supported explicit-resource requests using the real console refresh grant. Offline access required `prompt=login consent`. Organization token requests used `urn:logto:resource:organizations` with the organization and permission scopes. Do not treat opaque tokens as JWTs or infer Console nonce protection from an omitted nonce.

Before claiming B2B readiness, resolve the selected immutable Recipe 1.0.2 tag to its actual commit and repeat the entire matrix, restarts, full fresh restore, and recovery on the exact queried Railway Deploy V2 deployment with stable, trusted public HTTPS origins and exact registered callbacks. Source access/revision, remote headroom and soak metrics, production capacity, scoped remote cleanup, and marketplace publication receipts remain **pending**. Owned local test resources and temporary secrets, keys, and dumps were retired; that proves local teardown only. Single-backend/single-database operation is not HA.

See [SUPPORT.md](SUPPORT.md), [UPGRADE.md](UPGRADE.md), and [LICENSE_REVIEW.md](LICENSE_REVIEW.md). The review is a finite source-only recipe review under existing source-only permissions; it provides no new binary distribution grant. Artifact review is tracked separately; these docs claim neither assembled-image distribution clearance nor full licensing/security clearance or universal certification. Keep private operational evidence out of shipped documentation.

Preserve UAParser v2's AGPL obligations, the retained Cloud package's ELv2 restrictions, npm's Artistic terms, and native/base-image grants. Embedded SAML/XML/native correspondence remains bounded; no external SAML provider is qualified here. The reviewed Koa redirect advisory has inconsistent range/fix metadata and no demonstrated default-path trigger; this limitation remains disclosed. Native acceptance does not expand the finite artifact packet into an assembled-image or security certification.
