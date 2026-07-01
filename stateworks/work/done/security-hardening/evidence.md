# Security Hardening Evidence

## Work

- Work ID: `security-hardening`
- Network: `stateworks/work/done/security-hardening/network.yaml`
- Started: `2026-07-01`
- Finished: `2026-07-01`

## MFA Enrollment

- Status: complete for the production owner identity.
- Date observed: `2026-07-01`
- Environment: production
- Principal: production owner
- Email: redacted in repo
- Identity ID: redacted in repo

## MFA Proof

Observed sequence:

1. Owner login to `https://api.trypressly.com` succeeded before MFA enrollment.
2. `pnpm admin auth mfa-enroll` started MFA enrollment and returned a TOTP secret plus authenticator URI.
3. The TOTP secret was added to Google Authenticator.
4. `pnpm admin auth mfa-confirm --code [redacted]` succeeded.
5. The CLI returned 10 MFA recovery codes.
6. Recovery codes were stored offline by the owner and are not stored in this repository.
7. Logout succeeded.
8. Login with password plus `--mfa-code [redacted]` succeeded.
9. `pnpm admin auth session` showed an active owner session.

## Restore Drill

- Status: passed.
- Date observed: `2026-07-01`
- Environment: production host, isolated disposable restore container.
- Backup object: `s3://bucket-a5tjsz/postgres/pressly-20260701T140722Z.dump.gpg`
- Recovery point: `2026-07-01T14:07:22Z`
- Encrypted bytes: `11374`
- SHA-256 verification: passed.
- SHA-256: `43a06d931b96d1fdf0c0b368bfa67b9b52c0124f6ddc416e77b8cc5bb263e230`
- Restore target: disposable Postgres container.
- Public tables restored: `13`
- `auth_identities` smoke check: passed.
- Recovery time seconds: `3`
- Wall-clock command time: `4.091s`
- Production volume touched: no.

## Rollback Drill

- Status: passed.
- Date observed: `2026-07-01`
- Environment: production.
- Rollback mechanism: immutable `previous-release.json` image digests through `rollback.sh`.

First rollback:

- From source SHA: `8860f5f9961253664679d5f756c6abf7fbca1d42`
- To source SHA: `a76c9a57f220592e3b1394ec4835d03e076ecc0a`
- API image: `ghcr.io/steven-rosales/pressly/api@sha256:fd1e1b205f299268dd49cb256ca7bd56932c8b02e1cd8ce7b3d0e181d747297a`
- Web image: `ghcr.io/steven-rosales/pressly/web@sha256:1ec6b90702ef234433b211b2a602a437004c6cd14a2a6b2de0ba66ceb461fc76`
- Deployment time: `2026-07-01T14:59:51Z`
- API health: passed.
- Web health: passed.

Return rollback:

- From source SHA: `a76c9a57f220592e3b1394ec4835d03e076ecc0a`
- To source SHA: `8860f5f9961253664679d5f756c6abf7fbca1d42`
- API image: `ghcr.io/steven-rosales/pressly/api@sha256:fcaf2c722c74af151036c28e8c074e74ce73b9bac39f0c1bc97a0effc12fa812`
- Web image: `ghcr.io/steven-rosales/pressly/web@sha256:1185e6720d9676777f3697ee4692227076149435b2d4df0adfd5eeffa0d10e4f`
- Deployment time: `2026-07-01T15:01:40Z`
- API health: passed.
- Web health: passed.
- Final current release: `8860f5f9961253664679d5f756c6abf7fbca1d42`
- Final previous release: `a76c9a57f220592e3b1394ec4835d03e076ecc0a`

## Failed Deployment Guard

- Status: passed.
- Date observed: `2026-07-01`
- GitHub run: `https://github.com/steven-rosales/pressly/actions/runs/28527597811`
- Trigger: manual `deploy-production.yml` dispatch with invalid full SHA.
- Created at: `2026-07-01T15:09:33Z`
- Conclusion: `failure`
- Failed step: `Verify manual commit passed CI`
- Deployment reached Lightsail: no.
- Deployment result recording step ran: yes.
- Alert delivery: owner confirmed alert delivery proof complete on `2026-07-01`.

## Alert Delivery

- Status: passed.
- Date observed: `2026-07-01`
- Sentry runtime alert delivery: owner confirmed.
- GitHub failed deployment notification: owner confirmed.
- Destination details: not stored in this repository.

## Public Surface, DNS, and TLS

- Status: partial pass.
- Date observed: `2026-07-01`
- Web hosting note: `trypressly.com` is still served by Vercel.
- API hosting note: `api.trypressly.com` is served by Lightsail/Caddy.

Public port scan against `18.232.228.111`:

- `22`: open
- `80`: open
- `443`: open
- `3000`: closed
- `4000`: closed
- `5432`: closed

DNS:

- `trypressly.com`: `216.150.1.1`
- `api.trypressly.com`: `18.232.228.111`

Health and headers:

- `https://trypressly.com/health`: HTTP `200`
- `https://api.trypressly.com/health/ready`: HTTP `200`
- Web response included CSP, HSTS, `x-content-type-options`, `x-frame-options`, and Vercel headers.
- API response included CSP, HSTS, request ID, Caddy `via`, Helmet security headers, and `vary: Origin`.

Certificates:

- `trypressly.com`
  - Issuer: Let's Encrypt `YR2`
  - Subject: `CN = trypressly.com`
  - Not before: `Jun 27 00:15:31 2026 GMT`
  - Not after: `Sep 25 00:15:30 2026 GMT`
- `api.trypressly.com`
  - Issuer: Let's Encrypt `YE1`
  - Subject: `CN = api.trypressly.com`
  - Not before: `Jun 16 15:10:02 2026 GMT`
  - Not after: `Sep 14 15:10:01 2026 GMT`

## Lightsail Snapshots

- Status: passed.
- Date observed: `2026-07-01`
- Automatic snapshots: enabled.
- Snapshot schedule: daily at `2:00 AM EDT`.
- Retention: seven most recent snapshots.
- Observed snapshot range: `2026-06-25` through `2026-07-01`.
- Manual snapshot: not required for this proof because automatic snapshots are enabled and recent snapshots are present.

## Tabletop Exercise

- Status: passed.
- Date recorded: `2026-07-01`
- Scope: choosing rollback versus restore versus credential containment.

Bad deploy:

- Use `rollback.sh` to return to the previous recorded image digest.
- Do not restore the database for a code-only failure.
- Verify API and web health after rollback.

Data loss or corruption:

- Do not use rollback as a data fix.
- Restore the encrypted S3 backup into an isolated database first.
- Verify the restored schema and critical reads before deciding the production recovery path.

Credential or session compromise:

- Revoke affected sessions.
- Rotate the affected secret.
- Preserve logs before restarting or redeploying.
- Verify MFA status for affected privileged identities.

## Secret Handling

Not stored in the repository:

- Owner password
- TOTP secret
- Authenticator URI
- MFA verification code
- MFA recovery codes
- Full production owner email
- Full production identity ID

## Open Risks

- The production owner password appeared in a local terminal transcript during setup.
  Rotate it once the password-change or reset path is available.
- MFA recovery-code login has not been drilled yet.
  Test one recovery code only when ready to consume it, because recovery codes should be single-use.
