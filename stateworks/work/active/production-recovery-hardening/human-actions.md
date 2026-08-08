# Production Recovery Hardening Human Actions

## Status

`H1` is complete. The repaired release, stable operations bundle, provisioned
host identity, and restore preflight are proven for one exact source SHA. `V2`
is running and must remain open until the first natural 03:15 UTC backup under
the deployed runner is observed. `H2`, `H3`, the existing LPMS launch gate, and
the live-vendor gates remain stopped.

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
- Runtime result: all seven Compose services were healthy and the four pinned
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
  least-privilege writer, retained-object readback, and secondary restore proof
  remain pending.

These decisions approve the target policy; they do not prove custody or
recoverability. No credential, recovery code, DSN, payload, or secret value is
recorded here.

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
