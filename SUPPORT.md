# Support boundary

This is an unpublished, single-backend/single-database **evaluation** recipe. Locally tested gateway security and OIDC discovery do not certify browser identity flows, B2B organization isolation, recovery, or production readiness. There is no HA, shared application disk, implicit mail provider, Cloud plan, or vendor support entitlement.

## Troubleshooting

- **IaC fails before rendering:** set the actual `SOURCE_REPO`; use a slash-free branch and repository-absolute `SOURCE_ROOT_DIR`. No distribution repository is inferred. `npm ci --ignore-scripts` installs the pinned local SDK.
- **Admin returns 401:** this is expected without a gate session. Open `ADMIN_ENDPOINT/__gate/login`, use username `operator` and the Admin service's generated `ADMIN_GATE_PASSWORD`. A valid Logto password or Bearer token alone cannot bypass this separate gate. Do not post your gate secret in an issue.
- **Gate session expired:** log in at the gate again after eight hours. Rotating the gate secret revokes all signed cookies. Browser HTTP Basic caches can persist until the profile closes.
- **Gate passes but Logto API rejects:** the gate is not Logto authorization. Obtain the upstream user's/API client's proper credentials as well. Logto Bearer and OIDC client Basic headers are preserved.
- **Wrong issuer/admin tenant:** make the origins different and point each domain to its correct gateway. Never expose private Logto ports directly; do not add a second public route on the backend. Fixed headers defeat incoming Host/forwarding spoofing, not a misconfigured deployment contract.
- **Database not ready:** wrapper retries for up to 60 attempts (3-second pauses and 3-second connection timeout), then fails. Check only private PostgreSQL coordinates and actual stored role credentials. Do not publish a DB TCP proxy as a workaround.
- **Migration fails:** no server is started after failed seed/alteration. Investigate against the pinned upstream source and your backup. Do not drop/reseed a populated identity database. The migration advisory lock is bounded and uses a separate PostgreSQL connection.
- **First-owner UI hangs on password validation:** upstream may need outbound `api.pwnedpasswords.com` for its breached-password check. This recipe does not disable that security feature or invent an account bootstrap command. Never add the gate password as a Logto account env variable.
- **Local ports occupied:** free only your own listener on 18420/18421 or defer the smoke run. Do not stop another agent's containers/projects.

Upstream SSRF protection remains enabled. Mail/social/enterprise SSO connectors require separately configured credentials and outbound access. Test chosen features against **self-hosted** Logto before promising Cloud parity. TLS edge behavior, third-party callback cookie behavior, full ownership/account recovery, organization-scoped token authorization, and restore remain unqualified.

Useful issue evidence: template/upstream versions, sanitized gate/backend HTTP status, the failing test step, readiness state, and scrubbed migration logs. Never include DB URLs/passwords, gate cookies/secrets, private keys, issued tokens, live draft variable values, or backups. See [Logto documentation](https://docs.logto.io), [upstream issues](https://github.com/logto-io/logto/issues), and [PostgreSQL documentation](https://www.postgresql.org/docs/17/).
