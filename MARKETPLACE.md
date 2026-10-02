# Deploy and Host Logto B2B Identity on Railway

Draft copy for an **unpublished evaluation template**. Run [Logto](https://logto.io) with a private backend, separate issuer and guarded administrator origins, and durable [PostgreSQL](https://www.postgresql.org). Two lightweight [Node.js](https://nodejs.org) gateways independently route the origins. Browser owner setup, HTTPS, real client login and B2B authorization, recovery, and restore still require qualification before this copy may be published.

## About Hosting Logto

This four-service recipe runs upstream Logto 1.44.0, PostgreSQL 17.11, and fixed-origin gateways. Only the issuer and gated administrator gateways have public domains. PostgreSQL has its own volume; Logto and the gateways do not share storage.

The administrator gate is active before the first owner exists. An operator must first authenticate at the Admin gateway's `/__gate/login`, then use Logto's Welcome UI. The gate is independent of the Logto account password and remains required after setup. End-user OIDC traffic uses the separate issuer origin without the operator gate.

## Why Deploy Logto with this recipe

- Keep a canonical OIDC issuer distinct from the administrator origin.
- Guard all administrator control paths, including the first-owner interaction APIs.
- Retain identity configuration and signing state in a dedicated PostgreSQL database.
- Start from a bounded single-node evaluation stack, not a claimed HA identity service.

## Common Use Cases

- Evaluate a self-hosted OIDC identity provider with a separately guarded console.
- Develop an application with exact registered callbacks and PKCE authentication.
- Qualify organization roles and organization-scoped tokens for B2B applications; these flows are not yet tested by this template.

## Dependencies for Logto B2B Identity

The template author must supply an actual accessible GitHub source and release branch. There is no published template code or assumed distribution source. Both origins must use stable, distinct HTTPS domains; client callbacks must match exactly. Keep the generated database password and operator gate secret confidential. Connector-based mail, social login, or enterprise SSO requires your own configuration and credentials.

### Deployment Dependencies

- [Logto upstream source and MPL-2.0 license](https://github.com/logto-io/logto/tree/v1.44.0).
- [Logto self-hosted configuration](https://docs.logto.io/logto-oss/deployment-and-configuration).
- [PostgreSQL](https://www.postgresql.org), with one private 5 GB data volume.
- [Node.js](https://nodejs.org), running the fixed-origin administrator and issuer gateways.
- An accessible source repository, separate HTTPS domains, and a backup/restore plan.

There is no Redis service, Docker socket, shared filesystem, auto-created owner, mail provider, or production/HA guarantee.
