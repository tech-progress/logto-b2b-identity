# Upgrades, backups, and recovery

**Source-only freeze candidate — 2026-10-06:** Recipe **1.0.2 is selected for immutable source-only publication**. The [standalone `v1.0.2` tag](https://github.com/tech-progress/logto-b2b-identity/tree/v1.0.2) is the intended immutable navigation target; `release-v1` is the prospective moving compatibility channel. These are publication targets, not a source-push receipt. Selection remains valid after a source push and does not qualify a Railway marketplace release. All remote qualification and marketplace publication receipts remain **PENDING**; see [PUBLISHING.md](PUBLISHING.md).

> **Historical pre-live snapshot — 2026-10-06 (before source freeze):** Recipe 1.0.2 was staged, not released; Recipe 1.0.1 was the public source release then. This records earlier history, not the current public source version.

This source candidate retains Logto 1.44.0, PostgreSQL 17.11, gateway Node.js 22.23.3, runtime `pg` 8.23.1, and Railway SDK 3.6.0. Recipe versions describe deployment contracts separately from application versions. Digest pins target tested Linux amd64; do not assume an untested ARM deployment. Genuine owner setup, native PKCE login, organization allow/deny authorization, recovery, restart continuity, and full fresh restore passed all ten local native gates on an initially empty isolated stack. The local run used private loopback HTTPS certificates with an explicit bounded test opt-in. Complete trusted public Railway HTTPS/lifecycle qualification, headroom/soak, cleanup, and marketplace publication receipts remain **pending**.

## Upgrade sequence

1. Review the upstream release/config/license and migration notes. Update both tag **and digest**, not just a floating image tag. Update package and lock together for `pg`/Railway changes. Re-run local render and drift tests.
2. Take and verify an encrypted backup of the **whole** PostgreSQL database with tenant/client records, signing private keys, cookie keys, and any connector credentials. Store the backup outside this repository and service ephemeral storage, with restrictive access. A volume alone is not a backup.
3. Preserve `ENDPOINT` and `ADMIN_ENDPOINT` as two distinct HTTPS origins, client IDs/secrets, registered callbacks, and any configured connector/recovery secrets. Keep Logto/backend and PostgreSQL private and exactly one Postgres-owned **5000 MB** volume. Changing an issuer invalidates normal identity trust and requires a planned client migration. Keep the permanent operator gate and its secret separate from native Logto privileges and recovery credentials.
4. Rehearse the upgrade against a cloned isolated database with no public production traffic and a gated admin origin. Run **one** backend replica. Startup takes an advisory lock, seeds only if configs do not exist, applies documented upstream alterations, then starts the server. It never reseeds an existing database to repair an upgrade.
5. Repeat the complete HTTPS/owner/PKCE/B2B/recovery/restore acceptance matrix, not only `/healthz`. Promote only after those tests and a reviewed compatible template version bump.

## Lost owner password: operator break-glass recovery

Logto 1.44.0 normally seeds an independent admin-tenant Machine-to-Machine application named `m-admin`, with a random secret and the admin Management API `all` permission. This is an existing native application, not the owner's console credential or a default-tenant client. The [exact seed](https://github.com/logto-io/logto/blob/79e9e3b0d9f505260d09c80d8a015e56fbc0ec01/packages/cli/src/commands/database/seed/tenant.ts) and [proxy definitions](https://github.com/logto-io/logto/blob/79e9e3b0d9f505260d09c80d8a015e56fbc0ec01/packages/schemas/src/types/mapi-proxy.ts) establish its provenance. This is an operator procedure using native APIs, not an official password-reset CLI or an OSS forgot-password UI feature. This exact procedure passed locally using the existing seeded client, a real native token, and the password PATCH API. New-password UI login succeeded, the old password was denied, and the owner subject and remaining continuity were retained; no old password was used for reset and no identity SQL was written. Railway owner recovery acceptance remains pending.

1. With legitimate database administration access, confirm the existing `admin` tenant's `m-admin` application and its application-role, role-scope and resource relations still authorize `https://admin.logto.app/api` with scope `all`. Retrieve only its existing active credential in a protected process; do not print it, place it in command history or commit it. Stop if the credential or authority is absent. Never insert an application, alter permissions, bypass tenant isolation or guess a secret to make recovery work.
2. Obtain a real admin-gateway cookie using the independently retained operator gate credential. With that cookie, authenticate the existing client using HTTP Basic at the admin issuer's discovered token endpoint. Request `grant_type=client_credentials`, resource `https://admin.logto.app/api`, and scope `all`. Validate the returned token against the admin issuer's JWKS, issuer, audience, existing client subject and required scope. The seeded audience is not your custom domain.
3. Use that genuine token and gate cookie to call `PATCH /api/users/{existingOwnerId}/password` on the **admin origin**, with a new strong password. The [native handler](https://github.com/logto-io/logto/blob/79e9e3b0d9f505260d09c80d8a015e56fbc0ec01/packages/core/src/routes/admin-user/basics.ts) updates the existing owner without requiring the old password. Do not write password hashes or identity/session records directly.
4. Prove fresh native login with the new password, rejection of the old password, the unchanged owner subject and retained authorization. Recheck clients, signing keys and organization boundaries. Retire temporary tokens and credential material. Do not assume that resetting a password revokes every existing session or recovers independently lost MFA factors.

This procedure requires trusted database administration access and the separate admin-gateway credential, but not SMTP or social-provider credentials. Ordinary owner console tokens and default-tenant M2M tokens do not carry this admin-tenant reset authority. `/me/password` requires the current password and is a password change, not lost-password recovery. Recheck the exact seed and credential model before applying this procedure to another Logto version or an altered installation.

## Database backup example

For a manually operated local stack with `POSTGRES_PASSWORD` and `ADMIN_GATE_PASSWORD` already supplied through a protected local environment:

```bash
umask 077
docker compose -p YOUR_OWN_PROJECT exec -T postgres \
  pg_dump -U logto -d logto --format=custom > /secure/backup/location/logto.dump
```

Replace the example backup location with protected storage **outside** the repository. Do not use the smoke project's names or volume for a real deployment; smoke deliberately deletes its test data. Upstream seed also creates database roles used by its tenant isolation: capture PostgreSQL role/ownership definitions with `pg_dumpall --globals-only` into the same protected backup set, review privileges, and restore the required roles before database objects. Role exports can contain password material. PostgreSQL's built-in superuser name in this recipe is `logto`.

For Railway, use a separately authorized private operator connection/backup mechanism or volume snapshot, and verify what is included. This implementation has not tested any remote backup command or snapshot. Do not expose the database publicly just to make a backup.

## Fresh restore drill (local pass; Railway receipts pending)

- Stop only the affected identity backend before restoring; keep both admin and restore targets restricted. Never restore into the production database as a first experiment.
- Provision an isolated compatible PostgreSQL database/volume, restore required role definitions and database data with `pg_restore --exit-on-error`, and run the **matching** pinned Logto image. Do not start with an empty database and call that a restore.
- Keep issuer/admin origins consistent with the identities/callbacks being verified. A shadow environment must use controlled DNS/client configuration; replacing the origin is not proof of production trust preservation.
- Verify the same signing-key IDs/JWKS, client registrations/secrets, owner identity/recovery, existing end-user login/logout, and organization membership/role/scope denial and success cases. Verify unguarded admin paths still fail externally.
- Record recovery-point/recovery-time measurements and safe rollback ownership. Database migration rollback is not guaranteed by reverting a container. Restore a pre-upgrade backup unless upstream explicitly supports and you have rehearsed the exact rollback.

Historical local smoke tested discovery/JWKS and database sentinel/signing-key **restart persistence** only. The subsequent native regression performed actual PostgreSQL/backend/gateway restarts, then stopped the application for a whole-database custom dump and globals export. The fresh target was independently verified to have zero public tables on a different volume and cluster. Before application startup, all 79 public tables' rows and four native roles' credentials, properties, and memberships matched the source. Native users, clients/secrets, callbacks, signing keys, roles, refresh grants, login/logout, organization boundaries, and recovery retained continuity after restoration. Temporary dumps and credentials were retired with the owned local resources.

Repeat this complete drill on the final immutable candidate's exact queried Railway Deploy V2 deployment with trusted public HTTPS. Remote restore/recovery, measured recovery time/point, resource headroom and soak metrics remain open release gates. PostgreSQL major upgrades need a separate migration plan; never mount an old major's data directory into a new major. Rotating a database environment variable alone does not change the stored role password. Rotating `ADMIN_GATE_PASSWORD` invalidates gate sessions but does not reset Logto administrator credentials.

Upgrade guidance belongs to a finite source-only recipe review. Artifact review is tracked separately; this guidance does not establish assembled-image distribution clearance, full licensing/security clearance, or universal certification. Preserve upstream component obligations; see [LICENSE_REVIEW.md](LICENSE_REVIEW.md).

Local acceptance preserves the packet's AGPL/ELv2/Artistic/native obligations, embedded SAML/XML correspondence limits, and Koa redirect advisory range/fix caveat. Reassess those boundaries when changing upstream versions, enabling optional features, or proposing assembled-image distribution.
