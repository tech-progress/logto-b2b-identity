# Upgrades, backups, and recovery

Template version `1.0.0` pins Logto 1.44.0, PostgreSQL 17.11, Node.js 22.23.3, runtime `pg` 8.23.1, and Railway SDK 3.6.0. The template version describes deployment contracts, not application versions. Digest pins currently target tested Linux amd64; do not assume an untested ARM deployment.

## Upgrade sequence

1. Review the upstream release/config/license and migration notes. Update both tag **and digest**, not just a floating image tag. Update package and lock together for `pg`/Railway changes. Re-run local render and drift tests.
2. Take and verify an encrypted backup of the **whole** PostgreSQL database with tenant/client records, signing private keys, cookie keys, and any connector credentials. Store the backup outside this repository and service ephemeral storage, with restrictive access. A volume alone is not a backup.
3. Preserve `ENDPOINT` and `ADMIN_ENDPOINT`, client IDs/secrets, registered callbacks, and any configured connector/recovery secrets. Changing an issuer invalidates normal identity trust and requires a planned client migration. The independent gate secret is also operational access material; keep it separately.
4. Rehearse the upgrade against a cloned isolated database with no public production traffic and a gated admin origin. Run **one** backend replica. Startup takes an advisory lock, seeds only if configs do not exist, applies documented upstream alterations, then starts the server. It never reseeds an existing database to repair an upgrade.
5. Repeat the complete HTTPS/owner/PKCE/B2B/recovery/restore acceptance matrix, not only `/healthz`. Promote only after those tests and a reviewed compatible template version bump.

## Database backup example

For a manually operated local stack with `POSTGRES_PASSWORD` and `ADMIN_GATE_PASSWORD` already supplied through a protected local environment:

```bash
umask 077
docker compose -p YOUR_OWN_PROJECT exec -T postgres \
  pg_dump -U logto -d logto --format=custom > /secure/backup/location/logto.dump
```

Replace the example backup location with protected storage **outside** the repository. Do not use the smoke project's names or volume for a real deployment; smoke deliberately deletes its test data. Upstream seed also creates database roles used by its tenant isolation: capture PostgreSQL role/ownership definitions with `pg_dumpall --globals-only` into the same protected backup set, review privileges, and restore the required roles before database objects. Role exports can contain password material. PostgreSQL's built-in superuser name in this recipe is `logto`.

For Railway, use a separately authorized private operator connection/backup mechanism or volume snapshot, and verify what is included. This implementation has not tested any remote backup command or snapshot. Do not expose the database publicly just to make a backup.

## Restore drill (required, not yet performed)

- Stop only the affected identity backend before restoring; keep both admin and restore targets restricted. Never restore into the production database as a first experiment.
- Provision an isolated compatible PostgreSQL database/volume, restore required role definitions and database data with `pg_restore --exit-on-error`, and run the **matching** pinned Logto image. Do not start with an empty database and call that a restore.
- Keep issuer/admin origins consistent with the identities/callbacks being verified. A shadow environment must use controlled DNS/client configuration; replacing the origin is not proof of production trust preservation.
- Verify the same signing-key IDs/JWKS, client registrations/secrets, owner identity/recovery, existing end-user login/logout, and organization membership/role/scope denial and success cases. Verify unguarded admin paths still fail externally.
- Record recovery-point/recovery-time measurements and safe rollback ownership. Database migration rollback is not guaranteed by reverting a container. Restore a pre-upgrade backup unless upstream explicitly supports and you have rehearsed the exact rollback.

The smoke test proves database sentinel and signing-key **restart persistence**, not a backup restore or owner/account recovery. A full restore is an open release gate. PostgreSQL major upgrades need a separate migration plan; never mount an old major's data directory into a new major. Rotating a database environment variable alone does not change the stored role password. Rotating `ADMIN_GATE_PASSWORD` invalidates gate sessions but does not reset Logto administrator credentials.
