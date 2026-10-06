# Exact input and source correspondence review

**Pre-freeze review snapshot — 2026-10-06:** Recipe **1.0.2** was unreleased when this finite review was recorded; the public **1.0.1** source then was [tech-progress/logto-b2b-identity at 9d468c9](https://github.com/tech-progress/logto-b2b-identity/tree/9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554). These are historical observations, not current release-channel assertions. The review itself changed no release tag, registry content, runtime pin or infrastructure. See [PUBLISHING.md](PUBLISHING.md) for the source selection and qualification boundary.

## Original exact inputs

| Role | Reference | Cached content |
| --- | --- | --- |
| Logto backend base | `ghcr.io/logto-io/logto:1.44.0@sha256:75c0767d7c907c79066c77bd1919d0598b17278d0f2c14c4520fa1d1ba4589b8` | Linux amd64; OCI version 1.44.0, revision `79e9e3b0d9f505260d09c80d8a015e56fbc0ec01`; Node 22.23.3, npm 10.9.9, Alpine 3.24.2. |
| Issuer/admin gateway base | `node:22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a` | Linux amd64; Node 22.23.3, npm 10.9.9, Alpine 3.23.6. Both gateway roles use this base. |
| Database | `public.ecr.aws/docker/library/postgres:17.11-bookworm@sha256:91eb910c44c7ed13f7f1a4ccadaa9ca72ef14cddc04cacb6e070e48eb44731a3` | Linux amd64; `PG_VERSION=17.11-1.pgdg12+2`; shipped server/client Debian notices captured. |
| Deployment wrapper | `pg` 8.23.1 and exact package lock | Production closure in [LICENSE_REVIEW.md](LICENSE_REVIEW.md); tarballs pass locked SHA-512 integrity checks. |
| Development SDK | Railway 3.6.0 | Tarball/grant checked separately; `--omit=dev` excludes it from the wrapper install. This does not describe every upstream pnpm-store package. |

The upstream [tagged Dockerfile](https://github.com/logto-io/logto/blob/79e9e3b0d9f505260d09c80d8a015e56fbc0ec01/Dockerfile) uses floating `node:22-alpine`, while this recipe selects an immutable built Logto image. Its actual Alpine release differs from the gateway's explicit Alpine 3.23 input. These are the inspected amd64 inputs; multi-architecture qualification is not claimed.

[provenance.json](artifact-review/provenance.json) records original recipe hashes, exact image references, source URLs, original/captured grant hashes, extraction details and advisory-response hashes. [Frozen original inputs](artifact-review/inputs/) identify the assessed recipe if the parent later patches production files. [grants/](artifact-review/grants/) contains original grant/notice texts. Where one terminal LF was added, both original and captured hashes and that normalization are explicit. No copyright attribution was invented.

## Source correspondence

The primary [v1.44.0 reference](https://api.github.com/repos/logto-io/logto/git/ref/tags/v1.44.0) resolves to annotated tag object [`19694f74460e3b4a1ac8fb6c09cbbbd22ccfb5cd`](https://api.github.com/repos/logto-io/logto/git/tags/19694f74460e3b4a1ac8fb6c09cbbbd22ccfb5cd), which peels to [`79e9e3b0d9f505260d09c80d8a015e56fbc0ec01`](https://github.com/logto-io/logto/tree/79e9e3b0d9f505260d09c80d8a015e56fbc0ec01). That agrees with the cached image's OCI revision. Cached source LICENSE, Dockerfile and pnpm lock are byte-identical to files fetched at the exact commit. The image's root Logto license matches the tagged license. This is correspondence evidence, not a signed build attestation or proof of reproducible compiled output.

Both cached Node environments have the same `/usr/local/LICENSE`, byte-identical to [Node v22.23.3's full grant](https://github.com/nodejs/node/blob/v22.23.3/LICENSE). UAParser v2's shipped license matches [2.0.10's upstream license](https://github.com/faisalman/ua-parser-js/blob/2.0.10/LICENSE.md). The actual OIDC provider is [Logto's fork at commit 513c523](https://github.com/logto-io/node-oidc-provider/tree/513c523c0e68ee6112da8c871cce86204a136163), as specified by the tagged lock. Upstream head is not exact correspondence for that dependency.

Wrapper tarballs were read without installation or execution. SHA-512 values match `package-lock.json`; captured grant bytes match locally installed notices. `pg-types` and `pgpass` publish their full MIT grants in README sections, preserved with exact extraction details and whole-README hashes. Verification covers this locked production closure, not every upstream application package.

The original backend Dockerfile adds separate wrappers under `/opt/railway-logto`, installs locked dependencies with `npm ci --omit=dev --ignore-scripts`, and invokes upstream seed/migration/start through npm. The gateway copies its separate source files and recipe LICENSE. Neither Dockerfile edits upstream MPL source. Upstream/package notices remain at their original locations; the original Dockerfiles do not explicitly copy this packet into outputs. A future binary distribution requiring this packet or a source offer needs a concrete parent-owned distribution change.

## Exceptions and limits

UAParser v2 is AGPL and used by tagged audit/session/console paths. The upstream dependency store retains an ELv2 `@logto/cloud` package despite removing the top-level Cloud workspace. npm has Artistic-2.0 terms. Native/base packages have separate grants and exceptions. [LICENSE_REVIEW.md](LICENSE_REVIEW.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) document these facts. The OCI MPL label is not a grant over every image component.

The release image also contains an injected OSS survey endpoint. Tagged console code gates submission behind development features and onboarding. Environment presence alone does not demonstrate default egress, and removing a runtime variable alone would not establish removal from compiled console assets. [SECURITY_REVIEW.md](SECURITY_REVIEW.md) records the actual triggers.

Only existing cached exact images were inspected. Owned disposable containers were created with pulling and networking disabled, inspected/exported or copied in `created` state, and never started. Every owned container was removed. There were no pulls, builds, starts, vulnerability network scans, repeated generic SBOM runs or changes to unrelated resources. Private extraction material is excluded from version control; the public packet has no local verification paths or operational resource identifiers.

This finite **source-only recipe** review does not authorize assembled-image distribution or provide every native/component source needed for that purpose. It certifies neither universal compliance nor production readiness. Separate local native owner/PKCE/B2B/recovery and full cold-restore gates passed; repetition on the final immutable source through trusted public Railway HTTPS remains pending. Operational evidence may establish zero compute and standard scoped deletion with honest retention statements; it does not establish physical erasure or billing-zero outcomes.
