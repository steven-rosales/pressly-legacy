# Evidence

## Work

- Work ID: `pressly-control-workforce-identity`
- Network:
  `stateworks/work/active/pressly-control-workforce-identity/network.yaml`
- Started: `2026-07-29`
- Finished: In progress

## T0 — Reconcile identity, security, order, and UI baselines

### Observed implementation

- Auth already owns identities, password credentials, hashed opaque sessions,
  MFA credentials and challenges, login attempts, audit events, and scoped role
  assignments in `packages/db/src/schema/auth.schema.ts`.
- Session loading re-reads current role assignments on every request in
  `modules/security/identity/src/features/sessions/load-session/load-session.repo.ts`; this is the
  correct revocation and capability-truth foundation and does not require JWT
  or an independent Auth service.
- Current roles omit `manager`; current scopes omit a business/account scope.
  A global owner or admin is consequently deployment-wide rather than
  business-scoped.
- `modules/policy/access-control/src/production/production.policy.ts` currently
  treats owner/admin as management and owner/admin/operator as floor roles.
  `modules/policy/access-control/src/order-management/order-management.policy.ts`
  exposes only broad customer-write and order-write actions.
- Privileged MFA is conditional on an already-enabled credential in
  `modules/security/identity/src/features/sessions/login/login.usecase.ts`. A privileged identity
  without enrollment can still receive a password-assurance session.
- Processor's browser boundary has the correct basic shape:
  `apps/api/src/http/processor/session/processor-cookie.adapter.ts` uses
  host-only `__Host-` cookies with Secure, HttpOnly, SameSite Strict, and path
  `/`; `processor-csrf.policy.ts` uses an app-domain HMAC proof, exact Origin,
  and constant-time comparison.
- `processor-session.mapper.ts` discards assignment scopes and returns unique
  role strings. `apps/processor/src/app/app.tsx` then derives `canManage` from
  owner/admin role names. The server remains the final guard, but the browser
  can present controls that are not authorized for the selected location.
- Production command adapters still record synthetic effective roles in
  `modules/business/production/src/features/scheduling/place-order`,
  `manage-batch-membership`, and `route-production-order`, rather than one
  authenticated actor plus the exact authorized action context.
- Canonical customer profiles live in `modules/business/users` and
  `packages/db/src/schema/users.schema.ts`. They are not workforce identities.
  `authIdentities.userId` is an optional explicit link and must never be
  inferred from matching email or phone.
- Canonical Orders already support first-party commands and source-neutral
  fulfillment in `modules/business/orders`, but Users and Orders have no
  management-plane list/detail slices and no business ancestry. Fulfillment
  `locationId` is not constrained to a business-owned Production location.
- Processor is a Vite, React, Tailwind v4, shadcn `radix-nova`, Tabler, and
  Inter application. The public Web application uses a different Next.js UI
  system. Control therefore belongs beside Processor as `apps/control`, not
  inside `apps/web`.
- Production deployment is a SHA-pinned immutable image set. Caddy,
  production Compose, CI artifact creation, release manifests, deploy tooling,
  topology smoke tests, and revision checks currently assume Web, API, Worker,
  and Processor; Control must be added to the whole release set.
- Stateworks overlap is explicit:
  `stateworks/work/queued/future-distributed-authentication` keeps distributed
  OIDC/JWT work gated, while
  `stateworks/work/done/security-hardening` supplies the current browser,
  database, deployment, and audit baseline. No other active work owns the
  Control or workforce surface.

### Architecture decision

- Auth owns one identity security aggregate containing identity, credentials,
  MFA, sessions, workforce memberships, invitations, and scoped grants. This
  keeps invitation acceptance and offboarding atomic. Membership, invitation,
  and grant remain distinct stateful concepts inside that aggregate.
- Add a small business-account root and required business ancestry for
  Production locations, customers, Orders, and fulfillments before exposing
  Control lists. For the current one-business deployment, composite constraints,
  mandatory query predicates, and IDOR tests are proportionate; a generalized
  RLS program remains deferred until real multi-business adoption.
- Users and Orders remain peer business modules. Control composes Auth, Users,
  and Orders through their public ports; it never writes Production tables.
- Build Control as a separate Vite SPA with its own host-only browser session.
  Extract only shared semantic tokens, primitives used by both apps, and a
  localization-agnostic workspace shell. Preserve Processor geometry and
  feature ownership rather than moving every local UI primitive at once.
- Return a server-evaluated app/capability manifest for one selected business
  and location. Navigation may hide unavailable actions, but every API mutation
  re-evaluates authority inside the transactional use case.

### Proportional threat model and mandatory controls

| Threat                              | Current exposure                                                   | Required control and proof                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen invite or reset link         | No lifecycle exists yet                                            | At least 32 random bytes, keyed hash at rest, token bound to email/business/intended scope, fragment bootstrap, immediate history scrub, bounded expiry, transactional single use, reissue revokes the prior token, generic errors, and replay/race tests |
| Account takeover                    | Login throttling exists; privileged MFA is optional until enrolled | Privileged grants remain ineffective until MFA enrollment, fresh MFA for security mutations, bounded MFA attempts, password/reset recovery revokes sessions, and no manager-created temporary password                                                    |
| Privilege escalation                | Global owner/admin and broad actions                               | Business and location ancestry, explicit manager, use-case-specific actions, no self-escalation, manager-manages-operators-only, owner-only manager/owner changes, serialized last-owner rule, and policy-matrix tests                                    |
| Cross-business/location IDOR        | Canonical Users and Orders lack business scope                     | Actor/resource business and location come from authenticated context and persisted ancestry, never request-body authority; every list/detail/cursor/mutation is scoped and tested with wrong-business and wrong-location identifiers                      |
| CSRF or session leakage             | Processor boundary is sound; Control does not exist                | Separate `__Host-pressly-control-*` cookies and CSRF secret/domain, exact Control Origin, cookie-only browser boundary, no parent-domain cookie, no credentials in JavaScript storage or URLs, and no-store responses                                     |
| Shared floor device exposure        | Processor session defaults are long and no explicit lock exists    | A real Lock/Switch Employee action revokes the server session, clears cookies and in-memory/query state, shift-aware Processor lifetime, shorter Control idle lifetime, and back-navigation/browser-cache QA                                              |
| XSS or extension exposure           | Control CSP adoption gate is now real                              | Strict schemas and length limits, plain-text names/notes, no rich HTML, self-only script/connect policy, deny object/base/frame, form-action self, no analytics on invite/setup, no-referrer setup pages, and header verification                         |
| Replay or revoke-vs-command race    | Assignments have no lifecycle version/receipt                      | Versioned/idempotent invitation, membership, and grant commands; assignment re-check inside the transaction; session revocation in the same transaction; concurrency tests                                                                                |
| Audit or log leakage                | Auth audit exists but metadata discipline is per use case          | Immutable actor/subject/business/location/reason/version/field-name evidence only; never record token/link/hash, credential, recovery code, email, phone, address, or before/after PII payload                                                            |
| Destructive customer/Order mutation | Commands exist without a Control review surface                    | Narrow capabilities, expected version, reason code, confirmation for destructive state changes, append-only authority evidence, and no direct Control-to-Production target-state command                                                                  |

### UX/security balance

- Routine operator floor actions stay password-session friendly and do not
  repeatedly prompt during a production pulse.
- Owner and manager security mutations require current MFA assurance; a
  15-minute fresh-assurance window is a reasonable initial policy.
- Operators may self-enroll MFA, but MFA is mandatory before owner/manager
  capabilities become effective.
- The product switch is a normal same-window navigation from a constant,
  server-authorized destination allowlist. It never accepts a redirect URL and
  never carries a session or token. A user signs into each host independently
  until a real one-time-code SSO boundary is justified.
- Control uses a focused Team table/detail sheet, Customers table/detail sheet,
  and Orders table/create-review sheet. Order dates use the shared shadcn
  Calendar and Popover, never a native date input.

### Assumptions and deferred controls

- Assumption: the first release has one Pressly business account and one
  Production location, but every authority boundary is modeled explicitly so a
  second business cannot inherit deployment-global access.
- Assumption: automated invitation email is unavailable. A freshly
  MFA-authorized owner/manager may copy a one-time invite link once; the raw
  token is not stored by the browser.
- Deferred by explicit gate: OIDC/JWT, Auth microservice, shared-domain SSO,
  passkeys/badge/PIN, SCIM/SAML/social login, distributed policy engine,
  cryptographic audit chain, distributed rate-limit store, customer payments,
  and automated email delivery.
- The current single-process in-memory throttle is acceptable for the first
  Control release only when route-specific limits and monitoring exist; a
  shared limiter becomes mandatory before horizontal API replicas.

### Worktree boundary

- Preserved user-owned state:
  `docs/seo-skill.md` is deleted locally; `apps/web/public/marketing/`,
  `docs/agents/07/10/*.png`, and the local `\test` path are untracked.
- This work writes neither those paths nor customer/production runtime data.
- Initial review was read-only apart from this Stateworks work package.

## T1 — Establish identity-access memory and authoritative graphs

### Durable domain truth

- Added the `identity-access` Stateworks domain with one source session, one
  applied source-backed delta, validated memory version 2, and a generated
  context pack.
- The memory keeps Auth identity, workforce membership, invitation, access
  grant, application session, customer User, Order, and Production execution
  as distinct concepts.
- The accepted domain model records business/location ancestry, privileged MFA,
  atomic session revocation, last-owner protection, manager delegation limits,
  host-isolated application sessions, capability manifests, invitation secret
  handling, and shared-device lock policy.
- Context generation was deterministic:
  `e0102c52ef3c2843a93e7198c0663942501e5bfb67e7800037442fa15e88a292`
  before and after regeneration.

### Executable lifecycle truth

- `workforce-invitation.policy.ts` owns exactly:
  `pending -> accepted|revoked|expired`, with every destination terminal.
- `workforce-membership.policy.ts` owns exactly:
  `active -> suspended`, `suspended -> active`, and
  `active|suspended -> ended`, with `ended` terminal.
- `access-grant.policy.ts` owns exactly:
  `active -> revoked|expired`, with both destinations terminal.
- All three policies use `packages/kernel/src/state-machine.ts`; callers submit
  events and cannot supply a target state.
- Focused graph tests enumerate the edge lists, allowed events, invalid edges,
  and every event denial from every terminal state.

### Verification

```text
command: pnpm stateworks:memory:validate stateworks/memory/domains/identity-access/memory.yaml
exit: 0
time: 2026-07-29
summary: Identity Access memory version 2 is valid after delta application.

command: pnpm stateworks:memory:validate stateworks/memory/domains/identity-access/deltas/2026-07-29-control-workforce-identity.memory-delta.yaml
exit: 0
time: 2026-07-29
summary: Source-backed Identity Access delta is valid.

command: pnpm stateworks:memory:context identity-access
exit: 0
time: 2026-07-29
summary: Context pack regenerated twice with an identical SHA-256 digest.

command: pnpm -F @pressly/auth-module exec vitest run test/workforce/workforce-lifecycle-policies.test.ts
exit: 0
time: 2026-07-29
summary: 1 file and 4 lifecycle graph tests passed.

command: pnpm -F @pressly/auth-module typecheck
exit: 0
time: 2026-07-29
summary: Auth source and test TypeScript checks passed.
```

## T2 — Persist business, workforce, invitation, and manager authority

### Implemented authority

- Added the business account root and mandatory business ancestry for
  locations, workforce authority, canonical customers, Orders, fulfillments,
  and Production resources.
- Added persistent workforce memberships, invitations, scoped grants,
  lifecycle transitions, idempotency receipts, and business-aware audit
  ancestry.
- Added a forward-only migration that backfills the prelaunch business,
  preserves existing records, and enforces append-only lifecycle evidence plus
  serialized last-owner protection.
- Implemented invitation, membership, and access-grant commands through the
  Auth aggregate with advisory business locks, expected versions, scoped
  manager delegation, MFA rechecks, audit evidence, and session revocation.
- Runtime login and session loading now derive workforce authority only from
  current active membership and grant windows. Legacy workforce role
  assignments no longer compete with that authority.

### Verification

```text
command: pnpm --filter @pressly/db typecheck; pnpm --filter @pressly/db test; focused migration and database integration suites
exit: 0
time: 2026-07-29
summary: Database type checks passed; 41 schema and migration tests passed; focused last-owner and Production ancestry integrations passed.

command: pnpm --filter @pressly/auth typecheck; pnpm --filter @pressly/auth test
exit: 0
time: 2026-07-29
summary: Authorization primitives passed type checks and 63 tests.

command: pnpm --filter @pressly/auth-module typecheck && pnpm --filter @pressly/auth-module test
exit: 0
time: 2026-07-29
summary: Auth application type checks passed; 20 files and 123 unit tests passed in the combined verification run.

command: pnpm --filter @pressly/contracts test
exit: 0
time: 2026-07-29
summary: Fourteen contract files and 118 tests passed.
```

## T3 — Expose secure Control authentication and workforce administration

### Implemented boundary

- Added a host-isolated Control browser session using Secure, HttpOnly,
  SameSite=Strict `__Host-` cookies in production, exact-origin checks,
  cookie-only authentication, app-specific HMAC CSRF, no-store headers,
  conservative body limits, and per-IP plus per-identity throttles.
- Added server-derived business, location, capability, and authorized
  application manifests. Browser JavaScript receives no session credential or
  role-array authority.
- Added Control workforce and invitation routes backed by Auth use cases rather
  than direct database writes. Raw invitation tokens are returned only on the
  first successful issue or reissue response.
- MFA enrollment policy permits an authenticated worker to enroll their own
  credential without first possessing an impossible privileged MFA session.

### Verification and remaining integration gates

```text
command: pnpm --filter @pressly/api typecheck
exit: 0
time: 2026-07-29
summary: API source and test TypeScript checks passed.

command: pnpm --filter @pressly/api exec vitest run test/control/control-session.test.ts test/control/control-workforce.routes.test.ts test/security/rate-limit.middleware.test.ts
exit: 0
time: 2026-07-29
summary: Three files and 12 focused Control boundary, workforce route, and rate-limit tests passed.
```

- Open gate: existing identities with no current Control access need a narrow
  invitation-scoped credential/MFA bootstrap; ordinary Control login correctly
  refuses to mint a Control session before invitation acceptance.
- Open gate: business-scoped owners and managers need Control-owned session
  inventory/revocation routes. The existing global Auth session-administration
  policy is intentionally not weakened or reused.

## T4 — Create the shared shadcn design foundation and Control shell

### Implemented design and runtime boundary

- Extracted shared semantic tokens, Inter typography, Radix Nova/shadcn
  primitives, and the workspace shell into `@pressly/ui` without moving
  Processor business behavior into the package.
- Added the responsive Control application shell, login and MFA challenge,
  capability-gated navigation, authorized application switcher, and safe
  loading/error/empty states.
- Added Control as a fifth immutable release image across local Compose, CI
  artifact generation, SBOM and vulnerability scanning, production Caddy and
  Compose, topology smoke tests, deploy, and rollback.
- Added production CSP, frame, MIME, referrer, cross-origin-opener, and
  permissions policies without `unsafe-inline` or `unsafe-eval`.

### Verification

```text
command: pnpm --filter @pressly/control typecheck && pnpm --filter @pressly/control test && pnpm --filter @pressly/control build
exit: 0
time: 2026-07-29
summary: Control type checks passed; 3 files and 13 tests passed; the production Vite build completed.

command: focused release, topology, CI artifact, Compose, deploy, and rollback test suites
exit: 0
time: 2026-07-29
summary: 64 release and deployment-topology tests passed; production Compose rendered successfully.

command: pnpm --filter @pressly/ui build; pnpm --filter @pressly/ui lint; pnpm --filter @pressly/processor typecheck
exit: 0
time: 2026-07-29
summary: Shared UI build and lint passed; Processor source and test type checks passed.
```

### T4 boundary correction — 2026-07-31

The initial shared-package implementation above was superseded before release.
Steven explicitly chose frontend-owned shadcn primitives and layout code over a
cross-application `@pressly/ui` package. Control and Processor now keep their
UI foundations inside their respective `apps/` boundaries while retaining the
same tokens, ergonomics, and rendered interaction language. The historical
commands above remain implementation evidence for the superseded attempt; the
release verifier uses the app-local commands recorded below.

```text
command: pnpm --filter @pressly/control typecheck; pnpm --filter @pressly/control lint; pnpm --filter @pressly/control test; pnpm --filter @pressly/control build
exit: 0
time: 2026-07-31
summary: Control app-local UI type checks and lint passed; 19 files and 74 tests passed; the production Vite build completed.

command: pnpm --filter @pressly/processor typecheck; pnpm --filter @pressly/processor lint; pnpm --filter @pressly/processor test; pnpm --filter @pressly/processor build
exit: 0
time: 2026-07-31
summary: Processor app-local UI type checks and lint passed; 40 files and 262 tests passed; the production Vite build completed.

command: rg '@pressly/ui|packages/ui' apps packages package.json pnpm-lock.yaml stateworks/work/active/pressly-control-workforce-identity/network.yaml
exit: 1
time: 2026-07-31
summary: No release input retains the rejected cross-application UI package or import.
```

## T5 — Deliver Team and account-security workflows in Control

### Implemented Team and invitation workflows

- `apps/control/src/features/team/team-workspace.tsx` owns capability-gated
  Team orchestration, current-member and pending-invitation tables, honest
  loading and empty states, stale-conflict recovery, and explicit invitation
  replacement and revocation confirmations. Mutation controls require the
  server-projected `team:write` capability; read-only sessions retain review
  access without receiving mutation controls.
- Invitation issuance, one-time link receipt, member detail, access changes,
  session actions, and membership lifecycle actions are separated by change
  reason across `team-invitation-workflow.tsx`,
  `team-member-detail-sheet.tsx`, and `team-member-controls.tsx`. The UI shows
  plain-language role and location previews, keeps self-access mutation
  controls unavailable, and treats the API policy as final authority.
- `team-api.ts` sends CSRF-protected, idempotent commands and includes expected
  versions for invitation replacement/revocation, membership transitions, and
  grant revocation. Team, invitation, grant, membership, and session responses
  are decoded through strict bounded schemas in `team-model.ts`.
- A newly issued raw invitation link exists only in component memory and is
  displayed once for deliberate copying. A replay response never re-displays
  the raw token, and replacing an invitation explicitly warns that the
  previous link becomes invalid.
- `invitation-bootstrap.ts` consumes `#invite` from the URL fragment and
  removes it from browser history before any preview request.
  `invitation-acceptance-view.tsx` supports a strong self-selected password for
  a new identity and password-then-MFA proof for an existing identity, reuses
  one acceptance idempotency key across that bootstrap, and clears password
  and MFA-code state after every submission. Application destinations remain
  constrained by the strict Control session destination schema.

### Implemented account-security workflows

- `apps/control/src/features/security/security-workspace.tsx` implements MFA
  enrollment and confirmation, one-time recovery-code receipt, deliberate
  recovery-code replacement, and explicit MFA-removal confirmation. A
  successful assurance change reloads the current server session before
  privileged controls are presented.
- Pre-MFA sessions can reach the enrollment path without receiving workforce
  or account-security mutation authority. Security history is not requested or
  rendered unless the current session includes `security:read`.
- `security-api.ts` keeps MFA mutations CSRF-protected and accepts only bounded
  strict response schemas. The audit projection contains event type, resource
  type, actor display name, and timestamp only; an unexpected metadata object
  is rejected instead of rendered.
- Member detail exposes bounded server-projected session inventory and an
  explicit per-session revocation confirmation. Session revocation remains
  business- and actor-scoped by the Auth use case and Control route rather than
  trusting a browser-provided role or business identifier.
- Manager delegation, self-change denial, location bounds, MFA assurance,
  atomic access-reduction revocation, and serialized final-owner preservation
  remain server-owned policies. T5 consumes those decisions and does not
  duplicate them as browser authority.

### Verification

```text
command: pnpm --filter @pressly/control typecheck && pnpm --filter @pressly/control lint
exit: 0
time: 2026-07-30
summary: Control source and test TypeScript checks and the complete Control ESLint gate passed.

command: pnpm --filter @pressly/control exec vitest run test/team test/security
exit: 0
time: 2026-07-30
summary: Seven focused Team, invitation, session, MFA, and security-history files passed all 22 tests.

command: pnpm --filter @pressly/control test && pnpm --filter @pressly/control build
exit: 0
time: 2026-07-30
summary: Fifteen Control files passed all 50 tests and the production Vite build completed.

command: pnpm --filter @pressly/auth-module exec vitest run test/workforce/workforce-authority.policy.test.ts test/workforce/workforce-mutations.usecase.test.ts test/workforce/workforce-security.usecase.test.ts
exit: 0
time: 2026-07-30
summary: Three focused Auth files passed all 17 manager-scope, self-change, MFA, final-owner, atomic revocation, session-projection, and replay tests.

command: pnpm --filter @pressly/api exec vitest run test/control/control-workforce.routes.test.ts test/control/control-security.routes.test.ts test/control/control-invitation-bootstrap.routes.test.ts
exit: 0
time: 2026-07-30
summary: Three focused Control HTTP files passed all 9 business-scoped session, redacted security-history, and existing-identity invitation-bootstrap tests.
```

- Automated T5 gates are complete. Cross-viewport rendered Team, invitation,
  and Security inspection remains part of the explicit `V1` design-QA gate;
  this evidence does not upgrade automated coverage into a rendered or
  deployed-runtime claim.

## T6 — Deliver canonical Customer and Order management in Control

### Implemented canonical data boundary

- Added business-scoped customer list, search, detail, create, correction, and
  inactivation through the Users module. Opaque cursors remain bound to the
  business and filter context, and duplicate email or phone signals are
  returned without fuzzy identity merging.
- Added business- and location-scoped canonical Order list, search, detail,
  create, and supported commercial correction through the Orders module.
  Commands require the exact persisted customer identity, compare aggregate
  versions, preserve idempotency, and commit the existing transactional outbox
  atomically with canonical Order state.
- Added authenticated Control Customer and Order routes under
  `apps/api/src/http/control/data`. The server derives the actor and business
  from the Control session and validates location ancestry; request bodies
  cannot select another business.
- First-party Order creation creates a source-neutral, unreleased fulfillment.
  Control exposes no Production lifecycle target, writes no Production table,
  and leaves later fulfillment release and downstream Production effects to
  their owning command and outbox boundaries.
- Added Customers and Orders workspaces with recognizable customer identity in
  every row, bounded server search and pagination, detail and correction
  sheets, explicit duplicate and stale-version states, capability-aware
  controls, and shared shadcn Calendar and Popover due-date input.
- Order customer selection uses explicit canonical search over up to 100 active
  matches. The current exact customer is retained during correction even when
  inactive or outside the bounded active page.

### Verification

```text
command: pnpm --filter @pressly/contracts typecheck && pnpm --filter @pressly/contracts lint && pnpm --filter @pressly/contracts test && pnpm --filter @pressly/contracts build
exit: 0
time: 2026-07-30
summary: Contracts passed type checks, lint, 15 files and 124 tests, and the package build.

command: pnpm --filter @pressly/users typecheck && pnpm --filter @pressly/users lint && pnpm --filter @pressly/users test && pnpm --filter @pressly/users build
exit: 0
time: 2026-07-30
summary: Users passed type checks, lint, 2 files and 5 unit tests, and the package build.

command: pnpm --filter @pressly/orders typecheck && pnpm --filter @pressly/orders lint && pnpm --filter @pressly/orders test && pnpm --filter @pressly/orders build
exit: 0
time: 2026-07-30
summary: Orders passed type checks, lint, 5 files and 32 unit tests, and the package build.

command: pnpm --filter @pressly/users test:integration && pnpm --filter @pressly/orders test:integration
exit: 0
time: 2026-07-30
summary: Six Users and 16 Orders integration tests passed, covering business isolation, pagination, exact ownership, idempotency, version conflicts, and outbox persistence.

command: pnpm --filter @pressly/api typecheck && pnpm --filter @pressly/api lint
exit: 0
time: 2026-07-30
summary: API source and test TypeScript checks and lint passed.

command: pnpm --filter @pressly/api exec vitest run test/control/control-data.routes.test.ts test/canonical/canonical-commands.routes.test.ts
exit: 0
time: 2026-07-30
summary: Two files and 11 focused Control and canonical-command route tests passed, including wrong-business and wrong-location denials.

command: pnpm --filter @pressly/control typecheck && pnpm --filter @pressly/control lint && pnpm --filter @pressly/control test && pnpm --filter @pressly/control build
exit: 0
time: 2026-07-30
summary: Control passed type checks, lint, 14 files and 49 tests, and the production Vite build.

command: git diff --check -- modules/business/users modules/business/orders packages/contracts apps/api apps/control packages/ui pnpm-lock.yaml
exit: 0
time: 2026-07-30
summary: The scoped implementation diff has no whitespace errors; static searches found no native date input, customer or Order browser storage, or Control-to-Production command or table write.
```

## Commands

```text
command: pnpm stateworks:validate stateworks/work/active/pressly-control-workforce-identity/network.yaml
exit: 0
time: 2026-07-29
summary: Active network is structurally valid with 10 tasks.

command: pnpm stateworks:next stateworks/work/active/pressly-control-workforce-identity/network.yaml --state stateworks/work/active/pressly-control-workforce-identity/state.yaml --json
exit: 0
time: 2026-07-29
summary: No pending task is schedulable while T0 is explicitly running.

command: git status --short
exit: 0
time: 2026-07-29
summary: Unrelated deleted and untracked files were identified and excluded.
```

## Decisions

### T3/T6 authority correction — 2026-08-03

The original Control behavior remains, but its application authority moved out
of API transport code into the v2 `@pressly/control-experience` module.

- Control access resolution, capability derivation, application destinations,
  business/location scoping, Customer and Order orchestration, workforce and
  invitation orchestration, and Control projections now live under
  `modules/experience/control`.
- `apps/api/src/http/control` retains contract validation and serialization,
  authenticated request-context adaptation, cookies, origin/CSRF enforcement,
  rate limiting, and outer error presentation.
- API composition adapts Identity, Users, and Orders public capabilities into
  narrow Control ports. The Experience module imports no peer module package.
- Expected peer rejections are typed, feature-specific data. Unexpected
  mechanism and invariant failures throw through to the standard API error
  boundary; no `cause: unknown` is stored in an expected failure union.
- Existing Control wire contracts and browser consumers were preserved. The
  full API suite passed 30 files and 198 tests; the Control Experience suite
  passed 4 files and 12 tests; and the Control browser suite passed 20 files
  and 80 tests. All three surfaces passed lint, source/test type checks, and
  production builds. Architecture check, lint, typecheck, and the affected
  Stateworks validators also passed.
- Control API and browser consumers now import the explicit Auth, Users, and
  Orders contract subpaths. With behavior and wire schemas unchanged, the
  Control production entry chunk decreased from 509.96 kB / 146.66 kB gzip to
  455.18 kB / 135.03 kB gzip in the same verification run.

### Identity failure and Control semantic-role refinement — 2026-08-03

- Identity expected failures are module-owned data for bootstrap, login,
  load-session, MFA, and workforce use cases. Database, cryptographic,
  configuration, corrupt-row, and invariant failures throw normalized
  `AppError` values instead of entering the expected failure union.
- MFA's atomic transition uses the shared result-aware unit of work, so an
  expected challenge rejection rolls back without using a private throwable
  as application control flow.
- Identity command receipts and acceptance replay metadata use Codec
  `JsonObject` and validate persisted structure before projection. Cursor wire
  bytes are preserved through shared Base64URL JSON primitives.
- The Control language is physically classified. Grant, invitation, and
  membership are continuity-bearing entities. Workforce snapshots, details,
  pages, lists, and mutation outcomes are models; roles, scopes, states, and
  actor references are values. Control access is a resolved application model,
  not an entity.
- Customer and Order application records were renamed to snapshots. The
  `Record` suffix is reserved for genuine representation records and cannot be
  used as an ambiguous synonym for a hydrated peer value.
- Identity passed lint, source/test typecheck, build, 139 unit tests, and 33
  sequential PostgreSQL integration tests. Control Experience passed lint,
  source/test typecheck, build, and 12 tests. Eight focused Control/Auth API
  files passed 36 tests; the API lint, source/test typecheck, and build gates
  passed. Both affected Stateworks networks validated and verified with no stop
  reason.

- Decision: Keep one modular-monolith Auth authority with app-specific browser
  session boundaries.
  Reason: Current opaque sessions provide immediate assignment and revocation
  truth without introducing premature distributed-token complexity.
  Date: 2026-07-29

- Decision: Build Pressly Control as a distinct application surface using the
  same shadcn and Tailwind design language as Processor.
  Reason: Team, customer, and Order administration are management-plane work,
  while Processor remains a low-friction physical execution surface.
  Date: 2026-07-29

- Decision: Keep workforce membership, invitations, and scoped grants inside
  the Auth security aggregate while preserving their own explicit state graphs.
  Reason: Invitation acceptance and offboarding change identity access,
  assignments, sessions, and audit evidence atomically; a peer module would
  create a false transaction boundary.
  Date: 2026-07-29

- Decision: Business ancestry is mandatory before Control list endpoints,
  while generalized RLS remains gated.
  Reason: Mandatory predicates, composite constraints, and IDOR tests solve
  the present one-business threat without prematurely building a SaaS policy
  platform.
  Date: 2026-07-29

## Open Risks

- Risk: The current Processor browser session flattens scoped assignments into
  role names.
  Owner: Agent
  Next step: Replace it with selected-location server-derived capabilities.

- Risk: Existing production controllers sometimes record synthetic role labels.
  Owner: Agent
  Next step: Preserve the authenticated identity and authorized action context.

- Risk: No email-delivery provider exists for invitation delivery.
  Owner: Agent
  Next step: Provide a single-display copyable invite link without persisting
  the raw token; defer automated delivery.

- Risk: Current privileged MFA is optional until a credential is enrolled.
  Owner: Agent
  Next step: Keep privileged grants ineffective until enrollment and require
  fresh MFA assurance for workforce and security mutations.

- Risk: Canonical Users, Orders, and fulfillments have no business ancestry.
  Owner: Agent
  Next step: Add the account root, backfill ancestry, and prove isolation
  before enabling Control list APIs.

- Risk: Control adds a fifth immutable image to a release path that currently
  validates exactly four.
  Owner: Agent
  Next step: update CI, release manifest, deployment, Caddy, Compose, topology
  smoke tests, and source-SHA verification together.

## 2026-07-31 planning reconciliation (no implementation claim)

- The amended work network is structurally valid and contains 12 tasks.
- The lifecycle snapshot reports `next: []`, `done: false`, and no stop reason.
  T3 and T7 remain the only running tasks; T7A and T7B remain pending and are
  next in delivery order only after their T3, T5, T6, and T7 dependencies are
  committed.
- T5 and T6 are already recorded as committed even though their T3 dependency
  remains running. This is retained as historical state rather than rewritten;
  it is a dependency-order anomaly that the remaining verification must account
  for.
- `design-qa.md` is relabeled as a historical pre-T7A/T7B rendered baseline.
  It does not satisfy the current V1 dependency or verification requirements.
- This reconciliation updates planning truth only. It makes no product,
  browser-harness, layered-verification, deployment, or operational-completion
  claim and changes no task status or task evidence array.
