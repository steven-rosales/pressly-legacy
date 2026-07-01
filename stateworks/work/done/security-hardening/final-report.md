# Final Report

## Status

Complete on `2026-07-01`.

## Proof Recorded

- Production owner MFA enrollment and MFA login.
- Offline storage of MFA recovery codes.
- Encrypted S3 backup upload with SHA-256 verification.
- Isolated restore drill from a real production backup.
- Digest-based rollback drill, including return to the original release.
- Failed deployment guard using an invalid manual deployment SHA.
- Public firewall, DNS, TLS, health, and security-header checks.
- Lightsail automatic snapshots with recent daily snapshots.
- Sentry runtime alert and GitHub failed deployment notification delivery.
- Rollback-versus-restore tabletop decision note.

## Main Evidence

- `stateworks/work/done/security-hardening/evidence.md`
- `stateworks/work/done/security-hardening/human-actions.md`
- `stateworks/work/done/security-hardening/state.yaml`

## Remaining Follow-Up

- Rotate the production owner password once the password-change or reset path exists.
- Drill one MFA recovery-code login only when ready to consume a single-use recovery code.
- Restrict SSH port `22` to a controlled source when operationally practical.
