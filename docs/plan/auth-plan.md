# Auth Implementation Plan

This plan is for the first real production-safe auth path in Pressly.

The immediate use case is admin pricing changes from the CLI.

The architecture must still scale to later apps:

- public web
- admin web
- worker/service actors
- customer/driver/operator surfaces

The important boundary:

```txt
CLI -> API -> auth middleware -> pricing module -> DB
```

The CLI must never send an actor.

The CLI sends credentials once, then sends a bearer token.

The API resolves the token into a server-trusted principal and actor.

## 1. Target Shape

```txt
credential/session proof
  -> authenticate
  -> principal
  -> actor
  -> authorize
  -> usecase
  -> repository
  -> database
```

Concrete production boundary:

```txt
apps/cli
  Ink shell + token store + API-backed client

apps/api
  Express process composition only

modules/auth
  login/session/logout/authenticate middleware

modules/pricing
  neutral pricing HTTP endpoint parts + existing pricing usecases

packages/auth
  pure auth vocabulary and policy interpreter

packages/contracts
  Zod contracts for HTTP/API boundaries

packages/db
  auth schema, migrations, seeds, db client
```

## 2. Non-Negotiable Rules

### Keep auth generic

Do not make core auth tables or types `admin_*`.

Use generic auth language:

- identity
- credential
- session
- principal
- role
- permission
- actor
- policy decision

Admin is only one actor profile.

### Keep apps thin

`apps/api` should compose modules.

It should not own auth features.

Good:

```ts
const authModule = makeAuthModule({ db, env });
const pricingModule = makePricingModule({ db });

app.use('/auth', authModule.routes);
app.post(
  '/pricing/changes/publish',
  pricingModule.http.publishChange.validate,
  authModule.guards.authenticate,
  authModule.guards.authorize({
    action: 'pricing:publish',
    roles: ['owner'],
    freshSessionMaxAgeMinutes,
  }),
  pricingModule.http.publishChange.handle,
);
```

Bad:

```txt
apps/api/src/auth/module.ts
apps/api/src/routes/admin-pricing.routes.ts
```

Those names pull business capability and security policy into the app shell.

### Use Drizzle generation

Do not hand-write migration files for auth.

Correct flow:

1. Add `packages/db/src/schema/auth.schema.ts`.
2. Export it from `packages/db/src/schema.ts`.
3. Run `pnpm -F @pressly/db generate`.
4. Review generated SQL.
5. Run `pnpm -F @pressly/db migrate`.

### Keep middleware as the HTTP pipe

Express should read naturally:

```txt
validate -> authenticate -> authorize -> controller -> error handler
```

Routes should declare the pipe.

Controllers should execute the adapter-level request handling.

Usecases should receive trusted inputs only.

### Use `@pressly/errors`

Do not throw plain `new Error(...)` for expected application failures.

Use:

- `validationError`
- `permissionError`
- `notFoundError`
- `conflictError`
- `makeAppError`

Plain `Error` is only acceptable for truly unexpected programming failures.

## 3. Package Boundaries

### `packages/auth`

Purpose:

Pure auth language.

No Express.

No Drizzle.

No bcrypt.

No filesystem.

No environment reads.

Files to create or expand:

```txt
packages/auth/src/
  action.ts
  actor.ts
  assert-can.ts
  decision.ts
  identity.ts
  password.ts
  permission.ts
  policy.ts
  principal.ts
  session.ts
  index.ts
```

Responsibilities:

- define roles and permissions
- define identity/principal/actor types
- map principal to actor
- evaluate policy rules
- describe password strength rules
- describe session age/expiry rules

Do not put password hashing here.

Do not put token hashing here.

Those are runtime mechanisms owned by `modules/auth` adapters/features.

Core shape:

```ts
export type Principal = Readonly<{
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  roles: readonly Role[];
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
}>;

export type Actor = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
  role: Role;
  permissions: readonly Permission[];
}>;

export type AuthDecision =
  | Readonly<{ ok: true; actor: Actor }>
  | Readonly<{
      ok: false;
      reason: AuthDenyReason;
      safeMessage: string;
      details?: unknown;
    }>;
```

Policy shape:

```ts
authorize({
  actor,
  action: 'pricing:publish',
  context: { sessionAgeMinutes: 4 },
  policies,
});
```

Keep policies declarative:

```ts
allow('pricing:publish')
  .to('owner')
  .require('pricing:publish')
  .when(freshSession({ maxAgeMinutes: 15 }));
```

### `packages/contracts`

Purpose:

Zod schemas and shared command/result types crossing process boundaries.

Add:

```txt
packages/contracts/src/auth/
  auth.contracts.ts
  auth.command.ts
  auth.result.ts
```

Export from:

```txt
packages/contracts/src/index.ts
```

Contracts to define:

```ts
loginRequestSchema;
loginResultSchema;
sessionResultSchema;
logoutResultSchema;
```

Login request:

```ts
{
  email: string;
  password: string;
}
```

Login result:

```ts
{
  accessToken: string;
  expiresAt: string;
  principal: {
    identityId: string;
    displayName: string;
    email?: string;
    roles: Role[];
  };
}
```

Admin pricing transport contracts should be actor-free.

Good HTTP request:

```ts
{
  serviceSlug: 'wash-fold',
  locationSlug?: string,
  reason: string,
  items: [{ code: 'delivery_fee', priceCents: 495 }]
}
```

Bad HTTP request:

```ts
{
  actor: { id: 'steven', role: 'owner' }
}
```

The API constructs actor-bearing module commands after authentication.

### `packages/db`

Purpose:

Database schema, migrations, seeds, and db client.

Add:

```txt
packages/db/src/schema/auth.schema.ts
```

Update:

```txt
packages/db/src/schema.ts
packages/db/package.json
```

Initial tables:

```txt
auth_identities
auth_password_credentials
auth_sessions
auth_identity_roles
auth_login_attempts
auth_audit_events
```

#### `auth_identities`

One row per login-capable identity.

This is generic.

It can represent:

- Steven as owner
- future employee
- future service account
- future customer account

Columns:

```txt
id
kind                  human | service
display_name
email                 unique, nullable for service identities later
email_normalized      unique, nullable
is_active
created_at
updated_at
```

#### `auth_password_credentials`

Password credential for a human identity.

Keep password hash separate from identity.

Columns:

```txt
id
identity_id
password_hash
password_updated_at
created_at
updated_at
```

#### `auth_sessions`

Bearer token session.

Store only token hash.

Never store the raw token.

Columns:

```txt
id
identity_id
token_hash
issued_at
expires_at
revoked_at
last_used_at
created_at
```

#### `auth_identity_roles`

Current role assignments.

Keep roles in code for now.

Use the DB only to assign known role names.

Columns:

```txt
id
identity_id
role
created_at
created_by_identity_id nullable
```

#### `auth_login_attempts`

Rate-limit and audit login attempts.

Columns:

```txt
id
email_normalized
identity_id nullable
success
failure_code nullable
ip_address nullable
user_agent nullable
created_at
```

#### `auth_audit_events`

Immutable auth/security audit log.

Columns:

```txt
id
actor_identity_id nullable
event_type
resource_type
resource_id nullable
metadata jsonb
created_at
```

First-owner bootstrap:

```txt
pnpm auth:bootstrap:owner -- --password-stdin
```

Environment:

```txt
DATABASE_URL
PRESSLY_BOOTSTRAP_OWNER_EMAIL
PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner
```

Password input:

```txt
stdin only
```

Bootstrap behavior:

1. Validate email/password input.
2. Hash the password.
3. Take an owner-bootstrap advisory lock.
4. Refuse if any owner already exists.
5. Refuse if the email already belongs to an identity.
6. Create identity.
7. Create password credential.
8. Assign `owner`.
9. Write audit event.

Do not update existing identities, reset passwords, reactivate users, or run this automatically from Docker/API startup.

Do not put privileged owner bootstrap data in migrations.

## 4. Auth Module

Create:

```txt
modules/auth/
  package.json
  tsconfig.json
  src/
    public.ts
    main.ts

    features/
      login/
        login.usecase.ts
        login.port.ts
        login.error.ts
      load-session/
        load-session.usecase.ts
        load-session.port.ts
        load-session.error.ts
      revoke-session/
        revoke-session.usecase.ts
        revoke-session.port.ts
        revoke-session.error.ts

    adapters/
      login/
        http/
          login.controller.ts
          login.route.ts
        persistence/
          login.repo.ts

      load-session/
        http/
          authenticate.middleware.ts
          load-session.controller.ts
          load-session.route.ts
        persistence/
          load-session.repo.ts

      revoke-session/
        http/
          revoke-session.controller.ts
          revoke-session.route.ts
        persistence/
          revoke-session.repo.ts
```

### `modules/auth/src/main.ts`

`main.ts` is the composition root.

It wires:

- repositories
- password hasher
- token generator
- token hasher
- usecases
- controllers
- routes
- middleware

Return:

```ts
{
  routes,
  guards: {
    authenticate,
    authorize,
  },
  usecases: {
    login,
    loadSession,
    revokeSession,
  },
}
```

### Login usecase

Inputs:

```ts
LoginCommand = {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}
```

Ports:

```ts
LoginStore = {
  findIdentityByEmail(emailNormalized): Promise<...>;
  findPasswordCredential(identityId): Promise<...>;
  countRecentFailedAttempts(emailNormalized, window): Promise<number>;
  createSession(input): Promise<...>;
  recordLoginAttempt(input): Promise<void>;
  recordAuditEvent(input): Promise<void>;
}

PasswordVerifier = {
  verify(hash, plainText): Promise<boolean>;
}

TokenIssuer = {
  issue(): string;
  hash(rawToken): string;
}

Clock = {
  now(): Date;
}
```

Usecase rules:

1. Normalize email.
2. Enforce login attempt limit.
3. Load active identity.
4. Load password credential.
5. Verify password.
6. Create bearer token and token hash.
7. Store session.
8. Record login attempt.
9. Record audit event.
10. Return raw token once.

The raw token only exists in memory and response output.

### Load session usecase

Inputs:

```ts
LoadSessionCommand = {
  bearerToken: string;
}
```

Rules:

1. Hash bearer token.
2. Load session by token hash.
3. Reject missing/revoked/expired sessions.
4. Load identity and roles.
5. Reject inactive identity.
6. Touch `last_used_at`.
7. Return `Principal`.

### Revoke session usecase

Inputs:

```ts
RevokeSessionCommand = {
  bearerToken: string;
}
```

Rules:

1. Hash bearer token.
2. Mark session revoked.
3. Write audit event.
4. Return success.

## 5. HTTP Middleware

HTTP middleware belongs in `modules/auth/adapters/**/http`.

It is an adapter because it knows Express.

Create:

```txt
authenticate.middleware.ts
authorize.middleware.ts
```

### Authenticate middleware

Behavior:

1. Read `Authorization: Bearer <token>`.
2. Call `loadSession`.
3. Convert principal to actor for the current app context.
4. Store principal/actor on `res.locals.auth`.
5. Call `next()`.

Failure:

- missing token -> `PermissionError` 401
- invalid token -> `PermissionError` 401
- expired token -> `PermissionError` 401

### Authorize middleware

Behavior:

1. Read actor/session context from `res.locals.auth`.
2. Call `authorize(...)` from `@pressly/auth`.
3. If denied, throw `permissionError`.
4. If allowed, call `next()`.

Example pipe:

```ts
router.post(
  '/publish',
  validateRequest({ body: adminPricingPublishRequestSchema }),
  guards.authenticate,
  guards.authorize({
    action: 'pricing:publish',
    freshSession: true,
  }),
  publishPricingChangeController,
);
```

### Lint update

Current lint only allows:

```txt
*.controller.ts
*.route.ts
```

under HTTP adapters.

Update it to allow:

```txt
*.controller.ts
*.route.ts
*.middleware.ts
```

Add a rule for middleware imports:

- may import `@pressly/*`
- may import `*.usecase.ts`
- may import `*.policy.ts`
- may not import repo files directly

## 6. Pricing HTTP API

Pricing routes are capability routes, not audience routes.

Do not use `/admin/pricing`.

The pricing module exposes neutral HTTP endpoint parts:

```txt
pricingModule.http.loadCatalog.validate
pricingModule.http.loadCatalog.handle
pricingModule.http.planChange({ readAuthor }).validate
pricingModule.http.planChange({ readAuthor }).handle
pricingModule.http.publishChange({ readAuthor }).validate
pricingModule.http.publishChange({ readAuthor }).handle
```

`apps/api` composes those parts with auth middleware:

```txt
validate -> authenticate -> authorize -> controller
```

Do not make pricing import auth middleware, roles, permissions, or
`@pressly/auth`.

Pricing write controllers receive only a generic `readAuthor(res)` function.

That function returns attribution:

```ts
{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
}
```

The author is for audit.

It is not authorization.

Authorization is declared in `apps/api`.

Controller behavior:

1. Read validated body.
2. Read author through injected `readAuthor(res)`.
3. Build `PricingChangeCommand`.
4. Call pricing usecase.
5. Return `apiSuccess(...)`.

The `requestedBy` command field is server-side only.

It is not a public HTTP request body.

## 7. API App Composition

Update `apps/api/src/app.ts`.

Final shape:

```ts
const authModule = makeAuthModule({
  db: runtime.database.db,
  env: runtime.env,
});

const pricingModule = makePricingModule({
  db: runtime.database.db,
});

app.use('/health', makeHealthRoutes(runtime));
app.use('/auth', authModule.routes);

app.get(
  '/pricing/services/:serviceSlug/pricing',
  pricingModule.http.loadCatalog.validate,
  authModule.guards.authenticate,
  authModule.guards.authorize({
    action: 'pricing:read',
    roles: ['owner', 'admin'],
  }),
  pricingModule.http.loadCatalog.handle,
);

app.post(
  '/pricing/changes/publish',
  pricingModule.http.publishChange({ readAuthor }).validate,
  authModule.guards.authenticate,
  authModule.guards.authorize({
    action: 'pricing:publish',
    roles: ['owner'],
    freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
  }),
  pricingModule.http.publishChange({ readAuthor }).handle,
);
```

Keep app-level responsibilities boring:

- process middleware
- module construction
- route mounting
- not-found handler
- error handler

No auth feature code should live directly in `apps/api`.

## 8. CLI Auth Flow

Current CLI shape is good.

Keep:

```txt
runCli({ features: [pricingCli] })
```

Change the pricing client implementation.

Replace direct DB client with API-backed client:

```txt
apps/cli/src/features/pricing/
  api-client.ts
```

Add auth support:

```txt
apps/cli/src/features/auth/
  api-client.ts
  token-store.ts
  login.ts
```

Token store:

```txt
~/.config/pressly/admin-session.json
```

Permissions:

```txt
directory: 0700
file:      0600
```

Token file:

```json
{
  "apiUrl": "https://api.trypressly.com",
  "accessToken": "...",
  "expiresAt": "2026-05-24T18:00:00.000Z",
  "principal": {
    "identityId": "...",
    "displayName": "Steven",
    "email": "steven@example.com",
    "roles": ["owner"]
  }
}
```

CLI runtime flow:

```txt
pricing command starts
  -> load token
  -> if token exists and not expired, call API
  -> if no token, prompt email/password
  -> POST /auth/login
  -> store token
  -> retry pricing command
```

Do not put the password in env.

Do not write the password to disk.

Do not log the password.

## 9. API Endpoints

### Auth

```txt
POST /auth/login
POST /auth/logout
GET  /auth/session
```

`POST /auth/login`

```json
{
  "email": "steven@example.com",
  "password": "..."
}
```

Returns:

```json
{
  "ok": true,
  "data": {
    "accessToken": "...",
    "expiresAt": "...",
    "principal": {
      "identityId": "...",
      "displayName": "Steven",
      "email": "steven@example.com",
      "roles": ["owner"]
    }
  }
}
```

### Protected Pricing

```txt
GET  /pricing/services/:serviceSlug/pricing
GET  /pricing/locations/:locationSlug/services/:serviceSlug/pricing
POST /pricing/changes/plan
POST /pricing/changes/publish
```

All protected pricing endpoints require:

```txt
Authorization: Bearer <token>
```

`publish` requires:

- `pricing:publish`
- owner role for now
- fresh session

## 10. Password Security

Use `argon2id`.

Recommended package:

```txt
argon2
```

Hash options:

```txt
type: argon2id
memoryCost: reasonable local/prod value
timeCost: 3
parallelism: 1
```

Keep password policy in `packages/auth`.

Keep password hashing in `modules/auth`.

Reason:

```txt
password policy = pure business/security rule
password hashing = runtime mechanism
```

## 11. Token Security

Use opaque random bearer tokens.

Do not use JWT for this first version.

Reason:

- sessions are revocable
- DB lookup is acceptable for admin CLI traffic
- simpler security model
- less risk of stale claims

Generate token:

```ts
crypto.randomBytes(32).toString('base64url');
```

Hash token before storing:

```txt
HMAC-SHA256(rawToken, AUTH_SECRET)
```

Environment:

```txt
AUTH_SECRET
AUTH_SESSION_TTL_MINUTES
AUTH_LOGIN_WINDOW_MINUTES
AUTH_LOGIN_MAX_FAILURES
AUTH_FRESH_SESSION_MAX_AGE_MINUTES
```

## 12. Error Policy

Expected errors use `@pressly/errors`.

Examples:

```txt
invalid_credentials       PermissionError 401
session_expired           PermissionError 401
missing_permission        PermissionError 403
stale_session             PermissionError 403
login_rate_limited        PermissionError 429
missing_auth_config       ValidationError 500
auth_store_failed         DatabaseError 500
```

Do not leak which part of login failed.

Bad:

```txt
No user exists for this email.
```

Good:

```txt
Invalid email or password.
```

## 13. Implementation Order

### Step 1: Pure auth package

Implement:

```txt
packages/auth/src/*
```

Run:

```bash
pnpm -F @pressly/auth test
pnpm -F @pressly/auth typecheck
```

### Step 2: Contracts

Implement:

```txt
packages/contracts/src/auth/*
```

Add actor-free admin pricing request schemas if missing.

Run:

```bash
pnpm -F @pressly/contracts test
pnpm -F @pressly/contracts typecheck
```

### Step 3: DB schema and first-owner bootstrap

Implement:

```txt
packages/db/src/schema/auth.schema.ts
modules/auth/src/features/bootstrap-owner
modules/auth/src/adapters/bootstrap-owner/persistence
modules/auth/src/adapters/bootstrap-owner/cli/bootstrap-owner.command.ts
```

Generate migration:

```bash
pnpm -F @pressly/db generate
```

Review generated SQL.

Apply migration:

```bash
pnpm -F @pressly/db migrate
```

Bootstrap first owner:

```bash
printf '%s\n' 'use-a-long-real-password-here' \
  | DATABASE_URL=postgres://pressly:pressly@localhost:55433/pressly \
    PRESSLY_BOOTSTRAP_OWNER_EMAIL=steven@example.com \
    PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner \
    pnpm auth:bootstrap:owner -- --password-stdin
```

### Step 4: Auth module

Implement:

```txt
modules/auth
```

Package name:

```txt
@pressly/auth-module
```

Do not name it `@pressly/auth`.

That package name is already the pure auth vocabulary package.

Focus on:

- login usecase
- load session usecase
- revoke session usecase
- persistence repos
- HTTP controllers/routes
- authenticate middleware
- authorize middleware

Run:

```bash
pnpm -F @pressly/auth-module test
pnpm -F @pressly/auth-module typecheck
```

Keep the source under `modules/auth`.

### Step 5: Pricing admin adapter

Add admin HTTP adapter to `modules/pricing`.

Do not move pricing auth logic into API app.

Do not let pricing import auth module.

Pricing receives trusted actor from controller input.

Run:

```bash
pnpm -F @pressly/pricing test
pnpm -F @pressly/pricing typecheck
```

### Step 6: API composition

Wire modules in `apps/api/src/app.ts`.

Run:

```bash
pnpm -F @pressly/api typecheck
pnpm -F @pressly/api test
```

### Step 7: CLI API client

Replace local direct-DB pricing client with API-backed client.

Add token login flow.

Run:

```bash
pnpm -F @pressly/cli test
pnpm -F @pressly/cli typecheck
```

### Step 8: End-to-end verification

Local:

```bash
pnpm docker:up
printf '%s\n' 'use-a-long-real-password-here' \
  | DATABASE_URL=postgres://pressly:pressly@localhost:55433/pressly \
    PRESSLY_BOOTSTRAP_OWNER_EMAIL=steven@example.com \
    PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner \
    pnpm auth:bootstrap:owner -- --password-stdin
pnpm admin pricing show --service wash-fold
pnpm admin pricing plan --service wash-fold --set delivery_fee=4.95 --reason "test"
pnpm admin pricing publish --service wash-fold --set delivery_fee=4.95 --reason "test" --yes
```

Production:

```bash
PRESSLY_API_URL=https://api.trypressly.com \
pnpm admin pricing show --service wash-fold
```

## 14. Test Plan

### `packages/auth`

Test:

- role -> permission mapping
- actor creation
- policy allow
- policy deny
- fresh session condition
- password strength validation

### `modules/auth`

Unit test usecases with fake ports:

- login succeeds
- wrong password fails generically
- inactive identity fails
- rate-limited login fails
- session load succeeds
- expired session fails
- revoked session fails
- logout revokes session

Integration test repos against test Postgres:

- create session stores token hash only
- loading by token hash works
- expired sessions are not accepted
- revoked sessions are not accepted
- login attempts are recorded
- audit events are immutable append-only rows

### `modules/pricing`

Test admin HTTP adapter:

- request body cannot include actor
- controller injects actor from `res.locals.auth`
- plan returns diff
- publish writes new pricing set
- missing permission returns 403 through middleware
- stale session blocks publish

### `apps/cli`

Test:

- no token prompts login
- valid token calls pricing API
- expired token prompts login again
- token file permissions are `0600`
- password is never printed
- `--json` works without Ink UI

## 15. What This Does Not Do Yet

This first version does not build:

- customer login
- driver login
- admin web UI
- password reset
- email verification
- MFA
- runtime-editable permissions
- OAuth/social login
- JWTs

That is intentional.

The first useful production boundary is:

```txt
trusted owner/admin session -> protected pricing write
```

Everything else can grow from the same vocabulary.

## 16. Final Check

The correct end state:

- auth tables are generic
- admin is a role/profile, not a separate auth system
- CLI talks to API, not DB
- API constructs actor server-side
- pricing module never trusts client-provided actor
- usecases know nothing about Express
- repos know nothing about domain policies
- migrations are generated by Drizzle
- seed data is separate from migrations
- expected failures use `@pressly/errors`

If an implementation violates one of those, fix the boundary before adding more code.

## 17. Hand-Copy Implementation

This section is the part to type from.

It is written in implementation order.

### 17.1 `packages/auth`

Replace the current small auth package with this pure vocabulary layer.

#### `packages/auth/src/permission.ts`

```ts
export type Permission =
  | 'auth:session:read'
  | 'auth:session:revoke'
  | 'auth:user:manage'
  | 'pricing:read'
  | 'pricing:plan'
  | 'pricing:publish'
  | 'pricing:rollback';

export type Role =
  | 'owner'
  | 'admin'
  | 'operator'
  | 'customer'
  | 'driver'
  | 'service'
  | 'developer'
  | 'ci';

const allPricingPermissions: readonly Permission[] = [
  'pricing:read',
  'pricing:plan',
  'pricing:publish',
  'pricing:rollback',
];

const permissionsByRole: Record<Role, readonly Permission[]> = {
  owner: [
    'auth:session:read',
    'auth:session:revoke',
    'auth:user:manage',
    ...allPricingPermissions,
  ],
  admin: ['auth:session:read', 'pricing:read', 'pricing:plan'],
  operator: ['pricing:read'],
  customer: [],
  driver: [],
  service: allPricingPermissions,
  developer: ['pricing:read', 'pricing:plan'],
  ci: allPricingPermissions,
};

const rankByRole: Record<Role, number> = {
  owner: 100,
  admin: 90,
  operator: 80,
  service: 70,
  developer: 60,
  ci: 60,
  driver: 40,
  customer: 30,
};

export const permissionsForRole = (role: Role): readonly Permission[] =>
  permissionsByRole[role];

export const isRole = (value: unknown): value is Role =>
  value === 'owner' ||
  value === 'admin' ||
  value === 'operator' ||
  value === 'customer' ||
  value === 'driver' ||
  value === 'service' ||
  value === 'developer' ||
  value === 'ci';

export const selectHighestRole = (roles: readonly Role[]): Role | undefined =>
  roles.reduce<Role | undefined>((selected, role) => {
    if (selected === undefined) return role;

    return rankByRole[role] > rankByRole[selected] ? role : selected;
  }, undefined);
```

#### `packages/auth/src/identity.ts`

```ts
export type IdentityKind = 'human' | 'service';

export type Identity = Readonly<{
  id: string;
  kind: IdentityKind;
  displayName: string;
  email?: string;
  isActive: boolean;
}>;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
```

#### `packages/auth/src/principal.ts`

```ts
import type { IdentityKind } from './identity.ts';
import type { Role } from './permission.ts';

export type Principal = Readonly<{
  identityId: string;
  kind: IdentityKind;
  displayName: string;
  roles: readonly Role[];
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
}>;

export const principalLabel = (principal: Principal): string =>
  principal.email ?? principal.displayName;
```

#### `packages/auth/src/actor.ts`

```ts
import type { Principal } from './principal.ts';
import type { IdentityKind } from './identity.ts';
import type { Permission, Role } from './permission.ts';
import { permissionsForRole } from './permission.ts';

export type Actor = Readonly<{
  id: string;
  kind: IdentityKind;
  displayName: string;
  role: Role;
  permissions: readonly Permission[];
}>;

export const makeActor = (
  input: Readonly<{
    id: string;
    kind: IdentityKind;
    displayName: string;
    role: Role;
  }>,
): Actor => ({
  ...input,
  permissions: permissionsForRole(input.role),
});

export const actorFromPrincipal = (input: {
  principal: Principal;
  role: Role;
}): Actor =>
  makeActor({
    id: input.principal.identityId,
    kind: input.principal.kind,
    displayName: input.principal.displayName,
    role: input.role,
  });
```

#### `packages/auth/src/assert-can.ts`

```ts
import { permissionError } from '@pressly/errors';
import type { Actor } from './actor.ts';
import type { Permission } from './permission.ts';

export const can = (actor: Actor, permission: Permission): boolean =>
  actor.permissions.includes(permission);

export const assertCan = (actor: Actor, permission: Permission): void => {
  if (can(actor, permission)) return;

  throw permissionError({
    code: 'missing_permission',
    message: `Actor ${actor.displayName} is missing permission ${permission}.`,
    safeMessage: 'You do not have permission to do this.',
  });
};
```

#### `packages/auth/src/action.ts`

```ts
import type { Permission } from './permission.ts';

export type Action = Permission | 'auth:login' | 'auth:logout';
```

#### `packages/auth/src/session.ts`

```ts
export type Session = Readonly<{
  id: string;
  identityId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

export const isSessionExpired = (
  session: Pick<Session, 'expiresAt'>,
  now: Date,
): boolean => session.expiresAt.getTime() <= now.getTime();

export const isSessionRevoked = (
  session: Pick<Session, 'revokedAt'>,
): boolean => session.revokedAt !== undefined && session.revokedAt !== null;

export const sessionAgeMinutes = (
  session: Pick<Session, 'issuedAt'>,
  now: Date,
): number =>
  Math.max(
    0,
    Math.floor((now.getTime() - session.issuedAt.getTime()) / 60_000),
  );
```

#### `packages/auth/src/decision.ts`

```ts
import type { Actor } from './actor.ts';

export type AuthDenyReason =
  | 'unauthenticated'
  | 'inactive_identity'
  | 'missing_role'
  | 'missing_permission'
  | 'stale_session'
  | 'missing_context'
  | 'invalid_session';

export type AuthDecision =
  | Readonly<{ ok: true; actor: Actor }>
  | Readonly<{
      ok: false;
      reason: AuthDenyReason;
      safeMessage: string;
      details?: unknown;
    }>;

export const allowDecision = (actor: Actor): AuthDecision => ({
  ok: true,
  actor,
});

export const denyDecision = (
  reason: AuthDenyReason,
  safeMessage: string,
  details?: unknown,
): AuthDecision => ({
  ok: false,
  reason,
  safeMessage,
  ...(details === undefined ? {} : { details }),
});
```

#### `packages/auth/src/policy.ts`

```ts
import type { Actor } from './actor.ts';
import type { Action } from './action.ts';
import type { AuthDecision, AuthDenyReason } from './decision.ts';
import { allowDecision, denyDecision } from './decision.ts';
import type { Permission, Role } from './permission.ts';
import { can } from './assert-can.ts';

export type AuthContext = Readonly<{
  sessionAgeMinutes?: number;
  [key: string]: unknown;
}>;

export type PolicyCondition = Readonly<{
  name: string;
  denyReason: AuthDenyReason;
  safeMessage: string;
  evaluate: (input: {
    actor: Actor;
    action: Action;
    context: AuthContext;
  }) => boolean;
}>;

export type PolicyRule = Readonly<{
  action: Action;
  roles: readonly Role[];
  permissions: readonly Permission[];
  conditions: readonly PolicyCondition[];
}>;

export type PolicyBuilder = PolicyRule &
  Readonly<{
    to: (...roles: readonly Role[]) => PolicyBuilder;
    require: (...permissions: readonly Permission[]) => PolicyBuilder;
    when: (...conditions: readonly PolicyCondition[]) => PolicyBuilder;
  }>;

const buildRule = (draft: PolicyRule): PolicyBuilder => ({
  ...draft,
  to: (...roles) => buildRule({ ...draft, roles }),
  require: (...permissions) => buildRule({ ...draft, permissions }),
  when: (...conditions) =>
    buildRule({ ...draft, conditions: [...draft.conditions, ...conditions] }),
});

export const allow = (action: Action): PolicyBuilder =>
  buildRule({
    action,
    roles: [],
    permissions: [],
    conditions: [],
  });

export const freshSession = (input: {
  maxAgeMinutes: number;
}): PolicyCondition => ({
  name: 'fresh_session',
  denyReason: 'stale_session',
  safeMessage: 'Please log in again before performing this action.',
  evaluate: ({ context }) =>
    typeof context.sessionAgeMinutes === 'number' &&
    context.sessionAgeMinutes <= input.maxAgeMinutes,
});

const matchesRole = (rule: PolicyRule, actor: Actor): boolean =>
  rule.roles.length === 0 || rule.roles.includes(actor.role);

const matchesPermissions = (rule: PolicyRule, actor: Actor): boolean =>
  rule.permissions.every((value) => can(actor, value));

export const authorize = (input: {
  actor: Actor;
  action: Action;
  context?: AuthContext;
  policies: readonly PolicyRule[];
}): AuthDecision => {
  const context = input.context ?? {};
  const candidates = input.policies.filter(
    (rule) => rule.action === input.action,
  );
  let hasRoleMatch = false;

  for (const rule of candidates) {
    if (!matchesRole(rule, input.actor)) continue;
    hasRoleMatch = true;
    if (!matchesPermissions(rule, input.actor)) continue;

    const failed = rule.conditions.find(
      (condition) =>
        !condition.evaluate({
          actor: input.actor,
          action: input.action,
          context,
        }),
    );

    if (failed !== undefined)
      return denyDecision(failed.denyReason, failed.safeMessage, {
        condition: failed.name,
      });

    return allowDecision(input.actor);
  }

  return denyDecision(
    candidates.length === 0 || hasRoleMatch
      ? 'missing_permission'
      : 'missing_role',
    'You do not have permission to perform this action.',
    {
      action: input.action,
      role: input.actor.role,
    },
  );
};
```

#### `packages/auth/src/password.ts`

```ts
export type PasswordStrengthViolation =
  | 'password_too_short'
  | 'password_requires_lowercase'
  | 'password_requires_uppercase'
  | 'password_requires_number'
  | 'password_requires_symbol';

export const validatePasswordStrength = (
  password: string,
): readonly PasswordStrengthViolation[] => {
  const violations: PasswordStrengthViolation[] = [];

  if (password.length < 16) violations.push('password_too_short');
  if (!/[a-z]/.test(password)) violations.push('password_requires_lowercase');
  if (!/[A-Z]/.test(password)) violations.push('password_requires_uppercase');
  if (!/\d/.test(password)) violations.push('password_requires_number');
  if (!/[^A-Za-z0-9]/.test(password))
    violations.push('password_requires_symbol');

  return violations;
};
```

#### `packages/auth/src/index.ts`

```ts
export { can, assertCan } from './assert-can.ts';
export { actorFromPrincipal, makeActor } from './actor.ts';
export { allowDecision, denyDecision } from './decision.ts';
export { normalizeEmail } from './identity.ts';
export { principalLabel } from './principal.ts';
export { isRole, permissionsForRole, selectHighestRole } from './permission.ts';
export { allow, authorize, freshSession } from './policy.ts';
export {
  isSessionExpired,
  isSessionRevoked,
  sessionAgeMinutes,
} from './session.ts';
export { validatePasswordStrength } from './password.ts';

export type { Action } from './action.ts';
export type { Actor } from './actor.ts';
export type { AuthDecision, AuthDenyReason } from './decision.ts';
export type { Identity, IdentityKind } from './identity.ts';
export type { Principal } from './principal.ts';
export type { Permission, Role } from './permission.ts';
export type { AuthContext, PolicyCondition, PolicyRule } from './policy.ts';
export type { Session } from './session.ts';
export type { PasswordStrengthViolation } from './password.ts';
```

### 17.2 `packages/contracts`

#### `packages/contracts/src/auth/auth.contracts.ts`

```ts
import { z } from 'zod';

export const authRoleSchema = z.enum([
  'owner',
  'admin',
  'operator',
  'customer',
  'driver',
  'service',
  'developer',
  'ci',
]);

export const loginRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1),
  })
  .strict();

export const authPrincipalSchema = z
  .object({
    identityId: z.uuid(),
    displayName: z.string().min(1),
    email: z.email().optional(),
    roles: z.array(authRoleSchema).min(1),
  })
  .strict();

export const loginResultSchema = z
  .object({
    accessToken: z.string().min(32),
    expiresAt: z.iso.datetime(),
    principal: authPrincipalSchema,
  })
  .strict();

export const sessionResultSchema = z
  .object({
    principal: authPrincipalSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const logoutResultSchema = z
  .object({
    revoked: z.literal(true),
  })
  .strict();
```

#### `packages/contracts/src/auth/auth.command.ts`

```ts
import type { z } from 'zod';
import type { loginRequestSchema } from './auth.contracts.ts';

export type LoginRequest = z.infer<typeof loginRequestSchema>;
```

#### `packages/contracts/src/auth/auth.result.ts`

```ts
import type { z } from 'zod';
import type {
  authPrincipalSchema,
  loginResultSchema,
  logoutResultSchema,
  sessionResultSchema,
} from './auth.contracts.ts';

export type AuthPrincipalResult = z.infer<typeof authPrincipalSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type SessionResult = z.infer<typeof sessionResultSchema>;
export type LogoutResult = z.infer<typeof logoutResultSchema>;
```

#### Add to `packages/contracts/src/pricing/pricing.contracts.ts`

```ts
export const pricingChangeRequestSchema = z
  .object({
    serviceSlug: pricingServiceSlugSchema,
    locationSlug: z.string().min(1).optional(),
    reason: z.string().min(1),
    items: z.array(publishPricingChangeItemSchema).min(1),
  })
  .strict();
```

Add neutral server-side attribution:

```ts
export const pricingChangeAuthorSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['human', 'service']),
    displayName: z.string().min(1),
  })
  .strict();
```

#### Add to `packages/contracts/src/pricing/pricing.command.ts`

```ts
import type { pricingChangeRequestSchema } from './pricing.contracts.ts';

export type PricingChangeRequest = z.infer<typeof pricingChangeRequestSchema>;
```

#### Add to `packages/contracts/src/index.ts`

```ts
export {
  authPrincipalSchema,
  authRoleSchema,
  loginRequestSchema,
  loginResultSchema,
  logoutResultSchema,
  sessionResultSchema,
} from './auth/auth.contracts.ts';

export type { LoginRequest } from './auth/auth.command.ts';

export type {
  AuthPrincipalResult,
  LoginResult,
  LogoutResult,
  SessionResult,
} from './auth/auth.result.ts';

export { pricingChangeRequestSchema } from './pricing/pricing.contracts.ts';

export type { PricingChangeRequest } from './pricing/pricing.command.ts';
```

### 17.3 `packages/db`

#### `packages/db/src/schema/auth.schema.ts`

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  displayName: text('display_name').notNull(),
  email: text('email').unique(),
  emailNormalized: text('email_normalized').unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authPasswordCredentials = pgTable('auth_password_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => authIdentities.id),
  passwordHash: text('password_hash').notNull(),
  passwordUpdatedAt: timestamp('password_updated_at', {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => authIdentities.id),
  tokenHash: text('token_hash').notNull().unique(),
  issuedAt: timestamp('issued_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authIdentityRoles = pgTable('auth_identity_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => authIdentities.id),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdByIdentityId: uuid('created_by_identity_id').references(
    () => authIdentities.id,
  ),
});

export const authLoginAttempts = pgTable('auth_login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailNormalized: text('email_normalized').notNull(),
  identityId: uuid('identity_id').references(() => authIdentities.id),
  success: boolean('success').notNull(),
  failureCode: text('failure_code'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authAuditEvents = pgTable('auth_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorIdentityId: uuid('actor_identity_id').references(
    () => authIdentities.id,
  ),
  eventType: text('event_type').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

#### `packages/db/src/schema.ts`

```ts
export * from './schema/auth.schema.ts';
export * from './schema/pricing.schema.ts';
```

#### `packages/db/src/index.ts`

```ts
export * as auth from './schema/auth.schema.ts';
export * as pricing from './schema/pricing.schema.ts';
```

Keep the existing database exports below those lines.

#### First-owner bootstrap command

Own first-user bootstrap in `modules/auth`, not `packages/db`.

```txt
modules/auth/src/features/bootstrap-owner
modules/auth/src/adapters/bootstrap-owner/persistence
modules/auth/src/adapters/bootstrap-owner/cli/bootstrap-owner.command.ts
```

Add scripts:

```json
{
  "scripts": {
    "auth:bootstrap:owner": "pnpm -F @pressly/auth-module bootstrap:owner"
  }
}
```

The command:

- requires `DATABASE_URL`
- requires `PRESSLY_BOOTSTRAP_OWNER_EMAIL`
- requires `PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner`
- reads the password from stdin with `--password-stdin`
- creates only the first owner
- refuses if any owner exists
- refuses if the email already belongs to an identity
- writes `auth.owner_bootstrapped`

It must never upsert identities, reset passwords, reactivate users, or run from normal app startup.

### 17.4 `modules/auth`

#### `modules/auth/package.json`

```json
{
  "name": "@pressly/auth-module",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/public.js",
  "types": "./dist/public.d.ts",
  "exports": {
    ".": {
      "types": "./dist/public.d.ts",
      "import": "./dist/public.js",
      "default": "./dist/public.js"
    }
  },
  "scripts": {
    "build:workspace-deps": "pnpm --dir ../../packages/errors run build && pnpm --dir ../../packages/auth run build && pnpm --dir ../../packages/db run build",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "typecheck:test": "tsc -p tsconfig.test.json --noEmit",
    "lint": "eslint src --max-warnings=0",
    "bootstrap:owner": "pnpm run build:workspace-deps && pnpm --dir ../.. exec tsx modules/auth/src/adapters/bootstrap-owner/cli/bootstrap-owner.command.ts",
    "test": "vitest run --exclude 'test/**/*.int.test.ts'",
    "test:integration": "vitest run test/adapters/*.repo.int.test.ts --no-file-parallelism",
    "test:all": "pnpm test && pnpm test:integration",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@pressly/auth": "workspace:*",
    "@pressly/contracts": "workspace:*",
    "@pressly/db": "workspace:*",
    "@pressly/errors": "workspace:*",
    "@pressly/http": "workspace:*",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@pressly/testkit": "workspace:*",
    "@pressly/tsconfig": "workspace:*",
    "@types/express": "^5.0.6",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "^4.1.5"
  }
}
```

#### `modules/auth/tsconfig.json`

```json
{
  "extends": "../../packages/tsconfig/node.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "rewriteRelativeImportExtensions": true,
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

#### `modules/auth/src/features/login/login.port.ts`

```ts
import type { Principal, Role } from '@pressly/auth';
import type { AppError, Result } from '@pressly/errors';

export type LoginIdentityRecord = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly Role[];
}>;

export type LoginPasswordCredentialRecord = Readonly<{
  identityId: string;
  passwordHash: string;
}>;

export type CreateSessionInput = Readonly<{
  identityId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type CreatedSession = Readonly<{
  id: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type LoginAttemptInput = Readonly<{
  emailNormalized: string;
  identityId?: string;
  success: boolean;
  failureCode?: string;
  ipAddress?: string;
  userAgent?: string;
}>;

export type AuthAuditEventInput = Readonly<{
  actorIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}>;

export type LoginStore = Readonly<{
  findIdentityByEmail: (
    emailNormalized: string,
  ) => Promise<Result<LoginIdentityRecord | undefined, AppError>>;
  findPasswordCredential: (
    identityId: string,
  ) => Promise<Result<LoginPasswordCredentialRecord | undefined, AppError>>;
  countRecentFailedAttempts: (input: {
    emailNormalized: string;
    since: Date;
  }) => Promise<Result<number, AppError>>;
  createSession: (
    input: CreateSessionInput,
  ) => Promise<Result<CreatedSession, AppError>>;
  recordLoginAttempt: (
    input: LoginAttemptInput,
  ) => Promise<Result<void, AppError>>;
  recordAuditEvent: (
    input: AuthAuditEventInput,
  ) => Promise<Result<void, AppError>>;
}>;

export type PasswordVerifier = Readonly<{
  verify: (
    passwordHash: string,
    plainTextPassword: string,
  ) => Promise<Result<boolean, AppError>>;
}>;

export type TokenIssuer = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;

export type LoginPrincipal = Principal;
```

#### `modules/auth/src/features/login/login.error.ts`

```ts
import { makeAppError } from '@pressly/errors';

export const invalidCredentials = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'invalid_credentials',
    message: 'Invalid email or password.',
    safeMessage: 'Invalid email or password.',
    status: 401,
  });

export const loginRateLimited = () =>
  makeAppError({
    kind: 'RateLimitError',
    code: 'login_rate_limited',
    message: 'Too many failed login attempts.',
    safeMessage: 'Too many failed login attempts. Try again later.',
    status: 429,
  });
```

#### `modules/auth/src/features/login/login.usecase.ts`

```ts
import { normalizeEmail } from '@pressly/auth';
import type { LoginResult } from '@pressly/contracts';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import { invalidCredentials, loginRateLimited } from './login.error.ts';
import type {
  Clock,
  LoginStore,
  PasswordVerifier,
  TokenIssuer,
} from './login.port.ts';

export type LoginCommand = Readonly<{
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}>;

export type Login = (
  command: LoginCommand,
) => Promise<Result<LoginResult, AppError>>;

export type LoginOptions = Readonly<{
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
}>;

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

const failureAttempt = (input: {
  emailNormalized: string;
  identityId?: string;
  ipAddress?: string;
  userAgent?: string;
}) => ({
  emailNormalized: input.emailNormalized,
  ...(input.identityId === undefined ? {} : { identityId: input.identityId }),
  success: false,
  failureCode: 'invalid_credentials',
  ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
  ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
});

export const makeLogin =
  (deps: {
    store: LoginStore;
    passwordVerifier: PasswordVerifier;
    tokenIssuer: TokenIssuer;
    clock: Clock;
    options: LoginOptions;
  }): Login =>
  async (command) => {
    const now = deps.clock.now();
    const emailNormalized = normalizeEmail(command.email);
    const since = addMinutes(now, -deps.options.loginWindowMinutes);
    const failedAttempts = await deps.store.countRecentFailedAttempts({
      emailNormalized,
      since,
    });

    if (!failedAttempts.ok) return failedAttempts;

    if (failedAttempts.value >= deps.options.loginMaxFailures)
      return err(loginRateLimited());

    const identity = await deps.store.findIdentityByEmail(emailNormalized);

    if (!identity.ok) return identity;

    if (identity.value === undefined || !identity.value.isActive) {
      await deps.store.recordLoginAttempt(
        failureAttempt({
          emailNormalized,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        }),
      );
      return err(invalidCredentials());
    }

    const credential = await deps.store.findPasswordCredential(
      identity.value.id,
    );

    if (!credential.ok) return credential;

    if (credential.value === undefined) {
      await deps.store.recordLoginAttempt(
        failureAttempt({
          emailNormalized,
          identityId: identity.value.id,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        }),
      );
      return err(invalidCredentials());
    }

    const verified = await deps.passwordVerifier.verify(
      credential.value.passwordHash,
      command.password,
    );

    if (!verified.ok) return verified;

    if (!verified.value) {
      await deps.store.recordLoginAttempt(
        failureAttempt({
          emailNormalized,
          identityId: identity.value.id,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        }),
      );
      return err(invalidCredentials());
    }

    const accessToken = deps.tokenIssuer.issue();
    const issuedAt = now;
    const expiresAt = addMinutes(now, deps.options.sessionTtlMinutes);
    const session = await deps.store.createSession({
      identityId: identity.value.id,
      tokenHash: deps.tokenIssuer.hash(accessToken),
      issuedAt,
      expiresAt,
    });

    if (!session.ok) return session;

    await deps.store.recordLoginAttempt({
      emailNormalized,
      identityId: identity.value.id,
      success: true,
      ...(command.ipAddress === undefined
        ? {}
        : { ipAddress: command.ipAddress }),
      ...(command.userAgent === undefined
        ? {}
        : { userAgent: command.userAgent }),
    });

    await deps.store.recordAuditEvent({
      actorIdentityId: identity.value.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: session.value.id,
      metadata: { email: emailNormalized },
    });

    return ok({
      accessToken,
      expiresAt: session.value.expiresAt.toISOString(),
      principal: {
        identityId: identity.value.id,
        displayName: identity.value.displayName,
        ...(identity.value.email === undefined
          ? {}
          : { email: identity.value.email }),
        roles: [...identity.value.roles],
      },
    });
  };
```

#### `modules/auth/src/features/load-session/load-session.port.ts`

```ts
import type { Principal, Role } from '@pressly/auth';
import type { AppError, Result } from '@pressly/errors';

export type StoredSessionPrincipal = Readonly<{
  sessionId: string;
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly Role[];
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

export type LoadSessionStore = Readonly<{
  findByTokenHash: (
    tokenHash: string,
  ) => Promise<Result<StoredSessionPrincipal | undefined, AppError>>;
  touchSession: (
    sessionId: string,
    now: Date,
  ) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{
  hash: (rawToken: string) => string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;

export type LoadedPrincipal = Principal;
```

#### `modules/auth/src/features/load-session/load-session.error.ts`

```ts
import { makeAppError } from '@pressly/errors';

export const missingBearerToken = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

export const invalidSession = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'invalid_session',
    message: 'Session is invalid.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

export const expiredSession = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'session_expired',
    message: 'Session is expired.',
    safeMessage: 'Please log in again.',
    status: 401,
  });
```

#### `modules/auth/src/features/load-session/load-session.usecase.ts`

```ts
import {
  isSessionExpired,
  isSessionRevoked,
  type Principal,
} from '@pressly/auth';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import { expiredSession, invalidSession } from './load-session.error.ts';
import type {
  Clock,
  LoadSessionStore,
  TokenHasher,
} from './load-session.port.ts';

export type LoadSessionCommand = Readonly<{
  bearerToken: string;
}>;

export type LoadSession = (
  command: LoadSessionCommand,
) => Promise<Result<Principal, AppError>>;

export const makeLoadSession =
  (deps: {
    store: LoadSessionStore;
    tokenHasher: TokenHasher;
    clock: Clock;
  }): LoadSession =>
  async (command) => {
    const now = deps.clock.now();
    const found = await deps.store.findByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
    );

    if (!found.ok) return found;
    if (found.value === undefined) return err(invalidSession());
    if (!found.value.isActive) return err(invalidSession());
    if (isSessionRevoked(found.value)) return err(invalidSession());
    if (isSessionExpired(found.value, now)) return err(expiredSession());

    const touched = await deps.store.touchSession(found.value.sessionId, now);

    if (!touched.ok) return touched;

    return ok({
      identityId: found.value.identityId,
      kind: found.value.kind,
      displayName: found.value.displayName,
      ...(found.value.email === undefined ? {} : { email: found.value.email }),
      roles: [...found.value.roles],
      sessionId: found.value.sessionId,
      sessionIssuedAt: found.value.issuedAt,
      sessionExpiresAt: found.value.expiresAt,
    });
  };
```

#### `modules/auth/src/features/revoke-session/revoke-session.port.ts`

```ts
import type { AppError, Result } from '@pressly/errors';

export type RevokeSessionStore = Readonly<{
  revokeByTokenHash: (
    tokenHash: string,
    revokedAt: Date,
  ) => Promise<Result<{ sessionId?: string; identityId?: string }, AppError>>;
  recordAuditEvent: (input: {
    actorIdentityId?: string;
    eventType: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{
  hash: (rawToken: string) => string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;
```

#### `modules/auth/src/features/revoke-session/revoke-session.usecase.ts`

```ts
import type { LogoutResult } from '@pressly/contracts';
import { ok, type AppError, type Result } from '@pressly/errors';
import type {
  Clock,
  RevokeSessionStore,
  TokenHasher,
} from './revoke-session.port.ts';

export type RevokeSessionCommand = Readonly<{
  bearerToken: string;
}>;

export type RevokeSession = (
  command: RevokeSessionCommand,
) => Promise<Result<LogoutResult, AppError>>;

export const makeRevokeSession =
  (deps: {
    store: RevokeSessionStore;
    tokenHasher: TokenHasher;
    clock: Clock;
  }): RevokeSession =>
  async (command) => {
    const revoked = await deps.store.revokeByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
      deps.clock.now(),
    );

    if (!revoked.ok) return revoked;

    await deps.store.recordAuditEvent({
      actorIdentityId: revoked.value.identityId,
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      resourceId: revoked.value.sessionId,
    });

    return ok({ revoked: true });
  };
```

#### `packages/auth/src/token-issuer.ts`

```ts
import { createHmac, randomBytes } from 'node:crypto';

export const makeTokenIssuer = (secret: string) => ({
  issue: (): string => randomBytes(32).toString('base64url'),
  hash: (rawToken: string): string =>
    createHmac('sha256', secret).update(rawToken).digest('hex'),
});
```

#### `packages/auth/src/password-verifier.ts`

```ts
import { verify } from 'argon2';
import {
  err,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';

export const makePasswordVerifier = () => ({
  verify: async (
    passwordHash: string,
    plainTextPassword: string,
  ): Promise<Result<boolean, AppError>> => {
    try {
      return ok(await verify(passwordHash, plainTextPassword));
    } catch (error) {
      return err(
        makeAppError({
          kind: 'UnexpectedError',
          code: 'password_verification_failed',
          message: 'Password verification failed.',
          safeMessage: 'Invalid email or password.',
          status: 500,
          cause: error,
        }),
      );
    }
  },
});
```

#### `packages/auth/src/password-hasher.ts`

Keep password hashing beside password verification in `@pressly/auth`.

The auth module can use `makePasswordHasher()` for operational bootstrap without making `@pressly/db` depend on Argon2.

#### Persistence adapter shape

Do not create one combined `auth.repo.ts`.

The feature ports stay narrow, so the persistence adapters should stay vertical:

```txt
modules/auth/src/adapters/
  login/
    persistence/
      login.repo.ts
  load-session/
    persistence/
      load-session.repo.ts
  revoke-session/
    persistence/
      revoke-session.repo.ts
  shared/
    persistence/
      auth-audit.ts
      database-result.ts
      roles.ts
```

The `shared/persistence` files are small helpers, not a shared auth repository.
They should not import feature ports or combine store interfaces.

#### `modules/auth/src/adapters/shared/persistence/database-result.ts`

```ts
import {
  err,
  isAppError,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';

export const databaseFailure = (cause: unknown): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    code: 'auth_database_failed',
    message: 'Auth database operation failed.',
    safeMessage: 'Authentication could not be completed.',
    status: 500,
    cause,
  });

export const toDatabaseResult = async <T>(
  work: () => Promise<T>,
): Promise<Result<T, AppError>> => {
  try {
    return ok(await work());
  } catch (error) {
    return err(isAppError(error) ? error : databaseFailure(error));
  }
};
```

#### `modules/auth/src/adapters/shared/persistence/roles.ts`

```ts
import { isRole, type Role } from '@pressly/auth';

export const mapStoredRoles = (rows: readonly { role: string }[]): Role[] =>
  rows.map((row) => row.role).filter(isRole);
```

#### `modules/auth/src/adapters/shared/persistence/auth-audit.ts`

```ts
import { auth, type Database } from '@pressly/db';
import type { AppError, Result } from '@pressly/errors';
import { toDatabaseResult } from './database-result.ts';

export type AuthAuditEventInput = Readonly<{
  actorIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}>;

export const recordAuthAuditEvent = (
  db: Database,
  input: AuthAuditEventInput,
): Promise<Result<void, AppError>> =>
  toDatabaseResult(async () => {
    await db.insert(auth.authAuditEvents).values({
      ...input,
      metadata: input.metadata ?? {},
    });
  });
```

#### `modules/auth/src/adapters/login/persistence/login.repo.ts`

```ts
import { and, auth, eq, gt, sql, type Database } from '@pressly/db';
import type {
  LoginAttemptInput,
  LoginStore,
} from '../../../features/login/login.port.ts';
import { recordAuthAuditEvent } from '../../shared/persistence/auth-audit.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../../shared/persistence/database-result.ts';
import { mapStoredRoles } from '../../shared/persistence/roles.ts';

export const makeLoginRepository = (db: Database): LoginStore => ({
  findIdentityByEmail: async (emailNormalized) =>
    toDatabaseResult(async () => {
      const [identity] = await db
        .select()
        .from(auth.authIdentities)
        .where(eq(auth.authIdentities.emailNormalized, emailNormalized))
        .limit(1);

      if (identity === undefined) return undefined;

      const roles = await db
        .select()
        .from(auth.authIdentityRoles)
        .where(eq(auth.authIdentityRoles.identityId, identity.id));

      return {
        id: identity.id,
        kind: identity.kind === 'service' ? 'service' : 'human',
        displayName: identity.displayName,
        ...(identity.email === null ? {} : { email: identity.email }),
        isActive: identity.isActive,
        roles: mapStoredRoles(roles),
      };
    }),

  findPasswordCredential: async (identityId) =>
    toDatabaseResult(async () => {
      const [credential] = await db
        .select()
        .from(auth.authPasswordCredentials)
        .where(eq(auth.authPasswordCredentials.identityId, identityId))
        .limit(1);

      if (credential === undefined) return undefined;

      return {
        identityId: credential.identityId,
        passwordHash: credential.passwordHash,
      };
    }),

  countRecentFailedAttempts: async ({ emailNormalized, since }) =>
    toDatabaseResult(async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auth.authLoginAttempts)
        .where(
          and(
            eq(auth.authLoginAttempts.emailNormalized, emailNormalized),
            eq(auth.authLoginAttempts.success, false),
            gt(auth.authLoginAttempts.createdAt, since),
          ),
        );

      return row?.count ?? 0;
    }),

  createSession: async (input) =>
    toDatabaseResult(async () => {
      const [session] = await db
        .insert(auth.authSessions)
        .values(input)
        .returning();

      if (session === undefined)
        throw databaseFailure('auth session insert returned no row');

      return {
        id: session.id,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      };
    }),

  recordLoginAttempt: async (input: LoginAttemptInput) =>
    toDatabaseResult(async () => {
      await db.insert(auth.authLoginAttempts).values(input);
    }),

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
```

#### `modules/auth/src/adapters/load-session/persistence/load-session.repo.ts`

```ts
import { auth, eq, type Database } from '@pressly/db';
import type { LoadSessionStore } from '../../../features/load-session/load-session.port.ts';
import { toDatabaseResult } from '../../shared/persistence/database-result.ts';
import { mapStoredRoles } from '../../shared/persistence/roles.ts';

export const makeLoadSessionRepository = (db: Database): LoadSessionStore => ({
  findByTokenHash: async (tokenHash) =>
    toDatabaseResult(async () => {
      const [row] = await db
        .select({
          session: auth.authSessions,
          identity: auth.authIdentities,
        })
        .from(auth.authSessions)
        .innerJoin(
          auth.authIdentities,
          eq(auth.authSessions.identityId, auth.authIdentities.id),
        )
        .where(eq(auth.authSessions.tokenHash, tokenHash))
        .limit(1);

      if (row === undefined) return undefined;

      const roles = await db
        .select()
        .from(auth.authIdentityRoles)
        .where(eq(auth.authIdentityRoles.identityId, row.identity.id));

      return {
        sessionId: row.session.id,
        identityId: row.identity.id,
        kind: row.identity.kind === 'service' ? 'service' : 'human',
        displayName: row.identity.displayName,
        ...(row.identity.email === null ? {} : { email: row.identity.email }),
        isActive: row.identity.isActive,
        roles: mapStoredRoles(roles),
        issuedAt: row.session.issuedAt,
        expiresAt: row.session.expiresAt,
        revokedAt: row.session.revokedAt,
      };
    }),

  touchSession: async (sessionId, now) =>
    toDatabaseResult(async () => {
      await db
        .update(auth.authSessions)
        .set({ lastUsedAt: now })
        .where(eq(auth.authSessions.id, sessionId));
    }),
});
```

#### `modules/auth/src/adapters/revoke-session/persistence/revoke-session.repo.ts`

```ts
import { and, auth, eq, gt, isNull, type Database } from '@pressly/db';
import type { RevokeSessionStore } from '../../../features/revoke-session/revoke-session.port.ts';
import { recordAuthAuditEvent } from '../../shared/persistence/auth-audit.ts';
import { toDatabaseResult } from '../../shared/persistence/database-result.ts';

export const makeRevokeSessionRepository = (
  db: Database,
): RevokeSessionStore => ({
  revokeByTokenHash: async (tokenHash, revokedAt) =>
    toDatabaseResult(async () => {
      const [session] = await db
        .update(auth.authSessions)
        .set({ revokedAt })
        .where(
          and(
            eq(auth.authSessions.tokenHash, tokenHash),
            isNull(auth.authSessions.revokedAt),
            gt(auth.authSessions.expiresAt, revokedAt),
          ),
        )
        .returning();

      return {
        ...(session === undefined ? {} : { sessionId: session.id }),
        ...(session === undefined ? {} : { identityId: session.identityId }),
      };
    }),

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
```

#### `modules/auth/src/adapters/login/http/login.controller.ts`

```ts
import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { LoginRequest } from '@pressly/contracts';
import type { Login } from '../../../features/login/login.usecase.ts';

export const makeLoginController = (login: Login): RequestHandler =>
  catchAsync(async (req, res) => {
    const body = req.body as LoginRequest;
    const result = await login({
      email: body.email,
      password: body.password,
      ipAddress: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
```

#### `modules/auth/src/adapters/login/http/login.route.ts`

```ts
import { Router } from 'express';
import { loginRequestSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { Login } from '../../../features/login/login.usecase.ts';
import { makeLoginController } from './login.controller.ts';

export const makeLoginRoute = (login: Login): Router => {
  const router = Router();

  router.post(
    '/',
    validateRequest({ body: loginRequestSchema }),
    makeLoginController(login),
  );

  return router;
};
```

#### `modules/auth/src/adapters/load-session/http/authenticate.middleware.ts`

```ts
import type { RequestHandler } from 'express';
import {
  actorFromPrincipal,
  selectHighestRole,
  type Actor,
  type Principal,
} from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';
import { missingBearerToken } from '../../../features/load-session/load-session.error.ts';

export type AuthLocals = Readonly<{
  principal: Principal;
  actor: Actor;
}>;

const readBearerToken = (authorization: string | undefined): string => {
  if (authorization === undefined) throw missingBearerToken();

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token === undefined || token.trim() === '')
    throw missingBearerToken();

  return token;
};

export const makeAuthenticateMiddleware = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const principal = await loadSession({ bearerToken: token });

    if (!principal.ok) throw principal.error;

    const role = selectHighestRole(principal.value.roles);

    if (role === undefined)
      throw makeAppError({
        kind: 'PermissionError',
        code: 'missing_role',
        message: 'Authenticated principal has no usable role.',
        safeMessage: 'You do not have permission to do this.',
        status: 403,
      });

    res.locals['auth'] = {
      principal: principal.value,
      actor: actorFromPrincipal({ principal: principal.value, role }),
    } satisfies AuthLocals;

    next();
  });
```

#### `modules/auth/src/adapters/load-session/http/authorize.middleware.ts`

```ts
import type { RequestHandler } from 'express';
import {
  allow,
  authorize,
  freshSession,
  sessionAgeMinutes,
  type AuthContext,
  type Actor,
  type Permission,
  type Principal,
  type Role,
} from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';

type AuthLocals = Readonly<{
  principal: Principal;
  actor: Actor;
}>;

export type AuthorizeMiddlewareInput = Readonly<{
  action: Permission;
  roles: readonly Role[];
  freshSessionMaxAgeMinutes?: number;
}>;

export type AuthorizeMiddlewareFactory = (
  input: AuthorizeMiddlewareInput,
) => RequestHandler;

export const makeAuthorizeMiddleware =
  (): AuthorizeMiddlewareFactory => (input) =>
    catchAsync(async (_req, res, next) => {
      const auth = res.locals['auth'] as AuthLocals | undefined;

      if (auth === undefined)
        throw makeAppError({
          kind: 'PermissionError',
          code: 'missing_auth_context',
          message: 'Auth middleware did not run before authorization.',
          safeMessage: 'Authentication is required.',
          status: 401,
        });

      const conditions =
        input.freshSessionMaxAgeMinutes === undefined
          ? []
          : [freshSession({ maxAgeMinutes: input.freshSessionMaxAgeMinutes })];

      const policies = [
        allow(input.action)
          .to(...input.roles)
          .require(input.action)
          .when(...conditions),
      ];

      const context: AuthContext =
        auth.principal.sessionIssuedAt === undefined
          ? {}
          : {
              sessionAgeMinutes: sessionAgeMinutes(
                { issuedAt: auth.principal.sessionIssuedAt },
                new Date(),
              ),
            };

      const decision = authorize({
        actor: auth.actor,
        action: input.action,
        context,
        policies,
      });

      if (!decision.ok)
        throw makeAppError({
          kind: 'PermissionError',
          code: decision.reason,
          message: decision.safeMessage,
          safeMessage: decision.safeMessage,
          status: 403,
          details: decision.details,
        });

      next();
    });
```

#### `modules/auth/src/adapters/load-session/http/load-session.controller.ts`

```ts
import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';
import { missingBearerToken } from '../../../features/load-session/load-session.error.ts';

const readBearerToken = (authorization: string | undefined): string => {
  if (authorization === undefined) throw missingBearerToken();

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token === undefined || token.trim() === '')
    throw missingBearerToken();

  return token;
};

export const makeLoadSessionController = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const result = await loadSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    if (result.value.sessionExpiresAt === undefined)
      throw makeAppError({
        kind: 'InvariantViolationError',
        code: 'loaded_session_missing_expiry',
        message: 'Loaded session principal is missing session expiry.',
        safeMessage: 'Session could not be loaded.',
        status: 500,
      });

    res.status(200).json(
      apiSuccess({
        principal: {
          identityId: result.value.identityId,
          displayName: result.value.displayName,
          ...(result.value.email === undefined
            ? {}
            : { email: result.value.email }),
          roles: [...result.value.roles],
        },
        expiresAt: result.value.sessionExpiresAt.toISOString(),
      }),
    );
  });
```

#### `modules/auth/src/adapters/revoke-session/http/revoke-session.controller.ts`

```ts
import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { RevokeSession } from '../../../features/revoke-session/revoke-session.usecase.ts';
import { missingBearerToken } from '../../../features/load-session/load-session.error.ts';

const readBearerToken = (authorization: string | undefined): string => {
  if (authorization === undefined) throw missingBearerToken();

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token === undefined || token.trim() === '')
    throw missingBearerToken();

  return token;
};

export const makeRevokeSessionController = (
  revokeSession: RevokeSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const result = await revokeSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
```

#### `modules/auth/src/main.ts`

```ts
import { Router } from 'express';
import { makePasswordVerifier, makeTokenIssuer } from '@pressly/auth';
import type { Database } from '@pressly/db';
import { makeLoginRoute } from './adapters/login/http/login.route.ts';
import { makeLoginRepository } from './adapters/login/persistence/login.repo.ts';
import { makeAuthenticateMiddleware } from './adapters/load-session/http/authenticate.middleware.ts';
import { makeAuthorizeMiddleware } from './adapters/load-session/http/authorize.middleware.ts';
import { makeLoadSessionController } from './adapters/load-session/http/load-session.controller.ts';
import { makeLoadSessionRepository } from './adapters/load-session/persistence/load-session.repo.ts';
import { makeRevokeSessionController } from './adapters/revoke-session/http/revoke-session.controller.ts';
import { makeRevokeSessionRepository } from './adapters/revoke-session/persistence/revoke-session.repo.ts';
import { makeLogin } from './features/login/login.usecase.ts';
import { makeLoadSession } from './features/load-session/load-session.usecase.ts';
import { makeRevokeSession } from './features/revoke-session/revoke-session.usecase.ts';

export type AuthModuleDeps = Readonly<{
  db: Database;
  tokenSecret: string;
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
  freshSessionMaxAgeMinutes: number;
}>;

export const makeAuthModule = (deps: AuthModuleDeps) => {
  const loginStore = makeLoginRepository(deps.db);
  const loadSessionStore = makeLoadSessionRepository(deps.db);
  const revokeSessionStore = makeRevokeSessionRepository(deps.db);
  const tokenIssuer = makeTokenIssuer(deps.tokenSecret);
  const clock = { now: () => new Date() };

  const login = makeLogin({
    store: loginStore,
    passwordVerifier: makePasswordVerifier(),
    tokenIssuer,
    clock,
    options: {
      sessionTtlMinutes: deps.sessionTtlMinutes,
      loginWindowMinutes: deps.loginWindowMinutes,
      loginMaxFailures: deps.loginMaxFailures,
    },
  });

  const loadSession = makeLoadSession({
    store: loadSessionStore,
    tokenHasher: tokenIssuer,
    clock,
  });

  const revokeSession = makeRevokeSession({
    store: revokeSessionStore,
    tokenHasher: tokenIssuer,
    clock,
  });

  const routes = Router();

  routes.use('/login', makeLoginRoute(login));
  routes.get('/session', makeLoadSessionController(loadSession));
  routes.post('/logout', makeRevokeSessionController(revokeSession));

  return {
    routes,
    guards: {
      authenticate: makeAuthenticateMiddleware(loadSession),
      authorize: makeAuthorizeMiddleware(),
    },
    usecases: {
      login,
      loadSession,
      revokeSession,
    },
  };
};

export type AuthModule = ReturnType<typeof makeAuthModule>;
```

#### `modules/auth/src/public.ts`

```ts
export { makeAuthModule } from './main.ts';
export type { AuthModule, AuthModuleDeps } from './main.ts';
export type { AuthLocals } from './adapters/load-session/http/authenticate.middleware.ts';
export type {
  AuthorizeMiddlewareFactory,
  AuthorizeMiddlewareInput,
} from './adapters/load-session/http/authorize.middleware.ts';
```

### 17.5 Pricing HTTP Adapter

Current shape:

```txt
modules/pricing exposes:
  http.loadCatalog
  http.planChange({ readAuthor })
  http.publishChange({ readAuthor })

apps/api declares:
  validate -> authenticate -> authorize -> handler
```

Pricing HTTP adapters do not import auth middleware, roles, permissions, or `@pressly/auth`.

Pricing write controllers build commands with `requestedBy`, not a role-bearing actor.

```ts
const result = await publishPricingChange({
  ...body,
  requestedBy: readAuthor(res),
});
```

### 17.6 API Wiring

#### Add `@pressly/auth-module` to `apps/api/package.json`

```json
{
  "dependencies": {
    "@pressly/auth-module": "workspace:*"
  }
}
```

#### Add auth env in `apps/api/src/common/config/env.ts`

Add to schema:

```ts
AUTH_SECRET: secret,
AUTH_SESSION_TTL_MINUTES: envInteger.default(720),
AUTH_LOGIN_WINDOW_MINUTES: envInteger.default(15),
AUTH_LOGIN_MAX_FAILURES: envInteger.default(8),
AUTH_FRESH_SESSION_MAX_AGE_MINUTES: envInteger.default(15),
```

Add to `apiEnv`:

```ts
auth: {
  secret: rawApiEnv.AUTH_SECRET,
  sessionTtlMinutes: rawApiEnv.AUTH_SESSION_TTL_MINUTES,
  loginWindowMinutes: rawApiEnv.AUTH_LOGIN_WINDOW_MINUTES,
  loginMaxFailures: rawApiEnv.AUTH_LOGIN_MAX_FAILURES,
  freshSessionMaxAgeMinutes: rawApiEnv.AUTH_FRESH_SESSION_MAX_AGE_MINUTES,
},
```

#### Update `apps/api/src/app.ts`

```ts
import { makeAuthModule } from '@pressly/auth-module';
import { makePricingModule } from '@pressly/pricing';
```

Inside `makeApiApp`:

```ts
const authModule = makeAuthModule({
  db: runtime.database.db,
  tokenSecret: revealSecret(runtime.env.auth.secret),
  sessionTtlMinutes: runtime.env.auth.sessionTtlMinutes,
  loginWindowMinutes: runtime.env.auth.loginWindowMinutes,
  loginMaxFailures: runtime.env.auth.loginMaxFailures,
});

const pricingModule = makePricingModule({ db: runtime.database.db });
const planPricingChange = pricingModule.http.planChange({ readAuthor });
const publishPricingChange = pricingModule.http.publishChange({ readAuthor });

app.use('/auth', authModule.routes);

app.post(
  '/pricing/changes/plan',
  planPricingChange.validate,
  authModule.guards.authenticate,
  authModule.guards.authorize({
    action: 'pricing:plan',
    roles: ['owner', 'admin'],
  }),
  planPricingChange.handle,
);

app.post(
  '/pricing/changes/publish',
  publishPricingChange.validate,
  authModule.guards.authenticate,
  authModule.guards.authorize({
    action: 'pricing:publish',
    roles: ['owner'],
    freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
  }),
  publishPricingChange.handle,
);
```

### 17.7 CLI API Client

Current implementation shape:

```txt
apps/cli/src/features/auth/
  api-client.ts
  args.ts
  cli.ts
  token-store.ts

apps/cli/src/features/pricing/
  api-client.ts
```

CLI uses:

```txt
PRESSLY_API_URL=http://localhost:4000
~/.config/pressly/admin-session.json
```

Pricing CLI commands read the stored bearer token.

They call:

```txt
GET  /pricing/services/:serviceSlug/pricing
GET  /pricing/locations/:locationSlug/services/:serviceSlug/pricing
POST /pricing/changes/plan
POST /pricing/changes/publish
```

Auth CLI commands call:

```txt
POST /auth/login
GET  /auth/session
POST /auth/logout
```

The old local DB CLI adapter is intentionally gone.

### 17.8 ESLint Boundary Update

In `eslint.config.mjs`, update the HTTP adapter filename rule:

```js
ignores: [
  '**/adapters/**/http/**/*.controller.ts',
  '**/adapters/**/http/**/*.route.ts',
  '**/adapters/**/http/**/*.middleware.ts',
  '**/adapter/**/http/**/*.controller.ts',
  '**/adapter/**/http/**/*.route.ts',
  '**/adapter/**/http/**/*.middleware.ts',
],
```

Add a middleware import rule:

```js
{
  files: ['**/*.middleware.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex:
              '^\\.(?!.*\\.(?:usecase|policy)(?:\\.(?:ts|js))?$).*',
            message:
              'Middleware files may only use relative imports for *.usecase or *.policy files.',
          },
        ],
      },
    ],
  },
},
```

If the middleware needs another middleware type nearby, move that type to
`@pressly/auth` or keep both values in the same middleware file.

Do not loosen the rule just to make a local import convenient.
