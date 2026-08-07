# Pressly Control And Workforce Identity

## Purpose

Create a secure Pressly management plane for workforce access, customers, and
orders while preserving Processor as the focused laundry-floor execution
surface.

## Confirmed Product Shape

- `control.trypressly.com` is the Pressly Control application for owners and
  authorized managers.
- Processor and Control use one canonical Auth authority, but each browser
  application keeps its own Secure, HttpOnly, host-scoped session boundary.
- Control owns team access, customer management, canonical order management,
  locations, and account security.
- Processor owns physical intake, scheduling, and production execution.
- The top-left Pressly product identity provides an authorization-aware switch
  between Processor and Control.
- Control uses the same shadcn, Tailwind, typography, spacing, tables, forms,
  drawers, and interaction language as Processor.

## Domain Shape

- Auth owns the identity security aggregate: credentials, MFA, sessions,
  workforce membership, invitations, and scoped grants. Keeping these
  transitions in one transaction avoids a split authority boundary during
  invitation acceptance and offboarding.
- Workforce membership still remains a distinct concept inside that aggregate:
  it owns a human's relationship to one Pressly business.
- Scoped access grants remain independently versioned and auditable; they own
  roles and location authority without becoming customer profiles.
- Users owns canonical customer profiles and remains independent of login.
- Orders owns canonical commercial orders and fulfillment release.
- Production consumes only canonical source-neutral fulfillment events.

## Architecture Authority

- `modules/experience/control` owns Control-specific cross-domain application
  orchestration, business/location scoping, capabilities, application
  destinations, and Control projections.
- Identity, Users, and Orders remain independent authorities. The API
  composition root adapts their public capabilities to narrow Control-owned
  ports; the Control Experience module imports no peer module package.
- `apps/api/src/http/control` owns HTTP validation and presentation plus
  cookie/session/CSRF mechanics. It does not own Control business policy.
- `apps/control` consumes serialized Control contracts and owns presentation
  state only.
- Expected peer rejections are classified into typed Control failure data at
  the API composition edge. Unexpected database, invariant, configuration, or
  programming failures remain throwable `AppError` values and are never
  disguised as expected `Result` data.
- Control language uses semantic roles, not transport convenience: workforce
  grant, invitation, and membership are entities because their identities
  continue across lifecycle changes; access manifests, snapshots, details,
  pages, lists, and mutation outcomes are models; role, scope, state, and actor
  reference are values. `Record` is reserved for an actual representation
  record, while date-rich peer application values use `Snapshot`.

## Security Posture

Security is deliberately strong at authority boundaries and proportionate to a
small operational business:

- Single-use hashed invitation tokens with bounded expiry.
- Deny-by-default authorization and server-computed selected-location
  capabilities.
- Mandatory MFA assurance for owner and manager privilege mutations.
- Immediate session revocation after suspension, credential changes, or
  security-sensitive offboarding.
- Last-owner protection, no self-escalation, no grant beyond the caller's
  scope, and exact business/location checks.
- Idempotent and versioned lifecycle commands with safe audit events.
- App-specific cookies, exact-origin CSRF checks, rate limits, safe headers, and
  no secrets or raw invite tokens in logs or durable evidence.
- Operators keep a low-friction login path; MFA may be enrolled without making
  routine floor execution cumbersome.

## Authoritative Graphs

```text
invitation:
pending -> accepted
pending -> revoked
pending -> expired

workforce membership:
active -> suspended
suspended -> active
active|suspended -> ended

access grant:
active -> revoked|expired
```

The kernel state-machine definition owns graph decisions. Controllers, UI,
repositories, and adapters do not define parallel transitions.

## Non-Goals

- No JWT/OIDC migration while Pressly remains one deployable modular monolith.
- No independent Auth service.
- No generalized SaaS tenant RLS before a second real business requires it.
  Business ancestry, composite database constraints, mandatory query
  predicates, and IDOR tests are required now.
- No driver execution app, customer checkout, payment system, or email-delivery
  platform in this work.
- No shared employee password and no owner-selected temporary password.
- No direct Control write into Production tables or lifecycle state.

## Existing Worktree Boundary

Pre-existing unrelated changes under infrastructure scripts, marketing assets,
SEO documentation, and local scratch paths are user-owned and excluded from
this work.
