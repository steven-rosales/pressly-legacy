# Production Recovery Hardening Final Report

Status: active

Repository hardening, combined verification, protected-main publication,
deployment, host-identity provisioning, and stable restore preflight are
complete. The approved hourly schedule has also completed one natural encrypted
backup to both destinations with exact version, size, hash, encryption, Sentry,
and post-run health readback. No live restore was performed.

The one-hour RPO, four-hour RTO, and 90-day Object Lock COMPLIANCE policy are
approved. The independent account, narrow writer, dual upload/readback, and
secondary restore preflight are proven. Exact `COMPLIANCE` retention through
2026-11-07 is also proven for all three versions of the manual secondary
triplet. A byte-identical, checksummed Bitwarden retrieval proves the dated
15-member file bundle. All five exact image manifests and the exact source SHA are
anonymously accessible, so release recovery requires no stored GitHub or GHCR
credential. Proven recovery-account administration can read retained versions
and create or rotate a replacement narrow writer, so retrieval of the existing
writer key is not a recovery prerequisite. Dated IAM Identity Center readback
now proves non-root `AWSReservedSSO_AdministratorAccess` for Steven in management
account `088594414587` and recovery account `067200612921`. Current GoDaddy
administration is also proven: Steven opened the `trypressly.com` DNS surface,
saw record-edit controls, and observed the same `ns17.domaincontrol.com` and
`ns18.domaincontrol.com` authorities returned by an independent DNS query. No
DNS change occurred. Separate vault-backed GoDaddy MFA-recovery and Production
Owner recovery-code methods are explicitly accepted nonblocking pre-launch debt
and are not claimed as present.

`H2` is committed. The locally verified 15-member bundle for exact deployed
release `ad499be0d73f4b5e5112f8bf25660a642d02ec48` was uploaded to Bitwarden;
its validated local archive and staging directory were then deleted and
confirmed absent, leaving the vault as the off-host copy. Steven confirmed the
current Pressly Production Owner password is available and its ordinary TOTP is
held in Google Authenticator without disclosing a value. The prior
byte-identical retrieval proves the vault path; H3 must freshly download and
reverify this exact attachment before recovery use.

This report remains intentionally incomplete until the replacement-instance
drill measures RPO and RTO, proves ordinary-TOTP Owner authentication, isolated
non-PII write/read behavior and all health surfaces, and removes every
drill-owned resource. `H3` and `V3` remain pending, with V3 dependency-gated
behind H3.
