# Historical Design QA Baseline (pre-T7A/T7B)

This document records rendered evidence gathered before the current T7A
cross-application browser-verification and T7B layered-verification tasks were
added to the work network. It is a historical baseline, not current evidence
that V1 is complete.

## Historical result

Passed on 2026-07-30 in an isolated local environment. No production host,
production database, customer data, or production credential was used.

The rendered pass covered:

- Control login, password submission, privileged MFA gating, MFA enrollment,
  and the post-MFA capability expansion;
- Home, Team, Security, Customers, and Orders at `1440x1000`;
- the same Control shell, navigation, forms, sheets, tables, and security
  history at `390x844`;
- customer creation and correction review;
- order creation and correction review, including the shared shadcn calendar;
- operator invitation issuance, one-time-link acceptance in a clean browser,
  immediate URL-fragment scrubbing, single-use rejection, and the operator
  handoff to Processor;
- Control-to-Processor and Processor-to-Control application switching;
- app-specific sessions: switching applications did not silently reuse the
  other host's session;
- capability-shaped Processor navigation for an operator and the broader
  owner navigation;
- shared-device lock / employee switching in Processor;
- keyboard submission, initial focus, menu semantics, Escape dismissal, modal
  focus containment, internal workspace scrolling, sheet scrolling, and
  mobile table scrolling.

No unresolved blocker was recorded for that historical pass. Current V1 still
depends on T7A and T7B and requires fresh evidence against the amended network.

## Rendered regressions found and corrected

### Successful login could remain stuck in development

React Strict Mode intentionally replays effects. The authentication hook's
cleanup marked the hook unmounted, but the replayed effect did not mark it
mounted again. A successful `200` login could therefore remain on the loading
state in development.

The hook now restores its mounted flag whenever the effect starts. A focused
Strict Mode regression test proves that a successful login reaches the
authenticated state and clears the busy state.

### Safe server errors were replaced with an unreadable-response message

The Control response decoder used a strict error-envelope schema that omitted
the server's trace ID. Valid application errors therefore failed decoding.
This was visible when a consumed one-time invitation returned a correct
conflict response but Control displayed a generic unreadable-response message.

The decoder now accepts the bounded optional trace ID while continuing to
reject unknown or malformed envelopes. A focused regression test proves that
the safe server message, status, and error code survive decoding. A consumed
invitation now renders the intended no-longer-available recovery state.

## Visual evidence

Regenerable local artifacts are under
`.artifacts/playwright/pressly-control-workforce-identity/`. The directory is
ignored by Git so raw browser output cannot be committed accidentally; this
document retains the durable QA conclusions.

Representative desktop evidence:

- `01-control-login-desktop.png`
- `02-control-security-pre-mfa.png`
- `03-control-security-mfa-enabled.png`
- `04-control-app-switcher.png`
- `06-control-customers-created.png`
- `07-control-customer-detail.png`
- `09-control-orders-created.png`
- `10-control-order-detail.png`
- `12-control-team-invitation.png`
- `13-control-invitation-bootstrap.png`
- `14-control-invitation-success.png`
- `15-processor-owner-shell.png`
- `28-control-team-member-created-desktop.png`

Representative mobile evidence:

- `16-control-team-mobile.png`
- `17-control-mobile-nav-switcher.png`
- `18-control-customers-mobile.png`
- `19-control-customers-mobile-table-scroll.png`
- `20-control-orders-mobile.png`
- `21-control-order-form-mobile.png`
- `22-control-order-form-mobile-scroll.png`
- `23-control-calendar-mobile.png`
- `24-control-security-mobile.png`
- `25-control-home-mobile.png`
- `26-control-team-member-mobile.png`
- `27-control-team-member-mobile-scroll.png`

The mobile tables keep row integrity in their own horizontal scroll region;
the page itself has no horizontal overflow. The main workspace and long sheets
use independent vertical scroll regions, and both were exercised to their
maximum scroll positions.

## Mechanical evidence

The QA runtime used:

- a dedicated disposable PostgreSQL container bound only to loopback;
- a freshly migrated `pressly_qa` database;
- one synthetic owner, one synthetic operator invitation, one synthetic
  customer, and one synthetic order;
- local API, Control, and Processor servers on ports `4000`, `4174`, and
  `4173`;
- Playwright Firefox because a local Chrome binary was unavailable.

Focused regressions:

```text
pnpm -F @pressly/control exec vitest run test/authentication/use-authentication.test.tsx
pnpm -F @pressly/control exec vitest run test/team/invitation-api.test.ts
```

Package checks:

```text
pnpm -F @pressly/control typecheck
pnpm -F @pressly/control lint
pnpm -F @pressly/control test
pnpm -F @pressly/control build
```

The focused tests, typecheck, lint, full package tests, and production build
passed. Playwright reported zero browser-console errors and zero warnings
across the primary Control session, the invitation-acceptance session, the
single-use replay session, and the Processor owner session.

The only API warning was expected in the isolated development configuration:
Cents webhook authentication was deliberately disabled for the disposable
runtime. No unhandled exception or application error appeared.

## Boundaries

- This is local rendered and mechanical evidence, not production DNS,
  deployment, or email-delivery evidence.
- Firefox desktop and phone-sized viewports were exercised; a separate native
  assistive-technology audit and cross-browser matrix were not run.
- No raw invitation token, MFA setup secret, recovery code, password, customer
  payload, or production identifier is recorded in this work evidence.
