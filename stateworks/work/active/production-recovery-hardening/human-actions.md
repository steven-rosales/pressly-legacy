# Production Recovery Hardening Human Actions

## Status

`H1` and `V2` are complete. The repaired release, stable operations bundle,
provisioned host identity, restore preflight, hourly dual-destination schedule,
and first natural 01:15 UTC execution are proven. Exact per-version 90-day
Object Lock COMPLIANCE retention and retrieval of the complete file-based
Bitwarden bundle are also proven. Anonymous exact-release access is proven, and
recovery-account administration makes the narrow writer regenerable. `H2`
remains pending only on read-only management-account access to the authoritative
DNS administration surface. `H3`, the existing LPMS launch gate, and the
live-vendor gates remain stopped.

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
configuration, release access, DNS access, and required recovery credentials in
an approved off-host store.

The merged secondary-destination support is only a repository prerequisite. It
can upload one encrypted triplet to independently verified primary and
secondary destinations and fails the operation unless every configured
destination passes remote readback. It does not create or configure the
secondary bucket, Object Lock, retention, encryption, IAM, or escrow, so `H2`
remains pending despite the approved objectives below.

### H2 partial evidence — 2026-08-08

- Owner: Steven.
- Approved RPO: one hour.
- Approved RTO: four hours.
- Approved immutable retention: 90 days in S3 Object Lock COMPLIANCE mode.
- Vault status: Steven confirmed completion of the Bitwarden baseline
  checklist: protected business vault, Pressly recovery collection and policy
  note, two-step login, and an offline recovery-code path. The complete
  recovery-material inventory and redacted retrieval proof remain pending.
- AWS status: the independently administered account, Object-Locked bucket,
  least-privilege writer, dual-destination readback, and secondary restore
  preflight are proven as described below. Exact per-version retention is now
  also proven.

These decisions alone approve the target policy; the external evidence below
proves independent backup custody and preflight recoverability. Complete secret
escrow and retrieval remain separate. No credential, recovery code, DSN,
payload, or secret value is recorded here.

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
  Lightsail SSH-key portion. The later credential-free release and
  regenerable-writer proof satisfies two remaining non-file paths; only
  management-account/DNS recovery access remains.

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
- This proves vault access, archive retrieval, and file-bundle integrity. It does
  not by itself prove the remaining non-file access paths listed above.
- After exact target validation, the two temporary Linux staging directories
  and workstation download were deleted and confirmed absent. The Bitwarden
  attachment remains authoritative; ordinary deletion is not claimed as
  forensic media erasure.

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
- Remaining `H2` action: provide redacted, read-only proof that Steven can enter
  management account `088594414587` and reach the authoritative DNS
  administration surface. Do not mutate DNS.

Record only owners, dates, objective values, retention, access-boundary facts,
and redacted outcomes. Never record a secret value in this package.

## H3 - Replacement-instance drill

After `H1` and `H2`, build a disposable replacement instance, recover the exact
release and configuration from escrow, restore a verified backup, prove writes
and all public health surfaces through isolated routing, measure achieved RPO
and RTO, and remove only the drill resources.

## Evidence template

- Date:
- Owner:
- Source SHA:
- Workflow/run identifiers:
- Approved RPO:
- Approved RTO:
- Immutable retention and independent-administration proof:
- Off-host escrow proof:
- Replacement backup timestamp:
- Achieved recovery point:
- Achieved recovery time:
- Redacted application write and health result:
- Disposable-resource cleanup result:
