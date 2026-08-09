# Production Recovery Hardening

## Purpose

Close the final recovery-path defects found after the first healthy production
deployment. Dated readback on 2026-08-09 found the deployed platform healthy;
this package concerns what happens when a release, migration, host, or primary
database is not.

## Outcomes

- A failed unverified deployment can be rolled back to an exact prior release
  without losing either the unresolved runtime identity or rollback target.
- Migration execution is conservatively classified as runtime-affecting before
  the database can mutate.
- Recovery restores an encrypted backup into a clean candidate database,
  reapplies roles and grants, runs release-compatible migrations, validates the
  result, and promotes it without colliding with existing `public` or `drizzle`
  objects.
- Backup execution remains authoritative when Sentry or its configuration is
  unavailable; telemetry is bounded and best effort.
- Recovery objectives, immutable secondary storage, off-host secret custody,
  and a full replacement-instance drill remain explicit human gates.

## Non-Goals

- No production release, rollback, restore, host replacement, bucket mutation,
  or secret movement is performed by repository verification.
- Repository verification alone does not prove that a deployed backup schedule
  satisfies an approved business RPO.
- The existing launch and live-vendor gates remain stopped.

## Current External Baseline

On 2026-08-09, the hourly-capable five-image release at exact source SHA
`d7dde6755b7d8c09b81692384a546172fa2651f0` passed protected-main CI, CodeQL,
artifact publication, normal deployment, exact host readback, and public
verification. Its stable runner dispatched the first natural hourly backup at
01:15 UTC, completed one encrypted triplet at both destinations, reported one
natural successful Sentry check-in, and left production stable: all seven
Compose services were running, the six defined container health checks were
healthy, Caddy was running, and the four pinned public health authorities
returned HTTP 200. A preceding manual dual backup also passed secondary
readback and the stable restore `--preflight-only` path without restoring data
or creating a recovery journal.

At the 2026-08-09 observation point, the immediately following
deployment-monitor release at exact source SHA
`bc0987b98f746cab5d2a97f91c5e3f7892561bb6` passed the same protected release
ladder, emitted one real deployment start-to-success check-in, and preserved the
verified hourly cron and secondary-destination bindings. This proves `H1` and
`V2`. The one-hour RPO, four-hour RTO, and 90-day Object Lock COMPLIANCE policy
are approved, and exact 90-day COMPLIANCE retention is independently proven for
all three versions of the manual secondary triplet. Bitwarden retrieval proves
the dated 15-member file bundle, including runtime environments, backup
passphrase, release identity, and the Lightsail SSH key. Anonymous readback of
all five exact image manifests and anonymous Git fetch of the exact source prove
that release recovery needs no stored registry or repository credential.
Independent recovery-account administration can read the immutable versions
and create or rotate a replacement narrow writer, so retaining the current
long-lived writer key is not a recovery prerequisite. Dated non-root IAM
Identity Center readback now proves Steven can assume `AdministratorAccess` in
both management account `088594414587` and recovery account `067200612921`.
Steven also opened the `trypressly.com` GoDaddy DNS administration surface,
confirmed record-edit controls, and observed the same authoritative
`ns17.domaincontrol.com` and `ns18.domaincontrol.com` nameservers returned by an
independent DNS query. He explicitly deferred separate vault-backed GoDaddy MFA
recovery and Production Owner recovery-code methods as accepted nonblocking
pre-launch debt; neither backup method is claimed as proven.

`H2` is committed. The locally verified 15-member archive for exact deployed
release `ad499be0d73f4b5e5112f8bf25660a642d02ec48` was uploaded to Bitwarden;
the exact local archive and staging directory were then deleted and confirmed
absent, leaving the vault as the off-host copy. Steven separately confirmed the
Production Owner password is available and its ordinary TOTP is held in Google
Authenticator without disclosing any value. H3 must freshly retrieve and verify
the attachment before use. `H3` and `V3` remain pending and dependency-gated
behind `H2` and `H3`, respectively.
