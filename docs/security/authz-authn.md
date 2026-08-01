# Authz/Authn

Pressly security is a request pipeline, not one generic "auth" step.

The system first proves who is calling.
Then it decides whether that caller may perform one action against one resource.
Only after that does the business use case run.

```txt
credential
-> identity + session
-> principal + principal attributes
-> action + resource + environment
-> policies
-> authorization decision
-> business use case
-> audit
```

## The Short Model

Authentication answers:

```txt
Who is this caller?
```

Authorization answers:

```txt
Given who this caller is,
given what authority they carry,
given what action they are attempting,
given what resource they are touching,
given the request environment,
should the system allow it?
```

## Code Ownership

`packages/auth` owns the small security language and interpreter.

It defines principals, assignments, scopes, resources, policy rules,
conditions, and decisions.

`modules/business/auth` authenticates callers.

It verifies credentials and sessions, then loads trusted principal facts.
It should not know pricing policy.

`modules/policy/access-control` owns application authorization policy.

It maps business requests into authorization actions, resources, and policies.

`modules/business/<module>` owns business behavior.

It should receive an already-authorized command and execute business rules.

`apps/api` composes the pipeline.

It wires middleware and routes.
It should not become the owner of policy logic.

## Authentication Nouns

### Credential

A credential is evidence presented to the system.

Examples:

```txt
password
bearer token
service key
```

A credential proves nothing until the auth module verifies it.

### Identity

An identity is the durable account record.

It answers:

```txt
Does this human or service exist in our system?
Is it active?
How can we identify it?
```

Examples of identity data:

```txt
identity id
kind: human | service
display name
email
active flag
```

### Session

A session is a time-bounded login proof.

It answers:

```txt
Has this identity authenticated recently enough to use the app?
```

The session is authentication evidence.
It is not authority by itself.

### Principal

A principal is the runtime caller for this request.

In code, this is intentionally small:

```ts
type Principal = {
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
};
```

Intuition:

```txt
The principal is the "who" standing at the gate.
```

The principal should not carry policy.
It should not say what the caller may do.

## Authorization Nouns

### Principal Attributes

Principal attributes are trusted facts about the principal that policy may inspect.

Today they include:

```txt
role assignments
identity active status
assurance level
```

Intuition:

```txt
The principal says who is calling.
The principal attributes say what facts are known about that caller.
```

### Assignment

An assignment is a grant.

It says:

```txt
This principal has this role inside this boundary, optionally during this time window.
```

Examples:

```ts
{ role: 'owner', scope: globalScope() }
{ role: 'admin', scope: locationScope('pressly-main') }
{ role: 'operator', scope: resourceScope('order', 'order_123') }
```

An assignment does not directly allow an action.

It only describes authority the principal carries.
Policies decide whether that authority is enough for a specific action.

### Role

A role is a named kind of authority.

Examples:

```txt
owner
admin
operator
customer
driver
service
developer
ci
```

Roles are not enough by themselves.

This is incomplete:

```txt
Junnior is an admin.
```

This is the actual security statement:

```txt
Junnior has the admin role within this scope.
```

### Scope

A scope is the boundary of authority.

Current scope kinds:

```txt
global
business
location
resource
```

Scope coverage is intentionally conservative:

```txt
global covers everything
business covers only the same business
location covers only the same location
resource covers only the same resource type and id
```

This prevents authority from accidentally becoming universal.

Important current reality:

```txt
Production and order-management policies enforce persisted location scope.
Business grants cover locations only through server-resolved, persisted
location-to-business ancestry; request input cannot establish that ancestry.
Pricing is currently global.
```

### Action

An action is the verb being attempted.

Examples:

```txt
pricing:plan
pricing:publish
auth:user:manage
auth:session:revoke
```

Actions are closed and explicit.
Adding a new protected operation should usually require adding a new action.

### Resource

A resource is the thing being acted on.

It must carry a scope.

Example:

```ts
{
  kind: 'pricing.catalog',
  scope: globalScope(),
  id: 'pricing:wash-fold:global',
  attributes: {
    serviceSlug: 'wash-fold',
  },
}
```

Intuition:

```txt
The action is the verb.
The resource is the object.
The scope is the boundary around that object.
```

### Environment

The environment is request-time context.

Examples:

```txt
now
session age
IP address
user agent
```

Environment is useful for policies that depend on current conditions.

Example:

```txt
Publishing pricing requires a fresh session.
```

That rule reads `sessionAgeMinutes` from the environment.

## Policy Rules

A policy rule says whether an action is allowed or denied under conditions.

In code, policies are built with:

```ts
allow({ action, when: [...] })
deny({ action, when: [...] })
```

`allow` and `deny` are constructors.
They do not make the decision by themselves.

The decision is made by `authorize(...)`.

## Policy Evaluation

Authorization follows this order:

1. If the identity is inactive, deny.
2. Find policies matching the requested action.
3. Evaluate matching deny rules first.
4. If any deny rule has all conditions pass, deny.
5. Evaluate matching allow rules.
6. If any allow rule has all conditions pass, allow.
7. Otherwise deny.

Inside one policy rule:

```txt
conditions are AND
```

Across multiple allow rules:

```txt
allow rules are OR
```

Across deny rules:

```txt
any matching deny wins
```

## Scoped Role Check

The most important condition today is `hasScopedRole(...)`.

It checks:

```txt
Does the principal have an active assignment
with one of these roles
whose scope covers the resource scope?
```

Example:

```txt
assignment:
  owner at global scope

resource:
  pricing catalog at global scope

result:
  passes
```

Example for later facility-scoped work:

```txt
assignment:
  admin at location pressly-main

resource:
  order at location pressly-main

result:
  passes
```

Different location:

```txt
assignment:
  admin at location pressly-main

resource:
  order at location pressly-west

result:
  denies
```

## Current Pricing Example

Publishing pricing currently uses:

```txt
action:
  pricing:publish

resource:
  pricing.catalog
  scope: global

policy:
  allow pricing:publish when:
    - principal has owner role in scope
    - session is fresh
```

For the seeded owner:

```txt
principal:
  authenticated identity

principal attributes:
  identityActive: true
  assignment: owner at global scope

environment:
  sessionAgeMinutes is within the fresh-session limit

decision:
  allowed
```

The owner does not bypass authorization.

The owner passes authorization because a global owner assignment covers the
global pricing resource.

## Route Flow

A protected HTTP route should read like this:

1. Validate request shape with `@pressly/contracts`.
2. Authenticate the session.
3. Load `Principal` and `PrincipalAttributes`.
4. Build the authorization `Resource`.
5. Call `authorize(...)` for one `Action`.
6. Convert denial to a permission `AppError`.
7. Run the business use case only after authorization passes.
8. Record audit data where the workflow requires it.

## Boundary Rules

Contracts validate request and response shape.

They should not decide who may do something.

Business modules execute business behavior.

They should not know how a principal received authority.

Policy modules decide authorization.

They should know actions, resources, and policy rules.

Auth modules authenticate and load trusted facts.

They should not know pricing, orders, or other business-specific policy.

## Adding A Protected Operation

When adding a new protected operation:

1. Add or reuse an `Action`.
2. Decide what `Resource` is being touched.
3. Decide the resource `Scope`.
4. Add policy rules in `modules/policy/access-control`.
5. Wire route middleware to authenticate, build the resource, and authorize.
6. Keep the business use case actor-neutral.
7. Add tests for allow, deny, stale session, missing assignment, and wrong scope.

## Mental Check

Before shipping a protected operation, ask:

```txt
Who is the caller?
What trusted facts do we know about them?
What are they trying to do?
What are they touching?
What boundary protects that thing?
What request facts matter right now?
Which policy allowed or denied the action?
```

If those questions are answerable from the code, the security flow is legible.
