# Production Recovery Hardening Evidence

## T0 - Baseline

The reported defects were confirmed in the pre-change scripts:

- ordinary rollback had no admission path through `running_unverified`;
- migration ran before the deployment state became conservative;
- the restore runbook dropped only `public`, despite backups also containing
  `drizzle`, and did not prove roles, grants, or compatible migrations; and
- the monitoring wrapper could prevent the backup command from starting.

Read-only production checks on 2026-08-08 found the current release healthy:

- release SHA, current-release metadata, and verified deployment state agreed;
- all seven Compose services were running, all six defined container health
  checks were healthy, and Caddy was running;
- API, Web, Processor, and Control returned HTTP 200;
- CPU, burst-capacity, and status-check alarms were OK with valid email
  notification;
- private versioned object storage held a recent encrypted backup whose local
  checksum and remote size matched; and
- the latest main CI, CodeQL, deployment, and nightly browser run had succeeded.

These checks prove the current baseline, not rollback or disaster recovery.
No production mutation, customer payload, credential, DSN, or secret was read
into this evidence.

## T1 - Failure-safe deploy and rollback

Deployment and rollback now share one nonblocking host lock. Migration is
preceded by a durable conservative state. A rollback journals the full
unresolved release, exact recovery target, and prior running release before
preflight, then retains that schema-v2 recovery authority until current and
previous metadata plus public health have converged. During recovery,
`rollback.sh` resolves the target from the journal rather than a possibly
partially rotated pointer. App-to-repository mapping and distinct image digests
are validated at the host boundary.

```text
command: bash -n infra/aws/lightsail/deploy.sh infra/aws/lightsail/rollback.sh; VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/release-deployment.test.mjs
exit: 0
time: 2026-08-08T13:38:48-04:00
summary: all 65 focused tests passed. They cover shared-lock and active-restore exclusion; DNS failure and drift before and after pinned health; pull, label, migration, Compose, and health failure; exact rollback retries; unresolved and recovery-target retention; forced metadata-pair failure and modeled rename-boundary crashes; stable checksummed operations bundles; canonical repository mapping; distinct digests; and final current=A, previous=B, verified convergence.
```

## T3 - Backup remains authoritative

The monitored-operation runner now executes and classifies the locked, timed
operation before attempting Sentry. Telemetry is best effort, bounded to 20
seconds, structurally validates the DSN, suppresses CLI output, and cannot
replace the operation's exit status. The fallback log is private and bounded by
rotation.

```text
command: bash -n infra/aws/lightsail/run-monitored-operation.sh; VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/host-operations-monitoring.test.mjs
exit: 0
time: 2026-08-08T13:38:48-04:00
summary: all 30 focused tests passed, including direct and monitored lock ownership, active-restore exclusion for backup and role configuration, private partial-artifact failure, complete Compose binding closure, and missing, malformed, noisy, failing, and successful Sentry paths. The exact backup exit remained authoritative and synthetic DSN values did not reach stdout or stderr.
```

## T2 - Production-shaped database restore

The new confirmation-gated recovery workflow serializes against deploy,
rollback, and backup; binds itself to the checked-out release and canonical
five-image identity; restores into a clean candidate; reapplies roles,
ownership, and grants; applies current migrations; validates runtime reads and
DML, lack of runtime DDL, backup read-only behavior, and schema ownership; then
promotes the candidate while retaining the prior database in a
connection-disabled quarantine. Pre-journal failure leaves services untouched.
After durable journal and service-fence admission, handled failure and reboot
keep ingress and writers stopped; a process-only `SIGKILL` can leave already-
running validated containers alive, but the journal blocks every competing
operation and exact resume revalidates the database and public target before
retiring recovery authority.

```text
command: infra/aws/lightsail/restore-postgres-proof.sh
exit: 0
time: 2026-08-08T13:37:42-04:00
summary: the terminal disposable proof generated a real AES256 backup at SHA-256 fd97385c158958f571cfce23691c1a05f43a0100ec27454deda1bc097330a861, restored migration ledger N-1 at 39 and applied release migration 40, then proved exact verified and running-unverified admission; current and first-rollout candidate bundle binding; provisioned host identity and immutable public-health target binding; durable pre-cutover abort; process death at both database renames, abort, and public-verification boundaries; restart-policy fencing; role, grant, owner, runtime DML/no-DDL, and backup read-only/no-write invariants; and rejection of stale quarantine and impossible topology collisions. Production resources were never mounted or contacted, and every owned container, network, volume, image, and temporary file was removed.
```

```text
command: bash -n infra/aws/lightsail/restore-postgres.sh infra/aws/lightsail/restore-postgres-proof.sh infra/aws/lightsail/restore-postgres-drill.sh; VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/ci-production-artifacts.test.mjs
exit: 0
time: 2026-08-08T13:38:48-04:00
summary: shell syntax passed and all 24 focused production-artifact and restore assertions passed. The combined deploy, restore, backup, and monitoring slice passed 119 of 119 focused tests.
```

## V1 - Combined repository verification

```text
commands: pnpm format:check; pnpm architecture:check; pnpm lint:architecture; pnpm lint; pnpm typecheck; pnpm test; pnpm build; Stateworks validate and verify for production-recovery-hardening and lpms-production-readiness; git diff --check
exit: 0
time: 2026-08-08T13:41:03-04:00
summary: formatting and both architecture gates passed; lint passed across 28 Turbo tasks; typecheck passed across 50 Turbo tasks plus browser and architecture tooling; tests passed across 51 Turbo tasks and 316 tooling tests; build passed across all 28 tasks. Both Stateworks networks validated. Recovery hardening has only external publication and disaster-recovery obligations left; LPMS correctly remains stopped on human_action_required and invariant_violation. The adversarial recovery review found no remaining script correctness or security defect, and no disposable proof resources remain.
```

## H1 - Published recovery release

Status: committed.

The repaired release was published through protected `main` at exact source SHA
`a44216cf83223225ab1caeb32a1e20d616ccce47`.

```text
main CI: 31271988560, success
CodeQL: 31271988452, success
production deployment: 31273257568, success
time: 2026-08-08
summary: immutable production artifacts and the normal workflow-run deployment succeeded for the exact source SHA. Repository HEAD, current-release metadata, verified deployment state, and /opt/pressly/ops/current agreed; all seven Compose services were running, all six defined container health checks were healthy, Caddy was running, and the four pinned public HTTPS health authorities returned HTTP 200.
```

The independently provisioned host identity is owned by `root:root`, has mode
`0644`, and has SHA-256
`31032a9bfd414b438359bb96c5d3a75bea6beaae6762b34d7a43eb771d25865e`.
No private address, credential, DSN, database URL, or recovery secret is recorded
here.

### Current operational release re-verification — 2026-08-09

The hourly-capable release was published at exact source SHA
`d7dde6755b7d8c09b81692384a546172fa2651f0`.

```text
CodeQL: 31285810375, success
main CI: 31285810370, success
production artifacts job: 93175484173, success
strict required job: 93177475707, success
release artifact: 9030133529
release archive SHA-256: 2440f2b0aa265bbe93a053cccaa75fd0a86378c32e90c299981bc0a8bd1223ac
production deployment: 31286982819, success
summary: quality, integration, browser, immutable artifact publication, and the workflow-run deployment succeeded for exact d7dde. The artifact contained five expected distinct GHCR repository/digest identities and the exact source SHA. Independent host readback matched current-release, metadata, verified deployment state, repository HEAD, and stable operations source to d7dde; all seven services were running, the six defined container health checks were healthy, Caddy was running, all five application revisions and digests were exact, no restore journal existed, and three rounds of the four public health authorities returned HTTP 200.
```

The following deployment-monitor release was published at exact source SHA
`bc0987b98f746cab5d2a97f91c5e3f7892561bb6` without changing the backup
schedule or secondary-destination contract.

```text
CodeQL: 31288031106, success
main CI: 31288031209, success
quality job: 93180289632, success
integration job: 93180738996, success
browser job: 93180738990, success
production artifacts job: 93181221880, success
strict required job: 93183226933, success
production deployment: 31289140630 / job 93183237583, success
summary: both deployment-monitor workflow steps succeeded and deployment.succeeded exited 0. Sentry check-in 7c2f04ab-fca1-412c-af46-9578354e32a0 moved from in_progress at 01:52:16.909Z to ok under the same identifier after 57.631 seconds. Independent pinned-host readback matched all release pointers, metadata, verified state, repository HEAD, operations source, five image revisions, and operations checksums to bc098. All seven containers were running with zero restarts, the six defined container health checks were healthy, Caddy was running, no restore journal or backup/restore process existed, and API, Web, Processor, and Control returned HTTP 200 through both public and pinned authorities.
```

## V2 - Deployed hourly recovery verification

Status: committed.

- The deployed stable operations scripts match the published recovery source
  SHA.
- The stable restore `--preflight-only` path accepted the approved encrypted
  `pressly-20260808T052558Z.dump.gpg` backup under the verified deployment and
  host-identity authority.
- The proof performed no restore, created no recovery journal, retained no
  operational lock, and left production healthy.
- The stable monitored backup runner, private backup log, and log rotation are
  installed.

At 00:56 UTC, a monitored manual run under exact `d7dde` created
`pressly-20260809T005607Z.dump.gpg` plus its checksum and metadata at both the
primary and independently administered secondary destination. All three
secondary objects had non-null VersionIds, exact remote size and encrypted-byte
hash readback, and `AES256` server-side encryption. Each current-object GET was
bracketed by readback of the same non-null immutable VersionId before and after
the transfer; the writer did not perform a version-pinned GET. That secure
downloaded triplet passed the stable restore `--preflight-only` path, performed
no live restore, created no recovery journal, retained no operational lock, and
was removed afterward.

```text
manual secondary dump: 5198037 bytes, VersionId Fk.t0adfW.z8ZO3ktGeYWWPszqoPgkMV
manual secondary checksum: 100 bytes, VersionId PyOJ0XrOYgHd0AARoO94mbC.a6aIjCV.
manual secondary metadata: 206 bytes, VersionId 0cu6_uXcPqtfXj1uUWqTc3JYnVU5vvWX
```

The first natural hourly execution then proved scheduler ownership rather than
manual command capability:

```text
cron dispatch: 2026-08-09T01:15:02Z
backup interval: 2026-08-09T01:15:03Z through 2026-08-09T01:15:21Z
source and operations SHA: d7dde6755b7d8c09b81692384a546172fa2651f0
triplet: pressly-20260809T011503Z.dump.gpg and its .sha256 and .json companions
dump: 5199742 bytes, SHA-256 cfae3cfccc58a097b0ce9e9ae949c3f3cdc9da620c38a8fa758e4433e31233e9
checksum: 100 bytes, SHA-256 prefix 715fba5d
metadata: 206 bytes, SHA-256 prefix ff2f0ad5
local authority: mode 0600
primary VersionIds: ktN_Q5EU11qKXTQGaPfxJlWsY.F2W2Yx / we1CROBv5PmgkuMmY67W2yWiAL3REEYL / 93kFhvsQzZDPpBEMW4nBock4z0CUyG17
secondary VersionIds: osfhmZuXWGNbJYgh0G0ODzGF2tzn5fHe / PzXN_yh_HV4DLUtxNX73cg3e9Opmk3hz / W3Ch5NfS7p7_pgS2yc0Eq6jwZIIJ06Cq
summary: all six VersionIds were non-null. Every current-object primary and secondary GET was bracketed by the same exact VersionId before and after transfer and matched the local size and encrypted-byte hash; no version-pinned GET is claimed. Every object reported AES256, and the secure readback copy was removed.
```

Sentry recorded the distinct natural check-in at 01:15:23.459Z as `ok` with a
16-second duration. The `pressly-postgres-backup` monitor was active on
`15 * * * *` UTC with the next check-in expected at 02:15. Final exact-`d7dde`
readback found the cron hash stable and no process, lock, or restore journal.
All seven containers were running with zero restarts, the six defined container
health checks were healthy, Caddy was running, and all four public and pinned
health authorities returned HTTP 200. The later exact-`bc098` deployment
preserved a single hourly cron entry, its monitor schedule, secondary URI,
profile, expected-owner binding, and host-capacity entry.

This natural run, rather than the manual backup or restore preflight, satisfies
`V2`'s scheduler, durability, encryption, version, telemetry, and post-run
health verifier.

The next natural run also crossed the intervening deployment boundary. Under
exact `bc098`, the unchanged cron dispatched
`pressly-20260809T021502Z.dump.gpg`; the encrypted dump was 5,206,857 bytes with
SHA-256
`24e8a3927f7c2efeacd830b13b1048149af97dda9de5c149088869bcca52aa27`, and its
100-byte checksum and 206-byte metadata companions passed local mode-`0600`
validation. Sentry recorded the natural check-in at 02:15:22.301Z as `ok` with
an 8-second duration and next expected time 03:15. Post-run readback preserved
the unchanged cron SHA-256 prefix `55a4d05e`, found no backup process or restore
journal, and found all seven containers running, the six defined health checks
healthy, Caddy running, and all four public and pinned health authorities
returning HTTP 200. This corroborates that the later deployment preserved
natural scheduling; it does not add an Object Lock or escrow claim.

## H2 - Immutable-secondary repository prerequisite

Status: independent retention and file escrow proven; access inventory pending.

Main at exact source commit
`a5c768b97cc9dee56bb53de1678563849b6d1f9a` contains optional
immutable-secondary backup destination support. One encrypted dump, checksum,
and metadata triplet is uploaded to both independently configured destinations;
each destination is attempted independently and the operation succeeds only
when every configured remote readback matches. The configuration requires a
distinct secondary bucket and expected AWS account.

Repository support does not provision or verify an independently administered
bucket, Object Lock retention, encryption, least-privilege host IAM, or off-host
recovery-secret escrow. It therefore proves no external custody fact by itself;
the owner decisions below are separate human evidence.

### H2 owner decisions — 2026-08-08

- Owner: Steven.
- Approved recovery point objective: one hour.
- Approved recovery time objective: four hours.
- Approved immutable retention: 90 days in S3 Object Lock COMPLIANCE mode.
- Off-host store: Steven confirmed completion of the Bitwarden baseline
  checklist: protected business vault, Pressly recovery collection and policy
  note, two-step login, and an offline recovery-code path. Recovery-material
  escrow and a redacted retrieval test remain unproved.

### H2 external boundary evidence — 2026-08-09

- The secondary destination is a dedicated AWS Organizations member account,
  `067200612921`, reached by Steven through a non-root IAM Identity Center
  assignment. Centralized member-root credential management is enabled.
- `pressly-prod-postgres-recovery-067200612921-use1` is private with all four
  account-level Block Public Access settings enabled, bucket-owner-enforced
  ownership, versioning, `AES256` default encryption, Object Lock enabled, and a
  default 90-day `COMPLIANCE` retention rule.
- The production host uses the no-console
  `arn:aws:iam::067200612921:user/pressly-secondary-writer` identity through an
  owner-only profile. Its narrow policy grants only the required bucket
  discovery, multipart, put, and readback operations under `postgres/`; the
  bucket policy denies writer deletion and retention mutation. Host STS and
  expected-owner bucket-location readback succeeded without exposing the key.
- The manual and natural dual runs above prove that complete encrypted triplets
  reach both destinations under non-null version identities and exact remote
  readback. The current manual secondary objects were bracketed by the same
  immutable VersionIds around their GETs, and the downloaded triplet passed the
  stable restore preflight; no version-pinned GET is claimed.
- Steven confirmed a protected Bitwarden Business recovery collection,
  two-step login, offline account-recovery path, and storage of the secondary
  writer credential. Complete recovery-material inventory and a redacted
  retrieval from escrow are not yet proven.

### H2 exact per-version retention — 2026-08-09

Independent readback in recovery account `067200612921` found versioning enabled
on `pressly-prod-postgres-recovery-067200612921-use1` and proved the actual
retention attached to all three current versions of the manual secondary
triplet. This is object-version evidence rather than an inference from the
bucket default.

| Object                                              | VersionId                          | Current | Bytes     | Encryption        | Retention    | Retain until           |
| --------------------------------------------------- | ---------------------------------- | ------- | --------- | ----------------- | ------------ | ---------------------- |
| `postgres/pressly-20260809T005607Z.dump.gpg`        | `Fk.t0adfW.z8ZO3ktGeYWWPszqoPgkMV` | yes     | 5,198,037 | SSE-S3 (`AES256`) | `COMPLIANCE` | `2026-11-07T00:56:17Z` |
| `postgres/pressly-20260809T005607Z.dump.gpg.sha256` | `PyOJ0XrOYgHd0AARoO94mbC.a6aIjCV.` | yes     | 100       | SSE-S3 (`AES256`) | `COMPLIANCE` | `2026-11-07T00:56:18Z` |
| `postgres/pressly-20260809T005607Z.dump.gpg.json`   | `0cu6_uXcPqtfXj1uUWqTc3JYnVU5vvWX` | yes     | 206       | SSE-S3 (`AES256`) | `COMPLIANCE` | `2026-11-07T00:56:19Z` |

Each retain-until timestamp is 90 days after its version's upload timestamp.
The exact VersionIds and sizes agree with the prior manual upload/readback and
secondary restore-preflight authority. This closes the Object Lock retention
portion of `H2` without claiming that bucket defaults alone were sufficient.

### H2 off-host bundle retrieval — 2026-08-09

Steven retrieved `pressly-recovery-bundle-20260809.tar` from Bitwarden to a
separate workstation boundary. The downloaded archive was byte-identical to the
source escrow archive: 30,720 bytes with SHA-256
`d727ed2d1a4ec3276d4e86cc1c540bee3a8bd1133ecc86570d002e1ccc7655ee`.

The exact 15-member archive topology was:

```text
env/compose.env
env/caddy.env
env/web.env
env/api.env
env/worker.env
env/processor.env
env/control.env
env/postgres.env
env/migration.env
env/database-roles.env
env/backup.env
backup-passphrase.txt
current-release.json
LightsailDefaultKey-us-east-1.pem
SHA256SUMS
```

The retrieved local archive was mode `0600`. It was extracted only into an
isolated mode-`0700` verification directory whose environment subdirectory was
also mode `0700`. All 14 protected members passed
`sha256sum --check --strict` against `SHA256SUMS`; no file content or individual
secret hash was emitted. This proves real off-host vault retrieval plus the
integrity of the runtime environment files, backup passphrase, exact release
identity, and Lightsail SSH key.

The redacted member list does not prove every non-file access required by a
replacement host. `H2` remains pending on three exact attestations:

1. retrieve or prove a regenerable recovery path for private GHCR/GitHub release
   pull access; `current-release.json` identifies immutable images but is not
   registry authentication;
2. retrieve or prove the management-account and DNS administration recovery
   path; and
3. retrieve the separately stored secondary-writer AWS credential required by
   the replacement host; `backup.env` names the profile but the archive contains
   no AWS credentials file.

No secret value is recorded here.

```text
command: VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/postgres-backup-destinations.test.mjs tooling/test/host-operations-monitoring.test.mjs
exit: 0
time: 2026-08-08T16:45:24-04:00
summary: both focused files and all 41 tests passed. The proof covers independent primary and optional secondary destination attempts and readback, distinct bucket/account admission, exact backup authority despite missing or failing telemetry, and private bounded fallback logging. It configures no AWS resource and proves no external H2 fact.
```

## Pending evidence

- `H2`: redacted retrieval or regenerable-access proof for private release pull,
  management-account/DNS administration, and the separately stored secondary
  writer credential
- `H3`: complete replacement-instance drill
