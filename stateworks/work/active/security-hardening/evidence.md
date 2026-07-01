# Security Hardening Evidence

## Work

- Work ID: `security-hardening`
- Network: `stateworks/work/active/security-hardening/network.yaml`
- Started: `2026-07-01`
- Finished: pending

## MFA Enrollment

- Status: complete for the production owner identity.
- Date observed: `2026-07-01`
- Environment: production
- Principal: production owner
- Email: redacted in repo
- Identity ID: redacted in repo

## MFA Proof

Observed sequence:

1. Owner login to `https://api.trypressly.com` succeeded before MFA enrollment.
2. `pnpm admin auth mfa-enroll` started MFA enrollment and returned a TOTP secret plus authenticator URI.
3. The TOTP secret was added to Google Authenticator.
4. `pnpm admin auth mfa-confirm --code [redacted]` succeeded.
5. The CLI returned 10 MFA recovery codes.
6. Recovery codes were stored offline by the owner and are not stored in this repository.
7. Logout succeeded.
8. Login with password plus `--mfa-code [redacted]` succeeded.
9. `pnpm admin auth session` showed an active owner session.

## Secret Handling

Not stored in the repository:

- Owner password
- TOTP secret
- Authenticator URI
- MFA verification code
- MFA recovery codes
- Full production owner email
- Full production identity ID

## Open Risks

- The production owner password appeared in a local terminal transcript during setup.
  Rotate it once the password-change or reset path is available.
- MFA recovery-code login has not been drilled yet.
  Test one recovery code only when ready to consume it, because recovery codes should be single-use.
