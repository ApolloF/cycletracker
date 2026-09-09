# Operations requirements

The Compose configuration is a development deliverable. Container startup and live deployment have not been verified.

## Before production

- Configure HTTPS `APP_URL`, a random `BETTER_AUTH_SECRET`, PostgreSQL credentials, SMTP sender/authentication and a real support address.
- Use an HTTPS reverse proxy in front of the loopback-bound web port. Verify cookie flags and proxy headers at the deployed origin.
- Store PostgreSQL and private PDF volumes on encrypted storage. Application-level document access checks do not encrypt disks.
- Configure OAuth clients and approved callback URLs before enabling provider buttons. Secure account linking and optional passkeys still need implementation/review.
- Configure VAPID only when testing reminders. Validate endpoint support, permission flow and delivery on each supported browser.
- Replace moving container tags with reviewed pinned versions/digests before release.
- Do not expose PostgreSQL, private document paths or local email capture publicly.

## Backups and deletion

The intended policy is encrypted database plus document backups, with a 30-day retention ceiling. This is an operator requirement; there is no automated retention job yet. Final user-facing policy must match the deployed system.

Back up the PostgreSQL database and private PDF volume together. Maintain a manifest/checksum so document metadata and bytes can be compared. Restore into an isolated database/volume and verify account ownership, record counts, sample values, attachment downloads and revocation. Do not call recovery verified until that exercise succeeds.

Account deletion removes the user and cascading database records and attempts to remove document files. Failure/partial-deletion recovery and backup-retention handling still require tests. Revocation cannot erase copies users have already exported or downloaded.

## Development database

Embedded PostgreSQL is for local development and isolated tests only. It must have one owning process. The process-lock check rejects a second open, and synthetic data survived close/reopen in the publication check. Separate-process crashes and startup failure paths still need coverage. Do not run a separate worker or migration process against a database currently opened by the API.

If a development process is interrupted, stop its verified owning process before recovery. Preserve the database directory; never delete it to conceal a persistence failure. Use a distinct `LOCAL_DATABASE_PATH` under `.local` for new synthetic tests. Production uses PostgreSQL server connections instead.
