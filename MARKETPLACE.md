# Deploy and Host Logto B2B Identity on Railway

**Source-only freeze candidate — 2026-10-06:** Recipe **1.0.2 is selected for immutable source-only publication**. The [standalone `v1.0.2` tag](https://github.com/tech-progress/logto-b2b-identity/tree/v1.0.2) is the intended immutable navigation target; `release-v1` is the prospective moving compatibility channel. These are publication targets, not a source-push receipt. Selection remains valid after a source push and does not qualify a Railway marketplace release. All remote qualification and marketplace publication receipts remain **PENDING**; see [PUBLISHING.md](PUBLISHING.md).

> **Historical pre-live snapshot — 2026-10-06 (before source freeze):** Recipe 1.0.2 was staged, not released; Recipe 1.0.1 was the public source release then. This records earlier history, not the current public source version.

Run [Logto](https://logto.io) with a private backend, separate issuer and guarded administrator HTTPS origins, and durable [PostgreSQL](https://www.postgresql.org). Two lightweight [Node.js](https://nodejs.org) gateways independently route the origins. Genuine browser owner setup, native PKCE login, organization allow/deny authorization, recovery, and full fresh restore passed the ten-gate local native regression, including actual service restarts. Local HTTPS used a private loopback certificate with an explicit bounded test opt-in. Complete trusted public Railway HTTPS qualification receipts remain **pending**, along with remote headroom/soak, cleanup, and marketplace publication.

## About Hosting Logto

This four-service recipe runs upstream Logto 1.44.0, PostgreSQL 17.11, and Node.js 22.23.3 fixed-origin gateways. Only the issuer and gated administrator gateways have public domains, with two distinct HTTPS origins. Logto and PostgreSQL remain private. PostgreSQL owns exactly one **5000 MB** volume; Logto and the gateways do not share storage.

The permanent administrator operator gate is active before the first owner exists. An operator must first authenticate at the Admin gateway's `/__gate/login`, then use Logto's Welcome UI. The gate is independent of the Logto account password and remains required after setup. It grants no native Logto privileges: administrator APIs still require native Logto authentication and authorization. End-user OIDC traffic uses the separate issuer origin without the operator gate.

## Why Deploy Logto with this recipe

- Keep a canonical OIDC issuer distinct from the administrator origin.
- Guard all administrator control paths, including the first-owner interaction APIs.
- Retain identity configuration and signing state in a dedicated PostgreSQL database.
- Start from a bounded single-node evaluation stack, not a claimed HA identity service.

## Common Use Cases

- Evaluate a self-hosted OIDC identity provider with a separately guarded console.
- Develop an application with exact registered callbacks and PKCE authentication.
- Evaluate organization roles and signed organization-scoped tokens for B2B applications; granted, cross-organization, and removed-member cases passed locally and require Railway qualification.

## Dependencies for Logto B2B Identity

Select an accessible GitHub source and release branch: the standalone source layout uses `SOURCE_REPO=tech-progress/logto-b2b-identity` and `SOURCE_ROOT_DIR=/`. Recheck `release-v1` and Railway GitHub App access before deployment. This source-only candidate supplies no qualified marketplace template code. Both origins must use stable, distinct HTTPS domains; client callbacks must match exactly. Keep the generated database password and operator gate secret confidential. Connector-based mail, social login, or enterprise SSO requires your own configuration and credentials.

### Deployment Dependencies

- [Logto upstream source and MPL-2.0 license](https://github.com/logto-io/logto/tree/v1.44.0).
- [Logto self-hosted configuration](https://docs.logto.io/logto-oss/deployment-and-configuration).
- [PostgreSQL](https://www.postgresql.org), with exactly one private 5000 MB data volume.
- [Node.js](https://nodejs.org), running the fixed-origin administrator and issuer gateways.
- An accessible source repository, separate HTTPS domains, and a backup/restore plan.

There is no Redis service, Docker socket, shared filesystem, auto-created owner, mail provider, or production/HA guarantee.

The finite source-only recipe review does not establish assembled-image distribution clearance, full licensing/security clearance, or universal certification. Artifact review is tracked separately; AGPL/ELv2/Artistic/native obligations, embedded SAML assessment limits, and the Koa advisory range/fix caveat remain applicable. See [LICENSE_REVIEW.md](LICENSE_REVIEW.md) and [PUBLISHING.md](PUBLISHING.md). Marketplace metadata retains [Logto's product icon](https://raw.githubusercontent.com/logto-io/logto/v1.44.0/packages/console/src/favicon.ico) and all three upstream origins above.
