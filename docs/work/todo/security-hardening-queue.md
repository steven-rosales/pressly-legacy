# Security Hardening Queue

## Purpose

Finish Pressly's next security layer without turning the modular monolith into a security platform.

## Status: Engineering Complete, Human Gates Pending

The repository work for Queues 1-4 was completed on 2026-06-29. Queue 5 remains
deliberately trigger-based. Keep this file in `todo/` until the Human Category
tasks and one real CI-to-production digest deployment and rollback drill are
verified.

Implementation and operator steps are summarized in
`docs/agents/06/29/security-hardening-handoff.md`.

The order is risk-driven:

```text
public request boundary
-> production and deployment boundary
-> identity, session, and database authority
-> privileged access and supply chain
-> detection and recovery
```

## Execution Rules

- Complete queues in order.
- Tasks inside the same parallel group may run at the same time.
- Parallel tasks must stay inside their listed ownership boundaries.
- Run the queue exit gate after all parallel work is merged.
- Preserve current behavior unless a task explicitly changes a security policy.
- Add tests for deny paths and failure paths, not only successful requests.
- Move this file to `docs/work/archived/` only after every active queue and human task is complete.

## Not Active Yet

Do not implement these without their adoption trigger:

- CSRF protection while browser authentication uses explicit bearer tokens instead of cookies.
- SSRF machinery before Pressly fetches a user- or vendor-controlled URL.
- Global HTML sanitization before a feature intentionally accepts and renders rich HTML.
- Tenant RLS before tenant ownership and resource ancestry exist in the data model.
- Distributed JWT authentication while one process can validate opaque sessions centrally.
- Nonce-based CSP while preserving static rendering is more valuable and the current static CSP works.

---

# Queue 1: Close Immediate Boundaries

These lanes are independent and may run in parallel.

## 1A. API Ingress

**Owns:** `apps/api`, `packages/http`

1. Configure Express proxy trust for the exact Caddy-to-API topology.
2. Generate one request ID at the API boundary and return it in the response.
3. Include the request ID in request, error, and security logs.
4. Require an appropriate JSON content type on routes that consume JSON.
5. Replace the broad `1mb` default with a conservative global body limit.
6. Add smaller route-specific limits where credentials or small commands are expected.
7. Add a coarse global per-IP limiter.
8. Add a stricter login per-IP limiter while retaining the existing DB-backed per-account failure window.
9. Return `429` with `Retry-After` and the normal safe error shape.
10. Test spoofed forwarding headers, malformed content types, oversized bodies, and limiter recovery.

Do not add CSRF, SSRF, or global HTML sanitization in this task.

## 1B. Immutable Deployment Selection

**Owns:** `.github/workflows`, `.github/actions`, `infra/aws/lightsail/deploy.sh`

1. Deploy `workflow_run.head_sha`, never the moving branch name.
2. Make manual deployment accept only a commit that has a successful CI run.
3. Keep production deployment protected by the GitHub `production` environment.
4. Replace live `ssh-keyscan` trust with a pre-verified host key supplied through GitHub.
5. Pin third-party GitHub Actions to full commit SHAs.
6. Record the deployed commit SHA in deployment output and release files.
7. Test automatic deploy, approved manual redeploy, invalid SHA, and failed-CI rejection.

## 1C. Production Secret and Process Isolation

**Owns:** `apps/api/Dockerfile`, `infra/aws/lightsail/docker-compose.production.yml`, production env examples

1. Replace the shared production env file with service-specific env files.
2. Give Caddy only domain and proxy configuration.
3. Give web only values required by the Next.js runtime.
4. Give API only API, auth, observability, and runtime DB values.
5. Give Postgres only database initialization values.
6. Create a non-root API runtime user and run the API as that user.
7. Verify no service receives another service's secrets through its environment.
8. Keep Postgres and application ports internal to the Compose network.

## Queue 1 Exit Gate

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:int
docker compose -f infra/aws/lightsail/docker-compose.production.yml config
docker build --target runner -f apps/api/Dockerfile -t pressly-api:security-check .
```

Also inspect the API image and each rendered service environment as part of a local production-parity run.

---

# Queue 2: Make Authority Singular

These lanes may run in parallel if `2A` owns auth schema migrations and `2B` owns database roles and grants only.

## 2A. Auth Authority and Session Lifecycle

**Owns:** `packages/auth`, auth tables in `packages/db`, `modules/business/auth`, related contracts and tests

1. Make `auth_role_assignments` the only source of authorization and displayed roles.
2. Remove reads and writes of `auth_identity_roles`.
3. Add a migration that verifies assignments exist before dropping `auth_identity_roles`.
4. Keep global, location, and resource scope semantics unchanged.
5. Add an idle session timeout in addition to the current absolute expiration.
6. Add revoke-all-sessions for an identity.
7. Revoke sessions when credentials change or an identity becomes inactive once those mutations exist.
8. Expose session inventory and selective revocation for privileged administration.
9. Audit login, logout, session revocation, credential changes, and assignment changes.
10. Ensure owner bootstrap is idempotent and unavailable as a normal remote application operation.

## 2B. Database Least Privilege

**Owns:** database bootstrap SQL, DB runtime configuration, migration scripts, backup scripts, DB security tests

1. Define separate roles for migration, application runtime, and backup/restore.
2. Give the runtime role only the table and sequence privileges the application needs.
3. Do not give the runtime role DDL, role-management, database-creation, or superuser privileges.
4. Give the migration role schema-change privileges without making it the application credential.
5. Give the backup role read-only access sufficient for the supported backup path.
6. Configure statement, lock, and idle-in-transaction timeouts.
7. Add integration tests proving the runtime role can execute normal repositories and cannot perform DDL or read unrelated system data.
8. Keep the existing parameterized-query boundary and SQL safety tests.

## 2C. Security Event Foundation

**Owns:** `packages/logging`, `packages/metrics`, generic API observability composition, observability tests

1. Define stable event names for authentication, authorization denial, validation rejection, throttling, session changes, and privileged mutations.
2. Include request ID, safe principal ID, session ID, action, resource type, outcome, and reason when available.
3. Never log credentials, bearer tokens, cookies, raw request bodies, or database URLs.
4. Add redaction regression tests for nested values and security events.
5. Emit counters for login failures, authorization denials, rate limits, and server errors.

Business modules keep ownership of when a business security event occurred. Logging owns only safe serialization and transport.

## Queue 2 Exit Gate

1. Run all repository checks and integration tests using the restricted runtime role.
2. Prove migrations fail under the runtime role and succeed under the migration role.
3. Prove removed role data cannot drift because only `auth_role_assignments` remains.
4. Prove expired, idle, revoked, and inactive sessions fail closed.
5. Inspect test logs to confirm secrets and credentials are absent.

---

# Queue 3: Protect Privileged Access and Artifacts

The first two lanes may run in parallel. Start `3C` after their event contracts are stable.

## 3A. Privileged MFA

**Owns:** auth credentials and authentication flows, admin CLI, related API contracts and tests

1. Require MFA for owner and admin authority.
2. Use a maintained standards-based authenticator implementation; do not write cryptography.
3. Store MFA secrets encrypted and store recovery codes as one-way hashes.
4. Require fresh authentication for enrollment, reset, recovery-code generation, and MFA removal.
5. Make recovery single-use, auditable, and capable of revoking existing sessions.
6. Test replay, expired challenges, invalid recovery codes, and lost-device recovery.

## 3B. Reproducible Artifact Pipeline

**Owns:** CI image jobs, registry publication, deployment artifact selection, SBOM and scanner configuration

1. Build production images once in CI after required checks pass.
2. Generate an SBOM for each image.
3. Scan dependencies and images for known critical vulnerabilities.
4. Publish images to a private registry.
5. Deploy immutable image digests rather than rebuilding source on the server.
6. Record source SHA, image digest, and deployment time together.
7. Roll back by previously recorded image digest.

## 3C. Security Event Integration

**Owns:** module-level event emission and alert wiring; does not redefine logging mechanics

1. Connect auth, access-control, API rejection, and deploy events to the Queue 2 event vocabulary.
2. Alert on repeated login failures, MFA recovery, assignment changes, unusual authorization denials, and deployment failures.
3. Keep high-volume client mistakes out of paging alerts.
4. Add request-ID-based investigation steps to the incident runbook.

## Queue 3 Exit Gate

1. Deploy a CI-built image by digest to a non-production Compose run.
2. Roll back to the previous digest.
3. Complete an MFA enrollment, login, recovery, and session-revocation test.
4. Trigger each critical security alert once and verify its safe payload.

---

# Queue 4: Runtime and Recovery

## 4A. Container Restrictions

1. Add `no-new-privileges` and drop Linux capabilities not required by each service.
2. Use read-only filesystems where the service passes health checks with explicit writable `tmpfs` paths.
3. Add memory, process, and log-rotation limits.
4. Pin production base images to reviewed versions or digests.
5. Verify graceful shutdown and backup jobs still work under the restrictions.

## 4B. Backup and Restore Proof

1. Encrypt database backups outside the Lightsail instance.
2. Enforce retention and lifecycle deletion.
3. Verify backup integrity after upload.
4. Restore into an isolated database and run schema plus smoke checks.
5. Record recovery-point and recovery-time measurements.
6. Keep rollback and restore procedures separate: code rollback does not reverse a destructive migration.

## Queue 4 Exit Gate

Run one complete drill:

```text
detect failure
-> identify release and request IDs
-> choose rollback or data recovery
-> restore service
-> verify health and critical reads
-> record timings and follow-up
```

---

# Queue 5: Triggered Controls

Create a new implementation plan only when one of these becomes real:

| Trigger                                         | Control                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Browser authentication moves to cookies         | SameSite policy, Origin checks, and CSRF tokens                                                             |
| Pressly fetches user- or vendor-controlled URLs | Central outbound client, destination allowlist, DNS/IP validation, redirect revalidation, and egress limits |
| A feature accepts rich HTML                     | Field-level sanitization at the trust boundary plus safe rendering tests                                    |
| File uploads arrive                             | Type and size validation, isolated storage, malware scanning, and safe download headers                     |
| External webhooks arrive                        | Signature verification, timestamp freshness, replay protection, and idempotency                             |
| Real tenant ownership exists                    | Tenant-aware resources, authorization tests, and selective Postgres RLS                                     |
| Services deploy independently                   | Follow `future-distributed-authentication.md`                                                               |
| Browser workflows become materially sensitive   | Follow `future-distributed-content-security-policy.md`                                                      |

---

# Human Category

These tasks require access to external control planes, physical authenticators, or operational judgment. An agent may prepare commands and checklists, but the owner must perform and verify them.

## After Queue 1

| Site or system          | Human task                                                                                                    | Evidence to retain                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| AWS Lightsail           | Restrict inbound traffic to `80` and `443`; restrict `22` to a controlled source when operationally possible. | Firewall-rule screenshot or exported configuration               |
| GitHub                  | Protect `main` with required CI checks and no direct pushes.                                                  | Branch-ruleset link or screenshot                                |
| GitHub                  | Protect the `production` environment with required review and narrow deployment access.                       | Environment protection screenshot                                |
| Lightsail host + GitHub | Verify the server SSH host fingerprint out of band, then store the exact known-host entry as a GitHub secret. | Fingerprint and date verified; never store a private key in docs |
| Production host         | Create service-specific env files with least-secret distribution and restrictive file permissions.            | Redacted variable-name inventory and `stat` output               |

## After Queue 2

| Site or system      | Human task                                                                                      | Evidence to retain                       |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Production Postgres | Create and rotate migration, runtime, and backup credentials; place each only where used.       | Role/grant audit with secrets removed    |
| Production          | Rotate any secret that was previously exposed to Caddy or web through the shared env file.      | Rotation date and affected service names |
| Production data     | Approve the `auth_identity_roles` removal only after comparing it with `auth_role_assignments`. | Row-count and mismatch query results     |

## After Queue 3

| Site or system     | Human task                                                                                     | Evidence to retain                            |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Authenticator      | Enroll owner and admin authenticators and store recovery material offline.                     | Enrollment confirmation without secret values |
| Container registry | Create the private repository, retention policy, and least-privilege CI/deploy credentials.    | Policy names and tested push/pull results     |
| GitHub             | Enable dependency review, secret scanning, CodeQL, and image-scan enforcement where available. | Required-check list                           |
| Alert providers    | Configure destinations and test who receives security and outage alerts.                       | Dated test-alert result                       |

## After Queue 4

| Site or system               | Human task                                                                                                               | Evidence to retain                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| AWS S3                       | Create the backup bucket, encryption policy, public-access block, lifecycle policy, and least-privilege backup identity. | Redacted bucket-policy review                           |
| AWS Lightsail                | Enable and inspect instance snapshots as a second recovery layer.                                                        | Snapshot schedule and one successful snapshot           |
| Isolated restore environment | Perform the restore drill without touching production data.                                                              | Date, backup ID, recovery time, and verification result |
| DNS and TLS                  | Verify production DNS, certificate renewal, HTTPS redirect, and security headers from outside the host.                  | Dated command output                                    |
| Operations                   | Choose the emergency contact path and run one rollback-versus-restore tabletop exercise.                                 | Short incident note with decisions and gaps             |
