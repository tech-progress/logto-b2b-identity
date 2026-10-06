# Publishing gates

**Source-only freeze candidate — 2026-10-06:** Recipe **1.0.2 is selected for immutable source-only publication**. The [standalone `v1.0.2` tag](https://github.com/tech-progress/logto-b2b-identity/tree/v1.0.2) is the intended immutable navigation target; `release-v1` is the prospective moving compatibility channel. These are publication targets, not a source-push receipt. Selection remains valid after a source push and does not qualify a Railway marketplace release. All remote qualification and marketplace publication receipts remain **PENDING**; see [PUBLISHING.md](PUBLISHING.md).

> **Historical pre-live snapshot — 2026-10-06 (before source freeze):** Recipe 1.0.2 was staged, not released; Recipe 1.0.1 was the public source release then. This records earlier history, not the current public source version.

## Public source history

The sanitized standalone repository is [tech-progress/logto-b2b-identity](https://github.com/tech-progress/logto-b2b-identity). Historical published source receipts and the selected source-only target:

| Recipe | Immutable standalone tag | Source commit | Recorded channel state |
| --- | --- | --- | --- |
| 1.0.0 | `v1.0.0` | [19ccd4cae07c820917b4c028a649cb87972c4516](https://github.com/tech-progress/logto-b2b-identity/commit/19ccd4cae07c820917b4c028a649cb87972c4516) | Historical initial source release |
| 1.0.1 | `v1.0.1` | [9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554](https://github.com/tech-progress/logto-b2b-identity/commit/9d468c9c8bddbb0b3ef01a4fcd236dbf6f5f0554) | `main` and `release-v1` at the historical pre-live snapshot |
| 1.0.2 | [`v1.0.2`](https://github.com/tech-progress/logto-b2b-identity/tree/v1.0.2), selected immutable target | Resolve the actual commit from the tag; no push receipt asserted here | Source-only selection; `release-v1` prospective channel |

Existing immutable tags are preserved; never repoint them to a correction. Recipe 1.0.1 changed direct authoring secret generation to independent Node crypto values; that source change did not close live identity gates. Historical source privacy checks covered the current tree/modes and reachable history for 1.0.1; repeat them for the actual 1.0.2 candidate before the release maintainer pushes. Public visibility alone does not establish selected-source access, Railway GitHub App qualification, a template ID/code, or a passing stored deployment. `marketplace-metadata.json` remains a local proposal without fabricated IDs/codes.

## Local contract

Retain upstream Logto 1.44.0, PostgreSQL 17.11, and gateway Node.js 22.23.3. Pin Railway SDK 3.6.0 via `package-lock.json`. Set `SOURCE_REPO` to your actual accessible owner/repository, `SOURCE_BRANCH` to the intended slash-free release channel (`release-v1` by default), and `SOURCE_ROOT_DIR` to `/logto-b2b-identity` in this monorepo or `/` in a real sanitized standalone repository. All three application services must use that exact source. Typed `source: { type: "github", repo, branch, rootDirectory }` avoids the SDK 3.6.0 untyped-source normalization bug. The verifier asserts the **rendered** repo, branch, and root directory, including nondefault roots.

Run `npm ci --ignore-scripts`, `bash scripts/verify.sh`, and `bash scripts/smoke.sh` with the intended source inputs. They only build, render locally, or run local Docker. None invokes a Railway cloud API, authenticates, deploys, or publishes. Discovery/JWKS smoke and restart persistence do not establish native PKCE login, organization allow/deny authorization, recovery, or a fresh restore.

Focused source-only doc checks need no installed dependencies or Docker:

```bash
node scripts/verify-docs.mjs --expected-version=1.0.2
DOCS_EXPECTED_VERSION=1.0.2 node --test tests/docs.test.mjs
```

The checks default to the current local `VERSION`, now 1.0.2; the explicit option above can assert the intended candidate. For the broader test suite, `DOCS_EXPECTED_VERSION=1.0.2 npm test` makes that expectation explicit, as does supplying the variable to `scripts/verify.sh`. The validator checks this source-selection phase without requiring a self-referential commit or inventing a push receipt. The release maintainer must review the frozen export and finite source-only grant/default boundaries before pushing; the version option does not rewrite the historical public 1.0.1 record.

The direct IaC definition uses real, distinct Node `crypto.randomBytes(32)` secrets, not the deterministic SDK helper or literal `${{secret(...)}}` application values. Expressions are **only** interpreted later as template `defaultValue` values. Native `preserveExisting: true` is declared for both authoring secrets; its live update behavior remains unverified. Do not print/archive a rendered graph publicly or reapply against a populated database without checking actual secret preservation. Offline contract checks validate strong/distinct rendered secrets and exact values for every nonsecret variable, but restored templates always receive the template expressions.

## Offline draft repair and audit

With a locally saved serializedConfig snapshot (either a bare `services` object/array, a `serializedConfig` wrapper, or `.data.template.serializedConfig`), run:

```bash
export SOURCE_REPO=tech-progress/logto-b2b-identity
export SOURCE_BRANCH=release-v1
export SOURCE_ROOT_DIR=/
bash scripts/restore-template-draft.sh /tmp/draft-before.json /tmp/draft-restored.json
bash scripts/audit-template.sh /tmp/draft-restored.json
```

The restore command writes a **new**, permission-0600 file; it never overwrites its input or uploads anything. It preserves the snapshot's existing service identities (including mapping keys or list entries), repairs defaults/descriptions/generated-secret expressions, exact image or repo sources, build/start/health contracts, public gateway routing, and the Postgres-only volume. Name-keyed SDK snapshots without a redundant service `name` field are also supported. Unknown/missing/duplicate service names, extra resource lists/buckets, non-Postgres volumes, and absent/multiple PostgreSQL bindings cause refusal before output. PostgreSQL must already have exactly one **real binding key** (existing volume ID/name, not a mount path): that key and backup metadata are retained, while its value's `mountPath` and `sizeMB` are corrected. If an explicit volume declaration is present, exactly one declaration must match that existing binding; it is retained and its size corrected. No volume identity is invented. It repairs extra variables, mixed sources, and public backend routes. Review the output before any separately authorized use; the serialized Composer schema must be revalidated against the then-current Railway API.

Audit rejects exact source/branch/root drift, mixed image/repo sources, build/start/health/replica drift, missing/extra/changed variable defaults or descriptions, nondefault or extra public/TCP/custom networking, and wrong/extra volume mounts. It does not print credential values. Secret expressions remain expressions; do not paste resolved live secrets into draft snapshots. Tests cover each drift category.

## Pending qualification and release gates

Local native acceptance receipts now record **all ten gates passed** on an initially empty, isolated four-service stack with the exact pinned Logto/PostgreSQL/gateway versions. They cover genuine Welcome owner setup, default Management client/role grants, native PKCE and signed-token validation with fresh SPA nonce/state, actual replay/verifier/callback rejection, nonadmin API denial after independent gate authentication, two-organization signed-token allow/deny and removed-member rejection, logout/silent-login denial, actual service restarts, full cold restore, and native admin-API owner recovery. The restore matched all 79 public tables and four native roles' credentials/properties/memberships before app startup on a different, independently empty cluster/volume. Recovery preserved the owner subject, accepted the new password and denied the old one without using the old password for reset or writing identity SQL. All owned local attempts and restore resources were removed, with temporary credentials, keys, and dumps retired.

Local HTTPS used a private loopback certificate with an explicit bounded test opt-in. These receipts cover local native behavior; they do not qualify trusted public TLS, Railway source access, Deploy V2, remote capacity, or publication. Native Console optional-nonce omission and Account API opaque tokens were accommodated without weakening the test SPA's nonce or signed-token checks; see [README.md](README.md) for the resource/scopes contract.

The following table records **pending Railway qualification receipts** for the final immutable candidate. Each local identity/lifecycle pass must be repeated on that actual deployment:

| Gate | Receipt status |
| --- | --- |
| Genuine browser owner setup | Pending |
| Native authorization code + PKCE | Pending |
| Organization allow/deny authorization | Pending |
| Owner/account recovery | Pending |
| Fresh PostgreSQL restore | Pending |
| Live HTTPS and stored-template qualification | Pending |

## Source-only freeze and publication

Source-only publication is separate from remote Railway qualification. Under existing source-only permissions, the release maintainer owns the following finite preparation and publication steps; no new binary distribution grant is requested or supplied:

1. Freeze the exact Recipe 1.0.2 standalone export after the canonical static/doc checks. Review the actual source tree, file modes, and entire reachable history, including the export's doc links; omit private findings, operational evidence, credentials, cloud IDs, logs, dependencies, and local state. Historical privacy checks for 1.0.1 are not a 1.0.2 receipt.
2. Obtain finite source-only grant/default review acceptance for that frozen export. Preserve AGPL/ELv2/Artistic/native obligations and the separate artifact-review boundaries. This is not a blanket licensing/security certification or assembled-image clearance.
3. The release maintainer may then publish the selected immutable standalone `v1.0.2`, coordinate the template-scoped monorepo tag `logto-b2b-identity-v1.0.2`, and update `release-v1` as the moving compatibility channel. Existing `v1.0.0` and `v1.0.1` tags stay immutable. The tag link above is prospective navigation, not an asserted receipt or a commit embedded into its own content. Record the actual tag-to-commit push receipt separately after publication. Documentation and static-test readiness do not establish publication.

The selection statement and historical snapshot remain true after that source push. A source push does not close any remote gate or authorize a Railway marketplace release.

## Remote qualification and marketplace publication

All remote gates remain PENDING, independently of source-only publication:

1. Resolve `v1.0.2` to its actual immutable source commit. Recheck public repository visibility, exact source roots, and Railway GitHub App access, then verify the running `sourceRevision` against that commit. Rendering is not a remote source audit. The standalone root is `/`; this monorepo root is `/logto-b2b-identity`.
2. Complete real HTTPS edge checks and genuine protected first-owner setup in a disposable deployment, including external anonymous setup rejection. Verify Secure gate cookies and callback behavior in a real browser. The permanent operator gate stays separate from native Logto privileges after setup.
3. Repeat the complete locally passed native matrix on real Railway HTTPS: authorization code + PKCE login/logout, signature/issuer/audience/fresh nonce/state validation, replay/verifier/callback rejection, nonadmin denial after gate authentication, and two-organization membership/roles/scopes with actual allowed/cross-organization/removed-member denials. Repeat actual service restarts, full fresh PostgreSQL restore with pre-start data/role equality, and native owner recovery with new-password success, old-password denial, and retained identity/client/signing/grant state. These remote gates require dated passing receipts on that exact deployment.
4. Qualify the exact queried Deploy V2 state and the actual Railway template's stored serializedConfig. Verify startup/restarts, current running instances, persistence, remote resource headroom, and soak metrics before any production-capacity claim. Confirm two distinct public HTTPS origins, private Logto/backend and PostgreSQL, and exactly one Postgres-owned **5000 MB** volume. Verify live secret preservation before reapplication.
5. In a separately authorized marketplace publication task, register the assigned real template ID/code and metadata in root `railway-template-metadata.json`, run root `scripts/sync-template-marketplace.sh`, and require root `scripts/audit-template-marketplace.sh` to pass. No template ID, code, deploy link, or marketplace-publication receipt is inferred from the source tag. This source-only task does not run those cloud-writing/live audit scripts.
6. Link every main upstream product in every GitHub-facing README (Logto, PostgreSQL, Node.js), including the standalone export. Keep Logto's main-product icon, every metadata origin, the 45–75 character description, and the six shared marketplace headings. Record scoped remote teardown, retention, and charges before considering marketplace publication complete.

## Review and teardown boundary

This is a finite source-only recipe review. The separate artifact-review worker owns artifact findings; [LICENSE_REVIEW.md](LICENSE_REVIEW.md) provides the component context. Source review does not establish assembled-image distribution clearance, full licensing/security clearance, or universal certification. Newly authored recipe MIT terms do not replace upstream component licenses/notices, source obligations, or artwork/trademark terms.

Retain the AGPL/ELv2/Artistic and native/base-image obligations, embedded SAML/XML assessment limits, and the Koa redirect advisory's inconsistent range/fix metadata without claiming a demonstrated default-path exploit. Local native passes do not expand this finite packet's distribution or security scope. Registry/marketplace publication receipts remain PENDING. At the historical pre-live snapshot, no Logto Railway project or template draft existed; that observation is not a current cloud inventory claim.

The owner boundary permits zero compute after qualification and standard scoped deletion of the disposable resources. Record the scoped resources removed and verify no active compute remains. Describe retained platform logs, backups, deletion windows, and accrued charges honestly under the provider's policies. Standard deletion is not a claim of physical erasure or a billing-zero result. Preserve only the required sanitized receipts; never remove unrelated resources.

Local native acceptance closes the local behavioral gates only. The release maintainer owns final source freeze and finite source-only review acceptance. Public source/App access, queried Deploy V2, the entire remote HTTPS/lifecycle matrix, soak/headroom, remote teardown, and registry/marketplace publication remain PENDING remote gates even after a source push.
