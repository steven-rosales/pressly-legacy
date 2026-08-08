# Production Recovery Hardening Human Actions

## Status

No production recovery action should run yet. Repository implementation and
verification must complete at `V1` first. The existing LPMS launch and vendor
gates remain stopped.

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

## H2 - Approve objectives and independent custody

Approve explicit RPO and RTO values. Provision an independently administered,
encrypted, Object-Locked secondary backup boundary for which the production
host has no delete authority. Escrow the backup passphrase, runtime
configuration, release access, DNS access, and required recovery credentials in
an approved off-host store.

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
