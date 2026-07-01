# Human Actions

## Complete

- `H1` Configure Sentry projects, secrets, and alert destinations.

## Instructions

Do not paste secrets, DSNs, cookies, bearer tokens, MFA material, recovery codes, or raw request bodies into this file.

When the repo-side work reaches `H1`, record only redacted proof:

- API Sentry project name or redacted identifier.
- Web Sentry project name or redacted identifier.
- Alert rule names.
- Alert destination name.
- One redacted test-event result.
- Confirmation that PII and request-body collection are disabled or minimized.

## Redacted Proof

- Human confirmed Sentry setup is complete for `pressly-api` and `pressly-web`.
- Human confirmed advanced data scrubbing is configured for both projects.
- Human confirmed alert rules are configured for critical API and Web failures.
- Redacted Sentry test notification observed:
  - Project: `pressly-api`
  - Issue type: new issue
  - Issue title: `Test Issue Test notification`
  - Event ID: `d6e13c4553194181b3f69615c8830472`
  - Timestamp: `2026-07-01T15:51:59Z`
  - Level: `error`
  - Trigger: Issue Stream notification
