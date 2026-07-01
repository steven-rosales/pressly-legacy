# Security Hardening Handoff

## What Changed

Pressly now treats security as a chain of explicit boundaries:

```text
untrusted request
-> bounded and identified API request
-> authenticated principal and live session
-> policy decision with MFA assurance
-> least-privilege database operation
-> safe event and immutable release evidence
-> restricted runtime with tested recovery
```

## 1. Requests Fail Early

The API generates `X-Request-Id`, trusts exactly one Caddy proxy hop, requires
JSON where expected, applies small body limits, and rate-limits global and login
traffic. Rejections use the normal safe API error shape.

Use the request ID to connect request, error, authorization, session, and MFA
events. Investigation steps live in `docs/security/incident-response.md`.

## 2. Authority Has One Source

`auth_role_assignments` is the only authorization source. Sessions now have
absolute and idle expiry, assurance level, inventory, selective revocation, and
revoke-all support.

Database credentials are separate:

```text
migration -> schema ownership and migrations
runtime   -> required table and sequence operations only
backup    -> read-only dumps
```

Integration tests prove runtime DML works while runtime DDL and protected system
catalog access fail.

## 3. Privileged Work Requires MFA

Owner/admin pricing and session administration require MFA assurance. TOTP uses
the maintained OTPAuth implementation. Secrets use AES-256-GCM encryption;
recovery codes are high-entropy hashes and single-use.

Recovery revokes existing sessions and returns password assurance so the owner
can enroll a new authenticator. Recovery codes are displayed once.

## 4. Releases Are Evidence, Not Branch Names

After checks pass on `main`, CI builds each production image once, creates SPDX
SBOMs, blocks critical image/library vulnerabilities, and publishes to private
GHCR packages. `release.json` binds:

```text
source SHA + API digest + web digest + build time
```

Lightsail pulls those exact digests. The server does not rebuild source. Current
and previous release manifests make rollback deterministic.

## 5. Runtime And Recovery Are Bounded

Production containers use pinned bases, read-only roots, dropped capabilities,
`no-new-privileges`, memory/process limits, writable `tmpfs` paths, and rotated
logs. API and web run without root.

Backups use the read-only database role, encrypt before S3 upload, publish a
checksum and metadata, and verify the uploaded encrypted stream. The restore
drill creates and destroys an isolated database volume.

## What You Must Do

Do these in order:

1. Create every `/opt/pressly/env/*.env` file from `infra/aws/docs/env/`, replace
   placeholders, and set mode `600`.
2. Rotate production DB credentials and run `configure-database-roles.sh`.
3. Add a read-only GHCR pull credential on Lightsail and verify one image pull.
4. Add `AUTH_MFA_ENCRYPTION_KEY`, deploy, then enroll owner/admin MFA and store
   recovery codes offline.
5. Configure GitHub branch rules, production-environment approval, the verified
   SSH known-host secret, and security scanning controls.
6. Configure the external alert destination for `security.alert` and failed
   GitHub deployments.
7. Configure the private S3 bucket, encryption, public-access block, lifecycle,
   and least-privilege backup identity.
8. Run one real backup plus isolated restore drill and record RPO/RTO evidence.
9. Run one digest deployment and rollback, then verify API/web health.
10. Complete the firewall, snapshot, DNS/TLS, and incident-tabletop checks in the
    Human Category of `stateworks/work/queued/security-hardening/brief.md`.

Do not enable CSRF, SSRF, global HTML sanitization, tenant RLS, distributed JWTs,
or nonce CSP until the adoption trigger listed in Queue 5 becomes real.

## Verification Completed

- Repository format, lint, typecheck, unit tests, integration tests, and build.
- Restricted runtime-role and migration-role database proofs.
- API production image build, non-root identity, read-only health check, and
  graceful `SIGTERM` shutdown.
- Migration execution under a read-only container filesystem.
- Encrypted disposable restore drill with schema smoke checks and no production
  volume attached.
- Compose rendering with service-specific environments and runtime restrictions.
