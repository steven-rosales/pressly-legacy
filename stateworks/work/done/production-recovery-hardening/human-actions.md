# Production Recovery Hardening Human Actions

## Status

`H1`, `V2`, `H2`, `H3`, and `V3` are complete. The repaired release, deployed
natural hourly dual-destination backup, exact-version immutable retention,
independent administration, and exact-release Bitwarden custody are proven.
The replacement-instance drill freshly retrieved and verified that escrow,
restored the latest complete immutable triplet available at drill start,
authenticated the Production Owner with ordinary TOTP, exercised an isolated
synthetic non-PII write and authoritative read, passed every public health
surface, met the approved RPO and RTO, and removed every drill-owned cloud
resource.

No further human action is required by this package. Separate vault-backed
GoDaddy MFA recovery and Production Owner recovery codes remain accepted
nonblocking pre-launch debt and are not claimed as present or tested. The
existing LPMS launch, live-vendor, production-data, and pilot gates remain
stopped under their own package.

## H1 - Publish the repaired release

After `V1`, review the rollback and restore diff, publish it only through
protected `main`, and observe strict CI, CodeQL, immutable artifact publication,
normal deployment, and public health for one exact source SHA. Do not run a live
restore simply to exercise the runbook. Independently verify the production
static IP and four HTTPS health URLs, then install the runbook's
`/etc/pressly/host-identity.json` root-owned and mode `0644`; record only its
checksum and redacted authority facts, never secret material. `V2` must prove
the stable restore entrypoint accepts that identity with `--preflight-only`
against an approved backup before recovery readiness is claimed.

### H1 evidence — 2026-08-08

- Source SHA: `a44216cf83223225ab1caeb32a1e20d616ccce47`
- Main CI: `31271988560` succeeded.
- CodeQL: `31271988452` succeeded.
- Production deployment: `31273257568` succeeded.
- Release result: repository HEAD, current-release metadata, deployment state,
  and `/opt/pressly/ops/current` agreed with the exact source SHA.
- Runtime result: all seven Compose services were running, all six defined
  container health checks were healthy, Caddy was running, and the four pinned
  public HTTPS health authorities returned HTTP 200.
- Host identity: root-owned, group `root`, mode `0644`, SHA-256
  `31032a9bfd414b438359bb96c5d3a75bea6beaae6762b34d7a43eb771d25865e`.
- Restore admission: the stable `--preflight-only` path accepted the approved
  `pressly-20260808T052558Z.dump.gpg` backup. It did not restore data, create a
  recovery journal, or leave an operational lock held.

## H2 - Approve objectives and independent custody

Approve explicit RPO and RTO values. Provision an independently administered,
encrypted, Object-Locked secondary backup boundary for which the production
host has no delete authority. Escrow the backup passphrase, runtime
configuration, release access, and required application recovery credentials
in an approved off-host store. Separately prove the current AWS and
authoritative-DNS administration paths without recording credentials.

The merged secondary-destination support is only a repository prerequisite. It
can upload one encrypted triplet to independently verified primary and
secondary destinations and fails the operation unless every configured
destination passes remote readback. It does not create or configure the
secondary bucket, Object Lock, retention, encryption, IAM, or escrow, so it did
not complete `H2` by itself; the later external evidence does.

### H2 partial evidence — 2026-08-08

- Owner: Steven.
- Approved RPO: one hour.
- Approved RTO: four hours.
- Approved immutable retention: 90 days in S3 Object Lock COMPLIANCE mode.
- Vault status at this evidence point: Steven confirmed completion of the Bitwarden baseline
  checklist: protected business vault, Pressly recovery collection and policy
  note, two-step login, and an offline recovery-code path. The file-bundle
  inventory and retrieval were proven later. Fresh exact-`ad499be0` custody and
  Production Owner password/ordinary-TOTP availability were then proven by the
  terminal H2 evidence below.
- AWS status: the independently administered account, Object-Locked bucket,
  least-privilege writer, dual-destination readback, and secondary restore
  preflight are proven as described below. Exact per-version retention is now
  also proven.

These decisions alone approve the target policy; the external evidence below
proves independent backup custody and preflight recoverability. Secret escrow
and retrieval are separate evidence boundaries. No credential, recovery code,
DSN, payload, or secret value is recorded here.

### H2 partial external evidence — 2026-08-09

- Recovery account: independently administered AWS Organizations member
  `067200612921`, with non-root Identity Center access and centralized member
  root-credential management.
- Bucket: private, account Block Public Access enabled, ownership enforced,
  versioned, `AES256`, Object Lock enabled, and default retention configured for
  90-day `COMPLIANCE` mode.
- Writer: no-console, least-privilege host identity restricted to required
  upload/readback operations under `postgres/`; deletion and retention mutation
  are denied. The owner-only host profile passed STS and expected-owner readback.
- Recoverability: one manual encrypted triplet reached both destinations. Each
  current secondary GET was bracketed by the same immutable VersionId before and
  after transfer; the downloaded triplet passed stable restore
  `--preflight-only`, and the secure temporary copy was removed. This does not
  claim a version-pinned GET. A later natural hourly run produced a second
  complete dual-destination triplet with matching version-bracketed size, hash,
  and encryption readback.
- Immutable retention: all three current manual-triplet versions independently
  reported SSE-S3, exact sizes, `COMPLIANCE`, and 90-day retain-until timestamps:
  `2026-11-07T00:56:17Z`, `2026-11-07T00:56:18Z`, and
  `2026-11-07T00:56:19Z`. Their exact VersionIds match the upload/readback and
  restore-preflight evidence in `evidence.md`; bucket defaults were not used as
  a substitute for object-version proof.
- At this evidence point, the off-host recovery-material inventory and redacted
  retrieval test were incomplete. The file-based archive retrieval below
  satisfies the backup passphrase, runtime configuration, release identity, and
  Lightsail SSH-key portion for its dated release. The later credential-free
  release and regenerable-writer proof close those two recovery dependencies.
  The dated AWS and GoDaddy access proof below is separate. Fresh
  exact-`ad499be0` custody and Production Owner password/ordinary-TOTP
  availability are proven by the later terminal H2 evidence.

### H2 Bitwarden bundle retrieval — 2026-08-09

- One 30,720-byte archive was downloaded from Bitwarden to a separate
  workstation and matched the source archive byte-for-byte at SHA-256
  `d727ed2d1a4ec3276d4e86cc1c540bee3a8bd1133ecc86570d002e1ccc7655ee`.
- Its 15 members were the 11 `/opt/pressly/env` runtime files,
  `backup-passphrase.txt`, `current-release.json`, the Lightsail private key, and
  `SHA256SUMS`.
- The local retrieved archive was mode `0600`; isolated verification directories
  were mode `0700`; all 14 protected members passed strict checksum validation.
  No file contents or individual secret hashes were emitted.
- This proves vault access plus retrieval and integrity of that dated 15-member
  file bundle. It does not prove a fresh roundtrip for a later deployed release
  or Production Owner password and ordinary-TOTP availability.
- After exact target validation, the two temporary Linux staging directories
  and workstation download were deleted and confirmed absent. The Bitwarden
  attachment remains authoritative for that dated file bundle; ordinary
  deletion is not claimed as forensic media erasure.

### H2 regenerable-access proof — 2026-08-09

- Every digest-pinned image in the exact deployed
  `bc0987b98f746cab5d2a97f91c5e3f7892561bb6` release accepted an anonymous
  manifest inspection from an empty, mode-`0700` Docker configuration with no
  `config.json`.
- With system and global Git configuration disabled and every credential prompt
  suppressed, anonymous `ls-remote` matched public `main` to exact
  `bc0987b98f746cab5d2a97f91c5e3f7892561bb6`, and an anonymous depth-one fetch
  of that exact SHA succeeded. No GitHub or GHCR recovery credential is
  required.
- Steven exercised non-root Identity Center `AdministratorAccess` in recovery
  account `067200612921` to open the exact immutable objects and report their
  per-VersionId retention. That administrator can read retained versions and
  create or rotate a replacement least-privilege writer. Retrieving the current
  long-lived writer key is not a recovery gate and would be unsafe ceremony;
  this does not authorize deleting a credential still used by production.
- The exact deployed release above is a dated 2026-08-09 snapshot, superseded for
  the planned drill by exact `ad499be0d73f4b5e5112f8bf25660a642d02ec48`.

### H2 independent administration proof — 2026-08-09

- Steven authenticated through IAM Identity Center as the non-root subject
  `steven`. Read-only STS results returned management account `088594414587` and
  recovery account `067200612921`; both sessions used the
  `AWSReservedSSO_AdministratorAccess` role class. No root credential or role
  suffix is recorded.
- Steven opened the GoDaddy DNS administration page for `trypressly.com`, saw
  record-edit controls, and observed `ns17.domaincontrol.com` and
  `ns18.domaincontrol.com`. An independent authoritative DNS query returned the
  same two nameservers. No DNS record was changed.
- Steven explicitly chose to defer a separate vault-backed GoDaddy MFA-recovery
  method until later. This is accepted nonblocking pre-launch debt, not a proven
  recovery control.

### H2 terminal custody and Owner proof — 2026-08-09

- The locally verified mode-`0600`, 40,960-byte archive
  `pressly-recovery-bundle-ad499be0-20260809T145331Z.tar` contains the exact
  15-member inventory for deployed source
  `ad499be0d73f4b5e5112f8bf25660a642d02ec48`; all 14 protected members passed
  checksum verification. Its whole-archive SHA-256 is
  `5f620640716df4569b4b3afa86a07929485c806762d15e2bc56ba7d09ef04523`.
- Steven uploaded that exact fresh attachment to Bitwarden. The validated local
  archive and its staging directory were then deleted and confirmed absent, so
  the vault is the off-host copy. The earlier byte-identical Bitwarden retrieval
  proves the retrieval path; H3 must freshly download and reverify this exact
  attachment before using it.
- Steven confirmed the current Pressly Production Owner password is available
  and its ordinary TOTP is in Google Authenticator. No password, seed, TOTP
  value, or account identifier is recorded.
- Steven deferred a separate Production Owner recovery-code path as accepted
  nonblocking pre-launch debt. It is not claimed as present, and H3 must still
  authenticate with ordinary TOTP rather than a recovery code.

Do not paste a password, passkey, TOTP seed, TOTP value, recovery code, session
credential, customer identifier, or DNS record value into Stateworks, Git,
terminal output, screenshots, or agent messages.

Record only owners, dates, objective values, retention, access-boundary facts,
and redacted outcomes. Never record a secret value in this package.

## H3 - Replacement-instance drill

### H3 evidence - 2026-08-09

- Owner: Steven, with the drill controller providing sanitized verification.
- Drill: uniquely named and tagged `20260809-01` disposable replacement.
- Exact source:
  `ad499be0d73f4b5e5112f8bf25660a642d02ec48`, with all five immutable image
  identities recorded in `evidence.md`.
- Fresh escrow: the 15-member archive was retrieved after the RTO clock
  started; its whole-archive checksum, aggregate inventory, all 14 protected
  members, and `current-release.json` matched the exact drilled release. No
  member contents or individual secret hashes were recorded.
- Selected recovery point: latest complete exact-version immutable triplet
  `pressly-20260809T141503Z.dump.gpg` plus checksum and metadata; every version
  reported `AES256` and Object Lock `COMPLIANCE` retention.
- Approved RPO: 3,600 seconds. Achieved RPO: 3,315 seconds (55 minutes 15
  seconds), passed.
- Approved RTO: 14,400 seconds. Achieved RTO: 4,492 seconds (1 hour 14 minutes
  52 seconds), passed.
- Restore: exact deployment admission, database schema and role validation,
  all seven runtime containers, and API, Web, Processor, and Control HTTPS
  health passed through isolated routing. Production DNS was unchanged and no
  production volume was used.
- Application: ordinary-TOTP Production Owner authentication passed; a
  synthetic non-PII write returned HTTP 201, authoritative read returned HTTP
  200, logout returned HTTP 200, and the revoked session was rejected with HTTP 401.
- Cleanup: before deletion the controller required exact instance name
  `pressly-recovery-drill-20260809-01` and the exact three-entry ownership map
  `pressly:purpose=recovery-drill`, `pressly:drill-id=20260809-01`, and
  `pressly:source-sha=ad499be0d73f4b5e5112f8bf25660a642d02ec48`.
  Tag-bounded teardown completed at `2026-08-09T16:25:56Z`; readback found zero
  drill instances, snapshots, static IPs, or custom keys, and exact cleanup
  removed private and transient controller state.

Do not paste or add credentials, application account identifiers, TOTP
material, recovery codes, public addresses, customer data, or individual secret
hashes to this completed package.
