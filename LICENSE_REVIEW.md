# License and upstream review


## Owner-approved recipe license

On October 2, 2026, the code owner explicitly approved MIT for newly authored recipe, wrapper, application and test code. `LICENSE` records that narrow scope. Upstream components are not relicensed: all original notices, corresponding-source/network-use obligations, enterprise exceptions and artwork/trademark terms remain applicable. This approval resolves the authored-code license hold only; it does not close the artifact or behavioral publication gates.

Reviewed on **2026-10-02** against current primary upstream material. No paid Cloud plan, enterprise entitlement, or redistribution rights beyond the applicable upstream licenses are assumed.

| Component | Pinned release | Primary license / source |
| --- | --- | --- |
| Logto backend | 1.44.0 (latest GitHub release observed, published 2026-09-30) | [Tagged MPL-2.0 license](https://github.com/logto-io/logto/blob/v1.44.0/LICENSE), [release](https://github.com/logto-io/logto/releases/tag/v1.44.0) |
| PostgreSQL | 17.11, Bookworm | [PostgreSQL License](https://www.postgresql.org/about/licence/), [official image source](https://github.com/docker-library/postgres/tree/master/17/bookworm) |
| Node.js gateway runtime | 22.23.3, Alpine 3.23 | [Node.js MIT license and third-party notices](https://github.com/nodejs/node/blob/v22.23.3/LICENSE), [official image Dockerfile](https://github.com/nodejs/docker-node/blob/main/22/alpine3.23/Dockerfile) |
| node-postgres runtime dependency | `pg` 8.23.1 | [MIT license/source](https://github.com/brianc/node-postgres), exact tarball/integrity in `package-lock.json` |
| Railway development SDK | 3.6.0 | [MIT source](https://github.com/railwayapp/railway-ts-sdk), exact tarball/integrity in `package-lock.json` |

The template extends the **unmodified** official Logto image with separate deployment/gateway wrappers, not changes to MPL-covered upstream files. Preserve upstream notices and provide the exact corresponding upstream source link with any distributed derived container. MPL-2.0 is file-level copyleft; modifications to covered upstream files would require reviewing source-availability duties. Container base distributions and transitive packages retain their own licenses/notices. This is a component review, not legal advice or a declaration that the whole stack has one license.

Logto's tagged [Docker Compose](https://github.com/logto-io/logto/blob/v1.44.0/docker-compose.yml) uses PostgreSQL 17 and seeds with `npm run cli db seed -- --swe`; the deployment wrapper uses the same command followed by the upstream CLI's documented alteration deploy command. Logto's official [release workflow](https://github.com/logto-io/logto/blob/v1.44.0/.github/workflows/release.yml) publishes the same image to GHCR and Docker Hub. GHCR is used for the backend to avoid Docker Hub's anonymous rate limit encountered locally. The current PostgreSQL 17 image version is verified in the primary [docker-library versions file](https://github.com/docker-library/postgres/blob/master/versions.json); its pinned amd64 image is pulled from the public ECR Docker library mirror because of that same Hub limit. Verify registry availability during any later deployment.

Upstream self-hosted source has organization, organization-role, organization-scope, and OIDC routes. That source presence is not evidence that this deployment has correctly configured or verified a B2B user/organization login workflow. The template makes no Cloud-only capability promise. Preserve product branding; the proposed icon is Logto's own tagged console favicon, not Silverhand's mark or a PostgreSQL/Node.js logo.
