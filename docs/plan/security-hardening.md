Below is the implementation I would write by hand in your repo. It keeps your existing architecture: apps compose, modules own application capability, packages provide stable primitives, adapters translate mechanisms, and route pipes stay `validate -> authenticate -> authorize -> controller`. Your current pricing routes already have that pipe shape.

The change is conceptual:

```txt id="xe47xj"
Before:
principal.roles -> highest role -> selected role -> permission check

After:
credential -> principal -> principal attributes -> resource -> policy decision -> use case
```

Your current code still selects one highest role in auth middleware. That is the main thing to remove from the security path.

---

# 1. Target shape

```txt id="qv7q06"
apps/api
  composes security/identity + policy/access-control + business/pricing
  does not define authorization policy

modules/security/identity
  authenticates credentials/sessions
  loads trusted principal + principal attributes
  provides generic HTTP authentication/authorization middleware

modules/policy/access-control
  owns Pressly application authorization policy
  defines pricing resources and pricing policies
  composes route guards for protected business capabilities
  imports pure authorization primitives from @pressly/auth
  does not import business module internals

modules/business/pricing
  owns pricing business capability
  receives already-composed route security from module wiring
  does not define roles, resources, policies, or authorization rules

packages/auth
  existing auth primitives for identity/session/password
  authorization core is pure policy language and interpreter
  authorization core has no Express, Drizzle, env, bcrypt, filesystem, or AppError dependency

packages/contracts
  external HTTP/API command/result contracts only

packages/db
  storage schema + migrations
```

One boundary correction: `PricingModuleAuthorizationInput` and `AuthorizeMiddlewareInput` should not live in `@pressly/contracts`. They are internal module/middleware ports, not external protocol contracts. Right now they are exported from contracts. Keep request/response schemas in contracts. Move generic authorization middleware types into `modules/security/identity` or `@pressly/auth`, and move route-specific policy composition into `modules/policy/access-control`.

One implementation correction: `packages/auth` already exists and is not purely authorization-only today. Do not block this hardening pass on purifying the whole package. Add a pure `authorization/` core inside it, export the primitives from `@pressly/auth`, and convert denied authorization decisions into `AppError` only at module/HTTP adapter edges.

---

# 2. New file tree

```txt id="o4pmw8"
packages/auth/src/
  principal.ts
  authorization/
    action.ts
    assignment.ts
    decision.ts
    environment.ts
    policy.ts
    principal-attributes.ts
    resource.ts
    role.ts
    scope.ts
    conditions/
      fresh-session.ts
      scoped-role.ts
      same-identity.ts
  index.ts

modules/security/identity/src/
  features/load-session/
    load-session.usecase.ts
    load-session.port.ts
  adapters/load-session/http/
    authenticate.middleware.ts
    authorize.middleware.ts
  adapters/load-session/persistence/
    load-session.repo.ts

modules/policy/access-control/src/
  resources/
    pricing-resource.ts
  policies/
    pricing-policy.ts
  guards/
    pricing-guards.ts
  main.ts
  public.ts

packages/db/src/schema/
  auth.schema.ts
```

Do not create a full IAM product yet. No policy admin UI, no customer-editable policy language, no remote policy engine. Use code-reviewed policy and DB-backed assignments.

---

# 3. Authorization core inside the auth package

This is the new pure authorization layer inside the existing `@pressly/auth` package. Keep password hashing, token issuing, and session helpers where they are. The new authorization path should not import `@pressly/errors`; adapters convert denied decisions into `AppError`.

Do not add a new compatibility wrapper around the old `Actor` model. The end state of this plan is no `Actor` type, no `actor.ts`, no `actorFromPrincipal`, no `makeActor`, no `resolveCliActor`, and no request authorization based on a selected highest role.

## `packages/auth/src/authorization/role.ts`

Keep roles centralized. Replace `permission.ts` as the primary security path over time.

```ts id="p3b0qp"
export type Role =
  | 'owner'
  | 'admin'
  | 'operator'
  | 'customer'
  | 'driver'
  | 'service'
  | 'developer'
  | 'ci';

export const isRole = (value: unknown): value is Role =>
  value === 'owner' ||
  value === 'admin' ||
  value === 'operator' ||
  value === 'customer' ||
  value === 'driver' ||
  value === 'service' ||
  value === 'developer' ||
  value === 'ci';
```

Delete `selectHighestRole` from authorization use. If display ordering is needed later, make it a UI/display helper only. It must not participate in access control.

## `packages/auth/src/authorization/scope.ts`

```ts id="gnjf21"
export type Scope =
  | Readonly<{ kind: 'global'; id: '*' }>
  | Readonly<{ kind: 'location'; id: string }>
  | Readonly<{ kind: 'resource'; type: string; id: string }>;

export const globalScope = (): Scope => ({ kind: 'global', id: '*' });

export const locationScope = (locationId: string): Scope => ({
  kind: 'location',
  id: locationId,
});

export const resourceScope = (type: string, id: string): Scope => ({
  kind: 'resource',
  type,
  id,
});

export const scopeKey = (scope: Scope): string => {
  if (scope.kind === 'resource')
    return `${scope.kind}:${scope.type}:${scope.id}`;
  return `${scope.kind}:${scope.id}`;
};

export const scopeCovers = (
  assignmentScope: Scope,
  resourceScope: Scope,
): boolean => {
  if (assignmentScope.kind === 'global') return true;

  if (assignmentScope.kind === 'location' && resourceScope.kind === 'location')
    return assignmentScope.id === resourceScope.id;

  if (assignmentScope.kind === 'resource' && resourceScope.kind === 'resource')
    return (
      assignmentScope.type === resourceScope.type &&
      assignmentScope.id === resourceScope.id
    );

  return false;
};
```

This is the core hardening move: authority is not global unless explicitly global.

Do not add tenant scope in this first pass. The current auth scope model is global/location/resource. Tenant authority only becomes correct when the system has a real tenant-to-location graph and resources carry enough ancestry to evaluate "tenant covers location" without guessing.

## `packages/auth/src/authorization/assignment.ts`

```ts id="isrshr"
import type { Role } from './role.ts';
import type { Scope } from './scope.ts';

export type RoleAssignment = Readonly<{
  role: Role;
  scope: Scope;
  startsAt?: Date;
  endsAt?: Date;
}>;

export const isAssignmentActive = (
  assignment: RoleAssignment,
  now: Date,
): boolean => {
  if (assignment.startsAt !== undefined && assignment.startsAt > now)
    return false;
  if (assignment.endsAt !== undefined && assignment.endsAt <= now) return false;
  return true;
};
```

## `packages/auth/src/principal.ts`

Principal is identity/session-facing. It does not decide authority.

```ts id="opf2sp"
export type Principal = Readonly<{
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
}>;

export const principalLabel = (principal: Principal): string =>
  principal.email ?? principal.displayName;
```

## `packages/auth/src/authorization/principal-attributes.ts`

Principal is identity/session-facing. Principal attributes are authorization-facing. This keeps `Principal` from becoming a junk drawer while avoiding a second security noun.

```ts id="md844z"
import type { RoleAssignment } from './assignment.ts';

export type PrincipalAttributes = Readonly<{
  assignments: readonly RoleAssignment[];
  identityActive: boolean;
  assuranceLevel?: 'password' | 'mfa' | 'service_key';
}>;

export const principalAttributesFromSession = (input: {
  assignments: readonly RoleAssignment[];
  identityActive: boolean;
  assuranceLevel?: PrincipalAttributes['assuranceLevel'];
}): PrincipalAttributes => ({
  assignments: input.assignments,
  identityActive: input.identityActive,
  ...(input.assuranceLevel === undefined
    ? {}
    : { assuranceLevel: input.assuranceLevel }),
});
```

## `packages/auth/src/authorization/resource.ts`

Keep this generic. Domain modules define precise resources.

```ts id="lqg0v6"
import type { Scope } from './scope.ts';

export type AuthResource = Readonly<{
  kind: string;
  scope: Scope;
  id?: string;
  attributes?: Readonly<Record<string, unknown>>;
}>;
```

## `packages/auth/src/authorization/environment.ts`

```ts id="n6ee3c"
export type AuthEnvironment = Readonly<{
  now: Date;
  sessionAgeMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}>;
```

## `packages/auth/src/authorization/action.ts`

Keep current action names for low migration pain.

```ts id="wll6fh"
export type Action =
  | 'auth:login'
  | 'auth:logout'
  | 'auth:session:read'
  | 'auth:session:revoke'
  | 'auth:user:manage'
  | 'pricing:read'
  | 'pricing:plan'
  | 'pricing:publish'
  | 'pricing:rollback';
```

## `packages/auth/src/authorization/decision.ts`

```ts id="hlyxvg"
export type AuthDenyReason =
  | 'unauthenticated'
  | 'inactive_identity'
  | 'missing_assignment'
  | 'missing_permission'
  | 'missing_context'
  | 'stale_session'
  | 'invalid_session'
  | 'policy_denied';

export type AuthDecision =
  | Readonly<{
      tag: 'allowed';
      policyId: string;
    }>
  | Readonly<{
      tag: 'denied';
      reason: AuthDenyReason;
      safeMessage: string;
      policyId?: string;
      details?: unknown;
    }>;

export const allowDecision = (policyId: string): AuthDecision => ({
  tag: 'allowed',
  policyId,
});

export const denyDecision = (input: {
  reason: AuthDenyReason;
  safeMessage: string;
  policyId?: string;
  details?: unknown;
}): AuthDecision => ({
  tag: 'denied',
  reason: input.reason,
  safeMessage: input.safeMessage,
  ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
  ...(input.details === undefined ? {} : { details: input.details }),
});

export const isAllowed = (
  decision: AuthDecision,
): decision is Extract<AuthDecision, { tag: 'allowed' }> =>
  decision.tag === 'allowed';

export const isDenied = (
  decision: AuthDecision,
): decision is Extract<AuthDecision, { tag: 'denied' }> =>
  decision.tag === 'denied';
```

Use `tag: 'allowed' | 'denied'` instead of `{ ok: true | false }`. Authorization denial is an expected policy outcome, not an operational `Result` failure. The HTTP adapter can still turn a denied decision into an `AppError`.

## `packages/auth/src/authorization/policy.ts`

This is the interpreter. Keep it small.

```ts id="rtzq1h"
import type { Action } from './action.ts';
import type { AuthDecision, AuthDenyReason } from './decision.ts';
import { allowDecision, denyDecision } from './decision.ts';
import type { AuthEnvironment } from './environment.ts';
import type { Principal } from '../principal.ts';
import type { PrincipalAttributes } from './principal-attributes.ts';
import type { AuthResource } from './resource.ts';

export type PolicyInput<R extends AuthResource = AuthResource> = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
  action: Action;
  resource: R;
  environment: AuthEnvironment;
}>;

export type PolicyCondition<R extends AuthResource = AuthResource> = Readonly<{
  name: string;
  denyReason: AuthDenyReason;
  safeMessage: string;
  evaluate: (input: PolicyInput<R>) => boolean;
}>;

export type PolicyRule<R extends AuthResource = AuthResource> = Readonly<{
  id: string;
  action: Action;
  effect: 'allow' | 'deny';
  conditions: readonly PolicyCondition<R>[];
}>;

export type AuthorizationRequest<R extends AuthResource = AuthResource> =
  PolicyInput<R> &
    Readonly<{
      policies: readonly PolicyRule<R>[];
    }>;

const allConditionsPass = <R extends AuthResource>(
  rule: PolicyRule<R>,
  input: PolicyInput<R>,
): true | PolicyCondition<R> => {
  const failed = rule.conditions.find(
    (condition) => !condition.evaluate(input),
  );
  return failed ?? true;
};

export const authorize = <R extends AuthResource>(
  request: AuthorizationRequest<R>,
): AuthDecision => {
  const candidates = request.policies.filter(
    (policy) => policy.action === request.action,
  );
  let firstFailedAllowCondition:
    | Readonly<{
        policyId: string;
        condition: PolicyCondition<R>;
      }>
    | undefined;

  for (const policy of candidates.filter((rule) => rule.effect === 'deny')) {
    const result = allConditionsPass(policy, request);

    if (result === true)
      return denyDecision({
        reason: 'policy_denied',
        safeMessage: 'You do not have permission to perform this action.',
        policyId: policy.id,
      });
  }

  for (const policy of candidates.filter((rule) => rule.effect === 'allow')) {
    const result = allConditionsPass(policy, request);

    if (result === true) return allowDecision(policy.id);

    firstFailedAllowCondition ??= {
      policyId: policy.id,
      condition: result,
    };
  }

  if (firstFailedAllowCondition !== undefined) {
    const failed = firstFailedAllowCondition.condition;

    return denyDecision({
      reason: failed.denyReason,
      safeMessage: failed.safeMessage,
      policyId: firstFailedAllowCondition.policyId,
      details: { condition: failed.name },
    });
  }

  return denyDecision({
    reason: 'missing_assignment',
    safeMessage: 'You do not have permission to perform this action.',
    details: {
      action: request.action,
      resource: request.resource.kind,
      scope: request.resource.scope,
    },
  });
};

export const allow = <R extends AuthResource>(
  input: Readonly<{
    id: string;
    action: Action;
    when: readonly PolicyCondition<R>[];
  }>,
): PolicyRule<R> => ({
  id: input.id,
  action: input.action,
  effect: 'allow',
  conditions: input.when,
});

export const deny = <R extends AuthResource>(
  input: Readonly<{
    id: string;
    action: Action;
    when: readonly PolicyCondition<R>[];
  }>,
): PolicyRule<R> => ({
  id: input.id,
  action: input.action,
  effect: 'deny',
  conditions: input.when,
});
```

This preserves useful deny reasons. For example, an owner with the right scoped role but a stale session should be denied as `stale_session`, not collapsed into generic `missing_assignment`.

## `packages/auth/src/authorization/conditions/scoped-role.ts`

```ts id="klbf17"
import type { Role } from '../role.ts';
import type { AuthResource } from '../resource.ts';
import { isAssignmentActive } from '../assignment.ts';
import { scopeCovers } from '../scope.ts';
import type { PolicyCondition } from '../policy.ts';

export const hasScopedRole = <R extends AuthResource>(
  roles: readonly Role[],
): PolicyCondition<R> => ({
  name: 'has_scoped_role',
  denyReason: 'missing_assignment',
  safeMessage: 'You do not have permission to perform this action.',
  evaluate: ({ principalAttributes, resource, environment }) =>
    principalAttributes.assignments.some(
      (assignment) =>
        roles.includes(assignment.role) &&
        isAssignmentActive(assignment, environment.now) &&
        scopeCovers(assignment.scope, resource.scope),
    ),
});
```

## `packages/auth/src/authorization/conditions/fresh-session.ts`

```ts id="s6ki5w"
import type { AuthResource } from '../resource.ts';
import type { PolicyCondition } from '../policy.ts';

export const freshSession = <R extends AuthResource>(
  maxAgeMinutes: number,
): PolicyCondition<R> => ({
  name: 'fresh_session',
  denyReason: 'stale_session',
  safeMessage: 'Please log in again before performing this action.',
  evaluate: ({ environment }) =>
    typeof environment.sessionAgeMinutes === 'number' &&
    environment.sessionAgeMinutes <= maxAgeMinutes,
});
```

## `packages/auth/src/authorization/conditions/same-identity.ts`

Useful for session/user self-service.

```ts id="xshksl"
import type { AuthResource } from '../resource.ts';
import type { PolicyCondition } from '../policy.ts';

export const sameIdentity = <
  R extends AuthResource & Readonly<{ id: string }>,
>(): PolicyCondition<R> => ({
  name: 'same_identity',
  denyReason: 'missing_assignment',
  safeMessage: 'You do not have permission to perform this action.',
  evaluate: ({ principal, resource }) => principal.identityId === resource.id,
});
```

## `packages/auth/src/index.ts`

Export the new primitives.

```ts id="i1ygzk"
export type { Action } from './authorization/action.ts';
export type { Role } from './authorization/role.ts';
export { isRole } from './authorization/role.ts';

export type { Scope } from './authorization/scope.ts';
export {
  globalScope,
  locationScope,
  resourceScope,
  scopeCovers,
  scopeKey,
} from './authorization/scope.ts';

export type { RoleAssignment } from './authorization/assignment.ts';
export { isAssignmentActive } from './authorization/assignment.ts';

export type { Principal } from './principal.ts';
export { principalLabel } from './principal.ts';

export type { PrincipalAttributes } from './authorization/principal-attributes.ts';
export { principalAttributesFromSession } from './authorization/principal-attributes.ts';

export type { AuthResource } from './authorization/resource.ts';
export type { AuthEnvironment } from './authorization/environment.ts';

export type { AuthDecision, AuthDenyReason } from './authorization/decision.ts';
export {
  allowDecision,
  denyDecision,
  isAllowed,
  isDenied,
} from './authorization/decision.ts';

export type {
  AuthorizationRequest,
  PolicyCondition,
  PolicyInput,
  PolicyRule,
} from './authorization/policy.ts';
export { allow, authorize, deny } from './authorization/policy.ts';

export { freshSession } from './authorization/conditions/fresh-session.ts';
export { hasScopedRole } from './authorization/conditions/scoped-role.ts';
export { sameIdentity } from './authorization/conditions/same-identity.ts';

export {
  isSessionExpired,
  isSessionRevoked,
  sessionAgeMinutes,
} from './session.ts';
```

---

# 4. Database schema

Your current `auth_identity_roles` table stores only `identity_id` and `role`, so it cannot express global/location/resource authority. Add a new assignment table rather than stretching that one.

## `packages/db/src/schema/auth.schema.ts`

Add:

```ts id="coetn8"
import { sql } from 'drizzle-orm';
import { check, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const authScopeKindEnum = pgEnum('auth_scope_kind', [
  'global',
  'location',
  'resource',
]);

export const authRoleAssignments = pgTable(
  'auth_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    role: authRoleEnum('role').notNull(),

    scopeKind: authScopeKindEnum('scope_kind').notNull(),
    scopeId: text('scope_id').notNull().default('*'),
    scopeResourceType: text('scope_resource_type').notNull().default('*'),

    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByIdentityId: uuid('created_by_identity_id').references(
      () => authIdentities.id,
    ),
  },
  (table) => ({
    identityIdx: index('auth_role_assignments_identity_idx').on(
      table.identityId,
    ),
    scopeIdx: index('auth_role_assignments_scope_idx').on(
      table.scopeKind,
      table.scopeId,
    ),
    uniqueAssignment: uniqueIndex('auth_role_assignments_unique_idx').on(
      table.identityId,
      table.role,
      table.scopeKind,
      table.scopeId,
      table.scopeResourceType,
    ),
    scopeShape: check(
      'auth_role_assignments_scope_shape_check',
      sql`
        (
          ${table.scopeKind} = 'resource'
          and ${table.scopeResourceType} <> '*'
        )
        or
        (
          ${table.scopeKind} <> 'resource'
          and ${table.scopeResourceType} = '*'
        )
      `,
    ),
  }),
);
```

Use `scopeId = '*'` and `scopeResourceType = '*'` for global. Keep `scopeResourceType` non-null so the unique index actually prevents duplicate assignments. Nullable columns inside a Postgres unique index would allow duplicates and weaken the migration.

Generate migrations using your documented Drizzle flow, not hand-written migration files. Your auth plan already says schema first, generate, review SQL, migrate.

Backfill:

```sql id="uxm5fe"
insert into auth_role_assignments (
  identity_id,
  role,
  scope_kind,
  scope_id,
  scope_resource_type,
  created_by_identity_id
)
select
  identity_id,
  role,
  'global',
  '*',
  '*',
  created_by_identity_id
from auth_identity_roles;
```

Keep `auth_identity_roles` for one compatibility pass. Remove it after the middleware no longer reads it.

Small hygiene note: the identity table spelling has been corrected with a dedicated migration. Keep future auth schema work on `auth_identities`.

---

# 5. Auth module load-session

The auth module should load a principal and authority-relevant attributes. The current load-session result returns roles. Change that to return `principal + principalAttributes`.

## `modules/security/identity/src/features/sessions/load-session/load-session.port.ts`

Move storage-only types here. `StoredSessionPrincipal` should leave `@pressly/contracts`; it is persistence adapter language, not an HTTP/API contract.

```ts id="vb0xhw"
import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import type { RoleAssignment } from '@pressly/auth';

export type StoredSessionPrincipalRecord = Readonly<{
  sessionId: string;
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  assignments: readonly RoleAssignment[];
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

export type LoadSessionStore = Readonly<{
  findByTokenHash: (
    tokenHash: string,
  ) => Promise<Result<StoredSessionPrincipalRecord | undefined, AppError>>;
  touchSession: (
    sessionId: string,
    now: Date,
  ) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{ hash: (rawToken: string) => string }>;
export type Clock = Readonly<{ now: () => Date }>;
```

## `modules/security/identity/src/features/sessions/load-session/load-session.usecase.ts`

```ts id="adrryr"
import { result, type Result } from '@pressly/kernel';
import {
  isSessionExpired,
  isSessionRevoked,
  principalAttributesFromSession,
  type Principal,
  type PrincipalAttributes,
} from '@pressly/auth';
import { type AppError } from '@pressly/errors';
import { expiredSession, invalidSession } from './load-session.error.ts';
import type {
  Clock,
  LoadSessionStore,
  TokenHasher,
} from './load-session.port.ts';

export type LoadedSession = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

type MakeLoadSessionDeps = Readonly<{
  store: LoadSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
}>;

export type LoadSession = (
  command: Readonly<{ bearerToken: string }>,
) => Promise<Result<LoadedSession, AppError>>;

export const makeLoadSession =
  (deps: MakeLoadSessionDeps): LoadSession =>
  async (command) => {
    const now = deps.clock.now();
    const found = await deps.store.findByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
    );

    if (result.isErr(found)) return found;
    if (found.value === undefined) return result.err(invalidSession());
    if (!found.value.isActive) return result.err(invalidSession());
    if (isSessionRevoked(found.value)) return result.err(invalidSession());
    if (isSessionExpired(found.value, now)) return result.err(expiredSession());

    const touched = await deps.store.touchSession(found.value.sessionId, now);
    if (result.isErr(touched)) return touched;

    const principal: Principal = {
      identityId: found.value.identityId,
      kind: found.value.kind,
      displayName: found.value.displayName,
      ...(found.value.email === undefined ? {} : { email: found.value.email }),
      sessionId: found.value.sessionId,
      sessionIssuedAt: found.value.issuedAt,
      sessionExpiresAt: found.value.expiresAt,
    };

    return result.ok({
      principal,
      principalAttributes: principalAttributesFromSession({
        assignments: found.value.assignments,
        identityActive: found.value.isActive,
      }),
    });
  };
```

---

# 6. Persistence mapping

## `modules/security/identity/src/features/sessions/load-session/stored-assignments.persistence.mapper.ts`

```ts id="s8m99s"
import {
  globalScope,
  locationScope,
  resourceScope,
  isRole,
  type RoleAssignment,
  type Scope,
} from '@pressly/auth';

const mapScope = (row: {
  scopeKind: string;
  scopeId: string;
  scopeResourceType: string;
}): Scope | undefined => {
  if (row.scopeKind === 'global') return globalScope();
  if (row.scopeKind === 'location') return locationScope(row.scopeId);

  if (row.scopeKind === 'resource' && row.scopeResourceType !== '*')
    return resourceScope(row.scopeResourceType, row.scopeId);

  return undefined;
};

export const mapStoredAssignments = (
  rows: readonly {
    role: string;
    scopeKind: string;
    scopeId: string;
    scopeResourceType: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }[],
): RoleAssignment[] =>
  rows.flatMap((row) => {
    if (!isRole(row.role)) return [];

    const scope = mapScope(row);
    if (scope === undefined) return [];

    return [
      {
        role: row.role,
        scope,
        ...(row.startsAt === null ? {} : { startsAt: row.startsAt }),
        ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
      },
    ];
  });
```

## `modules/security/identity/src/features/sessions/load-session/load-session.repo.ts`

Change the role query to assignment query.

```ts id="x6ovb6"
import { auth, eq, type Database } from '@pressly/db';
import type { LoadSessionStore } from '../../../features/load-session/load-session.port.ts';
import { toDatabaseResult } from '../../common/database-result.ts';
import { mapStoredAssignments } from '../../common/assignments.ts';

export const makeLoadSessionStore = (db: Database): LoadSessionStore => ({
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

      const assignments = await db
        .select()
        .from(auth.authRoleAssignments)
        .where(eq(auth.authRoleAssignments.identityId, row.identity.id));

      return {
        sessionId: row.session.id,
        identityId: row.identity.id,
        kind: row.identity.kind === 'service' ? 'service' : 'human',
        displayName: row.identity.displayName,
        ...(row.identity.email === null ? {} : { email: row.identity.email }),
        isActive: row.identity.isActive,
        assignments: mapStoredAssignments(assignments),
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

---

# 7. Auth HTTP middleware

## `modules/security/identity/src/features/sessions/load-session/authenticate.middleware.ts`

No highest-role selection.

```ts id="sm2fjh"
import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import type { Principal, PrincipalAttributes } from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';
import { readBearerToken } from '../../common/read-bearer.ts';

export type AuthLocals = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

export const makeAuthenticateMiddleware = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const loaded = await loadSession({ bearerToken: token });

    if (result.isErr(loaded)) throw loaded.error;

    res.locals['auth'] = {
      principal: loaded.value.principal,
      principalAttributes: loaded.value.principalAttributes,
    } satisfies AuthLocals;

    next();
  });
```

## `modules/security/identity/src/foundations/adapters/http/authentication-request/authorize-request.adapter.ts`

This middleware stays generic. Pricing passes action, policies, and a resource reader.

```ts id="bu7kd6"
import type { Request, RequestHandler, Response } from 'express';
import {
  authorize,
  isDenied,
  sessionAgeMinutes,
  type Action,
  type AuthEnvironment,
  type AuthResource,
  type PolicyRule,
  type Principal,
  type PrincipalAttributes,
} from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';

type AuthLocals = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

export type AuthorizeMiddlewareInput<R extends AuthResource = AuthResource> =
  Readonly<{
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (req: Request, res: Response) => R;
  }>;

export type AuthorizeMiddlewareFactory = <R extends AuthResource>(
  input: AuthorizeMiddlewareInput<R>,
) => RequestHandler;

const readAuthLocals = (res: Response): AuthLocals => {
  const auth = res.locals['auth'] as AuthLocals | undefined;

  if (auth !== undefined) return auth;

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_context',
    message: 'Auth middleware did not run before authorization.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};

const environmentFromRequest = (
  req: Request,
  principal: Principal,
): AuthEnvironment => ({
  now: new Date(),
  ipAddress: req.ip,
  userAgent: req.header('user-agent') ?? undefined,
  ...(principal.sessionIssuedAt === undefined
    ? {}
    : {
        sessionAgeMinutes: sessionAgeMinutes(
          { issuedAt: principal.sessionIssuedAt },
          new Date(),
        ),
      }),
});

export const makeAuthorizeMiddleware =
  (): AuthorizeMiddlewareFactory =>
  <R extends AuthResource>(input: AuthorizeMiddlewareInput<R>) =>
    catchAsync(async (req, res, next) => {
      const auth = readAuthLocals(res);
      const resource = input.readResource(req, res);
      const environment = environmentFromRequest(req, auth.principal);

      const decision = authorize({
        principal: auth.principal,
        principalAttributes: auth.principalAttributes,
        action: input.action,
        resource,
        environment,
        policies: input.policies,
      });

      if (isDenied(decision))
        throw makeAppError({
          kind: 'PermissionError',
          code: decision.reason,
          message: decision.safeMessage,
          safeMessage: decision.safeMessage,
          status: 403,
          details: {
            ...((decision.details ?? {}) as Record<string, unknown>),
            action: input.action,
            resource: resource.kind,
            scope: resource.scope,
            policyId: decision.policyId,
          },
        });

      res.locals['authorization'] = {
        action: input.action,
        resource,
        decision,
      };

      next();
    });
```

---

# 8. Access-control pricing resource and policy

Your pricing request already keeps `requestedBy` out of the HTTP body and injects it server-side in the controller. Keep that.

Pricing authorization belongs in `modules/policy/access-control`, not in
`modules/business/pricing` and not in `apps/api`.

`modules/policy/access-control` may import:

- `@pressly/auth` authorization primitives
- `@pressly/contracts` protocol/request types
- HTTP adapter types needed to build guards

It must not import pricing module internals.

## `modules/policy/access-control/src/resources/pricing-resource.ts`

```ts id="bb58wn"
import { globalScope, type AuthResource } from '@pressly/auth';
import type { PricingChangeRequest } from '@pressly/contracts';

export type PricingCatalogResource = AuthResource &
  Readonly<{
    kind: 'pricing.catalog';
    attributes: Readonly<{
      serviceSlug: string;
    }>;
  }>;

export const pricingCatalogResourceFromRequest = (
  request: PricingChangeRequest,
): PricingCatalogResource => ({
  kind: 'pricing.catalog',
  scope: globalScope(),
  id: `pricing:${request.serviceSlug}:global`,
  attributes: {
    serviceSlug: request.serviceSlug,
  },
});
```

## `modules/policy/access-control/src/policies/pricing-policy.ts`

```ts id="ln6ax6"
import {
  allow,
  freshSession,
  hasScopedRole,
  type PolicyRule,
} from '@pressly/auth';
import type { PricingCatalogResource } from '../resources/pricing-resource.ts';

export const pricingPolicies: readonly PolicyRule<PricingCatalogResource>[] = [
  allow<PricingCatalogResource>({
    id: 'pricing.plan.owner_or_admin_in_scope',
    action: 'pricing:plan',
    when: [hasScopedRole(['owner', 'admin'])],
  }),

  allow<PricingCatalogResource>({
    id: 'pricing.publish.owner_in_scope.fresh_session',
    action: 'pricing:publish',
    when: [hasScopedRole(['owner']), freshSession(15)],
  }),
];
```

This is the replacement for route-local role arrays:

```ts id="hydw4k"
roles: ['owner'];
```

Your current route does this for publish. The new shape asks for a resource and evaluates scoped policy.

---

# 9. Access-control guard bundle and pricing route integration

## `modules/policy/access-control/src/guards/pricing-guards.ts`

`modules/policy/access-control` composes concrete pricing guards from the generic auth
middleware. It also owns the identity-to-audit-author translation.

```ts id="xctg7w"
import type { AuthResource, PolicyRule, Action } from '@pressly/auth';
import type { Request, RequestHandler, Response } from 'express';
import { makeAppError } from '@pressly/errors';
import type {
  PricingChangeAuthor,
  PricingChangeRequest,
} from '@pressly/contracts';
import type { Principal } from '@pressly/auth';
import { pricingCatalogResourceFromRequest } from '../resources/pricing-resource.ts';
import { pricingPolicies } from '../policies/pricing-policy.ts';

type AuthLocals = Readonly<{
  principal: Principal;
}>;

type Authorize = <R extends AuthResource>(
  input: Readonly<{
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (req: Request, res: Response) => R;
  }>,
) => RequestHandler;

export type PricingAccessControl = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

const readAuthLocals = (res: Response): AuthLocals => {
  const auth = res.locals['auth'] as AuthLocals | undefined;

  if (auth?.principal !== undefined) return auth;

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request locals.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};

const readAuthenticatedPricingChangeAuthor: ReadPricingChangeAuthor = (res) => {
  const { principal } = readAuthLocals(res);

  return {
    id: principal.identityId,
    kind: principal.kind,
    displayName: principal.displayName,
  };
};

const readPricingCatalogResource = (req: Request) => {
  const body = req.body as PricingChangeRequest;
  return pricingCatalogResourceFromRequest(body);
};

export const makePricingAccessControl = (input: {
  authenticate: RequestHandler;
  authorize: Authorize;
}): PricingAccessControl => ({
  authenticate: input.authenticate,
  planPricingChange: input.authorize({
    action: 'pricing:plan',
    policies: pricingPolicies,
    readResource: readPricingCatalogResource,
  }),
  publishPricingChange: input.authorize({
    action: 'pricing:publish',
    policies: pricingPolicies,
    readResource: readPricingCatalogResource,
  }),
  readAuthor: readAuthenticatedPricingChangeAuthor,
});
```

Freshness is now policy, not route wiring. Current `PricingModuleAuth` carries
`freshSessionMaxAgeMinutes`; remove it.

## `modules/policy/access-control/src/main.ts`

```ts id="gvc4sx"
import type { RequestHandler } from 'express';
import type { PricingAccessControl } from './guards/pricing-guards.ts';
import { makePricingAccessControl } from './guards/pricing-guards.ts';

type AccessControlAuthorize = Parameters<
  typeof makePricingAccessControl
>[0]['authorize'];

export type AccessControlModule = Readonly<{
  pricing: PricingAccessControl;
}>;

export const makeAccessControlModule = (input: {
  auth: Readonly<{
    authenticate: RequestHandler;
    authorize: AccessControlAuthorize;
  }>;
}): AccessControlModule => ({
  pricing: makePricingAccessControl({
    authenticate: input.auth.authenticate,
    authorize: input.auth.authorize,
  }),
});
```

## `modules/policy/access-control/src/public.ts`

```ts id="rki98e"
export type { AccessControlModule } from './main.ts';
export { makeAccessControlModule } from './main.ts';
export type { PricingAccessControl } from './guards/pricing-guards.ts';
```

## `modules/business/pricing/src/main.ts`

Pricing receives route security as an input. It does not know how that security
is implemented.

```ts id="fwcdsf"
import type { RequestHandler, Response } from 'express';
import type { PricingChangeAuthor } from '@pressly/contracts';

type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

export type PricingRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;
```

## `modules/business/pricing/src/adapters/publish-pricing/http/publish-pricing-change.route.ts`

```ts id="e91yuw"
import { Router, type RequestHandler, type Response } from 'express';
import {
  pricingChangeRequestSchema,
  type PricingChangeAuthor,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { PlanPricingChange } from '../../../features/publish-pricing/plan-pricing-change.usecase.ts';
import type { PublishPricingChange } from '../../../features/publish-pricing/publish-pricing-change.usecase.ts';
import { makePlanPricingChangeController } from './plan-pricing-change.controller.ts';
import { makePublishPricingChangeController } from './publish-pricing-change.controller.ts';

type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

type PricingChangeRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export const makePublishPricingChangeRoute = (input: {
  planPricingChange: PlanPricingChange;
  publishPricingChange: PublishPricingChange;
  security: PricingChangeRouteSecurity;
}): Router => {
  const router = Router();
  const validate = validateRequest({ body: pricingChangeRequestSchema });

  const planPricingChangeController = makePlanPricingChangeController({
    planPricingChange: input.planPricingChange,
    readAuthor: input.security.readAuthor,
  });

  const publishPricingChangeController = makePublishPricingChangeController({
    publishPricingChange: input.publishPricingChange,
    readAuthor: input.security.readAuthor,
  });

  router.post(
    '/changes/plan',
    validate,
    input.security.authenticate,
    input.security.planPricingChange,
    planPricingChangeController,
  );

  router.post(
    '/changes/publish',
    validate,
    input.security.authenticate,
    input.security.publishPricingChange,
    publishPricingChangeController,
  );

  return router;
};
```

This preserves your route pipe. Validation still comes before authorization, so
the access-control guard reads an already validated protocol shape from
`req.body`. Pricing still sees only route handlers and an audit author reader.

---

# 10. App composition

Your app composes auth, access-control, and pricing. It does not define policy
or read security locals itself.

```ts id="f0nj18"
const accessControlModule = makeAccessControlModule({
  auth: {
    authenticate: authModule.guards.authenticate,
    authorize: authModule.guards.authorize,
  },
});

const pricingModule = makePricingModule({
  db: runtime.database.db,
  security: accessControlModule.pricing,
});
```

---

# 11. Contracts cleanup

Keep these in `@pressly/contracts`:

```txt id="takb38"
loginRequestSchema
loginResultSchema
sessionResultSchema
logoutResultSchema
pricingChangeRequestSchema
publishPricingChangeCommandSchema
pricing result schemas
```

Move these out:

```txt id="tbqdsj"
AuthorizeMiddlewareInput
PricingModuleAuthorizationInput
StoredSessionPrincipal
LoginIdentityRecord
LoginPasswordCredentialRecord
```

Reason: those are internal module/adaptor types, not protocol contracts. Your architecture says contracts are boundary language for HTTP params, bodies, response bodies, event payloads, commands, results, and error envelopes. Internal persistence rows are not contracts.

Also delete the old selected-role authorization path from `@pressly/auth`: `Actor`, `actor.ts`, `makeActor`, `actorFromPrincipal`, `resolveCliActor`, `assertCan`, the old role/permission policy interpreter, and request authorization based on `Permission`.

Keep the external pricing request free of caller identity. Your current `pricingChangeRequestSchema` does that correctly.

---

# 12. Tests to write

## Pure auth tests

Create:

```txt id="cvze5y"
packages/auth/test/authorization/policy.test.ts
packages/auth/test/authorization/conditions/scoped-role.test.ts
```

Cases:

```txt id="eq6e8i"
global assignment covers any resource scope
location assignment covers the same location
location assignment does not cover another location
resource assignment covers the same resource type and id
resource assignment does not cover another resource type or id
failed allow condition preserves its deny reason
missing assignment denies by default
future assignment is inactive
expired assignment is inactive
```

Keep these tests generic. `packages/auth` should not import pricing policy or pricing resource types.

## Pricing policy tests

Create:

```txt id="t2x7ja"
modules/policy/access-control/test/policies/pricing-policy.test.ts
```

Cases:

```txt id="bsh429"
global owner can publish any pricing catalog
resource-scoped owner cannot publish global pricing catalog
admin can plan pricing in scope
admin cannot publish pricing
owner cannot publish with stale session
```

Example:

```ts id="md2clo"
import { describe, expect, it } from 'vitest';
import {
  authorize,
  globalScope,
  resourceScope,
  type Principal,
  type PrincipalAttributes,
} from '@pressly/auth';
import { pricingPolicies } from '../../src/policies/pricing-policy.ts';
import type { PricingCatalogResource } from '../../src/resources/pricing-resource.ts';

const principal: Principal = {
  identityId: 'identity_1',
  kind: 'human',
  displayName: 'Steven',
};

const attributes = (
  assignments: PrincipalAttributes['assignments'],
): PrincipalAttributes => ({
  assignments,
  identityActive: true,
});

const pricingResource = (): PricingCatalogResource => ({
  kind: 'pricing.catalog',
  scope: globalScope(),
  id: 'pricing:wash-fold:global',
  attributes: { serviceSlug: 'wash-fold' },
});

describe('pricing authorization', () => {
  it('allows a global owner to publish pricing', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: globalScope() },
      ]),
      action: 'pricing:publish',
      resource: pricingResource(),
      environment: {
        now: new Date('2026-06-20T00:00:00.000Z'),
        sessionAgeMinutes: 3,
      },
      policies: pricingPolicies,
    });

    expect(decision).toMatchObject({
      tag: 'allowed',
      policyId: 'pricing.publish.owner_in_scope.fresh_session',
    });
  });

  it('denies a resource-scoped owner publishing global pricing', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        {
          role: 'owner',
          scope: resourceScope(
            'pricing.catalog',
            'pricing:dry-cleaning:global',
          ),
        },
      ]),
      action: 'pricing:publish',
      resource: pricingResource(),
      environment: {
        now: new Date('2026-06-20T00:00:00.000Z'),
        sessionAgeMinutes: 3,
      },
      policies: pricingPolicies,
    });

    expect(decision).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
    });
  });

  it('allows global owner to publish any service pricing', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: globalScope() },
      ]),
      action: 'pricing:publish',
      resource: pricingResource(),
      environment: {
        now: new Date('2026-06-20T00:00:00.000Z'),
        sessionAgeMinutes: 3,
      },
      policies: pricingPolicies,
    });

    expect(decision.tag).toBe('allowed');
  });
});
```

## Middleware tests

Replace current tests that assert highest role behavior. Your existing middleware tests already cover authenticate-before-authorize, missing role, missing permission, stale session. Keep the stale-session and missing-auth-context cases. Replace role/permission cases with scoped-resource cases.

Cases:

```txt id="t7z9y1"
requires authenticate middleware first
passes resource from validated request into authorization
denies principal whose assignment does not cover global pricing
denies stale session
attaches authorization decision to res.locals
```

## Repository tests

Cases:

```txt id="gll509"
maps global assignment
maps resource assignment
drops unknown role
drops invalid resource assignment shape
does not read auth_identity_roles after migration pass
```

---

# 13. Rollout order

Use this order to avoid breaking the app mid-refactor.

## Pass 1: Add pure model

Add the new `packages/auth` authorization files and tests. New code must use `principal + principalAttributes`; do not add compatibility wrappers around the old selected-role model.

## Pass 2: Add DB table

Add `auth_role_assignments`, generate migration, review SQL, run migration. Backfill existing global roles from `auth_identity_roles`.

## Pass 3: Load assignments

Update load-session port/repo/usecase to return `principal + principalAttributes`. Keep a compatibility helper that derives `roles` from global assignments only for `/auth/session` response, since contracts currently expose `roles`.

## Pass 4: Remove highest-role middleware path

Change `authenticate.middleware.ts` to write `{ principal, principalAttributes }` to locals. Delete role selection from request authorization.

## Pass 5: Add generic authorize middleware

Change middleware input from `{ action, roles, freshSessionMaxAgeMinutes }` to `{ action, policies, readResource }`.

## Pass 6: Add access-control pricing policy

Add `modules/policy/access-control` with pricing resource mapping, pricing policy, and pricing guard composition. Change pricing routes to accept prebuilt route security handlers instead of policy inputs.

## Pass 7: Clean contracts

Move internal auth and persistence types out of `@pressly/contracts`. Keep only process boundary schemas and result shapes there.

## Pass 8: Delete old path

After tests pass:

```txt id="ybcy6n"
delete Actor type and actor.ts
delete makeActor, actorFromPrincipal, and resolveCliActor
delete selectHighestRole usage from request auth
delete permissionsForRole as authorization source
delete old assertCan and actor-based policy helpers
delete res.locals.auth.actor usage
deprecate auth_identity_roles
remove role arrays from route authorize calls
```

---

# 14. What this deliberately does not build

No customer-editable policies.
No OPA/Cedar/Zanzibar clone.
No separate permissions table.
No remote policy service.
No role hierarchy.
No admin UI for IAM.

Those are product surfaces. The hardening move is smaller and more fundamental: **authorization becomes scoped, resource-aware, and explainable**.

The finished system should read like this:

```txt id="lv8k9d"
validate request
authenticate session
load principal + principal attributes
construct resource from validated request
authorize principal/principalAttributes/action/resource/environment against access-control policy
execute use case with trusted requestedBy
audit sensitive result
```

That is the enterprise-grade foundation.
