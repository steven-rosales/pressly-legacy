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

Status: committed. Independent retention, exact current file-bundle custody,
non-root AWS management and recovery administration, current GoDaddy DNS
administration, and Production Owner password plus ordinary-TOTP availability
are proven at the redacted boundary required by H2.

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
  note, two-step login, and an offline recovery-code path. At that evidence
  point, recovery-material escrow and a redacted retrieval test were unproved;
  the later dated sections record their completion.

### H2 external boundary evidence — 2026-08-09

- The secondary destination is a dedicated AWS Organizations member account,
  `067200612921`, reached by Steven through a non-root IAM Identity Center
  assignment. Centralized member-root credential management is enabled.
- Separate read-only STS results now prove the non-root Identity Center subject
  `steven` can assume the `AWSReservedSSO_AdministratorAccess` role class in
  management account `088594414587` and recovery account `067200612921`.
- Steven opened the `trypressly.com` GoDaddy DNS administration surface, saw
  record-edit controls, and observed authoritative nameservers
  `ns17.domaincontrol.com` and `ns18.domaincontrol.com`; an independent DNS query
  returned the same two authorities. No DNS mutation occurred.
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
  writer credential. The later bundle retrieval and regenerable-access proof
  below supersede the earlier incomplete-inventory status.

### H2 exact per-version retention — 2026-08-09

Independent readback in recovery account `067200612921` found versioning enabled
on `pressly-prod-postgres-recovery-067200612921-use1` and proved the actual
retention attached to the three manual-secondary versions inspected at that
time. This is dated object-version evidence rather than an inference from the
bucket default or an assertion about a later current version.

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

After validating that both Linux staging directories were real, non-symlink,
mode-`0700` directories owned by Steven and that the workstation download was a
regular, non-symlink file, only those three temporary copies were deleted.
Readback found all three absent, and a bounded home-directory search found no
matching staging directory or archive. The Bitwarden attachment remains the
authoritative off-host copy of that dated file bundle. Normal filesystem
deletion is not claimed as forensic media erasure.

### H2 regenerable release and writer access — 2026-08-09

Read-only release recovery was proven without using an existing credential. At
the 2026-08-09 observation point, exact deployed source
`bc0987b98f746cab5d2a97f91c5e3f7892561bb6` had a live
`current-release.json` named five digest-pinned API, Web, Worker, Processor, and
Control images. From a fresh mode-`0700` `DOCKER_CONFIG` with no `config.json`,
`docker manifest inspect` succeeded anonymously for every exact digest
reference. With global and system Git configuration disabled, an empty
`credential.helper`, terminal prompting disabled, and `GIT_ASKPASS=/bin/false`,
anonymous `ls-remote` matched public `main` to exact `bc0987b`, and an anonymous
depth-one fetch of that exact SHA succeeded. Git and GHCR access for that exact
release is therefore public and regenerable; no stored repository or registry
credential is required to recover it. The post-merge release must be read back
and its exact access and escrow attachment reverified before `H3`.

Steven's non-root IAM Identity Center `AdministratorAccess` into recovery
account `067200612921` was independently exercised when he opened the exact S3
objects and supplied their per-VersionId retention readback. The later STS
readback below proves the same non-root administrator class in both recovery and
management accounts. The recovery administrator can read retained versions and
create or rotate a replacement narrow writer for a replacement host. The
existing secondary-writer key is therefore not a required recovery credential,
and requiring escrow retrieval of that long-lived key would add unsafe ceremony
rather than recoverability. This does not authorize removal of a credential
still used by the production host.

### H2 independent administration readback — 2026-08-09

At `2026-08-09T10:56:14-04:00`, read-only CLI identity results from the shared
IAM Identity Center session returned:

```text
management: account 088594414587, AWSReservedSSO_AdministratorAccess, subject steven
recovery: account 067200612921, AWSReservedSSO_AdministratorAccess, subject steven
```

The role-specific suffixes, session token, access-portal URL, passkey flow, and
all credentials are intentionally omitted. Neither result used or recovered a
root credential.

Steven separately opened the GoDaddy DNS administration page for
`trypressly.com`, confirmed the record-edit controls were available, and read
back `ns17.domaincontrol.com` and `ns18.domaincontrol.com`. A read-only DNS query
independently returned the same two authoritative nameservers. No DNS record was
created, edited, or deleted.

Steven explicitly deferred separate vault-backed GoDaddy MFA-recovery and
Production Owner recovery-code methods until later because Pressly has not
launched. They are accepted nonblocking pre-launch debt, not proven controls.
Current authoritative-DNS administration and current Owner password plus
ordinary-TOTP availability are sufficient for `H2`; actual Owner authentication
remains an H3 verifier, and the deferred backup methods remain visible for later
hardening.

The exact deployed release at this evidence point is
`ad499be0d73f4b5e5112f8bf25660a642d02ec48`. A new local mode-`0600`, 40,960-byte
15-member archive named
`pressly-recovery-bundle-ad499be0-20260809T145331Z.tar` was created for that
exact release with SHA-256
`5f620640716df4569b4b3afa86a07929485c806762d15e2bc56ba7d09ef04523`.
Its local inventory and all 14 protected-member checksums were verified. Steven
uploaded that exact fresh attachment to Bitwarden; the validated local archive
and staging directory were then deleted and confirmed absent, leaving the vault
as the off-host copy. The earlier byte-identical Bitwarden retrieval proves the
vault retrieval path. H3 still requires a fresh independent download and full
integrity check of this exact attachment before recovery use.

Steven separately confirmed the current Pressly Production Owner password is
available and its ordinary TOTP is held in Google Authenticator. No archive
content, individual member hash, password, TOTP seed or value, recovery code, or
application account identifier is recorded here.

No secret value is recorded here.

```text
command: VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/postgres-backup-destinations.test.mjs tooling/test/host-operations-monitoring.test.mjs
exit: 0
time: 2026-08-08T16:45:24-04:00
summary: both focused files and all 41 tests passed. The proof covers independent primary and optional secondary destination attempts and readback, distinct bucket/account admission, exact backup authority despite missing or failing telemetry, and private bounded fallback logging. It configures no AWS resource and proves no external H2 fact.
```

## H3 - Complete replacement-instance recovery drill

Status: committed.

The disposable drill `20260809-01` declared host loss and started the RTO clock
at `2026-08-09T15:10:18Z`. It was bound to exact deployed source
`ad499be0d73f4b5e5112f8bf25660a642d02ec48` and these five immutable images:

```text
api: ghcr.io/steven-rosales/pressly/api@sha256:828173066dd3448c6f16d32b5bf328b96ca72777d9807d10c814d19a1f49740c
web: ghcr.io/steven-rosales/pressly/web@sha256:b330699713624bc678754ca32e34e5dd25a93700cfbabcdd102aa503bde1f568
worker: ghcr.io/steven-rosales/pressly/worker@sha256:662752d7abebf4acd76917f91154d2980d5a8792f3b0342d0e303f35b4bdc5ed
processor: ghcr.io/steven-rosales/pressly/processor@sha256:1e167097bed661cc13d21cfbeb9be8c2db32936103300e739f4959648dd7f799
control: ghcr.io/steven-rosales/pressly/control@sha256:51805dc00307ed311f286a78b11b5d21340496f201552f3f3f268c71da54fc9c
```

### Fresh escrow admission

The exact Bitwarden attachment was retrieved after the RTO clock started. Its
whole-archive SHA-256 was
`5f620640716df4569b4b3afa86a07929485c806762d15e2bc56ba7d09ef04523`;
its aggregate archive-inventory SHA-256 was
`784707b1a63b9296b0193387916f8737e353b7aa96bbfa2e9e00b060f1032550`.
The archive held 15 members: `SHA256SUMS`, the Lightsail key, backup
passphrase, `current-release.json`, and the 11 runtime environment files for
Compose, Caddy, Web, API, Worker, Processor, Control, PostgreSQL, migrations,
database roles, and backup. All 14 protected members passed the archive's
checksum manifest without emitting contents or individual member hashes.
`current-release.json` matched exact source `ad499be0` and the five image
identities above.

### Immutable recovery point and measured RPO

The latest complete immutable triplet available at drill start was
`pressly-20260809T141503Z.dump.gpg` and its checksum and metadata companions.
Its recovery-point timestamp was `2026-08-09T14:15:03Z`; all three exact
versions were present by `2026-08-09T14:15:16Z`. Each reported `AES256`
server-side encryption and Object Lock `COMPLIANCE` retention. Redacted exact
version identities and retain-until readback were:

```text
dump: 5,303,438 bytes; last modified 2026-08-09T14:15:14Z
VersionId SHA-256: 7aa4d3777db169b79f7eec23e3cf8f8e7e44151e9d8769964fef672eb268f396
retain until: 2026-11-07T14:15:13.594000Z

checksum: 100 bytes; last modified 2026-08-09T14:15:15Z
VersionId SHA-256: 18ce5f230a3554501bbe0f015145a0202a2ba25c645ad133537a87fcf9c5bbac
retain until: 2026-11-07T14:15:14.661000Z

metadata: 206 bytes; last modified 2026-08-09T14:15:16Z
VersionId SHA-256: 565ecf6b923704ddeef0991716dbd4851831ed570c95280ba7d290dce487cd3a
retain until: 2026-11-07T14:15:15.665000Z
```

Measured RPO was 3,315 seconds (55 minutes 15 seconds), below the approved
3,600-second maximum. This is the controller-measured recovery-point result,
not an inference from the hourly schedule.

### Isolated restore and application proof

Before recovered-state handling, the controller stopped database and
application writers, closed host and Docker-published ingress, and blocked
runtime external egress. The disposable replacement used no production volume
and changed no production DNS. During mandatory on-host deployment and restore
probes, temporary HTTPS exposure was enabled only after that fence; final host,
Docker, and Lightsail HTTPS admission was narrowed to the operator's redacted
IPv4 `/32` before application proof. TLS used a drill-internal CA.

The exact current operations bundle passed deployment admission. The encrypted
backup restored to `public_verified`; schema and role validation passed; all
seven runtime containers passed recovery health; and runtime egress checks
proved all seven containers were blocked outside the Compose subnet while Web
could still reach the internal API health surface. The isolated API, Web,
Processor, and Control HTTPS health surfaces each returned HTTP 200.

Steven authenticated as the Production Owner with the ordinary Google
Authenticator TOTP. No recovery code substituted for TOTP and no account
identifier or credential entered evidence. Through the isolated application
route, one explicitly synthetic non-PII write returned HTTP 201 and its
authoritative read returned HTTP 200. Logout returned HTTP 200, and reuse of
the revoked session was rejected with HTTP 401. The application proof did not
select, expose, replay, or reuse an existing production customer or order
payload; it operated only on the synthetic non-PII drill record. The restored
database necessarily contained the production backup's encrypted state.

The application proof finished at `2026-08-09T16:25:10Z`. Measured RTO was
4,492 seconds (1 hour 14 minutes 52 seconds), below the approved 14,400-second
maximum.

### Tag-bounded cleanup

Cleanup passed at `2026-08-09T16:25:56Z`. Before deletion, the controller
required the exact instance name `pressly-recovery-drill-20260809-01` and this
exact three-entry tag map, rejecting any extra, missing, or different entry:

```text
pressly:purpose=recovery-drill
pressly:drill-id=20260809-01
pressly:source-sha=ad499be0d73f4b5e5112f8bf25660a642d02ec48
```

The exact drill-tagged disposable instance was deleted. Readback found zero
remaining drill instances, snapshots, static IPs, or custom keys. Instance
deletion removed the isolated synthetic record and drill-only routing.
Production DNS remained unchanged, no production volume was used, and no
retained backup, production resource, snapshot, or unrelated stopped instance
was removed. Exact cleanup also removed the private escrow tree, recovered
secret material, public-address state, SSH authority, TLS authority, and all
controller transient files; only mode-`0600` sanitized evidence/state and the
mode-`0700` controller scripts remain locally.

The authoritative sanitized evidence source for these H3 facts was the private
controller output `h3-evidence.json`, mode `0600`, captured on 2026-08-09 after
cleanup, with SHA-256
`1b461ea7c8d68bce3ab0a59dda3403cbe31282f8c73bd10c6cd3f494eb407c38`.
Its terminal authority is `phase=complete` and `cleanup=passed`. The raw
write-ahead phase marker intentionally remains `cleanup_in_progress`; controller
status resolves the terminal JSON first, and the cleanup fixture rejects a raw
marker as completion authority. The independently reviewed controller and
remote-script SHA-256 values were
`54dbe7c14038eabb6bf9b2fb0328eaf6ccaab49adf64717383ba5fb9e7b4e672`
and `8c4a39e9ec007c77bda5b1e1f3ede7aa1bf5b3f7c126660bab7d8e102f8623e8`,
respectively. Stateworks records only redacted operational results; the private
file, public address, credentials, secret values, customer data, and individual
secret hashes are not committed.

## V3 - Recovery hardening closure

Status: committed.

V3 reconciled every dependency and invariant at the evidence boundary:

- `V1` proves the repository rollback, restore, backup-authority, and failure
  behavior rather than inferring it from a healthy deployment.
- `H1` and `V2` prove protected-main publication, deployed stable scripts, and
  a natural hourly dual-destination backup rather than a manual-only schedule.
- `H2` proves approved objectives, independently administered immutable
  retention, non-root AWS recovery authority, current DNS administration, and
  freshly uploaded exact-release escrow without treating the regenerable
  writer key as secret custody.
- `H3` proves a real disposable replacement, exact-version restore, ordinary
  TOTP authentication, isolated non-PII write/read behavior, every health
  surface, measured RPO and RTO, and tag-bounded teardown.
- The H3 source SHA, escrow release identity, and all five image identities
  agree exactly. RPO and RTO derive from recorded UTC endpoints and satisfy the
  approved limits. Cleanup readback is terminal and contains no inferred
  absence claim.

```text
commands:
  pnpm stateworks:validate, stateworks:verify, and stateworks:next for:
    stateworks/work/done/production-recovery-hardening
    stateworks/work/active/lpms-production-readiness
    stateworks/work/active/pressly-control-workforce-identity
  prettier --check for the completed package and current moved-package cross-references
  git diff --check
  git diff --quiet ad499be0d73f4b5e5112f8bf25660a642d02ec48 -- . ':(exclude)stateworks/**'
exit: 0
time: 2026-08-09T12:40:20-04:00
summary: all three networks validated. Recovery reported done=yes, no stop reasons, zero ready tasks, and no next batch across 10 committed tasks. LPMS remained stopped at its human H1, and Control retained its existing next T3; neither separate package was advanced. Formatting and diff checks passed, and every repository change since the drilled ad499 source is confined to Stateworks. The isolated worktree lacked dependencies, so the commands used the dependency-bearing main checkout at exact ad499 to execute byte-identical Stateworks tooling against absolute paths in this worktree.
```

Separate vault-backed GoDaddy MFA recovery and Production Owner recovery codes
remain accepted nonblocking pre-launch debt. They are not represented as
present or tested. Existing LPMS launch, live-vendor, production-data, and pilot
gates remain separate and stopped on their own evidence; completing recovery
hardening does not advance them.
