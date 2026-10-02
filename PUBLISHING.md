# Publishing gates

The current template release is `v1.0.0`. **Unpublished.** No template ID, deploy code, cloud project, or public distribution repository has been created. `marketplace-metadata.json` is a local proposal without fabricated IDs/codes. Root catalog files are deliberately unchanged by this implementation task.

## Local contract

Pin Railway SDK 3.6.0 via `package-lock.json`. Set `SOURCE_REPO` to your actual accessible owner/repository, `SOURCE_BRANCH` to the intended slash-free release channel (`release-v1` by default), and `SOURCE_ROOT_DIR` to `/logto-b2b-identity` in this monorepo or `/` in a real sanitized standalone repository. All three application services must use that exact source. Typed `source: { type: "github", repo, branch, rootDirectory }` avoids the SDK 3.6.0 untyped-source normalization bug. The verifier asserts the **rendered** repo, branch, and root directory, including nondefault roots.

Run `npm ci --ignore-scripts`, `bash scripts/verify.sh`, and `bash scripts/smoke.sh`. They only build, render locally, or run local Docker. None invokes a Railway cloud API, authenticates, deploys, or publishes.

The direct IaC definition uses `defineRailway(ctx)` and real, distinct generated secrets, not literal `${{secret(...)}}` application values. The latter are **only** interpreted later as template `defaultValue` expressions. SDK 3.6.0's `ctx.randomString` hashes labels deterministically, so labels include fresh Node `crypto.randomBytes` entropy. Native `preserveExisting: true` is declared for both secret variables; its live update behavior remains unverified. Do not print/archive a rendered graph publicly or reapply against a populated database without checking actual secret preservation. Offline contract checks validate strong/distinct rendered secrets and exact values for every nonsecret variable, but restored templates always receive the template expressions.

## Offline draft repair and audit

With a locally saved serializedConfig snapshot (either a bare `services` object/array, a `serializedConfig` wrapper, or `.data.template.serializedConfig`), run:

```bash
export SOURCE_REPO=YOUR_ACTUAL_OWNER/YOUR_ACTUAL_REPOSITORY
bash scripts/restore-template-draft.sh /tmp/draft-before.json /tmp/draft-restored.json
bash scripts/audit-template.sh /tmp/draft-restored.json
```

The restore command writes a **new**, permission-0600 file; it never overwrites its input or uploads anything. It preserves the snapshot's existing service identities (including mapping keys or list entries), repairs defaults/descriptions/generated-secret expressions, exact image or repo sources, build/start/health contracts, public gateway routing, and the Postgres-only volume. Name-keyed SDK snapshots without a redundant service `name` field are also supported. Unknown/missing/duplicate service names, extra resource lists/buckets, non-Postgres volumes, and absent/multiple PostgreSQL bindings cause refusal before output. PostgreSQL must already have exactly one **real binding key** (existing volume ID/name, not a mount path): that key and backup metadata are retained, while its value's `mountPath` and `sizeMB` are corrected. If an explicit volume declaration is present, exactly one declaration must match that existing binding; it is retained and its size corrected. No volume identity is invented. It repairs extra variables, mixed sources, and public backend routes. Review the output before any separately authorized use; the serialized Composer schema must be revalidated against the then-current Railway API.

Audit rejects exact source/branch/root drift, mixed image/repo sources, build/start/health/replica drift, missing/extra/changed variable defaults or descriptions, nondefault or extra public/TCP/custom networking, and wrong/extra volume mounts. It does not print credential values. Secret expressions remain expressions; do not paste resolved live secrets into draft snapshots. Tests cover each drift category.

## Gates before external deployment or publication

1. Establish and authorize the **actual** repository, immutable release tag, and `release-v1` branch. Check visibility and exact source roots; rendering is not a remote source audit.
2. Complete real HTTPS edge checks and protected first-owner setup in a disposable deployment, including external anonymous setup rejection. Verify Secure gate cookies and callback behavior in a real browser.
3. Prove PKCE login/logout, issuer/audience validation, wrong callbacks, nonadmin denial, two-organization membership/roles/scopes and isolation, recovery, and a full PostgreSQL restore preserving clients and signing state. These are currently unrun.
4. Verify startup/restarts, current running instance state, resource headroom, and persistence using the actual Railway template's stored serializedConfig, not merely a CLI upload. Stop all disposable/source deployments when done.
5. In a separately authorized publication task, register the assigned real template ID/code and metadata in root `railway-template-metadata.json`, run root `scripts/sync-template-marketplace.sh`, and require root `scripts/audit-template-marketplace.sh` to pass. The current task does **not** run these cloud-writing/live audit scripts.
6. Sanitize any real distribution mirror: omit `FINDINGS.md`, local artifacts, credentials, cloud IDs, and operational logs. Link every main upstream product in **every** GitHub-facing README (Logto, PostgreSQL, Node.js). Do not substitute a vendor/database icon for Logto's product mark.
7. Follow repository `TEMPLATE_VERSIONING.md`: template-scoped monorepo tag `logto-b2b-identity-v1.0.0`, standalone `v1.0.0` if one actually exists, and moving `release-v1` compatibility channel. Do not create branches, commits, tags, or publication as part of this local implementation.

Local metadata, Docker success, and health checks do not close the unrun identity/security gates or make publication complete.
