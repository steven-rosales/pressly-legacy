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
- all seven Compose services were healthy;
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
summary: immutable production artifacts and the normal workflow-run deployment succeeded for the exact source SHA. Repository HEAD, current-release metadata, verified deployment state, and /opt/pressly/ops/current agreed; all seven Compose services were healthy and the four pinned public HTTPS health authorities returned HTTP 200.
```

The independently provisioned host identity is owned by `root:root`, has mode
`0644`, and has SHA-256
`31032a9bfd414b438359bb96c5d3a75bea6beaae6762b34d7a43eb771d25865e`.
No private address, credential, DSN, database URL, or recovery secret is recorded
here.

## V2 - Deployed recovery admission (partial)

Status: running.

- The deployed stable operations scripts match the published recovery source
  SHA.
- The stable restore `--preflight-only` path accepted the approved encrypted
  `pressly-20260808T052558Z.dump.gpg` backup under the verified deployment and
  host-identity authority.
- The proof performed no restore, created no recovery journal, retained no
  operational lock, and left production healthy.
- The stable monitored backup runner, private backup log and log rotation are
  installed; the 03:15 UTC cron schedule is unchanged.

The first natural 03:15 UTC execution after installation has not occurred. A
manual invocation or successful preflight cannot prove scheduler execution, so
`V2` remains open.

## H2 - Immutable-secondary repository prerequisite

Status: prerequisite implemented; human gate pending.

Main at exact source commit
`a5c768b97cc9dee56bb53de1678563849b6d1f9a` contains optional
immutable-secondary backup destination support. One encrypted dump, checksum,
and metadata triplet is uploaded to both independently configured destinations;
each destination is attempted independently and the operation succeeds only
when every configured remote readback matches. The configuration requires a
distinct secondary bucket and expected AWS account.

Repository support does not provision or verify an independently administered
bucket, Object Lock retention, encryption, least-privilege host IAM, approved
RPO/RTO, or off-host recovery-secret escrow. None of those external `H2` facts is
claimed here.

```text
command: VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/postgres-backup-destinations.test.mjs tooling/test/host-operations-monitoring.test.mjs
exit: 0
time: 2026-08-08T16:45:24-04:00
summary: both focused files and all 41 tests passed. The proof covers independent primary and optional secondary destination attempts and readback, distinct bucket/account admission, exact backup authority despite missing or failing telemetry, and private bounded fallback logging. It configures no AWS resource and proves no external H2 fact.
```

## Pending evidence

- `V2`: first natural 03:15 UTC execution after publication, including local
  checksum, remote durability/encryption/version evidence, and bounded telemetry
- `H2`: approved RPO/RTO, independent immutable storage, and off-host escrow
- `H3`: complete replacement-instance drill
