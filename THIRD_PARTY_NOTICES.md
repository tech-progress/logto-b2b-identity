# Third-party grants and notices

This packet accompanies the **source-only recipe** pre-freeze review of **1.0.2**, recorded **2026-10-06** before release. The public 1.0.1 source then was [tech-progress/logto-b2b-identity at 9d468c9](https://github.com/tech-progress/logto-b2b-identity/tree/9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554), a historical observation rather than a current release-channel assertion. See [PUBLISHING.md](PUBLISHING.md) for the source selection and qualification boundary. Newly authored recipe code has the narrow MIT grant in [LICENSE](LICENSE). Copied upstream grants and notices retain their own terms; no blanket MIT grant over the stack is made.

Original text is captured below by component. [provenance.json](artifact-review/provenance.json) records every original and captured SHA-256, exact image or tarball provenance, locked integrity value and any extraction or terminal-newline normalization. Full original copyright and warranty notices are in the linked files; no replacement attribution has been invented.

| Component | Exact reviewed version | Original grant / notice |
| --- | --- | --- |
| Logto | 1.44.0 | [Captured original](artifact-review/grants/logto-1.44.0.MPL-2.0.txt) |
| Node.js with bundled third-party notices | 22.23.3 | [Captured original](artifact-review/grants/node-22.23.3.LICENSE.txt) |
| PostgreSQL | 17.11 | [Captured original](artifact-review/grants/postgres-17.11.COPYRIGHT.txt) |
| PostgreSQL Debian package notices | 17.11-1.pgdg12+2 | [Captured original](artifact-review/grants/postgres-17.11.debian-copyright.txt) |
| UAParser.js | 2.0.10 | [Captured original](artifact-review/grants/ua-parser-js-2.0.10.AGPL.txt) |
| UAParser.js source copyright header | 2.0.10 | [Captured original](artifact-review/grants/ua-parser-js-2.0.10.copyright.txt) |
| Logto OIDC provider fork | 9.11.3; commit 513c523c0e68ee6112da8c871cce86204a136163 | [Captured original](artifact-review/grants/oidc-provider-513c523.MIT.txt) |
| node-forge | 1.4.0 | [Captured original](artifact-review/grants/node-forge-1.4.0.LICENSE.txt) |
| hash-wasm | 4.11.0 | [Captured original](artifact-review/grants/hash-wasm-4.11.0.LICENSE.txt) |
| samlify | 2.13.1 | [Captured original](artifact-review/grants/samlify-2.13.1.LICENSE.txt) |
| koa | 2.16.4 | [Captured original](artifact-review/grants/koa-2.16.4.LICENSE.txt) |
| jose | 5.9.6 | [Captured original](artifact-review/grants/jose-5.9.6.LICENSE.txt) |
| @logto/cloud | 0.2.5-b618bc1 | [Captured original](artifact-review/grants/logto-cloud-0.2.5-b618bc1.LICENSE.txt) |
| posthog-js | 1.268.6 | [Captured original](artifact-review/grants/posthog-js-1.268.6.LICENSE.txt) |
| spawndamnit | 3.0.1 | [Captured original](artifact-review/grants/spawndamnit-3.0.1.LICENSE.txt) |
| npm | 10.9.9 | [Captured original](artifact-review/grants/npm-10.9.9.LICENSE.txt) |
| pg | 8.23.1 | [Captured original](artifact-review/grants/pg-8.23.1.LICENSE.txt) |
| pg-cloudflare | 1.4.1 | [Captured original](artifact-review/grants/pg-cloudflare-1.4.1.LICENSE.txt) |
| pg-connection-string | 2.14.1 | [Captured original](artifact-review/grants/pg-connection-string-2.14.1.LICENSE.txt) |
| pg-int8 | 1.0.1 | [Captured original](artifact-review/grants/pg-int8-1.0.1.LICENSE.txt) |
| pg-pool | 3.14.0 | [Captured original](artifact-review/grants/pg-pool-3.14.0.LICENSE.txt) |
| pg-protocol | 1.16.1 | [Captured original](artifact-review/grants/pg-protocol-1.16.1.LICENSE.txt) |
| pg-types | 2.2.0 | [Captured original](artifact-review/grants/pg-types-2.2.0.README-license.txt.txt) |
| pgpass | 1.0.5 | [Captured original](artifact-review/grants/pgpass-1.0.5.README-license.txt.txt) |
| postgres-array | 2.0.0 | [Captured original](artifact-review/grants/postgres-array-2.0.0.license.txt) |
| postgres-bytea | 1.0.1 | [Captured original](artifact-review/grants/postgres-bytea-1.0.1.license.txt) |
| postgres-date | 1.0.7 | [Captured original](artifact-review/grants/postgres-date-1.0.7.license.txt) |
| postgres-interval | 1.2.0 | [Captured original](artifact-review/grants/postgres-interval-1.2.0.license.txt) |
| railway | 3.6.0 | [Captured original](artifact-review/grants/railway-3.6.0.LICENSE.txt) |
| split2 | 4.2.0 | [Captured original](artifact-review/grants/split2-4.2.0.LICENSE.txt) |
| xtend | 4.0.2 | [Captured original](artifact-review/grants/xtend-4.0.2.LICENSE.txt) |

The main upstream products are [Logto](https://github.com/logto-io/logto/tree/79e9e3b0d9f505260d09c80d8a015e56fbc0ec01), [PostgreSQL](https://github.com/postgres/postgres/tree/REL_17_11) and [Node.js](https://github.com/nodejs/node/tree/v22.23.3). The exact [Logto OIDC fork](https://github.com/logto-io/node-oidc-provider/tree/513c523c0e68ee6112da8c871cce86204a136163) and [UAParser v2 source](https://github.com/faisalman/ua-parser-js/tree/2.0.10) are separately identified. These links describe real source provenance; they do not establish commercial entitlements or signed binary attestations.

UAParser 2.0.10 is AGPL-3.0-or-later and is used by audit/session/console code. A retained `@logto/cloud` package has Elastic License 2.0, and npm uses Artistic-2.0. The original node-forge grant offers BSD-3-Clause as an alternative to GPL-2.0. PostHog includes Apache-2.0 and MIT portions. Original Node and PostgreSQL package records preserve additional embedded/component grants. See [LICENSE_REVIEW.md](LICENSE_REVIEW.md) for triggers and exceptions.

The wrapper production grants were checked against exact SHA-512-locked tarballs. `pg-types` and `pgpass` publish full MIT grants in their README sections; the linked copies preserve those sections verbatim, with extraction details in the manifest. The Railway SDK grant is a separately identified development-tool input, not a deployed production dependency.

This packet is a finite selection of exact original grants, not all notices from an assembled image. Alpine GPL/LGPL/base packages, retained tools and the SAML XML bridge/native closure are not universally cleared by this list. The inspected `@authenio/samlify-node-xmllint` package declares MIT but lacks a standalone grant file; its full embedded XML/native obligations remain outside this source-only pin review. Any later binary redistribution needs the specific notices and corresponding-source/offer assessment required by that artifact.

Preserve original notices and product branding when using upstream material. License texts do not grant a trademark endorsement. Separate local native owner/PKCE/B2B/recovery and full cold-restore gates passed; final immutable-source and trusted public Railway repetitions remain pending independently of this notice packet.
